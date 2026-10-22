// Matches a client's voice answers against the library's voice metadata.
// A criterion only counts when the client actually answered it: "no
// preference" (null) never filters. If nothing matches, the softest
// criteria are relaxed one step at a time (character, then gender, then
// age: age matters more than gender) and reported back so the UI can say so. The result is always
// alphabetical by name, with or without preferences.
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'nl', { sensitivity: 'base' });

export function matchVoices(pool, criteria) {
  const out = match(pool, criteria);
  return { ...out, voices: out.voices.slice().sort(byName) };
}

function match(pool, { gender, age, tags }) {
  const wantTags = Array.isArray(tags) ? tags : [];
  if (!gender && !age && wantTags.length === 0) return { voices: pool, relaxed: [] };
  const pick = (g, a, t) =>
    pool.filter((v) => {
      if (g && gender && v.gender !== gender) return false;
      if (a && age && v.ageRange !== age) return false;
      if (t && wantTags.length && !wantTags.some((x) => (v.tags || []).includes(x))) return false;
      return true;
    });
  // Age matters more than gender: when nothing fits everything, drop the
  // character preference first, then gender, and only last the age.
  const steps = [
    [true, true, true, []],
    [true, true, false, ['karakter']],
    [false, true, false, ['karakter', 'geslacht']],
    [false, false, false, ['karakter', 'geslacht', 'leeftijd']],
  ];
  for (const [g, a, t, relaxed] of steps) {
    const found = pick(g, a, t);
    if (found.length) return { voices: found, relaxed: relaxed.filter((r) => (r === 'karakter' ? wantTags.length : r === 'leeftijd' ? age : gender)) };
  }
  return { voices: pool, relaxed: ['karakter', 'leeftijd', 'geslacht'].filter((r) => (r === 'karakter' ? wantTags.length : r === 'leeftijd' ? age : gender)) };
}

const AGE_ORDER = ['18-34', '35-54', '55+'];

// Recommended voices (the matches, alphabetical) plus every other voice,
// ordered so the closest alternatives come first: age closeness matters
// more than gender, so for "man 55+" the other 55+ voices come before
// middle-aged men, which come before middle-aged women, and so on.
export function splitVoices(pool, { gender, age, tags }) {
  const { voices: recommended, relaxed } = matchVoices(pool, { gender, age, tags });
  const taken = new Set(recommended.map((v) => v.id));
  const wantAt = AGE_ORDER.indexOf(age);
  const distance = (v) => {
    const at = AGE_ORDER.indexOf(v.ageRange);
    return wantAt < 0 || at < 0 ? 0 : Math.abs(at - wantAt);
  };
  const genderMiss = (v) => (gender && v.gender !== gender ? 1 : 0);
  const others = pool
    .filter((v) => !taken.has(v.id))
    .sort((a, b) => distance(a) - distance(b) || genderMiss(a) - genderMiss(b) || byName(a, b));
  return { recommended, others, relaxed };
}
