// What the client-facing (unauthenticated) API may return about a brief.
// A brief comes back from the database with TFA-internal fields on it; the
// public routes are reachable by anyone holding the brief's link, so those
// must never leave the server. Add any new internal-only field here.
const INTERNAL_FIELDS = { internalNotes: '[]' };

export function toPublicBrief(brief) {
  if (!brief || typeof brief !== 'object') return brief;
  return { ...brief, ...INTERNAL_FIELDS };
}
