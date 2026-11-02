// Several text columns (scriptHistory, selectedTracks, internalNotes, ...) hold
// a JSON array as a string. One tolerant parser for all of them: anything that
// is missing, malformed or not an array comes back as [].
export function parseJsonArray(raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}
