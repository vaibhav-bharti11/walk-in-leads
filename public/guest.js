const { gsap } = window;
const form = document.querySelector('#lead-form');
const nameInput = document.querySelector('#guest-name');
const mobileInput = document.querySelector('#guest-mobile');
const paxInput = document.querySelector('#guest-pax');
const visitDateInput = document.querySelector('#visit-date');
const tableNumberInput = document.querySelector('#table-number');
const leadSourceSelect = document.querySelector('#lead-source');
const customSourceGroup = document.querySelector('#custom-source-group');
const customSourceInput = document.querySelector('#custom-source');
const submitButton = form.querySelector('button[type="submit"]');
const outletSelect = document.querySelector('#outlet-select');
const checkInView = document.querySelector('#check-in-view');
const successView = document.querySelector('#success-view');
const status = document.querySelector('#form-status');
const reduceTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
const themeColor = document.querySelector('meta[name="theme-color"]');
const themes = {
  Kampai: {
    brand: 'kampai',
    location: 'Plate & Pour · Aerocity',
    note: 'Japanese hospitality, in the heart of Delhi.',
    title: 'Come in. Stay a while.',
    copy: 'Leave us your name and number—we’ll make sure every visit feels familiar.',
    action: 'Join Kampai’s guest list',
    color: '#1c1a19',
    image: '/brands/kampai-interior.png',
  },
  Basque: {
    brand: 'basque',
    location: 'Restaurant · Garden · Dehradun',
    note: 'Garden dining beneath the Dehradun sky.',
    title: 'Your evening begins here.',
    copy: 'A name and number is all we need to make your next welcome feel personal.',
    action: 'Join Basque’s guest list',
    color: '#1f4c42',
    image: '/brands/basque-garden.jpg',
  },
  'Embassy — Connaught Place': {
    brand: 'embassy',
    location: 'Connaught Place · Since 1948',
    note: 'A Delhi tradition, welcoming generations.',
    title: 'Some welcomes never go out of style.',
    copy: 'Share your details once, and let The Embassy remember the pleasure of having you.',
    action: 'Join The Embassy guest list',
    color: '#b11226',
    image: '/brands/embassy-cp.jpg',
  },
  'Embassy — Elan Epic': {
    brand: 'embassy',
    location: 'Elan Epic, Gurugram · Since 1948',
    note: 'A Delhi tradition, now in Gurugram.',
    title: 'Modern luxury, timeless taste.',
    copy: 'Share your details once, and let The Embassy remember the pleasure of having you.',
    action: 'Join The Embassy guest list',
    color: '#b11226',
    image: '/brands/embassy-elan.jpg',
  },
  'Embassy — Vasant Kunj': {
    brand: 'embassy',
    location: 'DLF Promenade, Vasant Kunj · Since 1948',
    note: 'Conservatory dining, welcoming generations.',
    title: 'A serene setting for cherished moments.',
    copy: 'Share your details once, and let The Embassy remember the pleasure of having you.',
    action: 'Join The Embassy guest list',
    color: '#b11226',
    image: '/brands/embassy-vk.jpg',
  },
};
let reduceMotion = false;

function today() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

visitDateInput.value = today();

document.documentElement.classList.toggle('reduce-transparency', reduceTransparency.matches);
reduceTransparency.addEventListener?.('change', (event) => {
  document.documentElement.classList.toggle('reduce-transparency', event.matches);
});

const mm = gsap.matchMedia();
mm.add(
  { all: '(min-width: 0px)', reduceMotion: '(prefers-reduced-motion: reduce)' },
  (context) => {
    reduceMotion = context.conditions.reduceMotion;
    if (!reduceMotion) {
      gsap.from('.guest-header', { autoAlpha: 0, y: -12, duration: 0.55, ease: 'power2.out' });
      gsap.from('.guest-card', { autoAlpha: 0, y: 18, duration: 0.7, ease: 'power2.out' });
    }
  },
);

function renderTheme(value) {
  const theme = themes[value] || themes.Kampai;
  document.body.dataset.brand = theme.brand;
  document.body.dataset.outlet = value;
  const brandImage = document.querySelector('.brand-image');
  if (brandImage && theme.image) {
    brandImage.style.setProperty('background-image', `url("${theme.image}")`, 'important');
  }
  document.querySelector('#brand-location').textContent = theme.location;
  document.querySelector('#brand-note').textContent = theme.note;
  document.querySelector('#welcome-title').textContent = theme.title;
  document.querySelector('#welcome-copy').textContent = theme.copy;
  document.querySelector('#submit-label').textContent = theme.action;
  themeColor.content = theme.color;
}

function setTheme(value) {
  if (reduceMotion) return renderTheme(value);
  const changing = ['.brand-backdrop', '.guest-card__content'];
  gsap.to(changing, {
    autoAlpha: 0,
    duration: 0.18,
    ease: 'power1.in',
    overwrite: true,
    onComplete: () => {
      renderTheme(value);
      gsap.fromTo(changing, { autoAlpha: 0 }, {
        autoAlpha: 1,
        duration: 0.42,
        ease: 'power2.out',
        overwrite: true,
        clearProps: 'opacity,visibility',
      });
    },
  });
}

function mobileDigits() {
  let digits = mobileInput.value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  return digits;
}

function setError(input, message) {
  const target = document.querySelector(`#${input.getAttribute('aria-describedby')}`);
  target.textContent = message;
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function updateCustomSource() {
  const isCustom = leadSourceSelect.value === 'Custom';
  customSourceGroup.hidden = !isCustom;
  customSourceInput.required = isCustom;
  if (!isCustom) {
    customSourceInput.value = '';
    setError(customSourceInput, '');
  }
}

function validate({ showErrors = false } = {}) {
  const nameValid = nameInput.value.trim().replace(/\s+/g, ' ').length >= 2;
  const mobileValid = /^[6-9]\d{9}$/.test(mobileDigits());
  const pax = Number(paxInput.value);
  const paxValid = Number.isInteger(pax) && pax >= 1 && pax <= 50;
  const visitDateValid = /^\d{4}-\d{2}-\d{2}$/.test(visitDateInput.value);
  const tableNumberValid = tableNumberInput.value.trim().length >= 1 && tableNumberInput.value.trim().length <= 20;
  const sourceValid = ['Walk-in', 'District', 'EazyDiner', 'Dineout', 'Custom'].includes(leadSourceSelect.value);
  const customSourceValid = leadSourceSelect.value !== 'Custom'
    || (customSourceInput.value.trim().length >= 2 && customSourceInput.value.trim().length <= 50);
  if (showErrors) {
    setError(nameInput, nameValid ? '' : 'Please enter your name.');
    setError(mobileInput, mobileValid ? '' : 'Enter a valid 10-digit mobile number.');
    setError(paxInput, paxValid ? '' : 'Enter 1 to 50 guests.');
    setError(visitDateInput, visitDateValid ? '' : 'Choose a visit date.');
    setError(tableNumberInput, tableNumberValid ? '' : 'Enter a table number.');
    setError(leadSourceSelect, sourceValid ? '' : 'Choose a booking source.');
    setError(customSourceInput, customSourceValid ? '' : 'Enter the custom booking source.');
  }
  const valid = nameValid && mobileValid && paxValid && visitDateValid && tableNumberValid && sourceValid && customSourceValid;
  submitButton.disabled = !valid;
  return valid;
}

for (const input of [nameInput, mobileInput, paxInput, visitDateInput, tableNumberInput, customSourceInput]) {
  input.addEventListener('input', () => {
    setError(input, '');
    status.textContent = '';
    validate();
  });
  input.addEventListener('blur', () => validate({ showErrors: true }));
}

leadSourceSelect.addEventListener('change', () => {
  updateCustomSource();
  setError(leadSourceSelect, '');
  validate();
});
leadSourceSelect.addEventListener('blur', () => validate({ showErrors: true }));
updateCustomSource();

const customerDialog = document.querySelector('#customer-match-dialog');
const customerMatches = document.querySelector('#customer-matches');
const customerHints = document.querySelector('#customer-hints');
let lookupTimer;
let lookupController;
let lookupVersion = 0;
let lastOfferedLookup = '';

function clearCustomerLookup() {
  clearTimeout(lookupTimer);
  lookupController?.abort();
  lookupVersion += 1;
  customerHints.hidden = true;
  customerHints.replaceChildren();
  if (customerDialog.open) customerDialog.close();
}

function visitDescription(visit) {
  const date = visit.visit_date || visit.created_at?.slice(0, 10);
  const formatted = date ? new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(`${date}T00:00:00`)) : 'Date unavailable';
  return `${visit.outlet} · ${formatted} · ${visit.pax ?? 'Unknown'} guests`;
}

async function lookupCustomer(version) {
  const key = `${nameInput.value.trim()}|${mobileDigits()}`;
  if (key === lastOfferedLookup) return;
  lookupController = new AbortController();
  try {
    const response = await fetch('/api/customers/match', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      signal: lookupController.signal,
      body: JSON.stringify({ name: nameInput.value, mobile: mobileInput.value }),
    });
    if (!response.ok) throw new Error('Lookup unavailable');
    const { customers } = await response.json();
    if (version !== lookupVersion || checkInView.hidden || submitButton.classList.contains('is-loading')) return;
    if (!customers.length) return;
    lastOfferedLookup = key;
    customerMatches.replaceChildren();
    for (const customer of customers) {
      if (!customer.mobile) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'customer-hint';
        button.textContent = `${customer.name} · ${customer.masked_mobile} — enter full number to view visits`;
        button.addEventListener('click', () => {
          nameInput.value = customer.name;
          setError(nameInput, '');
          validate();
          mobileInput.focus();
        });
        customerHints.append(button);
        customerHints.hidden = false;
        continue;
      }
      const section = document.createElement('section');
      section.className = 'customer-match';
      const heading = document.createElement('h3');
      heading.textContent = `${customer.name} · ${customer.mobile}`;
      const count = document.createElement('p');
      count.textContent = `${customer.visit_count} previous ${customer.visit_count === 1 ? 'visit' : 'visits'} across ${customer.outlets.length} ${customer.outlets.length === 1 ? 'outlet' : 'outlets'}`;
      const visits = document.createElement('ul');
      for (const visit of customer.visits) {
        const item = document.createElement('li');
        item.textContent = visitDescription(visit);
        visits.append(item);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'primary-action liquid-button';
      button.textContent = 'Use these customer details';
      button.addEventListener('click', () => {
        nameInput.value = customer.name;
        mobileInput.value = customer.mobile;
        setError(nameInput, '');
        setError(mobileInput, '');
        validate();
        clearCustomerLookup();
        paxInput.focus();
      });
      section.append(heading, count, visits, button);
      customerMatches.append(section);
    }
    if (customerMatches.childElementCount && !customerDialog.open) customerDialog.showModal();
  } catch (error) {
    if (error.name !== 'AbortError' && version === lookupVersion) {
      customerHints.textContent = 'Previous visits could not be checked. You can still enter details and save this visit.';
      customerHints.hidden = false;
    }
  }
}

for (const input of [nameInput, mobileInput]) {
  input.addEventListener('input', () => {
    clearCustomerLookup();
    lastOfferedLookup = '';
    const version = lookupVersion;
    lookupTimer = setTimeout(() => lookupCustomer(version), 450);
  });
}
document.querySelector('#dismiss-customer-match').addEventListener('click', () => customerDialog.close());

outletSelect.addEventListener('change', () => setTheme(outletSelect.value));
renderTheme(outletSelect.value);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validate({ showErrors: true })) return;
  const selectedOutlet = outletSelect.value;

  clearCustomerLookup();

  submitButton.disabled = true;
  submitButton.classList.add('is-loading');
  status.textContent = 'Adding you to the guest list…';

  try {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: nameInput.value,
        mobile: mobileInput.value,
        outlet: selectedOutlet,
        pax: paxInput.value,
        visit_date: visitDateInput.value,
        table_number: tableNumberInput.value,
        lead_source: leadSourceSelect.value,
        custom_source: customSourceInput.value,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      if (payload.field === 'name') setError(nameInput, payload.error);
      if (payload.field === 'mobile') setError(mobileInput, payload.error);
      if (payload.field === 'pax') setError(paxInput, payload.error);
      if (payload.field === 'visit_date') setError(visitDateInput, payload.error);
      if (payload.field === 'table_number') setError(tableNumberInput, payload.error);
      if (payload.field === 'lead_source') setError(leadSourceSelect, payload.error);
      if (payload.field === 'custom_source') setError(customSourceInput, payload.error);
      throw new Error(payload.error);
    }

    document.querySelector('#success-outlet').textContent = selectedOutlet;
    status.textContent = '';
    if (reduceMotion) {
      checkInView.hidden = true;
      successView.hidden = false;
    } else {
      gsap.to(checkInView, {
        autoAlpha: 0,
        y: -12,
        duration: 0.24,
        ease: 'power1.in',
        onComplete: () => {
          checkInView.hidden = true;
          successView.hidden = false;
          gsap.fromTo(successView, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out' });
        },
      });
    }
  } catch (error) {
    status.textContent = error.message === 'Failed to fetch'
      ? 'We couldn’t save this check-in. Please try once more.'
      : error.message;
    submitButton.disabled = false;
  } finally {
    submitButton.classList.remove('is-loading');
  }
});

document.querySelector('#next-guest').addEventListener('click', () => {
  clearCustomerLookup();
  lastOfferedLookup = '';
  form.reset();
  nameInput.value = '';
  mobileInput.value = '';
  paxInput.value = '';
  visitDateInput.value = today();
  tableNumberInput.value = '';
  leadSourceSelect.value = 'Walk-in';
  customSourceInput.value = '';
  updateCustomSource();
  checkInView.hidden = false;
  successView.hidden = true;
  gsap.set([checkInView, successView], { clearProps: 'all' });
  validate();
  nameInput.focus();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
