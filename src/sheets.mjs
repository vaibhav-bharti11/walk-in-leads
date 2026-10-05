import { createSign } from 'node:crypto';

let cachedToken = null;
let tokenExpiresAt = 0;

export const SHEET_HEADERS = Object.freeze(['ID', 'Name', 'Mobile', 'Outlet', 'Guests', 'Visit date', 'Timestamp', 'Table', 'Source']);
export const SHEET_VALUE_INPUT_OPTION = 'RAW';

export function shouldWriteSheetHeaders(firstRow = []) {
  return firstRow.length === 0 || (firstRow[0] === 'ID' && firstRow[1] === 'Name');
}

export function leadToSheetRow(item) {
  return [item.id, item.name, item.mobile, item.outlet, item.pax, item.visit_date, item.created_at || new Date().toISOString(), item.table_number, item.lead_source];
}

function webhookValue(value, forceText = false) {
  if (typeof value !== 'string' || value.startsWith("'")) return value;
  return forceText || /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function leadForWebhook(item) {
  return Object.fromEntries(Object.entries(item).map(([key, value]) => [key, webhookValue(value, key === 'table_number')]));
}

export function leadToWebhookRow(item) {
  return leadToSheetRow(leadForWebhook(item));
}

/**
 * Mint or return a cached OAuth2 access token for Google Sheets API v4 using a Service Account.
 */
export async function getGoogleServiceAccountToken({ clientEmail, privateKey }) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && tokenExpiresAt > now + 60) {
    return cachedToken;
  }

  // Normalize private key (handles escaped newlines \n in env strings)
  const normalizedKey = privateKey.includes('\\n')
    ? privateKey.replace(/\\n/g, '\n')
    : privateKey;

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claimSet = Buffer.from(
    JSON.stringify({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })
  ).toString('base64url');

  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claimSet}`);
  signer.end();
  const signature = signer.sign(normalizedKey, 'base64url');
  const jwt = `${header}.${claimSet}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Google OAuth2 token request failed (${tokenRes.status}): ${errText}`);
  }

  const tokenData = await tokenRes.json();
  cachedToken = tokenData.access_token;
  tokenExpiresAt = now + (tokenData.expires_in || 3600);
  return cachedToken;
}

/**
 * Append row(s) to a Google Sheet using Google Sheets API v4.
 */
export async function appendToGoogleSheet({
  spreadsheetId,
  sheetName = 'Sheet1',
  clientEmail,
  privateKey,
  rows,
}) {
  const token = await getGoogleServiceAccountToken({ clientEmail, privateKey });
  const range = `${sheetName}!A:I`;
  const headerRange = `${sheetName}!A1:I1`;
  const headerBaseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodeURIComponent(headerRange)}`;
  const headerReadResponse = await fetch(headerBaseUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!headerReadResponse.ok) {
    const errText = await headerReadResponse.text();
    throw new Error(`Google Sheets header check failed (${headerReadResponse.status}): ${errText}`);
  }
  const headerData = await headerReadResponse.json();
  if (shouldWriteSheetHeaders(headerData.values?.[0] || [])) {
    const headerResponse = await fetch(`${headerBaseUrl}?valueInputOption=${SHEET_VALUE_INPUT_OPTION}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ range: headerRange, majorDimension: 'ROWS', values: [SHEET_HEADERS] }),
    });
    if (!headerResponse.ok) {
      const errText = await headerResponse.text();
      throw new Error(`Google Sheets header update failed (${headerResponse.status}): ${errText}`);
    }
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodeURIComponent(range)}:append?valueInputOption=${SHEET_VALUE_INPUT_OPTION}&insertDataOption=INSERT_ROWS`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values: rows,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Sheets API append failed (${response.status}): ${errText}`);
  }

  return response.json();
}

/**
 * High-level helper to sync a single lead or batch of leads to Google Sheets.
 */
export async function syncLeadToGoogleSheets({
  lead,
  leads,
  config = {},
}) {
  const {
    googleSheetId = process.env.GOOGLE_SHEET_ID,
    googleServiceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    googlePrivateKey = process.env.GOOGLE_PRIVATE_KEY,
    googleSheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1',
    googleSheetWebhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL,
  } = config;

  // 1. If Google Service Account is configured, use official Google Sheets API v4
  if (googleSheetId && googleServiceAccountEmail && googlePrivateKey) {
    const list = leads || (lead ? [lead] : []);
    if (!list.length) return { count: 0 };

    const rows = list.map(leadToSheetRow);

    await appendToGoogleSheet({
      spreadsheetId: googleSheetId,
      sheetName: googleSheetName,
      clientEmail: googleServiceAccountEmail,
      privateKey: googlePrivateKey,
      rows,
    });

    return { success: true, api: 'google_sheets_v4', count: rows.length };
  }

  // 2. If Google Sheet Webhook / Apps Script is configured
  if (googleSheetWebhookUrl) {
    const list = leads || (lead ? [lead] : []);
    const rows = list.map(leadToWebhookRow);
    const safeLeads = list.map(leadForWebhook);
    const res = await fetch(googleSheetWebhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: leads ? 'bulk_sync' : 'append_lead',
        leads: safeLeads,
        lead: safeLeads[0],
        headers: SHEET_HEADERS,
        rows,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      throw new Error(`Google Sheets webhook failed with HTTP ${res.status}`);
    }
    return { success: true, api: 'webhook', count: list.length };
  }

  return { success: false, notConfigured: true };
}
