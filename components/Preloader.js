'use client';

import { useEffect, useRef, useState } from 'react';

// Full-screen loading state built from the client's animated brand mark
// (public/brand/preloader.mp4) instead of a blank page or a generic spinner.
// Used everywhere the app previously rendered nothing (`return null`) while
// waiting on a brief to load, and as the root route-level loading.js fallback
// shown during slower server-rendered page transitions (e.g. the dashboard
// pages, which fetch real data server-side before rendering).
//
// Played back at 2x speed (a ~4s clip loops in ~2s) so the animation itself
// feels snappier — separate from useMinDelay(loading, ms), which controls
// how long the Preloader stays mounted/visible, not the video's own pace.
//
// A step transition mounts a fresh Preloader instance twice in a row (once
// instantly when "next" is clicked, again when the next page mounts — see
// contact/page.js's `navigating` state). Those are two different <video>
// DOM nodes, and a freshly mounted <video> normally starts from frame 0 —
// which is exactly what read as "the animation plays twice": it visibly
// snapped back to the start partway through a single transition. Rather
// than restructure the loading flow to share one persistent video element
// across route changes, `lastPlaybackTime` below is a module-scoped (not
// React) variable that survives the unmount/remount, so a new mount picks
// up playback where the previous one left off instead of restarting — the
// two mounts then read as one continuous loop, which is what "I only see it
// once" actually means from the client's side.
let lastPlaybackTime = 0;

export default function Preloader({ fullScreen = true, messages }) {
  const videoRef = useRef(null);
  // Optional rotating caption under the brand mark — used for the one
  // moment in the flow where this generic full-screen loader is actually
  // standing in for something specific happening (the details step's
  // "Volgende" click, which triggers the real AI script generation call
  // before routing to /script), so it's worth telling the client what's
  // actually going on instead of a silent spinner. Every other call site
  // omits `messages` and gets the same plain logo-only loader as before.
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    if (!messages || messages.length < 2) return undefined;
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return undefined;
    const interval = setInterval(() => {
      setMsgIdx((i) => (i + 1) % messages.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [messages]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;
    el.playbackRate = 2;

    function resume() {
      if (el.duration) el.currentTime = lastPlaybackTime % el.duration;
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
    if (el.readyState >= 1) resume();
    else el.addEventListener('loadedmetadata', resume, { once: true });

    function track() {
      lastPlaybackTime = el.currentTime;
    }
    el.addEventListener('timeupdate', track);
    return () => {
      lastPlaybackTime = el.currentTime || lastPlaybackTime;
      el.removeEventListener('timeupdate', track);
      el.removeEventListener('loadedmetadata', resume);
    };
  }, []);

  return (
    <div
      style={{
        position: fullScreen ? 'fixed' : 'static',
        inset: fullScreen ? 0 : undefined,
        minHeight: fullScreen ? undefined : '40vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1D1D1D',
        zIndex: 999,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, maxWidth: 380, padding: '0 24px' }}>
        <video
          ref={videoRef}
          src="/brand/preloader.mp4"
          loop
          muted
          playsInline
          style={{ width: 140, height: 140, objectFit: 'contain' }}
        />
        {messages && messages.length > 0 && (
          <div
            key={msgIdx}
            className="tfa-preloader-msg-fade"
            style={{ textAlign: 'center', fontSize: 13.5, lineHeight: 1.55, color: '#DEDCD7' }}
          >
            {messages[msgIdx]}
          </div>
        )}
      </div>
      {messages && messages.length > 0 && (
        <style jsx>{`
          @keyframes tfa-preloader-msg-fade {
            from { opacity: 0; transform: translateY(3px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .tfa-preloader-msg-fade { animation: tfa-preloader-msg-fade .5s ease-out; }
          @media (prefers-reduced-motion: reduce) {
            .tfa-preloader-msg-fade { animation: none; }
          }
        `}</style>
      )}
    </div>
  );
}
