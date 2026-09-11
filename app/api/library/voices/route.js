import { listVoices } from '../../../../lib/library';

// Real, changing data — never statically cache this route (Next would
// otherwise prerender it once at build time and serve stale results).
export const dynamic = 'force-dynamic';

// Public, read-only — same rationale as app/api/library/tracks/route.js,
// for the client-facing voice step (step 5).
export async function GET() {
  const voices = await listVoices();
  return Response.json(voices);
}
