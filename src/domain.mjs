import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

const { Pool } = pg;

export const OUTLETS = Object.freeze([
  'Kampai',
  'Basque',
  'Embassy — Connaught Place',
  'Embassy — Elan Epic',
  'Embassy — Vasant Kunj',
]);

class LeadValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'LeadValidationError';
    this.field = field;
  }
}

export function normalizeLead(input = {}) {
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 80) {
    throw new LeadValidationError('name', 'Please enter your name.');
  }

  let mobile = typeof input.mobile === 'string' ? input.mobile.replace(/\D/g, '') : '';
  if (mobile.length === 12 && mobile.startsWith('91')) mobile = mobile.slice(2);
  if (!/^[6-9]\d{9}$/.test(mobile)) {
    throw new LeadValidationError('mobile', 'Enter a valid 10-digit mobile number.');
  }

  if (!OUTLETS.includes(input.outlet)) {
    throw new LeadValidationError('outlet', 'Choose one of the listed outlets.');
  }

  const pax = Number(input.pax);
  if (!Number.isInteger(pax) || pax < 1 || pax > 50) {
    throw new LeadValidationError('pax', 'Enter a party size from 1 to 50.');
  }

  const visitDate = typeof input.visit_date === 'string' ? input.visit_date : '';
  const [year, month, day] = visitDate.split('-').map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate)
    || parsedDate.getUTCFullYear() !== year
    || parsedDate.getUTCMonth() !== month - 1
    || parsedDate.getUTCDate() !== day) {
    throw new LeadValidationError('visit_date', 'Choose a valid visit date.');
  }

  return { name, mobile, outlet: input.outlet, pax, visit_date: visitDate };
}

export function escapeCsvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function checkedOutlet(outlet) {
  if (outlet !== undefined && !OUTLETS.includes(outlet)) {
    throw new LeadValidationError('outlet', 'Choose one of the listed outlets.');
  }
  return outlet;
}

export function createLeadStore(filename) {
  const database = new DatabaseSync(filename);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      outlet TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const columns = new Set(database.prepare('PRAGMA table_info(leads)').all().map(({ name }) => name));
  if (!columns.has('pax')) database.exec('ALTER TABLE leads ADD COLUMN pax INTEGER');
  if (!columns.has('visit_date')) database.exec('ALTER TABLE leads ADD COLUMN visit_date TEXT');

  const insert = database.prepare('INSERT INTO leads (name, mobile, outlet, pax, visit_date) VALUES (?, ?, ?, ?, ?)');
  const listAll = database.prepare('SELECT id, name, mobile, outlet, pax, visit_date, created_at FROM leads ORDER BY id DESC');
  const listOutlet = database.prepare('SELECT id, name, mobile, outlet, pax, visit_date, created_at FROM leads WHERE outlet = ? ORDER BY id DESC');
  const countAll = database.prepare('SELECT COUNT(*) AS total FROM leads');
  const countOutlet = database.prepare('SELECT COUNT(*) AS total FROM leads WHERE outlet = ?');

  return {
    add(input) {
      const lead = normalizeLead(input);
      const result = insert.run(lead.name, lead.mobile, lead.outlet, lead.pax, lead.visit_date);
      return { id: Number(result.lastInsertRowid), ...lead };
    },
    list({ outlet } = {}) {
      checkedOutlet(outlet);
      return outlet ? listOutlet.all(outlet) : listAll.all();
    },
    count({ outlet } = {}) {
      checkedOutlet(outlet);
      return Number((outlet ? countOutlet.get(outlet) : countAll.get()).total);
    },
    close() {
      database.close();
    },
  };
}

export async function createPostgresLeadStore(connectionString, PoolClass = Pool) {
  const pool = new PoolClass({ connectionString });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      outlet TEXT NOT NULL,
      pax INTEGER,
      visit_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query('ALTER TABLE leads ADD COLUMN IF NOT EXISTS pax INTEGER; ALTER TABLE leads ADD COLUMN IF NOT EXISTS visit_date DATE;');

  function dateOnly(value) {
    if (!(value instanceof Date)) return value;
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function leadFromRow(row) {
    return {
      ...row,
      id: Number(row.id),
      visit_date: dateOnly(row.visit_date),
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };
  }

  return {
    async add(input) {
      const lead = normalizeLead(input);
      const { rows } = await pool.query(
        'INSERT INTO leads (name, mobile, outlet, pax, visit_date) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [lead.name, lead.mobile, lead.outlet, lead.pax, lead.visit_date],
      );
      return { id: Number(rows[0].id), ...lead };
    },
    async list({ outlet } = {}) {
      checkedOutlet(outlet);
      const { rows } = outlet
        ? await pool.query('SELECT id, name, mobile, outlet, pax, visit_date, created_at FROM leads WHERE outlet = $1 ORDER BY id DESC', [outlet])
        : await pool.query('SELECT id, name, mobile, outlet, pax, visit_date, created_at FROM leads ORDER BY id DESC');
      return rows.map(leadFromRow);
    },
    async count({ outlet } = {}) {
      checkedOutlet(outlet);
      const { rows } = outlet
        ? await pool.query('SELECT COUNT(*) AS total FROM leads WHERE outlet = $1', [outlet])
        : await pool.query('SELECT COUNT(*) AS total FROM leads');
      return Number(rows[0].total);
    },
    close() {
      return pool.end();
    },
  };
}
