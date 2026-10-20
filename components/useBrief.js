'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// Wraps fetch/patch of a single brief via the /api/briefs/:id routes —
// shared by every client-flow step page instead of each page reimplementing
// its own fetch/save/debounce dance (as every original public/*.html did).
// The full-screen loader appears before any brief is loaded on a new page, so
// it reads the partner logo from here (set the first time a brief loads).
function rememberPartnerLogo(b) {
  try {
    if (b && b.agencyLogoDark) window.sessionStorage.setItem('tfa_partner_logo', b.agencyLogoDark);
    else window.sessionStorage.removeItem('tfa_partner_logo');
  } catch (e) {}
}

export function useBrief(id) {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saveState, setSaveState] = useState('');
  const saveTimer = useRef(null);
  const pendingBody = useRef(null);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return null;
    }
    try {
      const res = await fetch('/api/briefs/' + id);
      if (!res.ok) {
        setNotFound(true);
        setLoading(false);
        return null;
      }
      const data = await res.json();
      setBrief(data);
      rememberPartnerLogo(data);
      setNotFound(false);
      return data;
    } catch (e) {
      setNotFound(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = useCallback(
    async (body) => {
      if (!id) return null;
      setSaveState('Opslaan…');
      try {
        const res = await fetch('/api/briefs/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('save failed');
        const updated = await res.json();
        setBrief(updated);
        setSaveState('Opgeslagen');
        return updated;
      } catch (e) {
        setSaveState('Niet opgeslagen, controleer je verbinding');
        return null;
      }
    },
    [id]
  );

  const schedulePatch = useCallback(
    (body, delay = 350) => {
      clearTimeout(saveTimer.current);
      setSaveState('Opslaan…');
      // Merge with a still-pending body so quick edits to different fields
      // are not dropped by the debounce.
      pendingBody.current = { ...(pendingBody.current || {}), ...body };
      saveTimer.current = setTimeout(() => {
        const b = pendingBody.current;
        pendingBody.current = null;
        patch(b);
      }, delay);
    },
    [patch]
  );

  const flushPending = useCallback(() => {
    clearTimeout(saveTimer.current);
    pendingBody.current = null;
  }, []);

  return { brief, setBrief, loading, notFound, saveState, setSaveState, patch, schedulePatch, flushPending, reload: load };
}
