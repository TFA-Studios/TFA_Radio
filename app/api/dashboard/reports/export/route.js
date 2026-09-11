import { NextResponse } from 'next/server';
import { listBriefs } from '../../../../../lib/db';
import { briefsToRows, rowsToCsv } from '../../../../../lib/reports';

// Producer-only (gated by middleware's /api/dashboard/* matcher) CSV export
// of every brief — the same one-row-per-brief shape the /dashboard/reports
// page summarizes, so a producer can drop it straight into Excel/Sheets.
export const dynamic = 'force-dynamic';

export async function GET() {
  const briefs = await listBriefs();
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
