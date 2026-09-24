# Walk-In Lead Capture Design

## Outcome

Build a fast, installable web app for Avantika Group that records a guest's
name and Indian mobile number at Kampai, Basque, and the three Embassy
outlets. An authenticated admin view shows every entry together, the total
lead count, outlet filtering, and CSV export.

Phase 2 retention data—last visit, spend, and visit frequency—is explicitly
out of scope.

## Product voice

The guest screen should sound like a good host: warm, assured, and brief.

- Headline: **Your table is almost ready.**
- Supporting copy: **Leave us your name and number, and we’ll take care of the rest.**
- Name label: **Your name**
- Mobile label: **Mobile number**
- Primary action: **Add me to the guest list**
- Privacy note: **Kept private by Avantika Group.**
- Success headline: **You’re on the list.**
- Success copy: **Welcome to {outlet}. We’ll take it from here.**
- Invalid name: **Please enter your name.**
- Invalid mobile: **Enter a valid 10-digit mobile number.**
- Network failure: **We couldn’t save this check-in. Please try once more.**

Admin copy remains operational: **Guest book**, **Total guests**, **All
outlets**, **Download guest list**, and **Sign out**.

## Visual system

### Tokens

- Oxblood `#961F1F`: venue panel and primary actions.
- Deep wine `#641818`: pressed and high-contrast states.
- Porcelain `#FAF6EE`: guest form and admin canvas.
- Ink `#251C18`: primary text.
- Aged brass `#B58A4A`: rules, focus details, and selected venue marker.
- Sage `#58745E`: success confirmation only.

Use **Cormorant Garamond** for expressive headlines and totals, and
**Manrope** for controls, labels, tables, and body copy. System fallbacks must
keep the app readable if web fonts are unavailable.

### Layout

The selected outlet is the one bold visual moment. The guest view uses a
left-aligned split composition on wide screens and stacks the compact outlet
picker over the form on phones.

```text
Desktop / tablet                       Mobile
┌────────────────┬──────────────────┐  ┌─────────────────────┐
│ outlet list    │ invitation copy │  │ selected outlet     │
│                │ name            │  ├─────────────────────┤
│ selected venue │ mobile          │  │ invitation copy     │
│                │ primary action  │  │ name / mobile       │
└────────────────┴──────────────────┘  │ primary action      │
                                      └─────────────────────┘
```

The admin view is a restrained guest ledger, not a dashboard card grid: one
large total, one filter row, and one responsive table.

### Motion

GSAP is limited to interaction feedback:

- On load, reveal the selected outlet rule and invitation copy once.
- On venue change, crossfade the venue name with `autoAlpha` and a small
  `y` transform.
- On successful check-in, replace the form with the confirmation using one
  short transition.
- Use `gsap.matchMedia()` and skip transforms when
  `prefers-reduced-motion: reduce` matches.

No scroll animation, looping decoration, or animated layout properties.

### Liquid glass controls

Liquid glass is reserved for the functional layer: primary actions, outlet
selection, admin filtering, and export. Controls use a 20–28 px backdrop blur,
subtle saturation, a bright inner edge, and a soft depth shadow. The oxblood
primary action is stained glass; secondary controls remain neutral.

Glass never appears behind body copy, form fields, table rows, or decorative
content. Text contrast must remain readable without blur, and
`prefers-reduced-transparency` receives an opaque fallback. Every control keeps
a minimum 44 px touch target and a visible keyboard focus ring.

## Functional behavior

### Guest capture

1. The outlet is selected from five fixed values.
2. The guest enters a name and a 10-digit Indian mobile number.
3. Client validation gives immediate, accessible errors.
4. The server validates and normalizes the same fields before storage.
5. A successful submission shows the venue-specific confirmation and clears
   the form for the next guest.
6. Duplicate numbers are allowed because each row represents a walk-in visit.

### Admin

1. `/admin` opens a password form when no valid session exists.
2. A successful login sets an HTTP-only, same-site session cookie.
3. The guest book shows the total, outlet filter, and newest entries first.
4. CSV export uses the active outlet filter and requires the same session.
5. Logout invalidates the browser session.

## Data and security

SQLite stores `id`, `name`, normalized `mobile`, `outlet`, and UTC
`created_at`. The server uses parameterized statements, request-size limits,
constant-time password comparison, signed session tokens, HTTP-only cookies,
CSV formula escaping, and no client-side admin secret. Production startup
requires `ADMIN_PASSWORD` and `SESSION_SECRET` environment variables.

The database file and secrets are never committed. The app collects no email,
spend, retention, analytics, or location data beyond the selected outlet.

## Architecture

Use Node's built-in HTTP, crypto, and SQLite modules with a small vanilla web
client. GSAP is the only runtime dependency. This keeps deployment and audits
simple while still providing durable storage, server-side protection, and an
installable PWA.

Files are separated by responsibility: server/API, persistence and validation,
guest UI, admin UI, shared styling, and PWA metadata/service worker.

## Acceptance criteria

- A valid guest can be saved from every listed outlet.
- Invalid or oversized input is rejected by both client and server.
- The app remains usable at phone, tablet, and desktop widths.
- Admin data and export are inaccessible without a valid signed session.
- Total count, outlet filter, table, and CSV represent the stored records.
- The manifest and service worker make the shell installable and resilient,
  while lead submission clearly reports offline failure instead of pretending
  to save.
- Keyboard focus, labels, live messages, contrast, and reduced motion meet the
  accessibility baseline.
