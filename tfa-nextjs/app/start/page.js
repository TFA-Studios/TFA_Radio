'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Preloader from '../../components/Preloader';

// Landing route the public homepage's CTA points to: creates a fresh brief
// via POST /api/briefs, then redirects to step 1 with the new id — mirrors
// what contact.html did inline (ensureBrief()) when no ?id was present.
// This is the very first thing a client sees after clicking "Start je
// commercial", so it shows the same animated Preloader used elsewhere in
// the flow instead of a plain "even geduld" text — no disclaimer line, the
// client just sees it loading until step 1 is ready.
export default function StartPage() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/briefs', { method: 'POST' });
        if (!res.ok) throw new Error('create failed');
        const brief = await res.json();
        if (!cancelled) router.replace(`/brief/${brief.id}/contact`);
      } catch (e) {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#DEDCD7' }}>
        <p style={{ fontSize: 14, color: '#5C5850' }}>Kon geen nieuwe brief aanmaken — probeer het opnieuw.</p>
      </div>
    );
  }

  return <Preloader />;
}
