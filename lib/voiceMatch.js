// Matches a client's voice answers against the library's voice metadata.
// A criterion only counts when the client actually answered it: "no
// preference" (null) never filters. If nothing matches, the softest
// criteria are relaxed one step at a time (character, then age, then
// gender) and reported back so the UI can say so.
export function matchVoices(pool, { gender, age, tags }) {
  const wantTags = Array.isArray(tags) ? tags : [];
  if (!gender && !age && wantTags.length === 0) return { voices: pool, relaxed: [] };
  const pick = (g, a, t) =>
    pool.filter((v) => {
      if (g && gender && v.gender !== gender) return false;
      if (a && age && v.ageRange !== age) return false;
      if (t && wantTags.length && !wantTags.some((x) => (v.tags || []).includes(x))) return false;
      return true;
    });
  const steps = [
    [true, true, true, []],
    [true, true, false, ['karakter']],
    [true, false, false, ['karakter', 'leeftijd']],
    [false, false, false, ['karakter', 'leeftijd', 'geslacht']],
  ];
  for (const [g, a, t, relaxed] of steps) {
    const found = pick(g, a, t);
    if (found.length) return { voices: found, relaxed: relaxed.filter((r) => (r === 'karakter' ? wantTags.length : r === 'leeftijd' ? age : gender)) };
  }
  return { voices: pool, relaxed: ['karakter', 'leeftijd', 'geslacht'].filter((r) => (r === 'karakter' ? wantTags.length : r === 'leeftijd' ? age : gender)) };
}
