import { listTracks, listPlaylists } from '../../../../lib/library';

// Real, changing data — never statically cache this route (Next would
// otherwise prerender it once at build time and serve stale results).
export const dynamic = 'force-dynamic';

// Public, read-only — the client-facing music step (step 6) needs the
// producer's real track library to offer real choices instead of a
// hard-coded sample pool. No auth: the whole client flow is unauthenticated
// by design (the client filling out a brief is never logged in), same as
// every /api/briefs route.
export async function GET() {
  const [tracks, playlists] = await Promise.all([listTracks(), listPlaylists()]);
  // Tracks in a hidden playlist (e.g. out of season) stay out of the client picker.
  const hiddenPlaylists = new Set(playlists.filter((p) => p.hidden).map((p) => p.name));
  return Response.json(tracks.filter((t) => !t.hidden && !hiddenPlaylists.has(t.category)));
}
