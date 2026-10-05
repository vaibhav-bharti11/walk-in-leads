# Avantika Hospitality Collection — Guest Concierge Ledger

An installable web app for collecting walk-in guest names, mobile numbers, party size, and visit date
across Kampai, Basque, and the three Embassy outlets. The private concierge ledger
shows all entries together, filters by outlet, searches in real time, and synchronizes
instantly with Google Sheets API v4.

## Run locally

Requires Node.js 25 or newer.

```powershell
npm install
$env:ADMIN_PASSWORD = "choose-a-strong-password"
$env:KAMPAI_ADMIN_PASSWORD = "choose-a-strong-password"
$env:BASQUE_ADMIN_PASSWORD = "choose-a-strong-password"
$env:EMBASSY_ADMIN_PASSWORD = "choose-a-strong-password"
$env:SESSION_SECRET = "generate-a-long-random-secret"
npm start
```

- Guest check-in: `http://localhost:3000/`
- Guest book: `http://localhost:3000/admin`
- Tests: `npm test`

In local development only, omitted secrets use clearly marked development
values. Production startup refuses to run without all admin passwords and the session secret.

## Configuration

| Variable | Required in production | Default |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Yes | Development-only fallback |
| `KAMPAI_ADMIN_PASSWORD` | Yes | — |
| `BASQUE_ADMIN_PASSWORD` | Yes | — |
| `EMBASSY_ADMIN_PASSWORD` | Yes | — |
| `SESSION_SECRET` | Yes | Development-only fallback |
| `PORT` | No | `3000` |
| `DATABASE_PATH` | No | `data/leads.db` |
| `DATABASE_URL` | No | Uses SQLite when absent; Antideploy supplies Postgres |
| `GOOGLE_SHEET_ID` | No | Google Spreadsheet ID (from spreadsheet URL) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | No | Google Cloud Service Account email |
| `GOOGLE_PRIVATE_KEY` | No | Google Cloud Service Account RSA private key (with `\n` preserved) |
| `GOOGLE_SHEET_NAME` | No | Sheet/Tab name (defaults to `Sheet1`) |
| `GOOGLE_SHEET_WEBHOOK_URL` | No | Alternative: Google Apps Script Web App URL for zero-auth sync |
| `NODE_ENV` | Set to `production` in production | — |

Use a unique, long `SESSION_SECRET` and serve the app behind HTTPS in
production so the secure admin cookie is transmitted only over TLS.

## Google Sheets Integration

The app supports two ways to synchronize leads to Google Sheets:

### Option A: Official Google Sheets API v4 (Recommended)
1. In Google Cloud Console, enable the **Google Sheets API**.
2. Create a **Service Account** and generate a JSON key.
3. Open your Google Sheet, click **Share**, and invite the service account email (e.g. `service-account@project.iam.gserviceaccount.com`) as an **Editor**.
4. Set the following environment variables:
   - `GOOGLE_SHEET_ID`: The ID from your sheet URL `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Your service account email
   - `GOOGLE_PRIVATE_KEY`: The `"private_key"` from the service account JSON
   - `GOOGLE_SHEET_NAME` *(optional)*: `Sheet1`

### Option B: Google Apps Script Webhook (No GCP credentials required)
1. In your Google Sheet, open **Extensions > Apps Script**.
2. Paste the following script:
```javascript
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  const headers = data.headers || ["ID", "Name", "Mobile", "Outlet", "Guests", "Visit date", "Timestamp", "Table", "Source"];
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  else sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (data.rows) {
    data.rows.forEach(row => sheet.appendRow(row));
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (data.action === "bulk_sync" && Array.isArray(data.leads)) {
    data.leads.forEach(function(lead) {
      sheet.appendRow([lead.id, lead.name, lead.mobile, lead.outlet, lead.pax, lead.visit_date, lead.created_at, lead.table_number, lead.lead_source]);
    });
  } else {
    var lead = data.lead || data;
    sheet.appendRow([lead.id, lead.name, lead.mobile, lead.outlet, lead.pax, lead.visit_date, lead.created_at || data.timestamp, lead.table_number, lead.lead_source]);
  }
  return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
}
```
3. Click **Deploy > New deployment > Web app**. Set *Who has access* to **Anyone**.
4. Set the Web App URL as `GOOGLE_SHEET_WEBHOOK_URL` in your environment.

## Data and backups

Local development uses SQLite at `DATABASE_PATH`. Production automatically
uses Postgres when `DATABASE_URL` is present; Antideploy supplies that variable
and creates the `leads` table when the app starts.

The app intentionally stores only name, normalized mobile number, outlet, party size,
visit date, and arrival time. Retention tracking, average spend, and visit frequency are not
part of this release.
