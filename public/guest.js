const { gsap } = window;
const form = document.querySelector('#lead-form');
const nameInput = document.querySelector('#guest-name');
const mobileInput = document.querySelector('#guest-mobile');
const submitButton = form.querySelector('button[type="submit"]');
const selectedVenue = document.querySelector('#selected-venue');
const checkInView = document.querySelector('#check-in-view');
const successView = document.querySelector('#success-view');
const status = document.querySelector('#form-status');
const reduceTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
let outlet = 'Kampai';
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
      gsap.from('.venue-option', { autoAlpha: 0, x: -14, duration: 0.45, stagger: 0.045, ease: 'power2.out' });
      gsap.from('.invitation-inner > div:not([hidden]) > *', { autoAlpha: 0, y: 16, duration: 0.55, stagger: 0.06, ease: 'power2.out' });
    }
  },
);

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

document.querySelectorAll('input[name="outlet"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    outlet = radio.value;
    document.querySelectorAll('.venue-option').forEach((option) => option.classList.toggle('is-selected', option.contains(radio)));
    if (reduceMotion) {
      selectedVenue.textContent = outlet;
    } else {
      gsap.to(selectedVenue, {
        autoAlpha: 0,
        y: -6,
        duration: 0.16,
        ease: 'power1.in',
        onComplete: () => {
          selectedVenue.textContent = outlet;
          gsap.fromTo(selectedVenue, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.24, ease: 'power2.out' });
        },
      });
    }
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validate({ showErrors: true })) return;

  submitButton.disabled = true;
  submitButton.classList.add('is-loading');
  status.textContent = 'Adding you to the guest list…';

  try {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nameInput.value, mobile: mobileInput.value, outlet }),
    });
    const payload = await response.json();
    if (!response.ok) {
      if (payload.field === 'name') setError(nameInput, payload.error);
      if (payload.field === 'mobile') setError(mobileInput, payload.error);
      throw new Error(payload.error);
    }

    document.querySelector('#success-outlet').textContent = outlet;
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
  document.querySelector('input[name="outlet"]:checked').dispatchEvent(new Event('change'));
  validate();
  nameInput.focus();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
