// Small word-level diff, used to show clients/producers what actually
// changed between the approved main script and a hand-edited variation —
// replacing an old "type a free-text description of the difference"
// field, which just duplicated work the client was already doing by
// editing the variation text themselves. Whitespace is kept as its own
// token so spacing survives untouched; equal runs and same-type runs are
// merged for cleaner, more compact rendering.

export function diffWords(oldText, newText) {
  const oldWords = (oldText || '').split(/(\s+)/).filter((t) => t !== '');
  const newWords = (newText || '').split(/(\s+)/).filter((t) => t !== '');
  const n = oldWords.length;
  const m = newWords.length;

  // Standard LCS dynamic-program over words — fine at script-length scale
  // (a handful of sentences, never more than a couple hundred words).
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = oldWords[i] === newWords[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const raw = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldWords[i] === newWords[j]) {
      raw.push({ type: 'equal', text: oldWords[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ type: 'removed', text: oldWords[i] });
      i++;
    } else {
      raw.push({ type: 'added', text: newWords[j] });
      j++;
    }
  }
  while (i < n) { raw.push({ type: 'removed', text: oldWords[i] }); i++; }
  while (j < m) { raw.push({ type: 'added', text: newWords[j] }); j++; }

  const merged = [];
  for (const tok of raw) {
    const last = merged[merged.length - 1];
    if (last && last.type === tok.type) last.text += tok.text;
    else merged.push({ ...tok });
  }
  return merged;
}

export function hasDiff(tokens) {
  return tokens.some((t) => t.type !== 'equal');
}

// Renders diffWords() output — removed words struck through, added words
// highlighted in the brand gold, everything else plain. Shows the FULL
// merged text (old + new interleaved) — accurate, but doubles up on length
// once there's more than one variation on a page (see DiffPreview below for
// the more compact alternative used there).
export function DiffText({ tokens }) {
  return tokens.map((t, i) => {
    if (t.type === 'removed') {
      return (
        <span key={i} style={{ textDecoration: 'line-through', color: '#B06156', background: 'rgba(194,81,63,.08)' }}>
          {t.text}
        </span>
      );
    }
    if (t.type === 'added') {
      return (
        <span key={i} style={{ background: 'rgba(230,200,88,.4)', color: '#1D1D1D', fontWeight: 600, borderRadius: 3 }}>
          {t.text}
        </span>
      );
    }
    return <span key={i}>{t.text}</span>;
  });
}

// Lighter alternative to DiffText — shows the variation's OWN text once
// (equal + added tokens only, additions highlighted in gold) instead of
// interleaving the removed words back in via strikethrough. What was
// removed is folded into one small muted caption underneath instead of
// being shown inline at full size. With several variations on one page
// this keeps each one to roughly its own length rather than ~1.5-2x it.
export function DiffPreview({ tokens }) {
  const removedText = tokens.filter((t) => t.type === 'removed').map((t) => t.text).join('').trim();
  return (
    <>
      <div>
        {tokens
          .filter((t) => t.type !== 'removed')
          .map((t, i) =>
            t.type === 'added' ? (
              <span key={i} style={{ background: 'rgba(230,200,88,.4)', color: '#1D1D1D', fontWeight: 600, borderRadius: 3 }}>
                {t.text}
              </span>
            ) : (
              <span key={i}>{t.text}</span>
            )
          )}
      </div>
      {removedText && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: '#9C9890', fontStyle: 'italic' }}>
          Verwijderd t.o.v. het hoofdscript: &ldquo;{removedText}&rdquo;
        </div>
      )}
    </>
  );
}
