'use client';

import { useEffect, useRef, useState } from 'react';

// Centered auto-advancing photo carousel for the "Kom langs" homepage
// section. Interaction pattern (not the visuals/content) was requested by
// Karim from a reference clip he recorded: one big centered card, its
// neighbours peeking in cropped at the edges, a continuous smooth slide
// between them. Everything here — photos, copy, colors, card shape — is
// TFA's own; only the mechanics are borrowed.
//
// Per Karim's follow-up notes: no play/pause button or progress bar
// anymore (removed — it just autoplays, no visible transport controls),
// and it's meant to run full-bleed edge-to-edge like the banner video
// above it — the caller (app/page.js) wraps this in the same
// `left: 50%; width: 100vw; margin-left: -50vw` full-bleed trick used for
// the video, and passes maxWidth="100%" here. Card widths are percentages
// of that full row width (not fixed px) so it scales the same way at any
// viewport size, and the row's height is capped the same way the video's
// is (see `.tfa-carousel-row` in page.js's <style> block).
//
// Sizing per card is driven by its circular distance from the active
// index (0 = active/big, 1 = immediate neighbour, 2+ = far/sliver), so
// growing the active card and shrinking the rest is just a flex-basis
// transition — no manual translateX math, and it still reads as the track
// "sliding" because the neighbours get pushed out of the way.
const SIZES = { 0: '56%', 1: '20%', 2: '4%' };

function distance(i, active, n) {
  const d = Math.abs(i - active);
  return Math.min(d, n - d);
}

export default function StudioCarousel({
  images,
  intervalMs = 4000,
  maxWidth = '100%',
  borderRadius = 20,
  gap = 14,
}) {
  const [active, setActive] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const n = images.length;
  const timerRef = useRef(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 700);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (n < 2) return undefined;
    timerRef.current = setInterval(() => {
      setActive((i) => (i + 1) % n);
    }, intervalMs);
    return () => clearInterval(timerRef.current);
  }, [intervalMs, n, active]);

  if (!images || images.length === 0) return null;

  const goTo = (i) => {
    setActive(i);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  return (
    <div style={{ width: '100%', maxWidth, margin: '0 auto' }}>
      <div
        className="tfa-carousel-row"
        style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap, overflow: 'hidden', width: '100%' }}
      >
        {images.map((img, i) => {
          const d = distance(i, active, n);
          const isActive = i === active;
          if (isMobile && d > 0) return null;
          const width = isMobile ? '100%' : SIZES[Math.min(d, 2)];
          return (
            <button
              key={img.src}
              onClick={() => goTo(i)}
              aria-label={img.alt || `Foto ${i + 1}`}
              style={{
                position: 'relative', flex: `0 0 ${width}`, width,
                borderRadius, overflow: 'hidden', border: 0, padding: 0, cursor: i === active ? 'default' : 'pointer',
                background: '#141414', transition: 'flex-basis .65s cubic-bezier(.65,0,.35,1), opacity .5s ease, filter .5s ease',
                opacity: isActive ? 1 : 0.55,
                filter: isActive ? 'none' : 'grayscale(35%) brightness(.8)',
              }}
            >
              <img
                src={img.src}
                alt={img.alt || ''}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              {isActive && img.tag && (
                <span
                  style={{
                    position: 'absolute', top: 14, left: 14, background: 'rgba(29,29,29,.7)',
                    color: '#FBF9EC', fontSize: 11.5, fontWeight: 600, letterSpacing: '.03em',
                    padding: '5px 11px', borderRadius: 999, border: '1px solid rgba(255,255,255,.12)',
                  }}
                >
                  {img.tag}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
