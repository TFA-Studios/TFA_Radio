'use client';

import { useEffect, useRef, useState } from 'react';

// "Us working in the studio" photos, shown two different ways depending on
// where this sits — see the `variant` prop on the default export below.
// Used on the public landing page (large, 'slide') and the client status
// page (small, near the assigned engineer's name, 'crossfade') so both read
// as "a real studio in Amsterdam is doing this for you" instead of a
// faceless SaaS screen.
const DEFAULT_IMAGES = [
  { src: '/studio/studio-1.jpg', alt: 'TFA Studios — in de studio' },
  { src: '/studio/studio-2.jpg', alt: 'TFA Studios — aan het mixen' },
];

// variant="crossfade" — the original small-footprint version (client status
// page): one photo quietly dissolves into the next, each with a slow Ken
// Burns zoom while it's visible so it never looks static even mid-photo.
// Forces a fixed `height` and crops to fill it (object-fit: cover), which
// is exactly the "squared frame" look that didn't work for the landing
// page hero — kept only for this small use, not exported separately since
// nothing outside this file needs to name it.
function CrossfadeLoop({ images, intervalMs, caption, height, borderRadius }) {
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
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '40%', background: 'linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,0))', pointerEvents: 'none' }} />
      {caption && (
        <div style={{ position: 'absolute', left: 16, bottom: 14, fontSize: 12, fontWeight: 600, letterSpacing: '.03em', color: '#FBF9EC', textShadow: '0 1px 4px rgba(0,0,0,.5)' }}>
          {caption}
        </div>
      )}
      <style>{`
        .tfa-studio-loop-img { animation: tfaStudioKenBurns ${intervalMs + 1400}ms ease-out forwards; }
        @keyframes tfaStudioKenBurns { from { transform: scale(1); } to { transform: scale(1.08); } }
        @media (prefers-reduced-motion: reduce) { .tfa-studio-loop-img { animation: none; } }
      `}</style>
    </div>
  );
}

// variant="slide" — the landing page version. Keeps each photo's real 3:2
// rectangle uncropped (every slide's aspect-ratio matches the source
// photos exactly, so object-fit: cover never has to cut anything off) and
// shows the *next* photo peeking, greyed out, at the right edge — then
// swipes over to it. The "two visible slides, dimmed peek on the side"
// look, not a full-bleed crossfade.
//
// How the swipe works without ever-growing transforms or a cloned-slide
// infinite-scroll setup: only ever renders two <div>s — order[0] (current,
// full color) and order[1] (next, dimmed peek) — recomputed from `index`.
// Each cycle: (1) turn the CSS transition on and slide the track left by
// one slot, revealing order[1] in full; (2) the instant that finishes,
// advance `index` AND, in the same style update, set transition to 'none'
// and snap the track back to 0 — invisible to the eye since it happens
// with no transition, but the now-current photo is back to being rendered
// at position 0. Standard "two-slide" carousel trick, just done with
// inline styles instead of a library.
function SlideLoop({ images, intervalMs, caption, maxWidth, borderRadius }) {
  const [index, setIndex] = useState(0);
  const [sliding, setSliding] = useState(false);
  const timeoutRef = useRef(null);
  const SLIDE_PCT = 82; // current slide's width, as % of the viewport
  const GAP = 20; // px between current and the peeking next slide
  const TRANSITION_MS = 900;

  useEffect(() => {
    if (images.length < 2) return;
    const id = setInterval(() => {
      setSliding(true);
      timeoutRef.current = setTimeout(() => {
        setIndex((i) => (i + 1) % images.length);
        setSliding(false);
      }, TRANSITION_MS);
    }, intervalMs);
    return () => {
      clearInterval(id);
      clearTimeout(timeoutRef.current);
    };
  }, [images.length, intervalMs]);

  const current = images[index];
  const next = images[(index + 1) % images.length];

  const slideBaseStyle = {
    position: 'relative', flex: `0 0 ${SLIDE_PCT}%`, aspectRatio: '3 / 2',
    borderRadius, overflow: 'hidden', background: '#111',
  };

  return (
    <div style={{ width: '100%', maxWidth, margin: '0 auto' }}>
      <div style={{ overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex', gap: GAP,
            transform: sliding ? `translateX(calc(-${SLIDE_PCT}% - ${GAP}px))` : 'translateX(0)',
            transition: sliding ? `transform ${TRANSITION_MS}ms cubic-bezier(.65,0,.35,1)` : 'none',
          }}
        >
          <div style={{ ...slideBaseStyle, boxShadow: '0 0 0 1.5px rgba(230,200,88,.45), 0 20px 50px rgba(0,0,0,.35)' }}>
            <img src={current.src} alt={current.alt || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '34%', background: 'linear-gradient(to top, rgba(0,0,0,.5), rgba(0,0,0,0))', pointerEvents: 'none' }} />
            {caption && (
              <div style={{ position: 'absolute', left: 18, bottom: 16, fontSize: 12.5, fontWeight: 600, letterSpacing: '.03em', color: '#FBF9EC', textShadow: '0 1px 4px rgba(0,0,0,.5)' }}>
                {caption}
              </div>
            )}
          </div>
          {/* The next photo, greyed out and dimmed — a preview of what's
              coming, not something to look at closely yet. */}
          <div style={{ ...slideBaseStyle, opacity: 0.4, filter: 'grayscale(65%) brightness(.75)' }}>
            <img src={next.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StudioPhotoLoop({
  images = DEFAULT_IMAGES,
  variant = 'crossfade',
  intervalMs,
  caption = 'TFA Studios · Amsterdam',
  height = 420,
  maxWidth = 860,
  borderRadius = 20,
}) {
  if (!images || images.length === 0) return null;
  if (variant === 'slide') {
    return <SlideLoop images={images} intervalMs={intervalMs || 5200} caption={caption} maxWidth={maxWidth} borderRadius={borderRadius} />;
  }
  return <CrossfadeLoop images={images} intervalMs={intervalMs || 4800} caption={caption} height={height} borderRadius={borderRadius} />;
}
