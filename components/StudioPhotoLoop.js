'use client';

import { useEffect, useState } from 'react';

// A quiet, auto-advancing crossfade of "us working in the studio" photos —
// no dots, no arrows, nothing to click, it just sits there and breathes.
// Used on the public landing page hero (large) and the client status page
// (small, near the assigned engineer's name) so both read as "a real
// studio in Amsterdam is doing this for you" instead of a faceless SaaS
// screen. Each photo gets a slow Ken Burns-style zoom while it's the
// visible one, so it never looks like a static image even mid-photo — the
// zoom restarts every time an image comes back around (see the `tick`-
// keyed <img> below, which remounts just the active photo each cycle).
const DEFAULT_IMAGES = [
  { src: '/studio/studio-1.jpg', alt: 'TFA Studios — in de studio' },
  { src: '/studio/studio-2.jpg', alt: 'TFA Studios — aan het mixen' },
];

export default function StudioPhotoLoop({
  images = DEFAULT_IMAGES,
  intervalMs = 4800,
  caption = 'TFA Studios · Amsterdam',
  height = 420,
  borderRadius = 20,
}) {
  const [index, setIndex] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (images.length < 2) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
      setTick((t) => t + 1);
    }, intervalMs);
    return () => clearInterval(id);
  }, [images.length, intervalMs]);

  if (!images.length) return null;

  return (
    <div
      style={{
        position: 'relative', width: '100%', height, borderRadius,
        overflow: 'hidden', background: '#111', flex: 'none',
        boxShadow: '0 0 0 1.5px rgba(230,200,88,.45), 0 20px 50px rgba(0,0,0,.4)',
      }}
    >
      {images.map((img, i) => (
        <img
          key={i === index ? `${img.src}-${tick}` : img.src}
          src={img.src}
          alt={img.alt || ''}
          className={i === index ? 'tfa-studio-loop-img' : undefined}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            opacity: i === index ? 1 : 0,
            transition: 'opacity 1.4s ease',
          }}
        />
      ))}

      {/* Bottom gradient so the caption stays legible over any photo,
          regardless of how bright/dark that particular shot is. */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '40%', background: 'linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,0))', pointerEvents: 'none' }} />

      {caption && (
        <div style={{ position: 'absolute', left: 16, bottom: 14, fontSize: 12, fontWeight: 600, letterSpacing: '.03em', color: '#FBF9EC', textShadow: '0 1px 4px rgba(0,0,0,.5)' }}>
          {caption}
        </div>
      )}

      <style>{`
        .tfa-studio-loop-img {
          animation: tfaStudioKenBurns ${intervalMs + 1400}ms ease-out forwards;
        }
        @keyframes tfaStudioKenBurns {
          from { transform: scale(1); }
          to { transform: scale(1.08); }
        }
        @media (prefers-reduced-motion: reduce) {
          .tfa-studio-loop-img { animation: none; }
        }
      `}</style>
    </div>
  );
}
