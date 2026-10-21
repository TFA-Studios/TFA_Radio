// Append-only history of what happened on a brief (who changed or decided
// what, when). Stored as a JSON list on the brief, capped so it cannot grow
// without bound. Staff-only: it is stripped from the public brief.
export const MAX_EVENTS = 400;
const MAX_TEXT = 4000;

export function parseEvents(raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// event: { actor: 'klant'|'tfa'|'systeem', type, text, detail? }
// detail is optional extra text (e.g. a full script) shown behind a toggle.
export function addEvent(list, event, id, nowIso) {
  const entry = {
    id,
    at: nowIso,
    actor: ['klant', 'tfa', 'systeem'].includes(event.actor) ? event.actor : 'systeem',
    type: String(event.type || 'info').slice(0, 40),
    text: String(event.text || '').slice(0, 300),
  };
  if (event.detail) entry.detail = String(event.detail).slice(0, MAX_TEXT);
  if (event.who) entry.who = String(event.who).slice(0, 80);
  return list.concat(entry).slice(-MAX_EVENTS);
}
