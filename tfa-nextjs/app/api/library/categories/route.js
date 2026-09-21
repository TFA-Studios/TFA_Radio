import { NextResponse } from 'next/server';
import { MUSIC_CATEGORIES, MUSIC_CATEGORY_DESCRIPTIONS } from '../../../../lib/library';

// Public, unauthenticated — the client-facing music step (step 6) uses this
// so all 6 categories always show as playlists, even ones with zero tracks
// uploaded yet, instead of only showing categories that happen to have at
// least one track in them. Returns {name, description} pairs (rather than
// bare strings) so the music step can show each playlist's one-line
// description alongside its name.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(MUSIC_CATEGORIES.map((name) => ({ name, description: MUSIC_CATEGORY_DESCRIPTIONS[name] || '' })));
}
