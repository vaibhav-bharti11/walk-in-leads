import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createLeadStore, escapeCsvCell } from './domain.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BODY_LIMIT = 16 * 1024;
const SESSION_AGE_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;
const STATIC_FILES = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/admin', ['public/admin.html', 'text/html; charset=utf-8']],
  ['/admin.js', ['public/admin.js', 'text/javascript; charset=utf-8']],
  ['/guest.js', ['public/guest.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['public/styles.css', 'text/css; charset=utf-8']],
  ['/manifest.webmanifest', ['public/manifest.webmanifest', 'application/manifest+json']],
  ['/sw.js', ['public/sw.js', 'text/javascript; charset=utf-8']],
  ['/icons/icon.svg', ['public/icons/icon.svg', 'image/svg+xml']],
  ['/vendor/gsap.min.js', ['node_modules/gsap/dist/gsap.min.js', 'text/javascript; charset=utf-8']],
]);

function json(response, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    ...headers,
  });
  response.end(payload);
}

function empty(response, status, headers = {}) {
  response.writeHead(status, { 'cache-control': 'no-store', ...headers });
  response.end();
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) tooLarge = true;
      else chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) return reject(Object.assign(new Error('Request is too large.'), { status: 413 }));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('Send valid JSON.'), { status: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function safePasswordEqual(candidate, expected, salt) {
  const left = scryptSync(String(candidate ?? ''), salt, 32);
  const right = scryptSync(expected, salt, 32);
  return timingSafeEqual(left, right);
}

function createSessionTools(secret) {
  function sign(payload) {
    return createHmac('sha256', secret).update(payload).digest('base64url');
  }

  return {
    issue() {
      const payload = `admin:${Date.now() + SESSION_AGE_SECONDS * 1000}`;
      return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
    },
    verify(token) {
      if (!token || !token.includes('.')) return false;
      const [encoded, signature] = token.split('.', 2);
      try {
        const payload = Buffer.from(encoded, 'base64url').toString('utf8');
        const expected = sign(payload);
        if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
        const [role, expires] = payload.split(':');
        return role === 'admin' && Number(expires) > Date.now();
      } catch {
        return false;
      }
    },
  };
}

function cookieValue(request, name) {
  for (const part of String(request.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return '';
}

function csvFor(leads) {
  const rows = [
    ['Name', 'Mobile', 'Outlet', 'Date'],
    ...leads.map((lead) => [lead.name, lead.mobile, lead.outlet, lead.created_at]),
  ];
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`;
}

export function createApp({ databasePath, adminPassword, sessionSecret, secureCookies = true }) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const store = createLeadStore(databasePath);
  const sessions = createSessionTools(sessionSecret);
  const passwordSalt = sessionSecret.slice(0, 32);
  const cookieFlags = `Path=/; HttpOnly; SameSite=Strict${secureCookies ? '; Secure' : ''}`;
  // ponytail: per-process limiting fits one Node instance; use a proxy/shared store when horizontally scaled.
  const loginFailures = new Map();

  function authorized(request) {
    return sessions.verify(cookieValue(request, 'avantika_session'));
  }

  async function handler(request, response) {
    const url = new URL(request.url, 'http://localhost');
    response.setHeader('content-security-policy', "default-src 'self'; base-uri 'none'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self'");
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-frame-options', 'DENY');
    if (secureCookies) response.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
    try {
      if (request.method === 'POST' && url.pathname === '/api/leads') {
        const lead = store.add(await readJson(request));
        return json(response, 201, { lead });
      }

      if (request.method === 'POST' && url.pathname === '/api/admin/login') {
        const client = request.socket.remoteAddress || 'unknown';
        const now = Date.now();
        const previous = loginFailures.get(client);
        const failures = previous && previous.resetAt > now ? previous : { count: 0, resetAt: now + LOGIN_WINDOW_MS };
        if (failures.count >= MAX_LOGIN_FAILURES) {
          return json(response, 429, { error: 'Too many sign-in attempts. Try again later.' }, {
            'retry-after': String(Math.ceil((failures.resetAt - now) / 1000)),
          });
        }
        const { password } = await readJson(request);
        if (!safePasswordEqual(password, adminPassword, passwordSalt)) {
          failures.count += 1;
          loginFailures.set(client, failures);
          return json(response, 401, { error: 'That password is not correct.' });
        }
        loginFailures.delete(client);
        return empty(response, 204, {
          'set-cookie': `avantika_session=${sessions.issue()}; Max-Age=${SESSION_AGE_SECONDS}; ${cookieFlags}`,
        });
      }

      if (url.pathname.startsWith('/api/admin/') && !authorized(request)) {
        return json(response, 401, { error: 'Admin sign-in required.' });
      }

      if (request.method === 'GET' && url.pathname === '/api/admin/leads') {
        const outlet = url.searchParams.get('outlet') || undefined;
        return json(response, 200, { total: store.count({ outlet }), leads: store.list({ outlet }) });
      }

      if (request.method === 'GET' && url.pathname === '/api/admin/export') {
        const outlet = url.searchParams.get('outlet') || undefined;
        const payload = csvFor(store.list({ outlet }));
        response.writeHead(200, {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="avantika-guest-list.csv"',
          'content-length': Buffer.byteLength(payload),
          'cache-control': 'no-store',
        });
        return response.end(payload);
      }

      if (request.method === 'POST' && url.pathname === '/api/admin/logout') {
        return empty(response, 204, {
          'set-cookie': `avantika_session=; Max-Age=0; ${cookieFlags}`,
        });
      }

      if (request.method === 'GET' && STATIC_FILES.has(url.pathname)) {
        const [relativePath, contentType] = STATIC_FILES.get(url.pathname);
        const payload = await readFile(join(ROOT, relativePath));
        response.writeHead(200, {
          'content-type': contentType,
          'content-length': payload.length,
          'cache-control': url.pathname === '/sw.js' ? 'no-cache' : 'public, max-age=3600',
        });
        return response.end(payload);
      }

      return json(response, 404, { error: 'Not found.' });
    } catch (error) {
      const status = error.status || (error.field ? 400 : 500);
      const body = { error: status === 500 ? 'Something went wrong.' : error.message };
      if (error.field) body.field = error.field;
      return json(response, status, body);
    }
  }

  return { handler, close: () => store.close() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const production = process.env.NODE_ENV === 'production';
  const adminPassword = process.env.ADMIN_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;
  if (production && (!adminPassword || !sessionSecret)) {
    throw new Error('ADMIN_PASSWORD and SESSION_SECRET are required in production.');
  }
  const databasePath = process.env.DATABASE_PATH || join(ROOT, 'data', 'leads.db');
  const app = createApp({
    databasePath,
    adminPassword: adminPassword || 'change-me-before-production',
    sessionSecret: sessionSecret || 'local-development-secret-change-me',
    secureCookies: production,
  });
  const port = Number(process.env.PORT || 3000);
  createServer(app.handler).listen(port, () => {
    console.log(`Avantika guest list running at http://localhost:${port}`);
  });
}
