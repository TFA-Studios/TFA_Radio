// Version control for the AI script-generation prompt's opening instructions
// (the "command" that tells Claude/Gemini/Ollama how to write — tone,
// approach, what a good radio script sounds like). Producers manage this
// from /dashboard/prompt: see the current live version, draft a new one,
// make a draft live, disable the live one, or edit an existing one.
//
// Editing never overwrites a version in place — it always creates a new
// version (1.0 -> 1.1 -> 1.2, ...) with the edited label/content, so the
// history of what the prompt used to say is never lost. If the version
// being edited was live, the new version takes over as live in its place
// (same net effect as before, just recorded as a new entry instead of a
// silent overwrite); editing an inactive version produces another inactive
// version, leaving the edited-from version untouched.
//
// Only the opening instructional paragraphs are editable this way — the
// per-brief data block (KLANTBRIEF, OPBOUW, EISEN, and the JSON-output
// contract) stays hard-coded in lib/scriptgen.js's buildPrompt(), since
// that part has to reliably reflect the brief's real fields and keep the
// response parseable. Same dual Postgres/in-memory backend pattern as
// lib/db.js and lib/library.js.

import { nanoid } from 'nanoid';

const USE_PG = !!process.env.POSTGRES_URL;

// Exactly the two opening paragraphs that used to be hard-coded in
// buildPrompt() — seeded as version 1.0 so behavior is unchanged until a
// producer actually edits something.
export const DEFAULT_PROMPT_INTRO = [
  'Je bent een ervaren, gelauwerde radiocopywriter bij TFA. Je schrijft al jaren commercials die op de radio ECHT opvallen — niet omdat ze schreeuwen, maar omdat ze goed geschreven zijn: een scherpe invalshoek, natuurlijk ritme, en zinnen die prettig hardop lezen in plaats van zinnen die eruitzien als een opsomming van een briefingformulier.',
  'Schrijf een radiocommercial-script in het Nederlands, gebaseerd op de klantbrief hieronder. Lees de hele brief eerst als geheel — waar wil dit merk mee scoren, wat is de emotie of het gemak dat ze verkopen — en schrijf dan pas. Het resultaat moet klinken als één samenhangend verhaal van een copywriter, met een duidelijke opening, opbouw en afsluiting — nooit als losse feitjes uit de brief die na elkaar zijn geplakt.',
].join('\n\n');

function rowOut(row) {
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    content: row.content,
    status: row.status, // 'live' | 'inactive'
    version: '1.' + (row.versionMinor || 0),
    createdAt: row.createdAt,
  };
}

// ------------------------------------------------------------------------
// In-memory fallback
// ------------------------------------------------------------------------
const mem = { versions: null };

function seedIfEmpty() {
  if (mem.versions) return;
  mem.versions = [
    { id: nanoid(10), label: 'Versie 1 (origineel)', content: DEFAULT_PROMPT_INTRO, status: 'live', versionMinor: 0, createdAt: new Date().toISOString() },
  ];
}

function memNextVersionMinor() {
  return mem.versions.reduce((max, v) => Math.max(max, v.versionMinor || 0), -1) + 1;
}

async function memList() {
  seedIfEmpty();
  return mem.versions.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(rowOut);
}
async function memCreate({ label, content }) {
  seedIfEmpty();
  const entry = { id: nanoid(10), label: label || 'Naamloze versie', content: content || '', status: 'inactive', versionMinor: memNextVersionMinor(), createdAt: new Date().toISOString() };
  mem.versions.push(entry);
  return rowOut(entry);
}
async function memActivate(id) {
  seedIfEmpty();
  const target = mem.versions.find((v) => v.id === id);
  if (!target) return null;
  mem.versions.forEach((v) => { v.status = v.id === id ? 'live' : 'inactive'; });
  return rowOut(target);
}
async function memDeactivate(id) {
  seedIfEmpty();
  const target = mem.versions.find((v) => v.id === id);
  if (!target) return null;
  target.status = 'inactive';
  return rowOut(target);
}
async function memRevise(id, patch) {
  seedIfEmpty();
  const source = mem.versions.find((v) => v.id === id);
  if (!source) return null;
  const wasLive = source.status === 'live';
  const entry = {
    id: nanoid(10),
    label: patch.label !== undefined ? patch.label : source.label,
    content: patch.content !== undefined ? patch.content : source.content,
    status: wasLive ? 'live' : 'inactive',
    versionMinor: memNextVersionMinor(),
    createdAt: new Date().toISOString(),
  };
  if (wasLive) mem.versions.forEach((v) => { v.status = 'inactive'; });
  mem.versions.push(entry);
  return rowOut(entry);
}
async function memGetLive() {
  seedIfEmpty();
  return mem.versions.find((v) => v.status === 'live') || null;
}
async function memDelete(id) {
  seedIfEmpty();
  const i = mem.versions.findIndex((v) => v.id === id);
  if (i === -1) return false;
  mem.versions.splice(i, 1);
  return true;
}

// ------------------------------------------------------------------------
// Postgres backend
// ------------------------------------------------------------------------
let migrated = false;
async function runMigrations() {
  if (!USE_PG || migrated) return;
  const { sql } = await import('@vercel/postgres');
  await sql`
    CREATE TABLE IF NOT EXISTS prompt_versions (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'inactive',
      "versionMinor" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TEXT NOT NULL
    );
  `;
  // Backfills the version column for tables created before it existed.
  await sql`ALTER TABLE prompt_versions ADD COLUMN IF NOT EXISTS "versionMinor" INTEGER NOT NULL DEFAULT 0;`;
  const { rows } = await sql`SELECT id FROM prompt_versions LIMIT 1`;
  if (!rows.length) {
    await sql`
      INSERT INTO prompt_versions (id, label, content, status, "versionMinor", "createdAt")
      VALUES (${nanoid(10)}, 'Versie 1 (origineel)', ${DEFAULT_PROMPT_INTRO}, 'live', 0, ${new Date().toISOString()})
    `;
  }
  migrated = true;
}

async function pgNextVersionMinor(sql) {
  const { rows } = await sql`SELECT COALESCE(MAX("versionMinor"), -1) + 1 AS next FROM prompt_versions`;
  return rows[0].next;
}

async function pgList() {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const { rows } = await sql`SELECT * FROM prompt_versions ORDER BY "createdAt" DESC`;
  return rows.map(rowOut);
}
async function pgCreate({ label, content }) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const versionMinor = await pgNextVersionMinor(sql);
  const entry = { id: nanoid(10), label: label || 'Naamloze versie', content: content || '', status: 'inactive', versionMinor, createdAt: new Date().toISOString() };
  await sql`INSERT INTO prompt_versions (id, label, content, status, "versionMinor", "createdAt") VALUES (${entry.id}, ${entry.label}, ${entry.content}, ${entry.status}, ${entry.versionMinor}, ${entry.createdAt})`;
  return rowOut(entry);
}
async function pgActivate(id) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT id FROM prompt_versions WHERE id = ${id}`;
  if (!existing.rows.length) return null;
  await sql`UPDATE prompt_versions SET status = 'inactive'`;
  await sql`UPDATE prompt_versions SET status = 'live' WHERE id = ${id}`;
  const { rows } = await sql`SELECT * FROM prompt_versions WHERE id = ${id}`;
  return rowOut(rows[0]);
}
async function pgDeactivate(id) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT id FROM prompt_versions WHERE id = ${id}`;
  if (!existing.rows.length) return null;
  await sql`UPDATE prompt_versions SET status = 'inactive' WHERE id = ${id}`;
  const { rows } = await sql`SELECT * FROM prompt_versions WHERE id = ${id}`;
  return rowOut(rows[0]);
}
async function pgRevise(id, patch) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const { rows: sourceRows } = await sql`SELECT * FROM prompt_versions WHERE id = ${id}`;
  const source = sourceRows[0];
  if (!source) return null;
  const wasLive = source.status === 'live';
  const label = patch.label !== undefined ? patch.label : source.label;
  const content = patch.content !== undefined ? patch.content : source.content;
  const versionMinor = await pgNextVersionMinor(sql);
  const entry = { id: nanoid(10), label, content, status: wasLive ? 'live' : 'inactive', versionMinor, createdAt: new Date().toISOString() };
  if (wasLive) await sql`UPDATE prompt_versions SET status = 'inactive'`;
  await sql`INSERT INTO prompt_versions (id, label, content, status, "versionMinor", "createdAt") VALUES (${entry.id}, ${entry.label}, ${entry.content}, ${entry.status}, ${entry.versionMinor}, ${entry.createdAt})`;
  return rowOut(entry);
}
async function pgGetLive() {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const { rows } = await sql`SELECT * FROM prompt_versions WHERE status = 'live' LIMIT 1`;
  return rows[0] ? rowOut(rows[0]) : null;
}
async function pgDelete(id) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const { rowCount } = await sql`DELETE FROM prompt_versions WHERE id = ${id}`;
  return rowCount > 0;
}

// ------------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------------
export async function listPromptVersions() {
  return USE_PG ? pgList() : memList();
}
export async function createPromptVersion(data) {
  return USE_PG ? pgCreate(data) : memCreate(data);
}
export async function activatePromptVersion(id) {
  return USE_PG ? pgActivate(id) : memActivate(id);
}
export async function deactivatePromptVersion(id) {
  return USE_PG ? pgDeactivate(id) : memDeactivate(id);
}
// Edits a version's name and/or instructions — never mutates the source
// version in place. Instead it creates a brand-new version (next minor
// number, e.g. 1.0 -> 1.1) carrying the edited label/content. If the
// source was live, the new version becomes live in its place; otherwise
// the new version is inactive, same as the source was. The source version
// itself is left completely untouched, so its history is preserved.
export async function revisePromptVersion(id, patch) {
  return USE_PG ? pgRevise(id, patch) : memRevise(id, patch);
}
// Permanently removes a version — this one DOES mutate (deletes a row),
// unlike every other write in this file, so the route calling it makes the
// producer confirm first. Deleting the live version just leaves no version
// live (same fallback-to-default behavior as deactivating).
export async function deletePromptVersion(id) {
  return USE_PG ? pgDelete(id) : memDelete(id);
}
// Returns just the live version's content, or '' if none is live (callers
// fall back to DEFAULT_PROMPT_INTRO in that case) — never throws, so a
// prompt-store hiccup never blocks script generation.
export async function getLivePromptIntro() {
  try {
    const live = USE_PG ? await pgGetLive() : await memGetLive();
    return (live && live.content) || '';
  } catch (err) {
    console.error('[promptVersions] getLivePromptIntro failed, using default:', err.message);
    return '';
  }
}
