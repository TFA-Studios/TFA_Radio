// Who is looking at the producer dashboard?
//
//  staff   — TFA. Full access (the default for any signed-in user).
//  agency  — a signed-in user whose email is linked to an agency in the
//            Agencies screen (agencies.userEmails). Read-only, and only for
//            that agency's own briefs.
//  anon    — not signed in (Clerk's middleware normally turns these away
//            before they get here).
//
// Without Clerk keys configured (local dev) everyone counts as staff, same
// as the middleware letting everyone through.
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { findAgencyByUserEmail } from './db';

const clerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

export async function getViewer() {
  if (!clerkConfigured) return { role: 'staff', email: '', agency: null };
  let email = '';
  try {
    const { currentUser } = await import('@clerk/nextjs/server');
    const user = await currentUser();
    if (!user) return { role: 'anon', email: '', agency: null };
    const addrs = (user.emailAddresses || []).map((e) => String(e.emailAddress || '').toLowerCase()).filter(Boolean);
    const primary = user.primaryEmailAddress && user.primaryEmailAddress.emailAddress ? String(user.primaryEmailAddress.emailAddress).toLowerCase() : addrs[0] || '';
    email = primary;
    // Only a *verified* address may unlock an agency's data.
    const verified = (user.emailAddresses || [])
      .filter((e) => e.verification && e.verification.status === 'verified')
      .map((e) => String(e.emailAddress || '').toLowerCase());
    for (const a of verified) {
      const agency = await findAgencyByUserEmail(a);
      if (agency) return { role: 'agency', email: a, agency };
    }
  } catch (e) {
    // Let Next's own control-flow errors (dynamic rendering, redirects) through.
    if (e && (e.digest === 'DYNAMIC_SERVER_USAGE' || String(e.digest || '').startsWith('NEXT_'))) throw e;
    console.error('[access] getViewer failed:', e && e.message);
    return { role: 'anon', email, agency: null };
  }
  return { role: 'staff', email, agency: null };
}

// A brief an agency user may see: only ones frozen onto their agency.
export function canSeeBrief(viewer, brief) {
  if (!viewer || !brief) return false;
  if (viewer.role === 'staff') return true;
  if (viewer.role === 'agency') return !!viewer.agency && !!brief.agencyId && brief.agencyId === viewer.agency.id;
  return false;
}

export function scopeBriefs(viewer, briefs) {
  return (briefs || []).filter((b) => canSeeBrief(viewer, b));
}

// --- API route guards: return a NextResponse to send back, or null to go on.
export async function requireStaffApi() {
  const v = await getViewer();
  if (v.role !== 'staff') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return null;
}

// For read endpoints an agency may use on its own briefs (e.g. the PDF).
export async function requireBriefReadApi(brief) {
  const v = await getViewer();
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canSeeBrief(v, brief)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return null;
}

// --- Page guard for staff-only screens.
export async function requireStaffPage() {
  const v = await getViewer();
  if (v.role !== 'staff') redirect('/dashboard');
  return v;
}

// For 'use server' actions (which can't return a redirect): throw on non-staff.
export async function assertStaff() {
  const v = await getViewer();
  if (v.role !== 'staff') throw new Error('forbidden');
  return v;
}
