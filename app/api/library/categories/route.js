import { NextResponse } from 'next/server';
import { listPlaylists } from '../../../../lib/library';

// Public, unauthenticated — the client-facing music step (step 6) uses this
// so every visible playlist shows up, even one with zero tracks yet. In the
// order the producer set; hidden (e.g. out-of-season) playlists are left
// out. Returns {name, description} pairs so the music step can show each
// playlist's one-line description alongside its name.
export const dynamic = 'force-dynamic';

export async function GET() {
  const playlists = await listPlaylists();
  return NextResponse.json(playlists.filter((p) => !p.hidden).map((p) => ({ name: p.name, description: p.description })));
}
