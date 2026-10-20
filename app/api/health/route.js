import { NextResponse } from 'next/server';
import { pingDb } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// Public liveness/readiness probe for uptime monitors (UptimeRobot, Better
// Stack, Vercel checks). Returns only ok/not-ok and how long the database took
// to answer; no configuration, versions or secrets.
export async function GET() {
  const started = Date.now();
  try {
    const db = await pingDb();
    return NextResponse.json({ ok: true, db, dbMs: Date.now() - started }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    console.error('[health] database check failed:', err && err.message);
    return NextResponse.json({ ok: false, db: 'error', dbMs: Date.now() - started }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
