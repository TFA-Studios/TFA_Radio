import { NextResponse } from 'next/server';
import { listBriefs } from '../../../../../lib/db';
import { briefsToRows, rowsToCsv } from '../../../../../lib/reports';

// Producer-only (gated by middleware's /api/dashboard/* matcher) CSV export
// of every brief — the same one-row-per-brief shape the /dashboard/reports
// page summarizes, so a producer can drop it straight into Excel/Sheets.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';
  let briefs = await listBriefs();
  // Mirrors the /dashboard/reports page's own from/to filtering — when the
  // producer exports from a filtered view, the CSV should match what's on
  // screen instead of always dumping every brief regardless of the range
  // they were just looking at.
  if (from || to) {
    briefs = briefs.filter((b) => {
      if (!b.createdAt) return false;
      const created = b.createdAt.slice(0, 10);
      if (from && created < from) return false;
      if (to && created > to) return false;
      return true;
    });
  }
  const csv = rowsToCsv(briefsToRows(briefs));
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tfa-briefs-${date}.csv"`,
    },
  });
}
