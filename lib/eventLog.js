// Append-only history of what happened on a brief (who changed or decided
// what, when). Stored as a JSON list on the brief, capped so it cannot grow
// without bound. Staff-only: it is stripped from the public brief.
export const MAX_EVENTS = 400;
const MAX_TEXT = 12000;
// Rapid edits of the same kind by the same actor fold into one entry.
const COALESCE_MS = 15 * 60 * 1000;

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
  const last = list[list.length - 1];
  if (event.coalesce && last && last.type === event.type && last.actor === event.actor && Date.parse(nowIso) - Date.parse(last.at) < COALESCE_MS) {
    // Same kind of edit moments ago: keep the entry, refresh its time and full text.
    const merged = { ...last, at: nowIso, text: String(event.text || last.text).slice(0, 300) };
    if (event.detail) merged.detail = String(event.detail).slice(0, MAX_TEXT);
    return list.slice(0, -1).concat(merged);
  }
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

// Full text of one script: the main spot plus every variation, labelled.
export function describeScript(main, variations) {
  const parts = ['Hoofdspot:\n' + String(main || '').trim()];
  (Array.isArray(variations) ? variations : []).forEach((v, i, all) => {
    if (String(v || '').trim()) parts.push((all.length > 1 ? 'Variatie ' + (i + 1) : 'Variatie') + ':\n' + String(v).trim());
  });
  return parts.join('\n\n');
}

// One script proposal (a scriptHistory entry) in full.
export function describeProposal(h) {
  if (!h) return '';
  const vars = Array.isArray(h.variations) && h.variations.length ? h.variations : (h.variation ? [h.variation] : []);
  return describeScript(h.main, vars);
}

// Several proposals in full, numbered.
export function describeProposals(list) {
  return (Array.isArray(list) ? list : []).map((h, i) => 'Voorstel ' + (i + 1) + '\n' + describeProposal(h)).join('\n\n---\n\n');
}
