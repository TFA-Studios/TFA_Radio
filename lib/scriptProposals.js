// Pure helpers for the producer's handling of the script proposals before
// they are released: replace one, remove one, add one. The database layer
// only loads/stores the list; the rules live here so they can be tested.
// The producer keeps a pool of drafts (generated, combined, or written by
// TFA itself) and chooses per draft whether it goes to the client. The client
// never sees more than MAX_SEND of them.
export const MAX_DRAFTS = 8;
export const MAX_SEND = 3;

// A draft is sent unless the producer switched it off.
export const isSending = (h) => !!h && h.send !== false;

// What a release would do with the current pool: the entries that go to the
// client (in order) and the ones that are held back. Entries without text
// never go out. Returns { send, withheld } or { error }.
export function releasePlan(history) {
  const list = Array.isArray(history) ? history : [];
  const send = list.filter((h) => isSending(h) && h.main && h.main.trim());
  const withheld = list.filter((h) => !send.includes(h));
  if (!send.length) return { error: 'nothing_to_send' };
  if (send.length > MAX_SEND) return { error: 'too_many_to_send' };
  return { send, withheld };
}

// op: { type: 'replace', versionId, version } | { type: 'remove', versionId } | { type: 'add', version }
// version: { id, main, variations, variation, source, createdAt, comment? }
// Returns { history } on success or { error: 'code' }.
export function applyProposalOp(history, op) {
  const list = Array.isArray(history) ? history.slice() : [];
  if (!op || !op.type) return { error: 'invalid_op' };
  if (op.type === 'add') {
    if (list.length >= MAX_DRAFTS) return { error: 'too_many' };
    // A new draft only goes out by default while there is room for it.
    const room = list.filter(isSending).length < MAX_SEND;
    return { history: list.concat({ ...op.version, send: room }) };
  }
  const idx = list.findIndex((h) => h.id === op.versionId);
  if (idx === -1) return { error: 'not_found' };
  if (op.type === 'replace') {
    // A rewrite keeps the producer's send choice for that slot.
    list[idx] = { ...op.version, send: isSending(list[idx]) };
    return { history: list };
  }
  if (op.type === 'remove') {
    if (list.length <= 1) return { error: 'last_one' };
    list.splice(idx, 1);
    return { history: list };
  }
  return { error: 'invalid_op' };
}
