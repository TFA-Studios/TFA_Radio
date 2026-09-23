import { NextResponse } from 'next/server';
import { listDeliveryRecipients } from '../../../../lib/db';

// Producer-only — gated by middleware.js. Not tied to a single brief:
// backs the recipient-email suggestions in the dashboard's "Uitlevering"
// tab (see DashboardClient.js), so an address used once for any brief's
// delivery is offered as a one-click suggestion for every other brief too.
export const dynamic = 'force-dynamic';

export async function GET() {
  const recipients = await listDeliveryRecipients();
  return NextResponse.json(recipients);
}
