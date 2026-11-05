// Saves a proof copy for a client action (see lib/snapshots.js). Never throws:
// failing to record proof must not stop the client from continuing.
import { saveSnapshot } from './snapshots.js';
import { clientIp } from './rateLimit.js';

export async function captureProof(request, brief, kind) {
  try {
    if (!brief) return null;
    return await saveSnapshot(brief, kind, { ip: clientIp(request), userAgent: request.headers.get('user-agent') || '' });
  } catch (err) {
    console.error('[proof] could not save proof copy (' + kind + '):', err && err.message);
    return null;
  }
}
