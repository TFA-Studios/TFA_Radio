// State of the background script writer on a brief (the `scriptJob` field).
// Stored as JSON: { status: 'running'|'failed', kind, versionId?, startedAt, message? }.
// A "running" job older than STALE_MS is treated as dead (the server function
// was stopped before it could report back), so a brief can never get stuck.
export const STALE_MS = 6 * 60 * 1000;

export function jobState(raw, nowMs = Date.now()) {
  let job = null;
  try { job = raw ? JSON.parse(raw) : null; } catch (e) { job = null; }
  if (!job || typeof job !== 'object' || !job.status) return { status: 'idle' };
  if (job.status === 'running' && nowMs - Date.parse(job.startedAt || 0) > STALE_MS) {
    return { ...job, status: 'failed', message: 'Het schrijven duurde te lang en is gestopt. Probeer het opnieuw.' };
  }
  return job;
}
