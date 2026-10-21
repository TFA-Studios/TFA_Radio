'use client';

// Compact audio progress bar shared by the voice and music steps: a slim
// rounded track with a gold fill, a thumb that appears on hover/drag and a
// "0:12 / 0:30" readout. Native range input underneath, so keyboard and
// touch seeking work without extra code.
export function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function AudioScrubber({ currentTime, duration, onSeek }) {
  const max = duration || 0;
  const pct = max ? Math.min(100, (currentTime / max) * 100) : 0;
  return (
    <div className="tfa-scrub" onClick={(e) => e.stopPropagation()}>
      <input
        type="range"
        aria-label="Positie in het fragment"
        min={0}
        max={max}
        step={0.01}
        value={Math.min(currentTime, max)}
        onChange={(e) => onSeek(parseFloat(e.target.value))}
        style={{ background: `linear-gradient(to right, #E6C858 ${pct}%, #E4E0D2 ${pct}%)` }}
      />
      <span className="tfa-scrub-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
      <style jsx>{`
        .tfa-scrub { display: flex; align-items: center; gap: 10px; flex: 1 1 auto; min-width: 0; }
        .tfa-scrub-time { flex: none; font-size: 11px; font-variant-numeric: tabular-nums; color: #8C6D1F; }
        input[type='range'] { -webkit-appearance: none; appearance: none; flex: 1; min-width: 0; height: 4px; border-radius: 999px; outline: none; cursor: pointer; margin: 0; }
        input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #1D1D1D; border: 2px solid #E6C858; transition: transform .12s ease; }
        input[type='range']::-moz-range-thumb { width: 8px; height: 8px; border-radius: 50%; background: #1D1D1D; border: 2px solid #E6C858; }
        input[type='range']:hover::-webkit-slider-thumb, input[type='range']:focus-visible::-webkit-slider-thumb { transform: scale(1.25); }
      `}</style>
    </div>
  );
}

export function PlayIcon({ playing, size = 12 }) {
  return playing ? (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor" /><rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor" /></svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4a.6.6 0 0 0 .9.5l6.6-4.2a.6.6 0 0 0 0-1L3.9 1.3a.6.6 0 0 0-.9.5z" fill="currentColor" /></svg>
  );
}
