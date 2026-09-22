'use client';

import { useEffect, useState } from 'react';

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
// `sizing` is either { height: <px> } (fixed, crops to fill via
// object-fit: cover — the small status-page use) or { aspectRatio: <css
// aspect-ratio value>, maxWidth: <px> } (the landing page's "cinematic"
// use: full width up to maxWidth, height derived from the ratio, so a 3:2
// photo is never cropped since the box IS a 3:2 box).
function CrossfadeLoop({ images, intervalMs, caption, sizing, borderRadius }) {
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

  const sizeStyle = sizing.aspectRatio
    ? { width: '100%', maxWidth: sizing.maxWidth, aspectRatio: sizing.aspectRatio, margin: '0 auto' }
    : { width: '100%', height: sizing.height };

  return (
    <div
      style={{
        position: 'relative', ...sizeStyle, borderRadius,
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

// variant="slide" — the landing page version. The main photo sits dead
// center of the section at its full real 3:2 rectangle; the next photo
// sits fully visible (never cropped/clipped) and smaller off to the
// right, greyed out, flush with the section's right edge. On the next
// cycle they swap: no overflow/clipping trick at all — both photos stay
// permanently mounted at fixed DOM positions, and it's their POSITION
// that swaps (main <-> peek), so the browser just animates the CSS
// left/width/opacity/filter difference between the two states — the peek
// photo visibly grows and slides into the center while the old main
// shrinks and slides out to the right, greying out as it goes.
// `transform` is only ever `translateY(-50%)` in both states (vertical
// centering) so it never has to interpolate between different transform
// functions — only left/width/opacity/filter animate, which is what
// keeps the swap smooth instead of jumpy.
const MAIN_POS = { left: '23%', width: '54%' };
const PEEK_POS = { left: '80%', width: '20%' };
// Container's own aspect ratio is derived from the main photo's rendered
// size (54% wide × the photos' real 2:3 height ratio) so there's exactly
// enough vertical room for it — see the aspectRatio below.
const CONTAINER_ASPECT = 1 / (0.54 * (2 / 3));

function SlideLoop({ images, intervalMs, caption, maxWidth, borderRadius }) {
  const [index, setIndex] = useState(0);
  const TRANSITION_MS = 1100;

  useEffect(() => {
    if (images.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % images.length), intervalMs);
    return () => clearInterval(id);
  }, [images.length, intervalMs]);

  const mainSrc = images[index].src;

  return (
    <div style={{ width: '100%', maxWidth, margin: '0 auto' }}>
      <div className="tfa-slideloop" style={{ position: 'relative', width: '100%', aspectRatio: String(CONTAINER_ASPECT) }}>
        {images.map((img, i) => {
          const isMain = img.src === mainSrc;
          const pos = isMain ? MAIN_POS : PEEK_POS;
          return (
            <div
              key={img.src}
              className={isMain ? 'tfa-slideloop-main' : 'tfa-slideloop-peek'}
              style={{
                position: 'absolute', top: '50%', left: pos.left, width: pos.width, aspectRatio: '3 / 2',
                transform: 'translateY(-50%)', borderRadius, overflow: 'hidden', background: '#111',
                transition: `left ${TRANSITION_MS}ms cubic-bezier(.65,0,.35,1), width ${TRANSITION_MS}ms cubic-bezier(.65,0,.35,1), opacity ${TRANSITION_MS}ms ease, filter ${TRANSITION_MS}ms ease`,
                opacity: isMain ? 1 : 0.4,
                filter: isMain ? 'none' : 'grayscale(65%) brightness(.75)',
                zIndex: isMain ? 2 : 1,
                boxShadow: isMain ? '0 0 0 1.5px rgba(230,200,88,.45), 0 20px 50px rgba(0,0,0,.35)' : 'none',
              }}
            >
              <img src={img.src} alt={isMain ? (img.alt || '') : ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {isMain && (
                <>
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '34%', background: 'linear-gradient(to top, rgba(0,0,0,.5), rgba(0,0,0,0))', pointerEvents: 'none' }} />
                  {caption && (
                    <div style={{ position: 'absolute', left: 18, bottom: 16, fontSize: 12.5, fontWeight: 600, letterSpacing: '.03em', color: '#FBF9EC', textShadow: '0 1px 4px rgba(0,0,0,.5)' }}>
                      {caption}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* On narrow screens there isn't room for a centered main + a
          distinct right-hand peek without everything feeling cramped, so
          the peek photo just hides and the main photo takes the full
          width instead — still swaps photos on the same interval, just
          without the side-peek effect. */}
      <style>{`
        @media (max-width: 700px) {
          .tfa-slideloop-peek { display: none !important; }
          .tfa-slideloop-main { left: 3% !important; width: 94% !important; }
        }
      `}</style>
    </div>
  );
}

// variant="pair" — no loop at all. Both photos sit side by side, same
// size, full color, no greying/dimming/hierarchy trick between them —
// a calm "editorial" pair instead of a rotating spotlight on one photo
// at a time. Only motion is a subtle hover-zoom per photo on pointer
// devices (a plain CSS :hover scale on the <img>, so it costs nothing
// on touch/no-hover devices where the media query below just no-ops).
function PairRow({ images, caption, maxWidth, borderRadius }) {
  return (
    <div style={{ width: '100%', maxWidth, margin: '0 auto' }}>
      <div
        className="tfa-studio-pair"
        style={{ display: 'grid', gridTemplateColumns: `repeat(${images.length}, 1fr)`, gap: 20 }}
      >
        {images.map((img) => (
          <div
            key={img.src}
            style={{
              position: 'relative', width: '100%', aspectRatio: '3 / 2', borderRadius,
              overflow: 'hidden', background: '#111',
              boxShadow: '0 0 0 1.5px rgba(230,200,88,.35), 0 16px 40px rgba(0,0,0,.28)',
            }}
          >
            <img
              src={img.src}
              alt={img.alt || ''}
              className="tfa-studio-pair-img"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
        ))}
      </div>
      {caption && (
        <div style={{ marginTop: 14, fontSize: 12, fontWeight: 600, letterSpacing: '.03em', color: '#5C5850', textAlign: 'center' }}>
          {caption}
        </div>
      )}
      <style>{`
        .tfa-studio-pair-img { transition: transform .5s ease; will-change: transform; }
        @media (hover: hover) and (pointer: fine) {
          .tfa-studio-pair-img:hover { transform: scale(1.045); }
        }
        @media (max-width: 640px) {
          .tfa-studio-pair { grid-template-columns: 1fr !important; }
        }
      `}</style>
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
  if (variant === 'pair') {
    return <PairRow images={images} caption={caption} maxWidth={maxWidth} borderRadius={borderRadius} />;
  }
  if (variant === 'slide') {
    return <SlideLoop images={images} intervalMs={intervalMs || 5200} caption={caption} maxWidth={maxWidth} borderRadius={borderRadius} />;
  }
  if (variant === 'cinematic') {
    // One big photo at a time, full width up to maxWidth, real 3:2 ratio
    // (never cropped) — the "drop the side-peek, just go big" option.
    return (
      <CrossfadeLoop
        images={images}
        intervalMs={intervalMs || 5000}
        caption={caption}
        sizing={{ aspectRatio: '3 / 2', maxWidth }}
        borderRadius={borderRadius}
      />
    );
  }
  return <CrossfadeLoop images={images} intervalMs={intervalMs || 4800} caption={caption} sizing={{ height }} borderRadius={borderRadius} />;
}
