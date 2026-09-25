# Avantika Group Walk-In Guest List

An installable web app for collecting walk-in guest names and mobile numbers
across Kampai, Basque, and the three Embassy outlets. The private guest book
shows all entries together, filters by outlet, and exports CSV.

## Run locally

Requires Node.js 25 or newer.

```powershell
npm install
$env:ADMIN_PASSWORD = "choose-a-strong-password"
$env:SESSION_SECRET = "generate-a-long-random-secret"
npm start
```

- Guest check-in: `http://localhost:3000/`
- Guest book: `http://localhost:3000/admin`
- Tests: `npm test`

In local development only, omitted secrets use clearly marked development
values. Production startup refuses to run without both secrets.

## Configuration

| Variable | Required in production | Default |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Yes | Development-only fallback |
| `SESSION_SECRET` | Yes | Development-only fallback |
| `PORT` | No | `3000` |
| `DATABASE_PATH` | No | `data/leads.db` |
| `DATABASE_URL` | No | Uses SQLite when absent; Antideploy supplies Postgres |
| `NODE_ENV` | Set to `production` in production | — |

Use a unique, long `SESSION_SECRET` and serve the app behind HTTPS in
production so the secure admin cookie is transmitted only over TLS.

## Data and backups

Local development uses SQLite at `DATABASE_PATH`. Production automatically
uses Postgres when `DATABASE_URL` is present; Antideploy supplies that variable
and creates the `leads` table when the app starts.

The app intentionally stores only name, normalized mobile number, outlet, and
arrival time. Retention tracking, average spend, and visit frequency are not
part of this release.
