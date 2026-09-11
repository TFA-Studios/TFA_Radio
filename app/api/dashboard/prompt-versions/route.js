import { NextResponse } from 'next/server';
import { listPromptVersions, createPromptVersion } from '../../../../lib/promptVersions';

// Producer-only (gated by middleware.js — isProtectedRoute matches
// /api/dashboard/(.*)). Lists/creates AI-prompt versions for the
// /dashboard/prompt version-control page.
export const dynamic = 'force-dynamic';

export async function GET() {
  const versions = await listPromptVersions();
  return NextResponse.json(versions);
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const label = (body && body.label ? String(body.label) : '').trim();
  const content = (body && body.content ? String(body.content) : '').trim();
  if (!content) {
    return NextResponse.json({ error: 'content_required' }, { status: 400 });
  }
  const created = await createPromptVersion({ label: label || 'Naamloze versie', content });
  return NextResponse.json(created);
}
