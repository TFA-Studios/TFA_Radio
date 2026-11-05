// The PDF's built-in Helvetica only knows Western (Windows-1252) characters.
// Anything else is replaced by something readable instead of printing garbage.
const REPLACEMENTS = [[/[\u2018\u2019\u2032]/g, "'"], [/[\u201C\u201D\u2033]/g, '"'], [/[\u2013\u2014]/g, '-'], [/\u2026/g, '...'], [/\u2192/g, '->'], [/[\u2022\u25CF]/g, '-'], [/\u00A0/g, ' ']];
const EXTRA_OK = new Set([0x20AC, 0x2122, 0x160, 0x161, 0x17D, 0x17E, 0x152, 0x153, 0x178]);

export function pdfText(value) {
  let s = String(value === undefined || value === null ? '' : value);
  for (const [re, to] of REPLACEMENTS) s = s.replace(re, to);
  return Array.from(s).map((ch) => {
    const c = ch.codePointAt(0);
    return c > 0xFF && !EXTRA_OK.has(c) || (c < 0x20 && ch !== '\n') ? '?' : ch;
  }).join('');
}
