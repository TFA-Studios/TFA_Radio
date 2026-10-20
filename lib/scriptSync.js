// Carries the client's edit of the MAIN script into the variations.
//
// Before this, the variations kept the copywriter's original variation text,
// so an edit made to the chosen script never reached them and then showed up
// as if it were part of the variation. Now the edit is merged into every
// variation (see lib/scriptMerge.js), which keeps the variation's own change
// (another branch, website, offer...) and adds the client's edit on top.
import { mergeEditIntoVariation } from './scriptMerge';

function parseJsonArray(raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// The copywriter's draft variations for the proposal the client is on.
export function draftVariationsOf(brief) {
  const history = parseJsonArray(brief.scriptHistory);
  const entry = history.find((h) => h.createdAt === brief.scriptGeneratedAt) || null;
  if (!entry) return [];
  if (Array.isArray(entry.variations) && entry.variations.length) return entry.variations.map((v) => String(v || ''));
  return entry.variation ? [String(entry.variation)] : [];
}

// Returns the fields to save: { variationScripts, variationsBase } or null
// when there are no variations to update.
export function syncVariationsPatch(brief) {
  const count = parseInt(brief.variationsCount, 10) || (brief.needsVariations ? 1 : 0);
  if (!count) return null;
  const generated = brief.generatedScript || '';
  const newMain = brief.editedScript !== null && brief.editedScript !== undefined ? brief.editedScript : generated;
  // What the stored variations are aligned to: the last synced main text, or
  // (first time) the copywriter's own main text.
  const base = brief.variationsBase ? brief.variationsBase : generated;
  const stored = parseJsonArray(brief.variationScripts);
  const drafts = draftVariationsOf(brief);
  const out = [];
  let conflicts = 0;
  let reset = false;
  for (let i = 0; i < count; i++) {
    let current = stored[i];
    if (current === undefined || current === null || current === '') current = drafts[i];
    if (current === undefined || current === null || current === '') current = base; // plain copy of the main script
    const merged = mergeEditIntoVariation(base, newMain, current);
    conflicts += merged.conflicts;
    if (merged.reset) reset = true;
    out.push(merged.text);
  }
  return { variationScripts: JSON.stringify(out), variationsBase: newMain, conflicts, reset };
}
