// Three-way word-level merge, used to carry the client's edit of the MAIN
// script into each variation.
//
//   base      = the main script the variation was written / last synced against
//   edited    = the main script after the client's edit
//   variation = the variation text (the copywriter's draft, or the client's own tweaks)
//
// The result is the variation with the main-script edit applied, while the
// variation's own differences (another branch, website, offer...) are kept.
// Where both sides changed the very same words, the variation's wording is
// kept (that is what makes it a variation) and `conflicts` counts how often
// that happened, so the UI can ask the client to double-check it.

function tokenize(text) {
  return String(text || '').split(/(\s+)/).filter((t) => t !== '');
}

// Hunks of a vs b: [{ start, end, repl }] — a[start..end) is replaced by repl.
function hunksOf(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const hunks = [];
  let i = 0;
  let j = 0;
  let cur = null;
  const close = () => { if (cur) { hunks.push(cur); cur = null; } };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      close();
      i++; j++;
    } else if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) {
      if (!cur) cur = { start: i, end: i, repl: [] };
      cur.end = i + 1;
      i++;
    } else {
      if (!cur) cur = { start: i, end: i, repl: [] };
      cur.repl.push(b[j]);
      j++;
    }
  }
  close();
  return hunks;
}

export function mergeEditIntoVariation(base, edited, variation) {
  const b = String(base || '');
  const e = String(edited || '');
  const v = String(variation || '');
  // Nothing to carry over, or nothing to preserve: trivial cases.
  if (b === e) return { text: v, conflicts: 0 };
  if (v === b) return { text: e, conflicts: 0 };
  if (v === e) return { text: v, conflicts: 0 };

  const bt = tokenize(b);
  const hE = hunksOf(bt, tokenize(e)).map((h) => ({ ...h, src: 'e' }));
  // A near-complete rewrite of the main script (less than half of the old
  // words survive): there is nothing sensible to merge the variation into,
  // so it restarts from the new main script instead of becoming a patchwork.
  const removed = hE.reduce((n, h) => n + (h.end - h.start), 0);
  if (bt.length && (bt.length - removed) / bt.length < 0.5) return { text: e, conflicts: 0, reset: true };
  const hV = hunksOf(bt, tokenize(v)).map((h) => ({ ...h, src: 'v' }));
  const all = hE.concat(hV).sort((x, y) => x.start - y.start || x.end - y.end);

  // Cluster overlapping / touching hunks.
  const clusters = [];
  for (const h of all) {
    const last = clusters[clusters.length - 1];
    const hz = h.start === h.end;
    const lz = last && last.start === last.end;
    // Overlap in the half-open sense; two insertions at the same point also
    // clash. An insertion right next to a replaced span does not.
    if (last && (h.start < last.end || (hz && lz && h.start === last.start))) {
      last.hunks.push(h);
      last.end = Math.max(last.end, h.end);
    } else {
      clusters.push({ start: h.start, end: h.end, hunks: [h] });
    }
  }

  let conflicts = 0;
  const chosen = [];
  for (const c of clusters) {
    const fromE = c.hunks.filter((h) => h.src === 'e');
    const fromV = c.hunks.filter((h) => h.src === 'v');
    if (fromE.length && fromV.length) {
      const sameRepl = fromE.length === 1 && fromV.length === 1
        && fromE[0].start === fromV[0].start && fromE[0].end === fromV[0].end
        && fromE[0].repl.join('') === fromV[0].repl.join('');
      if (!sameRepl) conflicts++;
      // Both changed the same words: keep the variation's own wording there
      // (that is what makes it a variation) and let the caller flag it.
      chosen.push(...fromV);
    } else {
      chosen.push(...c.hunks);
    }
  }
  chosen.sort((x, y) => x.start - y.start);

  const out = [];
  let pos = 0;
  for (const h of chosen) {
    if (h.start < pos) continue;
    for (let k = pos; k < h.start; k++) out.push(bt[k]);
    out.push(...h.repl);
    pos = h.end;
  }
  for (let k = pos; k < bt.length; k++) out.push(bt[k]);
  return { text: out.join(''), conflicts };
}
