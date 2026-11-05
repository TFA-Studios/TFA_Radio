// What the client-facing (unauthenticated) API may return about a brief.
// A brief comes back from the database with TFA-internal fields on it; the
// public routes are reachable by anyone holding the brief's link, so those
// must never leave the server. Add any new internal-only field here.
const INTERNAL_FIELDS = { internalNotes: '[]', eventLog: '[]', scriptJob: '', archivedAt: null, isTest: false };

// Drafts are the producer's work in progress: until they are released (or the
// client has already finalized, for older briefs) the client must not get the
// texts, including drafts the producer decides not to send at all.
const UNRELEASED_SCRIPT_FIELDS = { scriptHistory: '[]', generatedScript: '', generatedVarScript: '', variationScripts: '', scriptSource: '' };

export function toPublicBrief(brief) {
  if (!brief || typeof brief !== 'object') return brief;
  const hidden = !brief.scriptsReleasedAt && !brief.finalizedAt ? UNRELEASED_SCRIPT_FIELDS : null;
  return { ...brief, ...(hidden || {}), ...INTERNAL_FIELDS };
}
