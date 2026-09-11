import { listTracks } from '../../../../lib/library';

// Real, changing data — never statically cache this route (Next would
// otherwise prerender it once at build time and serve stale results).
export const dynamic = 'force-dynamic';

// Public, read-only — the client-facing music step (step 6) needs the
// producer's real track library to offer real choices instead of a
// hard-coded sample pool. No auth: the whole client flow is unauthenticated
// by design (the client filling out a brief is never logged in), same as
// every /api/briefs route.
export async function GET() {
  const tracks = await listTracks();
  return Response.json(tracks);
}
