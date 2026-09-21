import { NextResponse } from 'next/server';
import { aiEnabled, aiProvider } from '../../../lib/scriptgen';

export const dynamic = 'force-dynamic';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const emailEnabled = !!RESEND_API_KEY;
const emailProvider = RESEND_API_KEY ? 'resend' : 'db-fallback';

export async function GET() {
  return NextResponse.json({ aiEnabled, aiProvider, emailEnabled, emailProvider });
}
