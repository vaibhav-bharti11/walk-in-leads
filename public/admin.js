const { gsap } = window;
const loginView = document.querySelector('#login-view');
const dashboardView = document.querySelector('#dashboard-view');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const outletFilter = document.querySelector('#outlet-filter');
const totalCount = document.querySelector('#total-count');
const tableRows = document.querySelector('#lead-rows');
const mobileCards = document.querySelector('#lead-cards');
const statusToast = document.querySelector('#ledger-status-toast');
const statusText = document.querySelector('#ledger-status-text');
const exportLink = document.querySelector('#export-link');
const sheetLink = document.querySelector('#sheet-link');
const guestSearch = document.querySelector('#guest-search');
const filterPills = document.querySelectorAll('.filter-pill');
const liveDate = document.querySelector('#live-date');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let allCurrentLeads = [];
let dashboardRevealed = false;
let toastTimeout = null;

// Initialize Live Date & Clock
function updateClock() {
  if (!liveDate) return;
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(now);
  liveDate.textContent = dateStr;
}
updateClock();

function showToast(message, isError = false, duration = 4000) {
  if (!statusToast || !statusText) return;
  clearTimeout(toastTimeout);
  statusText.textContent = message;
  statusToast.classList.toggle('is-error', isError);
  statusToast.hidden = false;
  if (!reduceMotion && gsap) {
    gsap.fromTo(statusToast, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.25, ease: 'power2.out' });
  }
  toastTimeout = setTimeout(() => {
    if (!reduceMotion && gsap) {
      gsap.to(statusToast, { autoAlpha: 0, y: -8, duration: 0.25, onComplete: () => { statusToast.hidden = true; } });
    } else {
      statusToast.hidden = true;
    }
  }, duration);
}

function showLogin(message = '') {
  dashboardView.hidden = true;
  loginView.hidden = false;
  loginError.textContent = message;
  outletFilter.value = '';
  if (guestSearch) guestSearch.value = '';
  filterPills.forEach((pill) => {
    pill.hidden = false;
    pill.classList.toggle('is-active', pill.getAttribute('data-outlet') === '');
  });
  document.querySelector('#admin-password').focus();
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  if (!dashboardRevealed && !reduceMotion && gsap) {
    gsap.from('.admin-header, .bento-card, .controls-panel, .table-container, .mobile-cards-grid', {
      autoAlpha: 0,
      y: 16,
      duration: 0.45,
      stagger: 0.05,
      ease: 'power2.out',
      clearProps: 'opacity,visibility,transform',
    });
  }
  dashboardRevealed = true;
}

function formatMobile(mobile) {
  if (!mobile) return '';
  const clean = mobile.replace(/\D/g, '');
  if (clean.length === 10) {
    return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
  }
  if (clean.length === 12 && clean.startsWith('91')) {
    return `+91 ${clean.slice(2, 7)} ${clean.slice(7)}`;
  }
  return mobile;
}

function formatVisitDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${value}T00:00:00`));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character]);
}

function getInitials(name) {
  if (!name) return 'AH';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getOutletBadgeClass(outlet) {
  if (!outlet) return 'badge-neutral';
  const lower = outlet.toLowerCase();
  if (lower.includes('kampai')) return 'badge-kampai';
  if (lower.includes('basque')) return 'badge-basque';
  if (lower.includes('embassy')) return 'badge-embassy';
  return 'badge-neutral';
}

function renderAllViews(leads) {
  const query = (guestSearch?.value || '').trim().toLowerCase();
  const filtered = query
    ? leads.filter((l) => (l.name || '').toLowerCase().includes(query) || (l.mobile || '').includes(query))
    : leads;

  // 1. Render Desktop Table
  tableRows.replaceChildren();
  if (!filtered.length) {
    const row = tableRows.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 6;
    cell.className = 'empty-cell';
    cell.innerHTML = `
      <div class="empty-state-box">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14"/></svg>
        <p class="empty-title">No guests found</p>
        <p class="empty-desc">${query ? 'No records match your search filter.' : 'New guest check-ins will appear here in real time.'}</p>
      </div>
    `;
  } else {
    const dateTime = new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    for (const lead of filtered) {
      const row = tableRows.insertRow();
      const badgeClass = getOutletBadgeClass(lead.outlet);
      const initials = getInitials(lead.name);
      const cleanPhone = lead.mobile ? lead.mobile.replace(/\D/g, '') : '';
      const phoneDigits = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

      row.innerHTML = `
        <td class="guest-cell">
          <div class="guest-avatar" aria-hidden="true">${escapeHtml(initials)}</div>
          <div class="guest-info">
            <strong class="guest-name">${escapeHtml(lead.name)}</strong>
          </div>
        </td>
        <td class="phone-cell">
          <a class="phone-link" href="tel:+${phoneDigits}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            <span>${formatMobile(lead.mobile)}</span>
          </a>
        </td>
        <td class="outlet-cell">
          <span class="outlet-badge ${badgeClass}">
            <span class="badge-dot" aria-hidden="true"></span>
            <span>${escapeHtml(lead.outlet)}</span>
          </span>
        </td>
        <td class="pax-cell">${lead.pax ?? '—'}</td>
        <td class="visit-date-cell"><time datetime="${lead.visit_date || ''}">${formatVisitDate(lead.visit_date)}</time></td>
        <td class="time-cell">
          <time datetime="${lead.created_at}">${dateTime.format(new Date(lead.created_at))}</time>
        </td>
      `;
    }
  }

  // 2. Render Mobile Cards
  mobileCards.replaceChildren();
  if (!filtered.length) {
    mobileCards.innerHTML = `
      <div class="empty-state-box empty-state-mobile">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14"/></svg>
        <p class="empty-title">No guests found</p>
        <p class="empty-desc">${query ? 'No records match your search.' : 'Welcomes will appear here as guests check in.'}</p>
      </div>
    `;
  } else {
    const dateTime = new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    for (const lead of filtered) {
      const badgeClass = getOutletBadgeClass(lead.outlet);
      const initials = getInitials(lead.name);
      const cleanPhone = lead.mobile ? lead.mobile.replace(/\D/g, '') : '';
      const phoneDigits = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

      const card = document.createElement('div');
      card.className = 'guest-card-mobile';
      card.innerHTML = `
        <div class="card-mobile-header">
          <div class="guest-cell">
            <div class="guest-avatar" aria-hidden="true">${escapeHtml(initials)}</div>
            <div class="guest-info">
              <strong class="guest-name">${escapeHtml(lead.name)}</strong>
              <time class="card-time" datetime="${lead.created_at}">${dateTime.format(new Date(lead.created_at))}</time>
            </div>
          </div>
          <span class="outlet-badge ${badgeClass}">
            <span class="badge-dot" aria-hidden="true"></span>
            <span>${escapeHtml(lead.outlet.replace('Embassy — ', ''))}</span>
          </span>
        </div>
        <div class="card-mobile-body">
          <a class="card-phone-btn" href="tel:+${phoneDigits}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            <span>${formatMobile(lead.mobile)}</span>
          </a>
          <a class="card-wa-btn" href="https://wa.me/${phoneDigits}" target="_blank" rel="noopener noreferrer" title="WhatsApp Guest">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          </a>
        </div>
        <p class="card-visit-meta">${lead.pax ?? '—'} guests · ${formatVisitDate(lead.visit_date)}</p>
      `;
      mobileCards.appendChild(card);
    }
  }
}

async function loadLeads() {
  const outlet = outletFilter.value;
  exportLink.href = `/api/admin/export${outlet ? `?outlet=${encodeURIComponent(outlet)}` : ''}`;
  try {
    const response = await fetch(`/api/admin/leads${outlet ? `?outlet=${encodeURIComponent(outlet)}` : ''}`);
    if (response.status === 401) return showLogin();
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    const allowedOutlets = payload.allowedOutlets || [];
    filterPills.forEach((pill) => {
      const value = pill.getAttribute('data-outlet');
      pill.hidden = Boolean(value) && !allowedOutlets.includes(value);
    });
    if (sheetLink) sheetLink.hidden = payload.scope !== 'all';
    showDashboard();
    allCurrentLeads = payload.leads || [];
    totalCount.textContent = new Intl.NumberFormat('en-IN').format(payload.total);
    renderAllViews(allCurrentLeads);
  } catch (err) {
    showToast('Failed to load guest ledger. Please retry.', true);
  }
}

// Filter pill click listener
filterPills.forEach((pill) => {
  pill.addEventListener('click', () => {
    filterPills.forEach((p) => p.classList.remove('is-active'));
    pill.classList.add('is-active');
    const selectedOutlet = pill.getAttribute('data-outlet');
    outletFilter.value = selectedOutlet;
    loadLeads();
  });
});

if (guestSearch) {
  guestSearch.addEventListener('input', () => {
    renderAllViews(allCurrentLeads);
  });
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
      body: JSON.stringify({
        username: document.querySelector('#admin-username').value,
        password: document.querySelector('#admin-password').value,
      }),
    });
    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.error);
    }
    loginForm.reset();
    await loadLeads();
  } catch (error) {
    loginError.textContent = error.message || 'Sign-in failed. Check password.';
  } finally {
    button.disabled = false;
  }
});

const sheetsSyncBtn = document.querySelector('#sheets-sync-btn');
if (sheetsSyncBtn) {
  sheetsSyncBtn.addEventListener('click', async () => {
    sheetsSyncBtn.disabled = true;
    sheetsSyncBtn.classList.add('is-syncing');
    showToast('Connecting with Google Sheets API v4…');
    try {
      const response = await fetch('/api/admin/google-sheets/sync', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      showToast(`✓ Synced ${payload.syncedCount} guests to Google Sheet successfully!`);
    } catch (err) {
      showToast(`Sync failed: ${err.message}`, true, 6000);
    } finally {
      sheetsSyncBtn.disabled = false;
      sheetsSyncBtn.classList.remove('is-syncing');
    }
  });
}

document.querySelector('#sign-out').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  showLogin('You have securely signed out.');
});

loadLeads();
