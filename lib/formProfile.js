// Per-agency client form profile.
//
// Every agency gets the same 7-step flow, but the questions can differ:
//   hide           — sections of the standard form to leave out (see HIDEABLE)
//   extraQuestions — extra questions added at the end of the "Brief" step
//
// The profile is configured per agency (Agencies screen -> agencies.formConfig)
// and FROZEN onto each brief when it is created (briefs.formProfile), so a
// later change to an agency never alters briefs already in flight.
//
// Plain CommonJS so both lib/db.js and the client components can import it.

// Sections of the standard form that an agency may switch off.
const HIDEABLE = {
  impressions: { label: 'Aantal impressies', step: 'Levering' },
  variations: { label: 'Variaties van de hoofdspot', step: 'Levering' },
  airDate: { label: 'Eerste uitzenddatum', step: 'Levering' },
  audience: { label: 'Doelgroep (wie, beslisser, leeftijd en interesses)', step: 'Brief' },
  price: { label: 'Prijs of aanbieding', step: 'Brief' },
  slogan: { label: 'Slogan', step: 'Brief' },
  disclaimer: { label: 'Verplichte wettelijke tekst', step: 'Brief' },
};

const QUESTION_TYPES = ['text', 'longtext', 'choice'];

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

// Clean up whatever is stored/posted into a safe, bounded shape.
function normalizeFormConfig(raw) {
  let cfg = raw;
  if (typeof cfg === 'string') {
    try { cfg = JSON.parse(cfg || '{}'); } catch (e) { cfg = {}; }
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) cfg = {};
  const hide = (Array.isArray(cfg.hide) ? cfg.hide : []).filter((k, i, a) => HIDEABLE[k] && a.indexOf(k) === i);
  const seen = new Set();
  const extraQuestions = [];
  for (const q of Array.isArray(cfg.extraQuestions) ? cfg.extraQuestions.slice(0, 10) : []) {
    if (!q || typeof q !== 'object') continue;
    const label = String(q.label || '').trim().slice(0, 200);
    if (!label) continue;
    let key = slug(q.key || label) || 'vraag';
    let n = 2;
    const base = key;
    while (seen.has(key)) key = base + '_' + n++;
    seen.add(key);
    const type = QUESTION_TYPES.includes(q.type) ? q.type : 'text';
    const out = { key, label, type, required: !!q.required };
    if (type === 'choice') {
      out.options = (Array.isArray(q.options) ? q.options : String(q.options || '').split(','))
        .map((o) => String(o).trim().slice(0, 80)).filter(Boolean).slice(0, 10);
      if (out.options.length < 2) out.type = 'text', delete out.options;
    }
    extraQuestions.push(out);
  }
  return { hide, extraQuestions };
}

// The profile a new brief gets: standard form unless the agency says otherwise.
function resolveFormProfile(agency) {
  const cfg = normalizeFormConfig(agency && agency.formConfig);
  return { key: (agency && agency.formKey) || 'standard', hide: cfg.hide, extraQuestions: cfg.extraQuestions };
}

// Read the frozen profile off a brief (safe on legacy briefs: no profile = standard).
function profileOfBrief(brief) {
  let p = null;
  try { p = brief && brief.formProfile ? JSON.parse(brief.formProfile) : null; } catch (e) { p = null; }
  if (!p || typeof p !== 'object') return { key: 'standard', hide: [], extraQuestions: [] };
  const cfg = normalizeFormConfig(p);
  return { key: p.key || 'standard', hide: cfg.hide, extraQuestions: cfg.extraQuestions };
}

function answersOfBrief(brief) {
  try {
    const a = brief && brief.extraAnswers ? JSON.parse(brief.extraAnswers) : {};
    return a && typeof a === 'object' && !Array.isArray(a) ? a : {};
  } catch (e) {
    return {};
  }
}

module.exports = { HIDEABLE, QUESTION_TYPES, normalizeFormConfig, resolveFormProfile, profileOfBrief, answersOfBrief };
