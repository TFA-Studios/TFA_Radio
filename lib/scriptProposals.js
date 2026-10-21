// Pure helpers for the producer's handling of the script proposals before
// they are released: replace one, remove one, add one. The database layer
// only loads/stores the list; the rules live here so they can be tested.
export const MAX_PROPOSALS = 3;

// op: { type: 'replace', versionId, version } | { type: 'remove', versionId } | { type: 'add', version }
// version: { id, main, variations, variation, source, createdAt, comment? }
// Returns { history } on success or { error: 'code' }.
export function applyProposalOp(history, op) {
  const list = Array.isArray(history) ? history.slice() : [];
  if (!op || !op.type) return { error: 'invalid_op' };
  if (op.type === 'add') {
    if (list.length >= MAX_PROPOSALS) return { error: 'too_many' };
    return { history: list.concat(op.version) };
  }
  const idx = list.findIndex((h) => h.id === op.versionId);
  if (idx === -1) return { error: 'not_found' };
  if (op.type === 'replace') {
    list[idx] = op.version;
    return { history: list };
  }
  if (op.type === 'remove') {
    if (list.length <= 1) return { error: 'last_one' };
    list.splice(idx, 1);
    return { history: list };
  }
  return { error: 'invalid_op' };
}
