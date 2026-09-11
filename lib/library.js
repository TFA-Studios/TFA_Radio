// Data layer for the producer-facing music/voice library (app/dashboard/library).
// There's no equivalent table in the original Express app — the client-flow
// voice/music pages there use hard-coded in-memory pools (see voice.html's
// VOICE_POOL and music.html's PLAYLISTS). This gives the producer dashboard
// a real, editable backing store for the same idea, with the same
// Postgres-or-in-memory fallback pattern as lib/db.js.

import { nanoid } from 'nanoid';

const USE_PG = !!process.env.POSTGRES_URL;

// These are TFA's own curated playlist names (not a generic genre list) —
// producers have already been organizing tracks around them internally, so
// the category names here match that curation rather than something new.
export const MUSIC_CATEGORIES = ['Upbeat & Energiek', 'Warm & Vertrouwd', 'Zakelijk & Strak', 'Speels & Luchtig', 'Chill & Modern', 'Klassiek & Tijdloos'];

// One short line per playlist, shown to the client on the music-picker step.
// Deliberately describes the music itself (tempo, instrumentation, texture)
// rather than a target industry or use-case ("voor food", "voor B2B", ...) —
// naming an industry risks a client dismissing a track that would actually
// suit them just because the label named a different sector.
export const MUSIC_CATEGORY_DESCRIPTIONS = {
  'Upbeat & Energiek': 'Drijvend en vol energie, met een hoog tempo en een sterk, herkenbaar ritme.',
  'Warm & Vertrouwd': 'Akoestisch en ingetogen, met een zachte, oprechte klank.',
  'Zakelijk & Strak': 'Minimalistisch en strak geproduceerd, met een heldere, doelgerichte klank.',
  'Speels & Luchtig': 'Speels en kleurrijk, met een lichte, vrolijke melodie.',
  'Chill & Modern': 'Ontspannen en hedendaags, met een subtiele lo-fi productie.',
  'Klassiek & Tijdloos': 'Orkestraal en op piano gespeeld, met een elegante, tijdloze uitstraling.',
};

export const DEFAULT_VOICE_TAGS = [
  'Warm & vertrouwd',
  'Zakelijk & professioneel',
  'Energiek & enthousiast',
  'Rustig & kalm',
  'Speels & vrolijk',
];

function seedTracks() {
  return [
    { id: nanoid(10), title: 'Bright Momentum', artist: 'Nova Sound', category: 'Upbeat & Energiek', duration: '0:22', audioUrl: '', fileId: '', originalFilename: '' },
    { id: nanoid(10), title: 'Home Ground', artist: 'Elin Voss', category: 'Warm & Vertrouwd', duration: '0:22', audioUrl: '', fileId: '', originalFilename: '' },
    { id: nanoid(10), title: 'Clear Line', artist: 'Studio Halden', category: 'Zakelijk & Strak', duration: '0:20', audioUrl: '', fileId: '', originalFilename: '' },
    { id: nanoid(10), title: 'Sunny Side', artist: 'Milo Park', category: 'Upbeat & Energiek', duration: '0:20', audioUrl: '', fileId: '', originalFilename: '' },
    { id: nanoid(10), title: 'Slow Bloom', artist: 'Yuna Marsh', category: 'Chill & Modern', duration: '0:22', audioUrl: '', fileId: '', originalFilename: '' },
    { id: nanoid(10), title: 'Quiet Grandeur', artist: 'Wren Solberg', category: 'Klassiek & Tijdloos', duration: '0:23', audioUrl: '', fileId: '', originalFilename: '' },
    { id: nanoid(10), title: 'Grid System', artist: 'Iris Noor', category: 'Speels & Luchtig', duration: '0:23', audioUrl: '', fileId: '', originalFilename: '' },
    { id: nanoid(10), title: 'First Light', artist: 'Ensemble Aurea', category: 'Klassiek & Tijdloos', duration: '0:22', audioUrl: '', fileId: '', originalFilename: '' },
  ].map((t) => ({ ...t, createdAt: new Date().toISOString() }));
}

function seedVoices() {
  return [
    { id: nanoid(10), name: 'Sanne', gender: 'vrouw', ageRange: '35-54', tags: ['Warm & vertrouwd', 'Rustig & kalm'], audioUrl: '', fileId: '', originalFilename: '' },
    { id: nanoid(10), name: 'Naomi', gender: 'vrouw', ageRange: '18-34', tags: ['Energiek & enthousiast', 'Speels & vrolijk'], audioUrl: '', fileId: '', originalFilename: '' },
    { id: nanoid(10), name: 'Daan', gender: 'man', ageRange: '35-54', tags: ['Zakelijk & professioneel', 'Rustig & kalm'], audioUrl: '', fileId: '', originalFilename: '' },
    { id: nanoid(10), name: 'Bram', gender: 'man', ageRange: '18-34', tags: ['Energiek & enthousiast', 'Speels & vrolijk'], audioUrl: '', fileId: '', originalFilename: '' },
    { id: nanoid(10), name: 'Marit', gender: 'vrouw', ageRange: '55+', tags: ['Warm & vertrouwd', 'Rustig & kalm'], audioUrl: '', fileId: '', originalFilename: '' },
    { id: nanoid(10), name: 'Ruben', gender: 'man', ageRange: '35-54', tags: ['Zakelijk & professioneel', 'Warm & vertrouwd'], audioUrl: '', fileId: '', originalFilename: '' },
  ].map((v) => ({ ...v, createdAt: new Date().toISOString() }));
}

const mem = {
  tracks: null,
  voices: null,
};
function memTracks() {
  if (!mem.tracks) mem.tracks = seedTracks();
  return mem.tracks;
}
function memVoices() {
  if (!mem.voices) mem.voices = seedVoices();
  return mem.voices;
}

let migrated = false;
async function runMigrations() {
  if (!USE_PG || migrated) return;
  const { sql } = await import('@vercel/postgres');
  await sql`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      artist TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      duration TEXT NOT NULL DEFAULT '',
      "audioUrl" TEXT NOT NULL DEFAULT '',
      "fileId" TEXT NOT NULL DEFAULT '',
      "originalFilename" TEXT NOT NULL DEFAULT '',
      "createdAt" TEXT NOT NULL
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS voices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT '',
      "ageRange" TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      "audioUrl" TEXT NOT NULL DEFAULT '',
      "fileId" TEXT NOT NULL DEFAULT '',
      "originalFilename" TEXT NOT NULL DEFAULT '',
      "createdAt" TEXT NOT NULL
    );
  `;
  // Additive migrations for tables created before these columns existed.
  await sql`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS "audioUrl" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE voices ADD COLUMN IF NOT EXISTS "audioUrl" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS "fileId" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE voices ADD COLUMN IF NOT EXISTS "fileId" TEXT NOT NULL DEFAULT '';`;
  // Original uploaded filename — kept separate from the client-facing
  // title/name so the producer can trace which file version was uploaded.
  await sql`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS "originalFilename" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE voices ADD COLUMN IF NOT EXISTS "originalFilename" TEXT NOT NULL DEFAULT '';`;
  migrated = true;
}

function trackRowOut(row) {
  return row ? { id: row.id, title: row.title, artist: row.artist, category: row.category, duration: row.duration, audioUrl: row.audioUrl || '', fileId: row.fileId || '', originalFilename: row.originalFilename || '', createdAt: row.createdAt } : null;
}
function voiceRowOut(row) {
  if (!row) return null;
  let tags = [];
  try { tags = JSON.parse(row.tags || '[]'); } catch (e) { tags = []; }
  return { id: row.id, name: row.name, gender: row.gender, ageRange: row.ageRange, tags, audioUrl: row.audioUrl || '', fileId: row.fileId || '', originalFilename: row.originalFilename || '', createdAt: row.createdAt };
}

export async function listTracks() {
  if (!USE_PG) return memTracks().slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const { rows } = await sql`SELECT * FROM tracks ORDER BY "createdAt" DESC`;
  return rows.map(trackRowOut);
}

export async function createTrack({ title, artist, category, duration, audioUrl, fileId, originalFilename }) {
  const entry = { id: nanoid(10), title: title || '', artist: artist || '', category: category || MUSIC_CATEGORIES[0], duration: duration || '', audioUrl: audioUrl || '', fileId: fileId || '', originalFilename: originalFilename || '', createdAt: new Date().toISOString() };
  if (!USE_PG) { memTracks().unshift(entry); return entry; }
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  await sql`INSERT INTO tracks (id, title, artist, category, duration, "audioUrl", "fileId", "originalFilename", "createdAt") VALUES (${entry.id}, ${entry.title}, ${entry.artist}, ${entry.category}, ${entry.duration}, ${entry.audioUrl}, ${entry.fileId}, ${entry.originalFilename}, ${entry.createdAt})`;
  return entry;
}

export async function deleteTrack(id) {
  if (!USE_PG) {
    const list = memTracks();
    const i = list.findIndex((t) => t.id === id);
    if (i !== -1) list.splice(i, 1);
    return;
  }
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  await sql`DELETE FROM tracks WHERE id = ${id}`;
}

// Batch delete for the library's "select multiple, delete at once" flow —
// just loops the existing single-delete, which is simple and plenty fast at
// the scale a producer's library actually reaches.
export async function deleteTracksBulk(ids) {
  for (const id of ids) await deleteTrack(id);
}

// Partial update, preserving any field not present in `patch` (in
// particular audioUrl, which the edit form only sends when a replacement
// file was actually chosen) — read-merge-write so the caller never has to
// resend the whole record just to change one field.
export async function updateTrack(id, patch) {
  if (!USE_PG) {
    const list = memTracks();
    const i = list.findIndex((t) => t.id === id);
    if (i === -1) return null;
    list[i] = { ...list[i], ...patch };
    return list[i];
  }
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const { rows } = await sql`SELECT * FROM tracks WHERE id = ${id}`;
  const current = trackRowOut(rows[0]);
  if (!current) return null;
  const merged = { ...current, ...patch };
  await sql`
    UPDATE tracks SET title = ${merged.title}, artist = ${merged.artist}, category = ${merged.category},
      duration = ${merged.duration || ''}, "audioUrl" = ${merged.audioUrl}, "fileId" = ${merged.fileId},
      "originalFilename" = ${merged.originalFilename || ''}
    WHERE id = ${id}
  `;
  return merged;
}

export async function listVoices() {
  if (!USE_PG) return memVoices().slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const { rows } = await sql`SELECT * FROM voices ORDER BY "createdAt" DESC`;
  return rows.map(voiceRowOut);
}

export async function createVoice({ name, gender, ageRange, tags, audioUrl, fileId, originalFilename }) {
  const entry = { id: nanoid(10), name: name || '', gender: gender || '', ageRange: ageRange || '', tags: Array.isArray(tags) ? tags : [], audioUrl: audioUrl || '', fileId: fileId || '', originalFilename: originalFilename || '', createdAt: new Date().toISOString() };
  if (!USE_PG) { memVoices().unshift(entry); return entry; }
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  await sql`INSERT INTO voices (id, name, gender, "ageRange", tags, "audioUrl", "fileId", "originalFilename", "createdAt") VALUES (${entry.id}, ${entry.name}, ${entry.gender}, ${entry.ageRange}, ${JSON.stringify(entry.tags)}, ${entry.audioUrl}, ${entry.fileId}, ${entry.originalFilename}, ${entry.createdAt})`;
  return entry;
}

export async function deleteVoice(id) {
  if (!USE_PG) {
    const list = memVoices();
    const i = list.findIndex((v) => v.id === id);
    if (i !== -1) list.splice(i, 1);
    return;
  }
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  await sql`DELETE FROM voices WHERE id = ${id}`;
}

// See deleteTracksBulk above — same idea, voice side.
export async function deleteVoicesBulk(ids) {
  for (const id of ids) await deleteVoice(id);
}

// See updateTrack above — same read-merge-write partial-update idea.
export async function updateVoice(id, patch) {
  if (!USE_PG) {
    const list = memVoices();
    const i = list.findIndex((v) => v.id === id);
    if (i === -1) return null;
    list[i] = { ...list[i], ...patch };
    return list[i];
  }
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const { rows } = await sql`SELECT * FROM voices WHERE id = ${id}`;
  const current = voiceRowOut(rows[0]);
  if (!current) return null;
  const merged = { ...current, ...patch };
  await sql`
    UPDATE voices SET name = ${merged.name}, gender = ${merged.gender}, "ageRange" = ${merged.ageRange},
      tags = ${JSON.stringify(merged.tags)}, "audioUrl" = ${merged.audioUrl}, "fileId" = ${merged.fileId},
      "originalFilename" = ${merged.originalFilename || ''}
    WHERE id = ${id}
  `;
  return merged;
}
