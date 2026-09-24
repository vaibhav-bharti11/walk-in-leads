# Walk-In Lead Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production-ready Avantika Group guest capture PWA and protected guest-book admin view.

**Architecture:** A dependency-light Node server owns validation, SQLite persistence, signed admin sessions, and CSV export. Two vanilla browser entry points provide the guest and admin experiences; shared CSS and GSAP deliver the approved responsive visual system and restrained motion.

**Tech Stack:** Node.js 25+, built-in `node:http`, `node:sqlite`, and `node:crypto`; vanilla HTML/CSS/JavaScript; GSAP 3; Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-24-walk-in-lead-capture-design.md`

## Global Constraints

- Collect only guest name, 10-digit Indian mobile number, outlet, and timestamp.
- The five outlet values are Kampai, Basque, Embassy — Connaught Place, Embassy — Elan Epic, and Embassy — Vasant Kunj.
- Production requires `ADMIN_PASSWORD` and `SESSION_SECRET`.
- Admin routes and CSV export require a signed HTTP-only session.
- GSAP motion must be disabled for `prefers-reduced-motion: reduce`.
- Liquid glass is limited to functional controls and has an opaque reduced-transparency fallback.
- Do not add Phase 2 retention, spend, visit-frequency, or analytics features.

## Review Focus

- Whitespace, punctuation, or `+91` in mobile input normalizes to ten digits; other lengths fail.
- Unknown outlet values fail without reaching SQLite.
- Oversized or malformed JSON returns a controlled 400/413 response.
- CSV cells beginning with `=`, `+`, `-`, or `@` are escaped against spreadsheet formulas.
- Expired, tampered, or absent session cookies cannot read or export leads.

---

### Task 1: Domain validation and persistence

**Files:**
- Create: `package.json`
- Create: `src/domain.mjs`
- Create: `test/domain.test.mjs`
- Create: `.gitignore`

**Interfaces:**
- Produces: `OUTLETS`, `normalizeLead(input)`, `escapeCsvCell(value)`, and `createLeadStore(filename)`.

- [ ] **Step 1: Write failing domain tests**

Test valid normalization, invalid name/mobile/outlet, duplicate visit storage,
newest-first listing, outlet filtering, total count, and CSV formula escaping
with `node:test` and a temporary SQLite file.

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test test/domain.test.mjs`

Expected: FAIL because `src/domain.mjs` does not exist.

- [ ] **Step 3: Implement the minimum domain module**

Use a fixed outlet array, trim/collapse the name, strip an optional `91`
prefix from digit-only mobile input, and store rows with parameterized SQLite
statements. `createLeadStore()` exposes `add()`, `list({ outlet })`, `count({
outlet })`, and `close()`.

- [ ] **Step 4: Verify GREEN**

Run: `node --test test/domain.test.mjs`

Expected: all domain tests PASS.

### Task 2: HTTP API and admin security

**Files:**
- Create: `src/server.mjs`
- Create: `test/server.test.mjs`

**Interfaces:**
- Consumes: domain exports from Task 1.
- Produces: `createApp(options)` returning a Node request handler plus `close()`.

- [ ] **Step 1: Write failing API tests**

Start the app on an ephemeral port and test `POST /api/leads`, validation
errors, body limits, failed/successful admin login, signed-cookie access,
tampered cookies, filtered listing, formula-safe CSV export, and logout.

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test test/server.test.mjs`

Expected: FAIL because `src/server.mjs` does not exist.

- [ ] **Step 3: Implement the minimum server**

Use `crypto.scryptSync` plus `timingSafeEqual` for password comparison. Sign a
short-lived session payload with HMAC SHA-256. Parse at most 16 KiB of JSON,
serve exact public files, expose the tested API routes, and serialize filtered
rows to UTF-8 CSV with a BOM.

- [ ] **Step 4: Verify GREEN and the full backend suite**

Run: `node --test test/domain.test.mjs test/server.test.mjs`

Expected: all tests PASS with no warnings.

### Task 3: Guest PWA

**Files:**
- Create: `public/index.html`
- Create: `public/guest.js`
- Create: `public/styles.css`
- Create: `public/manifest.webmanifest`
- Create: `public/sw.js`
- Create: `public/icons/icon.svg`

**Interfaces:**
- Consumes: `POST /api/leads`; GSAP from `/vendor/gsap.min.js`.

- [ ] **Step 1: Add failing shell assertions**

Extend `test/server.test.mjs` to request `/`, the manifest, service worker, and
GSAP route; assert the guest HTML contains labeled name/mobile controls, all
five outlets, the approved copy, and a manifest link.

- [ ] **Step 2: Verify RED**

Run: `node --test test/server.test.mjs`

Expected: FAIL with missing public assets.

- [ ] **Step 3: Build the responsive guest experience**

Implement the approved split layout, liquid-glass controls, client validation, accessible live
messages, disabled submission state, venue-specific success state, keyboard
focus, and a reset action. Add only the three approved GSAP interactions via
`gsap.matchMedia()`; use CSS for ordinary hover/focus states.

- [ ] **Step 4: Verify GREEN**

Run: `node --test test/server.test.mjs`

Expected: all guest-shell and API tests PASS.

### Task 4: Protected guest book

**Files:**
- Create: `public/admin.html`
- Create: `public/admin.js`

**Interfaces:**
- Consumes: `/api/admin/login`, `/api/admin/leads`, `/api/admin/export`, and `/api/admin/logout`.

- [ ] **Step 1: Add failing admin-shell assertions**

Extend `test/server.test.mjs` to assert `/admin` contains the password form,
guest-book heading, outlet filter, accessible table headings, download action,
and sign-out action.

- [ ] **Step 2: Verify RED**

Run: `node --test test/server.test.mjs`

Expected: FAIL with missing admin assets.

- [ ] **Step 3: Build login and ledger states**

Render authentication, empty, loading, error, and populated states. Refresh
the total and newest-first rows when the outlet filter changes. Export through
the protected server route and return to login after logout or a 401.

- [ ] **Step 4: Verify GREEN**

Run: `node --test test/server.test.mjs`

Expected: all admin-shell and API tests PASS.

### Task 5: Run and visually verify

**Files:**
- Create: `README.md`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm start`, `npm test`, documented environment variables, and deployment notes.

- [ ] **Step 1: Add start scripts and operator documentation**

Document `ADMIN_PASSWORD`, `SESSION_SECRET`, `PORT`, `DATABASE_PATH`, the local
URLs, backup requirement for the SQLite file, and the production HTTPS
requirement.

- [ ] **Step 2: Run all automated checks**

Run: `npm test`

Expected: all tests PASS with no errors or warnings.

- [ ] **Step 3: Run the app and inspect both surfaces**

Open `/` at phone and tablet widths and `/admin` at desktop width. Submit a
real test entry, confirm it appears in the guest book, filter it, export it,
sign out, and confirm direct API access returns 401.

- [ ] **Step 4: Audit the final visuals**

Compare with `design/walkin-lead-concept-v1.png`; remove any decorative element
that weakens the outlet/form hierarchy. Confirm the revised guest copy is
prominent, readable, and not truncated at 320 px.
