// Pure helpers for the order of playlists (music categories).

// Returns the ids in the new order after moving `id` one step up (-1) or
// down (+1). Unknown ids and moves past either end leave the order unchanged.
export function movedOrder(ids, id, dir) {
  const i = ids.indexOf(id);
  const j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= ids.length) return ids.slice();
  const next = ids.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// Cleans a playlist name: trimmed, single-spaced, max 60 chars.
export function cleanPlaylistName(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 60);
}
