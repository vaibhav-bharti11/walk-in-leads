const { gsap } = window;
const loginView = document.querySelector('#login-view');
const dashboardView = document.querySelector('#dashboard-view');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const outletFilter = document.querySelector('#outlet-filter');
const totalCount = document.querySelector('#total-count');
const rows = document.querySelector('#lead-rows');
const ledgerStatus = document.querySelector('#ledger-status');
const exportLink = document.querySelector('#export-link');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let dashboardRevealed = false;

function showLogin(message = '') {
  dashboardView.hidden = true;
  loginView.hidden = false;
  loginError.textContent = message;
  document.querySelector('#admin-password').focus();
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  if (!dashboardRevealed && !reduceMotion) {
    gsap.from('.ledger-shell > *', {
      autoAlpha: 0,
      y: 12,
      duration: 0.42,
      stagger: 0.045,
      ease: 'power2.out',
      immediateRender: false,
      clearProps: 'opacity,visibility,transform',
    });
  }
  dashboardRevealed = true;
}

function formatMobile(mobile) {
  return `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`;
}

function renderRows(leads) {
  rows.replaceChildren();
  if (!leads.length) {
    const row = rows.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 4;
    cell.className = 'empty-cell';
    cell.textContent = 'No guests here yet. New welcomes will appear as they arrive.';
    return;
  }

  const dateTime = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  for (const lead of leads) {
    const row = rows.insertRow();
    const values = [lead.name, formatMobile(lead.mobile), lead.outlet, dateTime.format(new Date(lead.created_at))];
    values.forEach((value, index) => {
      const cell = row.insertCell();
      cell.textContent = value;
      if (index === 0) cell.className = 'guest-name-cell';
    });
  }
}

async function loadLeads() {
  ledgerStatus.textContent = 'Opening the guest book…';
  const outlet = outletFilter.value;
  exportLink.href = `/api/admin/export${outlet ? `?outlet=${encodeURIComponent(outlet)}` : ''}`;
  try {
    const response = await fetch(`/api/admin/leads${outlet ? `?outlet=${encodeURIComponent(outlet)}` : ''}`);
    if (response.status === 401) return showLogin();
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    showDashboard();
    totalCount.textContent = new Intl.NumberFormat('en-IN').format(payload.total);
    renderRows(payload.leads);
    ledgerStatus.textContent = payload.leads.length ? '' : 'The selected guest list is empty.';
  } catch {
    ledgerStatus.textContent = 'The guest book could not be loaded. Try again.';
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  const button = loginForm.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: document.querySelector('#admin-password').value }),
    });
    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.error);
    }
    loginForm.reset();
    await loadLeads();
  } catch (error) {
    loginError.textContent = error.message || 'Sign-in failed. Try again.';
  } finally {
    button.disabled = false;
  }
});

outletFilter.addEventListener('change', loadLeads);

document.querySelector('#sign-out').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  showLogin('You’re signed out.');
});

loadLeads();
