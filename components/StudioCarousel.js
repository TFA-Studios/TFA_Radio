'use client';

import { useEffect, useRef, useState } from 'react';

// Centered auto-advancing photo carousel for the "Kom langs" homepage
// section. Interaction pattern (not the visuals/content) was requested by
// Karim from a reference clip he recorded: one big centered card, its
// neighbours peeking in cropped at the edges, a continuous smooth slide
// between them, and a bottom-left play/pause control with a progress bar
// that fills up until the next auto-advance. Everything here — photos,
// copy, colors, card shape — is TFA's own; only the mechanics are borrowed.
//
// Sizing per card is driven by its circular distance from the active
// index (0 = active/big, 1 = immediate neighbour, 2+ = far/sliver), so
// growing the active card and shrinking the rest is just a flex-basis
// transition — no manual translateX math, and it still reads as the track
// "sliding" because the neighbours get pushed out of the way.
const SIZES = { 0: 620, 1: 210, 2: 110 };
const MOBILE_SIZES = { 0: '100%', 1: 0, 2: 0 };

function distance(i, active, n) {
  const d = Math.abs(i - active);
  return Math.min(d, n - d);
}

export default function StudioCarousel({
  images,
  intervalMs = 4000,
  maxWidth = 1180,
  borderRadius = 20,
  gap = 14,
}) {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
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
    if (!playing || n < 2) return undefined;
    timerRef.current = setInterval(() => {
      setActive((i) => (i + 1) % n);
    }, intervalMs);
    return () => clearInterval(timerRef.current);
  }, [playing, intervalMs, n, active]);

  if (!images || images.length === 0) return null;

  const goTo = (i) => {
    setActive(i);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  return (
    <div style={{ width: '100%', maxWidth, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap,
          overflow: 'hidden', aspectRatio: isMobile ? '4 / 3' : '16 / 7.2',
        }}
      >
        {images.map((img, i) => {
          const d = distance(i, active, n);
          const widthTable = isMobile ? MOBILE_SIZES : SIZES;
          const width = widthTable[Math.min(d, 2)];
          const isActive = i === active;
          if (isMobile && width === 0) return null;
          return (
            <button
              key={img.src}
              onClick={() => goTo(i)}
              aria-label={img.alt || `Foto ${i + 1}`}
              style={{
                position: 'relative', flex: `0 0 ${typeof width === 'number' ? `${width}px` : width}`,
                width: typeof width === 'number' ? width : width,
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

      {n > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 20 }}>
          <button
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pauzeer diavoorstelling' : 'Speel diavoorstelling af'}
            style={{
              flex: 'none', width: 40, height: 40, borderRadius: '50%', border: '1px solid #45412A',
              background: 'transparent', color: '#FBF9EC', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {playing ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#FBF9EC"><rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#FBF9EC"><path d="M6 4l14 8-14 8V4z" /></svg>
            )}
          </button>

          <div style={{ flex: 1, height: 3, borderRadius: 999, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}>
            <div
              key={`${active}-${playing}`}
              className="tfa-carousel-progress"
              style={{
                height: '100%', background: '#E6C858', borderRadius: 999, width: playing ? undefined : '0%',
                animation: playing ? `tfaCarouselProgress ${intervalMs}ms linear forwards` : 'none',
              }}
            />
          </div>
        </div>
      )}

      <style>{`
        @keyframes tfaCarouselProgress { from { width: 0%; } to { width: 100%; } }
        @media (prefers-reduced-motion: reduce) {
          .tfa-carousel-progress { animation: none !important; width: 100% !important; }
        }
      `}</style>
    </div>
  );
}
