'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Preloader from '../../components/Preloader';

// Landing route the public homepage's CTA points to: creates a fresh brief
// via POST /api/briefs, then redirects to step 1 with the new id — mirrors
// what contact.html did inline (ensureBrief()) when no ?id was present.
// This is the very first thing a client sees after clicking "Start je
// commercial", so it shows the same animated Preloader used elsewhere in
// the flow instead of a plain "even geduld" text — no disclaimer line, the
// client just sees it loading until step 1 is ready.
//
// Access code gate (see .env.example's TFA_ACCESS_CODE): if the server has
// one configured, POST /api/briefs requires it. A link that already has
// ?code=... in the URL (the kind Karim sends a prospect directly) sails
// straight through with no extra step; anyone who lands here without a
// valid code (e.g. via the public homepage button) sees a one-field prompt
// instead of a brief being created for free. If no code is configured on
// the server at all, the very first attempt (with no code) just succeeds,
// so this is fully transparent until TFA_ACCESS_CODE is actually set.
function StartInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('loading'); // 'loading' | 'needs-code' | 'error'
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function attempt(codeValue) {
    try {
      const res = await fetch('/api/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeValue || '' }),
      });
      if (res.status === 401) {
        setStatus('needs-code');
        return;
      }
      if (!res.ok) throw new Error('create failed');
      const brief = await res.json();
      router.replace(`/brief/${brief.id}/contact`);
    } catch (e) {
      setStatus('error');
    }
  }

  useEffect(() => {
    attempt(searchParams.get('code'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    await attempt(code);
    setSubmitting(false);
  }

  if (status === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#DEDCD7' }}>
        <p style={{ fontSize: 14, color: '#5C5850' }}>Kon geen nieuwe brief aanmaken, probeer het opnieuw.</p>
      </div>
    );
  }

  if (status === 'needs-code') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#DEDCD7', padding: 20 }}>
        <form
          onSubmit={handleSubmit}
          style={{
            width: '100%', maxWidth: 340, background: '#FBF9EC', borderRadius: 16, padding: '32px 28px',
            boxShadow: '0 20px 50px rgba(0,0,0,.08)', display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 13, letterSpacing: '.09em', textTransform: 'uppercase', color: '#8C6D1F', fontWeight: 600 }}>
            TFA Studios
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '2px 0 4px', color: '#1D1D1D' }}>Toegangscode</h1>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#5C5850', margin: '0 0 6px' }}>
            Vul de code in die je van ons hebt ontvangen om een nieuwe commercial te starten.
          </p>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            placeholder="Code"
            style={{
              fontSize: 15, padding: '11px 14px', borderRadius: 10, border: '1px solid #D8D4C8',
              background: '#fff', color: '#1D1D1D', textAlign: 'center', letterSpacing: '.04em',
            }}
          />
          <button
            type="submit"
            disabled={submitting || !code.trim()}
            className="btn-primary"
            style={{ padding: '11px 14px', borderRadius: 10, fontWeight: 600, opacity: submitting || !code.trim() ? 0.6 : 1 }}
          >
            {submitting ? 'Bezig…' : 'Doorgaan'}
          </button>
          <div style={{ fontSize: 12, color: '#8C8880' }}>
            Nog geen code? Neem contact op via{' '}
            <a href="mailto:planning@tfa.studio" style={{ color: '#8C6D1F' }}>planning@tfa.studio</a>.
          </div>
        </form>
      </div>
    );
  }

  return <Preloader />;
}

export default function StartPage() {
  return (
    <Suspense fallback={<Preloader />}>
      <StartInner />
    </Suspense>
  );
}
