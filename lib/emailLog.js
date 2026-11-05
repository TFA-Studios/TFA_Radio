// One row per email the app sends, with what Resend later tells us about it
// (delivered, bounced, marked as spam). Lets a producer see per brief whether
// the client's mail really arrived. Same Postgres-or-memory pattern as lib/library.js.
import { nanoid } from 'nanoid';
import { singleFlight } from './singleFlight.js';
import { nextEmailStatus } from './emailStatus.js';
import { parseJsonArray } from './jsonArray.js';

const USE_PG = !!process.env.POSTGRES_URL;
const mem = { rows: [] };
const MAX_EVENTS = 20;

const migrate = singleFlight(async function run() {
  if (!USE_PG) return;
  const { sql } = await import('@vercel/postgres');
  await sql`
    CREATE TABLE IF NOT EXISTS email_log (
      id TEXT PRIMARY KEY,
      brief_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT '',
      recipients TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      resend_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'sent',
      detail TEXT NOT NULL DEFAULT '',
      events TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS email_log_brief_idx ON email_log (brief_id)`;
  await sql`CREATE INDEX IF NOT EXISTS email_log_resend_idx ON email_log (resend_id)`;
});

function out(r) {
  return { id: r.id, briefId: r.brief_id, kind: r.kind, to: r.recipients, subject: r.subject, status: r.status, detail: r.detail, events: parseJsonArray(r.events), createdAt: r.created_at, updatedAt: r.updated_at };
}

// status: 'sent' (accepted by Resend), 'failed' or 'not_sent' (no key / no address; kept as a row in sent_emails).
export async function logEmail({ briefId, kind, to, subject, resendId = '', status = 'sent', detail = '' }) {
  const now = new Date().toISOString();
  const row = { id: nanoid(12), brief_id: briefId, kind: kind || '', recipients: Array.isArray(to) ? to.join(', ') : String(to || ''), subject: subject || '', resend_id: resendId, status, detail: String(detail).slice(0, 500), events: '[]', created_at: now, updated_at: now };
  if (!USE_PG) { mem.rows.push(row); return out(row); }
  await migrate();
  const { sql } = await import('@vercel/postgres');
  await sql`INSERT INTO email_log (id, brief_id, kind, recipients, subject, resend_id, status, detail, events, created_at, updated_at) VALUES (${row.id}, ${row.brief_id}, ${row.kind}, ${row.recipients}, ${row.subject}, ${row.resend_id}, ${row.status}, ${row.detail}, '[]', ${now}, ${now})`;
  return out(row);
}

export async function listEmailLog(briefId) {
  if (!USE_PG) return mem.rows.filter((r) => r.brief_id === briefId).map(out).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  await migrate();
  const { sql } = await import('@vercel/postgres');
  const res = await sql`SELECT * FROM email_log WHERE brief_id = ${briefId} ORDER BY created_at DESC`;
  return res.rows.map(out);
}

// Applies one Resend webhook event. Returns the updated entry (plus previousStatus), or null when we
// have no email with that id (e.g. sent from another system on the same account).
export async function applyEmailEvent({ resendId, type, at, detail = '' }) {
  if (!resendId) return null;
  let row;
  if (!USE_PG) row = mem.rows.find((r) => r.resend_id === resendId);
  else {
    await migrate();
    const { sql } = await import('@vercel/postgres');
    row = (await sql`SELECT * FROM email_log WHERE resend_id = ${resendId} LIMIT 1`).rows[0];
  }
  if (!row) return null;
  const events = parseJsonArray(row.events).concat({ type, at: at || new Date().toISOString(), detail: String(detail).slice(0, 300) }).slice(-MAX_EVENTS);
  const status = nextEmailStatus(row.status, type);
  const now = new Date().toISOString();
  const problem = status !== row.status && status !== 'delivered' && status !== 'sent' && status !== 'delayed';
  const newDetail = problem && detail ? String(detail).slice(0, 500) : row.detail;
  const previousStatus = row.status;
  if (!USE_PG) { Object.assign(row, { status, events: JSON.stringify(events), updated_at: now, detail: newDetail }); return { ...out(row), previousStatus }; }
  const { sql } = await import('@vercel/postgres');
  await sql`UPDATE email_log SET status = ${status}, events = ${JSON.stringify(events)}, updated_at = ${now}, detail = ${newDetail} WHERE id = ${row.id}`;
  return { ...out({ ...row, status, events: JSON.stringify(events), updated_at: now, detail: newDetail }), previousStatus };
}

export async function deleteEmailLogOf(briefIds) {
  const ids = (briefIds || []).filter((x) => typeof x === 'string' && x);
  if (!ids.length) return;
  if (!USE_PG) { mem.rows = mem.rows.filter((r) => !ids.includes(r.brief_id)); return; }
  await migrate();
  const { sql } = await import('@vercel/postgres');
  await sql.query(`DELETE FROM email_log WHERE brief_id IN (${ids.map((_, i) => '$' + (i + 1)).join(',')})`, ids);
}
