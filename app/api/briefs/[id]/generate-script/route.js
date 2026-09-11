import { NextResponse } from 'next/server';
import { getBrief, saveGeneratedScript, MAX_SCRIPT_HISTORY } from '../../../../../lib/db';
import { generateScript } from '../../../../../lib/scriptgen';

export const dynamic = 'force-dynamic';

function parseHistory(brief) {
  try {
    const parsed = brief.scriptHistory ? JSON.parse(brief.scriptHistory) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export async function POST(request, { params }) {
  const brief = await getBrief(params.id);
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Server-side enforcement of the "max 3 versions" regenerate limit — the
  // client already disables the button at this point, but this is the real
  // gate (also saves an AI call nobody can use).
  const history = parseHistory(brief);
  if (history.length >= MAX_SCRIPT_HISTORY) {
    return NextResponse.json(
      { error: true, message: `Je hebt het maximum van ${MAX_SCRIPT_HISTORY} versies al bereikt.`, code: 'max_versions_reached' },
      { status: 400 }
    );
  }

  try {
    const result = await generateScript(brief);

    // A real AI provider is configured but the call failed — surface this
    // as an explicit error, and deliberately do NOT touch the brief (any
    // previously generated script/history stays exactly as it was).
    if (result.source === 'error') {
      return NextResponse.json(
        { error: true, message: result.error, debugId: result.debugId },
        { status: 503 }
      );
    }

    const updated = await saveGeneratedScript(params.id, result);
    return NextResponse.json(updated);
  } catch (err) {
    console.error('[generate-script] unexpected failure:', err);
    return NextResponse.json(
      { error: true, message: 'Er ging iets onverwachts mis bij het genereren van het script.', debugId: 'n/a' },
      { status: 500 }
    );
  }
}
