import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createBrief, listBriefs } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function POST() {
  const id = nanoid(12);
  const brief = await createBrief(id);
  return NextResponse.json(brief, { status: 201 });
}

export async function GET() {
  const briefs = await listBriefs();
  return NextResponse.json(briefs);
}
