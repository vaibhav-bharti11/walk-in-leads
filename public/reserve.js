const form = document.querySelector('#booking-form');
const result = document.querySelector('#booking-result');
const submitButton = form.querySelector('.reserve-action');
const params = new URLSearchParams(location.search);
const venueMeta = {
  'embassy-vk': { location: 'DLF Promenade · Vasant Kunj', note: 'A Delhi tradition, welcoming generations.' },
  'embassy-elan': { location: 'Elan Epic · Gurugram', note: 'Legacy dining, now in Gurugram.' },
  basque: { location: 'Malsi · Dehradun', note: 'Garden dining beneath the Dehradun sky.' },
  kampai: { location: 'Worldmark 1 · Aerocity', note: 'Japanese hospitality in the heart of Delhi.' },
};
let requestId = crypto.randomUUID();

async function api(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data.reservation;
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
  result.replaceChildren();
  const state = document.createElement('p');
  state.className = 'result-state';
  state.textContent = reservation.status;
  const title = document.createElement('h2');
  title.textContent = reservation.status === 'pending'
    ? 'Your request is with the restaurant.'
    : 'Reservation ' + reservation.status + '.';
  const details = document.createElement('p');
  details.className = 'result-details';
  details.textContent = reservation.name + ' · ' + reservation.date + ' at ' + reservation.time + ' · ' + reservation.pax + ' guests';
  const reference = document.createElement('p');
  reference.className = 'result-reference';
  reference.textContent = 'Booking reference ' + reservation.id;
  const note = document.createElement('p');
  note.textContent = 'Keep this private link. The restaurant team will contact you after reviewing availability.';
  result.append(state, title, details, reference, note, action('Refresh status', loadStatus));
  if (['pending', 'confirmed'].includes(reservation.status)) {
    result.append(action('Cancel request', async () => {
      const reason = prompt('Why are you cancelling?');
      if (!reason) return;
      try {
        show(await api('/api/reservation-status', {
          token: location.hash.slice(1), action: 'cancel', version: reservation.version, reason,
        }));
      } catch (error) {
        reference.textContent = error.message;
      }
    }, true));
  }
}

async function loadStatus() {
  try {
    show(await api('/api/reservation-status', { token: location.hash.slice(1) }));
  } catch (error) {
    result.textContent = error.message;
  }
}

function setLoading(loading) {
  submitButton.disabled = loading;
  submitButton.querySelector('span').textContent = loading ? 'Sending request…' : 'Request a table';
}

async function init() {
  const response = await fetch('/api/reservation-venues');
  if (!response.ok) throw new Error('Reservations unavailable');
  const { venues } = await response.json();
  const select = form.elements.venue;
  for (const [id, venue] of Object.entries(venues)) select.add(new Option(venue.name, id));

  if (params.has('venue')) {
    if (!venues[params.get('venue')]) {
      form.hidden = true;
      result.textContent = 'This restaurant is not accepting reservations here.';
      return;
    }
    select.value = params.get('venue');
    select.disabled = true;
  }

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  form.elements.date.min = today;

  function theme() {
    const id = select.value;
    const venue = venues[id];
    const meta = venueMeta[id] || {};
    document.querySelector('#venue-title').textContent = venue.name;
    document.querySelector('#venue-location').textContent = meta.location || 'Avantika Hospitality Collection';
    document.querySelector('#venue-note').textContent = meta.note || 'Thoughtful hospitality, reserved for you.';
    document.querySelector('#booking-photo').style.setProperty('--venue-image', "url('/brands/" + venue.image + "')");
    document.title = 'Reserve at ' + venue.name;
  }

  select.onchange = theme;
  theme();
  if (location.hash) {
    form.hidden = true;
    await loadStatus();
  }
}

form.onsubmit = async (event) => {
  event.preventDefault();
  setLoading(true);
  result.textContent = '';
  result.classList.remove('booking-result--error');
  try {
    const reservation = await api('/api/reservations', {
      ...Object.fromEntries(new FormData(form)),
      venue: form.elements.venue.value,
      referral: params.get('source'),
      request_id: requestId,
    });
    history.replaceState(null, '', location.pathname + location.search + '#' + reservation.token);
    show(reservation);
  } catch (error) {
    result.textContent = error.message;
    result.classList.add('booking-result--error');
  } finally {
    setLoading(false);
  }
};

init().catch(() => {
  form.hidden = true;
  result.textContent = 'Reservations are temporarily unavailable. Please try again.';
});
