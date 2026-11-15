import { futureDates, timeSlots, withSeatingPreference } from './reserve-model.js';

const form = document.querySelector('#booking-form');
const result = document.querySelector('#booking-result');
const submitButton = form.querySelector('[type="submit"]');
const params = new URLSearchParams(location.search);
let requestId = crypto.randomUUID();
let activeStep = 0;

async function api(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data.reservation;
}

function animateIn(element) {
  if (!window.gsap || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  window.gsap.fromTo(element, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.42, ease: 'power2.out', clearProps: 'all' });
}

function setStep(index) {
  activeStep = index;
  document.querySelectorAll('[data-step-index]').forEach((step) => { step.hidden = Number(step.dataset.stepIndex) !== index; });
  document.querySelectorAll('[data-progress]').forEach((item) => {
    const number = Number(item.dataset.progress);
    item.classList.toggle('is-active', number === index);
    item.classList.toggle('is-complete', number < index);
  });
  const visible = document.querySelector(`[data-step-index="${index}"]`);
  animateIn(visible);
  document.querySelector('.reservation-stage').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function validateStep(index) {
  if (index === 0 && !form.elements.time.value) {
    document.querySelector('#time-options').classList.add('has-error');
    document.querySelector('#time-options button:not(:disabled)')?.focus();
    return false;
  }
  return true;
}

function displayTime(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(2020, 0, 1, hours, minutes));
}

function renderDates(today) {
  const container = document.querySelector('#date-options');
  const nativeDate = form.elements.date;
  futureDates(today).forEach(({ value }, index) => {
    const date = new Date(`${value}T12:00:00`);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.value = value;
    button.innerHTML = `<small>${index === 0 ? 'Today' : new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(date)}</small><b>${date.getDate()}</b>`;
    button.onclick = () => {
      nativeDate.value = value;
      container.querySelectorAll('button').forEach((item) => item.classList.toggle('is-selected', item === button));
      renderTimes(value, today);
    };
    container.append(button);
  });
  container.firstElementChild?.click();
}

function renderTimes(date, today) {
  const container = document.querySelector('#time-options');
  const selected = form.elements.time.value;
  const now = new Date();
  container.replaceChildren();
  for (const value of timeSlots()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = displayTime(value);
    button.dataset.value = value;
    const [hours, minutes] = value.split(':').map(Number);
    button.disabled = date === today && hours * 60 + minutes < now.getHours() * 60 + now.getMinutes() + 30;
    button.onclick = () => {
      form.elements.time.value = value;
      container.classList.remove('has-error');
      container.querySelectorAll('button').forEach((item) => item.classList.toggle('is-selected', item === button));
    };
    if (!button.disabled && selected === value) button.classList.add('is-selected');
    container.append(button);
  }
  if (!container.querySelector('.is-selected')) {
    form.elements.time.value = '';
    container.querySelector('button:not(:disabled)')?.click();
  }
}

function setupParty() {
  const input = form.elements.pax;
  const output = document.querySelector('#party-output');
  const update = (delta) => {
    input.value = Math.max(1, Math.min(20, Number(input.value) + delta));
    output.textContent = `${input.value} ${input.value === '1' ? 'guest' : 'guests'}`;
    document.querySelector('#party-minus').disabled = input.value === '1';
    document.querySelector('#party-plus').disabled = input.value === '20';
  };
  document.querySelector('#party-minus').onclick = () => update(-1);
  document.querySelector('#party-plus').onclick = () => update(1);
  update(0);
}

function action(label, handler, secondary = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = secondary ? 'result-action result-action--secondary' : 'result-action';
  button.textContent = label;
  button.onclick = handler;
  return button;
}

function show(reservation) {
  form.hidden = true;
  document.querySelector('.booking-steps').hidden = true;
  result.replaceChildren();
  const state = document.createElement('p');
  state.className = 'result-state';
  state.textContent = reservation.status;
  const title = document.createElement('h2');
  title.textContent = reservation.status === 'pending' ? 'Reservation request received.' : `Reservation ${reservation.status}.`;
  const details = document.createElement('dl');
  details.className = 'ticket-details';
  const items = [['Guest', reservation.name], ['Date', reservation.date], ['Time', reservation.time], ['Party', `${reservation.pax} guests`]];
  items.forEach(([term, value]) => { const dt = document.createElement('dt'); const dd = document.createElement('dd'); dt.textContent = term; dd.textContent = value; details.append(dt, dd); });
  const reference = document.createElement('p');
  reference.className = 'result-reference';
  reference.textContent = `Booking reference ${reservation.id}`;
  const note = document.createElement('p');
  note.textContent = 'Keep this private link. The restaurant will contact you after reviewing availability.';
  result.append(state, title, details, reference, note, action('Refresh status', loadStatus));
  if (['pending', 'confirmed'].includes(reservation.status)) {
    result.append(action('Cancel request', async () => {
      const reason = prompt('Why are you cancelling?');
      if (!reason) return;
      try { show(await api('/api/reservation-status', { token: location.hash.slice(1), action: 'cancel', version: reservation.version, reason })); }
      catch (error) { reference.textContent = error.message; }
    }, true));
  }
  result.classList.add('is-visible');
  animateIn(result);
}

async function loadStatus() {
  try { show(await api('/api/reservation-status', { token: location.hash.slice(1) })); }
  catch (error) { result.textContent = error.message; }
}

function setLoading(loading) {
  submitButton.disabled = loading;
  submitButton.querySelector('span').textContent = loading ? 'Sending request…' : 'Request reservation';
}

async function init() {
  const response = await fetch('/api/reservation-venues');
  if (!response.ok) throw new Error('Reservations unavailable');
  const { venues } = await response.json();
  const venueId = params.get('venue');
  if (!venueId || !venues[venueId]) {
    form.hidden = true;
    document.querySelector('.booking-steps').hidden = true;
    result.textContent = 'Please open the reservation link for your restaurant.';
    result.classList.add('is-visible');
    return;
  }
  form.elements.venue.value = venueId;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  form.elements.date.min = today;
  form.elements.date.onchange = () => {
    document.querySelectorAll('#date-options button').forEach((button) => button.classList.toggle('is-selected', button.dataset.value === form.elements.date.value));
    renderTimes(form.elements.date.value, today);
  };
  function theme() {
    const venue = venues[venueId];
    document.body.dataset.venue = venueId;
    document.querySelector('#venue-name').textContent = `Reserve at ${venue.name}`;
    document.title = `Reserve at ${venue.name}`;
  }
  setupParty();
  renderDates(today);
  theme();
  setStep(0);
  document.querySelectorAll('[data-next]').forEach((button) => { button.onclick = () => { if (validateStep(activeStep)) setStep(Number(button.dataset.next)); }; });
  document.querySelectorAll('[data-back]').forEach((button) => { button.onclick = () => setStep(Number(button.dataset.back)); });
  if (location.hash) { form.hidden = true; await loadStatus(); }
}

form.onsubmit = async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  setLoading(true);
  result.textContent = '';
  result.classList.remove('booking-result--error');
  try {
    const values = Object.fromEntries(new FormData(form));
    delete values.seating;
    values.notes = withSeatingPreference(form.elements.seating.value, values.notes);
    const reservation = await api('/api/reservations', { ...values, venue: form.elements.venue.value, referral: params.get('source'), request_id: requestId });
    history.replaceState(null, '', `${location.pathname}${location.search}#${reservation.token}`);
    show(reservation);
  } catch (error) { result.textContent = error.message; result.classList.add('booking-result--error', 'is-visible'); }
  finally { setLoading(false); }
};

init().catch(() => { form.hidden = true; result.textContent = 'Reservations are temporarily unavailable. Please try again.'; });
