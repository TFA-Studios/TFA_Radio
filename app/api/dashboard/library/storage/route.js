import { NextResponse } from 'next/server';
import { getBlobStorageUsage } from '../../../../../lib/library';

// Producer-only (gated by middleware.js — isProtectedRoute matches
// /api/dashboard/(.*)). Reports Vercel Blob storage usage so the library
// dashboard can show a producer how much of their Blob quota (1GB on the
// free "Hobby" tier) is used, without them having to check the Vercel
// dashboard separately.
export const dynamic = 'force-dynamic';

export async function GET() {
  const usage = await getBlobStorageUsage();
  return NextResponse.json(usage);
}
