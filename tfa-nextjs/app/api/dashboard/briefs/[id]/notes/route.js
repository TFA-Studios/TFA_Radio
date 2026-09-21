import { NextResponse } from 'next/server';
import { addInternalNote } from '../../../../../../lib/db';

// Producer-only — gated by middleware.js. Appends one entry to a brief's
// internal notes thread (never shown to the client).
export const dynamic = 'force-dynamic';

const clerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

// Pulls the signed-in producer's name from Clerk so notes are attributed
// automatically instead of asking them to type their own name every time.
// Falls back to whatever the client sent (or 'Team') when Clerk isn't
// configured (local dev with no auth set up at all).
async function resolveAuthor(fallback) {
  if (!clerkConfigured) return fallback || 'Team';
  try {
    const { currentUser } = await import('@clerk/nextjs/server');
    const user = await currentUser();
    if (!user) return fallback || 'Team';
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return name || user.emailAddresses?.[0]?.emailAddress || fallback || 'Team';
  } catch (e) {
    return fallback || 'Team';
  }
}

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const text = (body && body.text || '').trim();
  if (!text) return NextResponse.json({ error: 'empty_note' }, { status: 400 });

  const author = await resolveAuthor(body && body.author);
  const brief = await addInternalNote(params.id, { author, text });
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(brief);
}
