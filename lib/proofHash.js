// Fingerprint of a proof copy (lib/snapshots.js). The hash covers the brief id,
// the moment, the kind and every answer, so changing any of them afterwards
// makes the stored hash stop matching. Keys are sorted so the same content
// always gives the same hash.
import { createHash } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  return JSON.stringify(value === undefined ? null : value);
}

export function proofHash({ briefId, kind, createdAt, sections }) {
  return createHash('sha256').update(canonical({ briefId, kind, createdAt, sections })).digest('hex');
}
