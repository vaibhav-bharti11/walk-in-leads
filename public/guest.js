const { gsap } = window;
const form = document.querySelector('#lead-form');
const nameInput = document.querySelector('#guest-name');
const mobileInput = document.querySelector('#guest-mobile');
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
    title: 'Come in. Stay awhile.',
    copy: 'Leave us your name and number—we’ll make sure every visit feels familiar.',
    action: 'Join Kampai’s guest list',
    color: '#1c1a19',
  },
  Basque: {
    brand: 'basque',
    location: 'Restaurant · Garden · Dehradun',
    note: 'Garden dining beneath the Dehradun sky.',
    title: 'Your evening begins here.',
    copy: 'A name and number is all we need to make your next welcome feel personal.',
    action: 'Join Basque’s guest list',
    color: '#1f4c42',
  },
  'Embassy — Connaught Place': {
    brand: 'embassy',
    location: 'Connaught Place · Since 1948',
    note: 'A Delhi tradition, welcoming generations.',
    title: 'Some welcomes never go out of style.',
    copy: 'Share your details once, and let The Embassy remember the pleasure of having you.',
    action: 'Join The Embassy guest list',
    color: '#b11226',
  },
  'Embassy — Elan Epic': {
    brand: 'embassy',
    location: 'Elan Epic, Gurugram · Since 1948',
    note: 'A Delhi tradition, now in Gurugram.',
    title: 'Some welcomes never go out of style.',
    copy: 'Share your details once, and let The Embassy remember the pleasure of having you.',
    action: 'Join The Embassy guest list',
    color: '#b11226',
  },
  'Embassy — Vasant Kunj': {
    brand: 'embassy',
    location: 'DLF Promenade, Vasant Kunj · Since 1948',
    note: 'A Delhi tradition, welcoming generations.',
    title: 'Some welcomes never go out of style.',
    copy: 'Share your details once, and let The Embassy remember the pleasure of having you.',
    action: 'Join The Embassy guest list',
    color: '#b11226',
  },
};
let reduceMotion = false;

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
  const theme = themes[value];
  document.body.dataset.brand = theme.brand;
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

function validate({ showErrors = false } = {}) {
  const nameValid = nameInput.value.trim().replace(/\s+/g, ' ').length >= 2;
  const mobileValid = /^[6-9]\d{9}$/.test(mobileDigits());
  if (showErrors) {
    setError(nameInput, nameValid ? '' : 'Please enter your name.');
    setError(mobileInput, mobileValid ? '' : 'Enter a valid 10-digit mobile number.');
  }
  submitButton.disabled = !(nameValid && mobileValid);
  return nameValid && mobileValid;
}

for (const input of [nameInput, mobileInput]) {
  input.addEventListener('input', () => {
    setError(input, '');
    status.textContent = '';
    validate();
  });
  input.addEventListener('blur', () => validate({ showErrors: true }));
}

outletSelect.addEventListener('change', () => setTheme(outletSelect.value));
renderTheme(outletSelect.value);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validate({ showErrors: true })) return;
  const selectedOutlet = outletSelect.value;

  submitButton.disabled = true;
  submitButton.classList.add('is-loading');
  status.textContent = 'Adding you to the guest list…';

  try {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nameInput.value, mobile: mobileInput.value, outlet: selectedOutlet }),
    });
    const payload = await response.json();
    if (!response.ok) {
      if (payload.field === 'name') setError(nameInput, payload.error);
      if (payload.field === 'mobile') setError(mobileInput, payload.error);
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
  form.reset();
  nameInput.value = '';
  mobileInput.value = '';
  checkInView.hidden = false;
  successView.hidden = true;
  gsap.set([checkInView, successView], { clearProps: 'all' });
  validate();
  nameInput.focus();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
