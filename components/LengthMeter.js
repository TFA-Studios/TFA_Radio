'use client';

import { lengthLevel } from '../lib/lengthLevel';

const LEVELS = {
  ok: { color: '#1D7A46', track: '#D9EBDF' },
  check: { color: '#B7791F', track: '#F3E6C9' },
  long: { color: '#C2513F', track: '#F3D9D3' },
};

// Three-state length meter for the client's script steps: green = fits,
// orange = probably too long (TFA will check), red = too long (editing more
// words and continuing are blocked by the page).
export default function LengthMeter({ seconds, target }) {
  const level = lengthLevel(seconds, target);
  const { color, track } = LEVELS[level];
  const pct = Math.min((seconds / target) * 100, 125);
  const message = level === 'ok'
    ? 'Past binnen ' + target + ' seconden.'
    : level === 'check'
      ? 'Let op: dit wordt waarschijnlijk iets te lang voor ' + target + ' seconden. TFA controleert dit nog, maar probeer in te korten.'
      : 'Te lang voor ' + target + ' seconden. Haal eerst woorden weg: je kunt niet verder en er kunnen geen woorden bij.';
  return (
    <div role="status" aria-live="polite">
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#5C5850' }}>
        <span>Geschatte lengte</span>
        <span style={{ fontWeight: 600, color }}>{seconds.toFixed(1)}s van {target}″</span>
      </div>
      <div style={{ marginTop: 6, height: 8, borderRadius: 4, background: track, overflow: 'hidden', position: 'relative' }}>
        <div style={{ height: '100%', borderRadius: 4, width: pct * (100 / 125) + '%', background: color, transition: 'width .15s ease, background .15s ease' }} />
      </div>
      <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 500, color }}>
        {level === 'ok' ? '✓ ' : '⚠ '}{message}
      </div>
    </div>
  );
}
