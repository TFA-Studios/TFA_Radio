// Proof copies: a locked, timestamped copy of everything the client filled in
// and chose (all 7 steps), saved at the moments that matter (submitting the
// brief, choosing a script, confirming) so there is evidence if a client later
// says "I never said that". Insert-only: nothing here updates or edits a copy.
// Each copy carries a SHA-256 fingerprint (lib/proofHash.js), the client's IP
// address and browser. Same Postgres-or-memory pattern as lib/library.js.
import { nanoid } from 'nanoid';
import { singleFlight } from './singleFlight.js';
import { proofHash } from './proofHash.js';
import { briefAnswerSections, briefChoiceSections } from './briefAnswers.js';
import { SNAPSHOT_KINDS } from './snapshotKinds.js';

const USE_PG = !!process.env.POSTGRES_URL;
const mem = { rows: [] };

export { SNAPSHOT_KINDS };

const migrate = singleFlight(async function run() {
  if (!USE_PG) return;
  const { sql } = await import('@vercel/postgres');
  await sql`
    CREATE TABLE IF NOT EXISTS brief_snapshots (
      id TEXT PRIMARY KEY,
      brief_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL,
      hash TEXT NOT NULL,
      ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS brief_snapshots_brief_idx ON brief_snapshots (brief_id)`;
});

function out(row, withData) {
  const o = { id: row.id, briefId: row.brief_id, kind: row.kind, createdAt: row.created_at, hash: row.hash, ip: row.ip, userAgent: row.user_agent };
  if (withData) o.sections = JSON.parse(row.data);
  return o;
}

// `by` is who triggered it: the client's request details, or 'TFA'.
export async function saveSnapshot(brief, kind, { ip = '', userAgent = '' } = {}) {
  const createdAt = new Date().toISOString();
  const sections = briefAnswerSections(brief).concat(briefChoiceSections(brief));
  const row = {
    id: nanoid(12), brief_id: brief.id, kind, created_at: createdAt,
    hash: proofHash({ briefId: brief.id, kind, createdAt, sections }),
    ip: String(ip || '').slice(0, 80), user_agent: String(userAgent || '').slice(0, 300), data: JSON.stringify(sections),
  };
  if (!USE_PG) { mem.rows.push(row); return out(row, false); }
  await migrate();
  const { sql } = await import('@vercel/postgres');
  await sql`INSERT INTO brief_snapshots (id, brief_id, kind, created_at, hash, ip, user_agent, data) VALUES (${row.id}, ${row.brief_id}, ${row.kind}, ${row.created_at}, ${row.hash}, ${row.ip}, ${row.user_agent}, ${row.data})`;
  return out(row, false);
}

// Newest first, without the answers themselves.
export async function listSnapshots(briefId) {
  if (!USE_PG) return mem.rows.filter((r) => r.brief_id === briefId).map((r) => out(r, false)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  await migrate();
  const { sql } = await import('@vercel/postgres');
  const res = await sql`SELECT id, brief_id, kind, created_at, hash, ip, user_agent, '' AS data FROM brief_snapshots WHERE brief_id = ${briefId} ORDER BY created_at DESC`;
  return res.rows.map((r) => ({ id: r.id, briefId: r.brief_id, kind: r.kind, createdAt: r.created_at, hash: r.hash, ip: r.ip, userAgent: r.user_agent }));
}

export async function getSnapshot(briefId, id) {
  if (!USE_PG) { const r = mem.rows.find((x) => x.id === id && x.brief_id === briefId); return r ? out(r, true) : null; }
  await migrate();
  const { sql } = await import('@vercel/postgres');
  const res = await sql`SELECT * FROM brief_snapshots WHERE id = ${id} AND brief_id = ${briefId}`;
  return res.rows[0] ? out(res.rows[0], true) : null;
}

// Only used when a brief itself is permanently removed (archived or test briefs).
export async function deleteSnapshotsOf(briefIds) {
  const ids = (briefIds || []).filter((x) => typeof x === 'string' && x);
  if (!ids.length) return;
  if (!USE_PG) { mem.rows = mem.rows.filter((r) => !ids.includes(r.brief_id)); return; }
  await migrate();
  const { sql } = await import('@vercel/postgres');
  await sql.query(`DELETE FROM brief_snapshots WHERE brief_id IN (${ids.map((_, i) => '$' + (i + 1)).join(',')})`, ids);
}

// True when the stored fingerprint still matches the stored answers.
export function snapshotIntact(snap) {
  return !!snap && snap.hash === proofHash({ briefId: snap.briefId, kind: snap.kind, createdAt: snap.createdAt, sections: snap.sections });
}
