import { NextResponse } from 'next/server';
import { archiveDeliveredBriefs, logBriefEvent } from '../../../../lib/db';
import { autoArchiveCutoff, AUTO_ARCHIVE_DAYS } from '../../../../lib/autoArchive';

// Called once a day by Vercel Cron (see vercel.json). Vercel sends
// "Authorization: Bearer <CRON_SECRET>"; without that secret the route is
// closed, so nobody else can trigger it.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  if (request.headers.get('authorization') !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const ids = await archiveDeliveredBriefs(autoArchiveCutoff(new Date()));
  for (const id of ids) {
    await logBriefEvent(id, { actor: 'tfa', type: 'archived', text: 'Automatisch gearchiveerd, ' + AUTO_ARCHIVE_DAYS + ' dagen na levering' });
  }
  return NextResponse.json({ archived: ids.length });
}
