import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApp } from '../src/server.mjs';

async function startTestApp() {
  const directory = mkdtempSync(join(tmpdir(), 'walkin-server-'));
  const app = createApp({
    databasePath: join(directory, 'leads.db'),
    adminPassword: 'correct horse battery staple',
    sessionSecret: 'test-session-secret-that-is-long-enough',
    secureCookies: false,
  });
  const server = createServer(app.handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      app.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

async function request(url, options = {}) {
  const headers = { ...options.headers };
  if (options.json !== undefined) headers['content-type'] = 'application/json';
  return fetch(url, {
    ...options,
    headers,
    body: options.json === undefined ? options.body : JSON.stringify(options.json),
  });
}

test('captures a lead and rejects invalid or oversized input', async () => {
  const app = await startTestApp();
  try {
    const saved = await request(`${app.baseUrl}/api/leads`, {
      method: 'POST',
      json: { name: 'Aditi Sharma', mobile: '+91 98765 43210', outlet: 'Basque' },
    });
    assert.equal(saved.status, 201);
    assert.deepEqual(await saved.json(), {
      lead: { id: 1, name: 'Aditi Sharma', mobile: '9876543210', outlet: 'Basque' },
    });

    const invalid = await request(`${app.baseUrl}/api/leads`, {
      method: 'POST',
      json: { name: '', mobile: '1', outlet: 'Nowhere' },
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: 'Please enter your name.', field: 'name' });

    const oversized = await request(`${app.baseUrl}/api/leads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'A'.repeat(17_000) }),
    });
    assert.equal(oversized.status, 413);

    const malformed = await request(`${app.baseUrl}/api/leads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: 'Send valid JSON.' });
  } finally {
    await app.close();
  }
});

test('protects admin listing and filtered CSV export with a signed session', async () => {
  const app = await startTestApp();
  try {
    for (const lead of [
      { name: '=HYPERLINK("bad")', mobile: '9876543210', outlet: 'Kampai' },
      { name: 'Neha Bansal', mobile: '9987654321', outlet: 'Basque' },
    ]) {
      assert.equal((await request(`${app.baseUrl}/api/leads`, { method: 'POST', json: lead })).status, 201);
    }

    assert.equal((await fetch(`${app.baseUrl}/api/admin/leads`)).status, 401);
    assert.equal((await request(`${app.baseUrl}/api/admin/login`, {
      method: 'POST',
      json: { password: 'wrong' },
    })).status, 401);

    const login = await request(`${app.baseUrl}/api/admin/login`, {
      method: 'POST',
      json: { password: 'correct horse battery staple' },
    });
    assert.equal(login.status, 204);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    assert.match(cookie, /^avantika_session=/);

    const listing = await fetch(`${app.baseUrl}/api/admin/leads?outlet=${encodeURIComponent('Kampai')}`, {
      headers: { cookie },
    });
    assert.equal(listing.status, 200);
    const payload = await listing.json();
    assert.equal(payload.total, 1);
    assert.deepEqual(payload.leads.map(({ outlet }) => outlet), ['Kampai']);

    const tampered = `${cookie}x`;
    assert.equal((await fetch(`${app.baseUrl}/api/admin/leads`, { headers: { cookie: tampered } })).status, 401);

    const expiredPayload = `admin:${Date.now() - 1}`;
    const expiredSignature = createHmac('sha256', 'test-session-secret-that-is-long-enough').update(expiredPayload).digest('base64url');
    const expiredCookie = `avantika_session=${Buffer.from(expiredPayload).toString('base64url')}.${expiredSignature}`;
    assert.equal((await fetch(`${app.baseUrl}/api/admin/leads`, { headers: { cookie: expiredCookie } })).status, 401);

    const exported = await fetch(`${app.baseUrl}/api/admin/export?outlet=${encodeURIComponent('Kampai')}`, {
      headers: { cookie },
    });
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get('content-type'), /text\/csv/);
    assert.match(await exported.text(), /"'=HYPERLINK\(""bad""\)"/);

    const logout = await fetch(`${app.baseUrl}/api/admin/logout`, {
      method: 'POST',
      headers: { cookie },
    });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  } finally {
    await app.close();
  }
});

test('serves the installable guest shell and its local GSAP runtime', async () => {
  const app = await startTestApp();
  try {
    const page = await fetch(`${app.baseUrl}/`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
    assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
    assert.match(page.headers.get('content-security-policy') || '', /default-src 'self'/);
    assert.match(html, /Come in\. Stay awhile\./);
    assert.match(html, /Leave us your name and number—we’ll make sure every visit feels familiar\./);
    assert.match(html, /<body[^>]*class="guest-page"[^>]*data-brand="kampai"/);
    assert.match(html, /<select[^>]*id="outlet-select"[^>]*name="outlet"/);
    for (const brand of ['kampai', 'basque', 'embassy']) {
      assert.match(html, new RegExp(`class="brand-mark brand-mark--${brand}`));
    }
    assert.match(html, /<label[^>]*for="guest-name"[^>]*>Your name<\/label>/);
    assert.match(html, /<label[^>]*for="guest-mobile"[^>]*>Mobile number<\/label>/);
    assert.match(html, /Join Kampai’s guest list/);
    assert.match(html, /manifest\.webmanifest/);
    for (const outlet of ['Kampai', 'Basque', 'Embassy — Connaught Place', 'Embassy — Elan Epic', 'Embassy — Vasant Kunj']) {
      assert.match(html, new RegExp(`<option[^>]*value="${outlet}"`));
    }
    assert.doesNotMatch(html, /class="venue-panel"/);
    assert.match(html, /href="\/admin"/);

    for (const path of [
      '/manifest.webmanifest',
      '/sw.js',
      '/guest.js',
      '/styles.css',
      '/icons/icon.svg',
      '/vendor/gsap.min.js',
      '/brands/kampai-interior.png',
      '/brands/basque-garden.jpg',
      '/brands/embassy-cp.jpg',
      '/brands/embassy-elan.jpg',
      '/brands/embassy-vk.jpg',
      '/brands/basque-garden.webp',
      '/brands/basque-logo.webp',
      '/brands/embassy-heritage.webp',
      '/fonts/cormorant-garamond.woff2',
      '/fonts/cormorant-sc.woff2',
      '/fonts/jost.woff2',
    ]) {
      assert.equal((await fetch(`${app.baseUrl}${path}`)).status, 200, path);
    }

    const guestScript = await (await fetch(`${app.baseUrl}/guest.js`)).text();
    assert.match(guestScript, /const selectedOutlet = outletSelect\.value;/);
    assert.match(guestScript, /outlet: selectedOutlet/);
  } finally {
    await app.close();
  }
});

test('rate limits repeated admin password failures from one client', async () => {
  const app = await startTestApp();
  try {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await request(`${app.baseUrl}/api/admin/login`, {
        method: 'POST',
        json: { password: 'wrong' },
      });
      assert.equal(response.status, 401);
    }
    const blocked = await request(`${app.baseUrl}/api/admin/login`, {
      method: 'POST',
      json: { password: 'correct horse battery staple' },
    });
    assert.equal(blocked.status, 429);
    assert.match(blocked.headers.get('retry-after') || '', /^\d+$/);
  } finally {
    await app.close();
  }
});

test('serves the protected guest-book shell with accessible controls', async () => {
  const app = await startTestApp();
  try {
    const page = await fetch(`${app.baseUrl}/admin`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /<form[^>]*id="login-form"/);
    assert.match(html, /<label[^>]*for="admin-password"[^>]*>Password<\/label>/);
    assert.match(html, /<h1[^>]*>Guest book<\/h1>/);
    assert.match(html, /<label[^>]*for="outlet-filter"[^>]*>Outlet<\/label>/);
    for (const heading of ['Guest', 'Mobile', 'Outlet', 'Arrived']) assert.match(html, new RegExp(`<th[^>]*>${heading}</th>`));
    assert.match(html, /Download guest list/);
    assert.match(html, /Sign out/);
    assert.equal((await fetch(`${app.baseUrl}/admin.js`)).status, 200);
  } finally {
    await app.close();
  }
});
