'use client';

import { useEffect, useRef } from 'react';

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

export default function Preloader({ fullScreen = true }) {
  const videoRef = useRef(null);

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
      <video
        ref={videoRef}
        src="/brand/preloader.mp4"
        loop
        muted
        playsInline
        style={{ width: 140, height: 140, objectFit: 'contain' }}
      />
    </div>
  );
}
