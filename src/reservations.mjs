import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';

export const VENUES = {
  'embassy-vk': { name: 'Embassy — Vasant Kunj', image: 'embassy-vk.jpg' },
  'embassy-elan': { name: 'Embassy — Elan Epic', image: 'embassy-elan.jpg' },
  basque: { name: 'Basque', image: 'basque-google.jpg' },
  kampai: { name: 'Kampai', image: 'kampai-google.jpg' },
};
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export const indiaDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function validateBooking(input) {
  const venue = Object.hasOwn(VENUES, input.venue) ? VENUES[input.venue] : null;
  if (!venue) fail('Choose an available restaurant.');
  const name = String(input.name || '').trim();
  let mobile = String(input.mobile || '').replace(/\D/g, '');
  if (mobile.length === 12 && mobile.startsWith('91')) mobile = mobile.slice(2);
  const pax = Number(input.pax), date = String(input.date || ''), time = String(input.time || '');
  if (name.length < 2 || name.length > 80) fail('Enter your name (2–80 characters).');
  if (!/^[6-9]\d{9}$/.test(mobile)) fail('Enter a valid Indian mobile number.');
  if (!Number.isInteger(pax) || pax < 1 || pax > 50) fail('Party size must be between 1 and 50.');
  const stamp = new Date(`${date}T${time}:00+05:30`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !Number.isFinite(+stamp) || stamp <= new Date() || stamp > Date.now() + 180 * 86400000 || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) fail('Choose a future date and time within 180 days.');
  if (String(input.notes || '').length > 500) fail('Special requests must be under 500 characters.');
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(input.request_id || '')) fail('Invalid request identifier. Refresh the page.');
  return { venue: input.venue, outlet: venue.name, name, mobile, pax, date, time, notes: String(input.notes || ''), referral: ['google','website','instagram'].includes(input.referral) ? input.referral : 'direct' };
}

// All writes share one database transaction. Postgres uses a database lock across instances.
export function createReservationStore({ databasePath, connectionString }) {
  const sqlite = connectionString ? null : new DatabaseSync(databasePath);
  const pool = connectionString ? new pg.Pool({ connectionString }) : null;
  let queue = Promise.resolve();
  const schema = 'CREATE TABLE IF NOT EXISTS reservations (id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, token TEXT UNIQUE NOT NULL, payload TEXT NOT NULL);';
  const ready = pool ? pool.query(schema) : Promise.resolve(sqlite.exec(schema));
  async function transaction(fn) {
    const run = async () => {
      await ready;
      const client = pool ? await pool.connect() : null;
      const query = async (sql, args = []) => client ? (await client.query(sql, args)).rows : sqlite.prepare(sql.replace(/\$\d+/g, '?')).all(...args);
      try {
        if (client) { await client.query('BEGIN'); await client.query("SELECT pg_advisory_xact_lock(932846201)"); }
        else sqlite.exec('BEGIN IMMEDIATE');
        const result = await fn(query);
        if (client) await client.query('COMMIT'); else sqlite.exec('COMMIT');
        return result;
      } catch (e) { if (client) await client.query('ROLLBACK'); else sqlite.exec('ROLLBACK'); throw e; }
      finally { client?.release(); }
    };
    const pending = queue.then(run, run); queue = pending.catch(() => {}); return pending;
  }
  return {
    async create(input) {
      const data = validateBooking(input);
      return transaction(async q => {
        const old = await q('SELECT * FROM reservations WHERE request_id=$1', [input.request_id]);
        if (old.length) {
          const r = JSON.parse(old[0].payload);
          if (['venue','name','mobile','pax','date','time','notes','referral'].some(k => r[k] !== data[k])) fail('This request has already been saved. Start a new reservation.',409);
          return { ...r, token: old[0].token };
        }
        const r = { ...data, id: randomUUID(), status: 'pending', created_at: new Date().toISOString(), version: 1, history: [] };
        const token = randomBytes(32).toString('hex');
        await q('INSERT INTO reservations(id,request_id,token,payload) VALUES($1,$2,$3,$4)', [r.id,input.request_id,token,JSON.stringify(r)]);
        return { ...r, token };
      });
    },
    list: () => transaction(async q => (await q('SELECT payload FROM reservations')).map(r => JSON.parse(r.payload))),
    byToken: token => transaction(async q => { const rows = await q('SELECT payload FROM reservations WHERE token=$1',[token]); return rows[0] ? JSON.parse(rows[0].payload) : null; }),
    change(id, input, actor, allowed, token) {
      return transaction(async q => {
        const rows = await q('SELECT * FROM reservations WHERE id=$1',[id]);
        if (!rows.length) fail('Reservation not found.',404);
        const r = JSON.parse(rows[0].payload);
        if (token ? rows[0].token !== token : !allowed.includes(r.outlet)) fail('Access denied.',403);
        if (Number(input.version) !== r.version) fail('This reservation changed. Refresh and try again.',409);
        const transitions = { pending: ['confirmed','declined','cancelled','arrived'], confirmed: ['arrived','cancelled','no-show'], arrived: ['seated'], seated: ['completed'] };
        if (!(transitions[r.status] || []).includes(input.status) || (token && input.status !== 'cancelled')) fail('This action is not available.',409);
        if (['declined','cancelled'].includes(input.status) && !String(input.reason || '').trim()) fail('A reason is required.');
        if (String(input.reason || '').length > 500) fail('Reason is too long.');
        if (input.status === 'confirmed' && input.capacity_checked !== true) fail('Check seating capacity before confirming.');
        if (input.status === 'arrived') {
          if (r.status === 'pending') {
            if (input.capacity_checked !== true) fail('Check seating capacity before confirming at the gate.');
            r.history.push({from:'pending',to:'confirmed',actor,reason:'Confirmed at the gate after capacity check',at:new Date().toISOString()});
            r.status='confirmed';
          }
          if (r.date !== indiaDate()) fail('Only today’s reservations can be checked in.');
          const actual = Number(input.actual_pax);
          if (!Number.isInteger(actual) || actual < 1 || actual > 50) fail('Enter actual party size (1–50).');
          if (actual > r.pax && !input.capacity_checked) fail('Confirm capacity for the additional guests.');
          const inserted = await q("INSERT INTO leads(name,mobile,outlet,pax,visit_date,table_number,lead_source) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",[r.name,r.mobile,r.outlet,actual,r.date,'Waiting','Direct reservation']);
          r.lead_id = Number(inserted[0].id); r.actual_pax = actual; r.arrived_at = new Date().toISOString();
        }
        if (input.status === 'seated') {
          const table = String(input.table_number || '').trim();
          if (!table || table.length > 20) fail('Enter a table number (up to 20 characters).');
          r.table_number = table;
          await q('UPDATE leads SET table_number=$1 WHERE id=$2',[table,r.lead_id]);
        }
        if (input.status === 'no-show' && new Date(`${r.date}T${r.time}:00+05:30`) > new Date()) fail('The booking time has not passed.');
        r.history.push({ from: r.status, to: input.status, actor, reason: String(input.reason || ''), at: new Date().toISOString() });
        r.status = input.status; r.version++;
        await q('UPDATE reservations SET payload=$1 WHERE id=$2',[JSON.stringify(r),id]);
        return r;
      });
    },
    async close() { await queue; await ready; if (pool) await pool.end(); else sqlite.close(); },
  };
}
