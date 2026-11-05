'use client';

// Two staff-only panels about evidence: the locked proof copies of what the
// client filled in (with PDF), and the delivery status of every email sent.
import { useCallback, useEffect, useState } from 'react';
import { formatShortDateTime } from './flowData';
import { SNAPSHOT_KINDS } from '../lib/snapshotKinds.js';
import { EMAIL_STATUS_LABELS, EMAIL_PROBLEM_STATUSES } from '../lib/emailStatus.js';

const card = { background: '#FFFFFF', border: '1px solid #E3E0D5', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 6px rgba(29,29,29,.05)' };
const btn = { border: '1px solid #D2CFC8', background: '#fff', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: '#1D1D1D' };
const title = { fontSize: 13, fontWeight: 700, color: '#1D1D1D', margin: '0 0 6px' };

function useJson(url, version) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setData(null); setFailed(false);
    fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error('status ' + r.status)))).then((d) => { if (!cancelled) setData(d); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [url, version]);
  return { data, failed, setData };
}

export function ProofSnapshotsPanel({ briefId, hasSubmitted }) {
  const { data, failed, setData } = useJson(`/api/dashboard/briefs/${briefId}/snapshots`, briefId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/dashboard/briefs/${briefId}/snapshots`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.message || 'Vastleggen is niet gelukt.'); else setData(body);
    } catch (e) { setError('Geen verbinding. Probeer het opnieuw.'); }
    setBusy(false);
  }, [briefId, setData]);
  return (
    <section style={card}>
      <h3 style={title}>Bewijs: vastgelegde versies</h3>
      <div style={{ fontSize: 12, color: '#5C5850', lineHeight: 1.5, marginBottom: 10 }}>
        Een vergrendelde kopie van alle antwoorden en keuzes (stap 1 t/m 7), automatisch bewaard als de klant de brief verstuurt, een script kiest en alles bevestigt. Met tijdstip, IP-adres en vingerafdruk. Download als PDF om het aan de klant te laten zien.
      </div>
      {failed && <div style={{ fontSize: 12.5, color: '#C2513F' }}>Laden is niet gelukt.</div>}
      {data && data.length === 0 && <div style={{ fontSize: 12.5, color: '#6B675D', marginBottom: 8 }}>Nog niets vastgelegd voor deze brief.</div>}
      {data && data.map((s) => (
        <div key={s.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0', borderTop: '1px solid #F0EEE6', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{SNAPSHOT_KINDS[s.kind] || s.kind}</div>
            <div style={{ fontSize: 11.5, color: '#6B675D' }}>{formatShortDateTime(s.createdAt)} · vingerafdruk {s.hash.slice(0, 10)}…{s.ip ? ' · IP ' + s.ip : ''}</div>
          </div>
          <a href={`/api/dashboard/briefs/${briefId}/snapshots/${s.id}/pdf`} style={{ ...btn, textDecoration: 'none' }}>Download PDF</a>
        </div>
      ))}
      <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={save} disabled={busy} style={btn}>{busy ? 'Bezig…' : 'Nu vastleggen'}</button>
        <span style={{ fontSize: 11.5, color: '#6B675D' }}>
          {hasSubmitted ? 'Legt de brief vast zoals hij nu is (staat dan als "Door TFA vastgelegd").' : 'De klant heeft nog niet verstuurd; dit legt vast wat er nu staat.'}
        </span>
      </div>
      {error && <div style={{ fontSize: 12.5, color: '#C2513F', marginTop: 6 }}>{error}</div>}
    </section>
  );
}

// onlyProblems: the compact warning for the Overzicht tab (nothing at all when
// every email is fine). Otherwise the full list, for the Historie tab.
export function EmailStatusPanel({ briefId, onlyProblems }) {
  const { data } = useJson(`/api/dashboard/briefs/${briefId}/emails`, briefId);
  if (!data) return null;
  const problems = data.filter((e) => EMAIL_PROBLEM_STATUSES.includes(e.status));
  if (onlyProblems && problems.length === 0) return null;
  const rows = onlyProblems ? problems : data;
  return (
    <section style={{ ...card, ...(onlyProblems ? { border: '1px solid #E3B8AF', background: '#FBF3F1' } : {}) }}>
      <h3 style={{ ...title, color: onlyProblems ? '#8A2E1E' : '#1D1D1D' }}>{onlyProblems ? 'Let op: een e-mail aan deze klant is niet aangekomen' : 'E-mails aan deze klant'}</h3>
      {!onlyProblems && (
        <div style={{ fontSize: 12, color: '#5C5850', lineHeight: 1.5, marginBottom: 8 }}>
          &ldquo;Afgeleverd&rdquo; betekent dat de mailserver van de klant de e-mail heeft aangenomen. Of hij in de inbox of in de spamfolder terechtkomt, kan niemand van buitenaf zien. Staat er na een paar minuten alleen &ldquo;Verstuurd&rdquo;, dan ontbreekt de bevestiging (controleer de webhook in Resend).
        </div>
      )}
      {rows.length === 0 && <div style={{ fontSize: 12.5, color: '#6B675D' }}>Nog geen e-mails vastgelegd.</div>}
      {rows.map((e) => {
        const bad = EMAIL_PROBLEM_STATUSES.includes(e.status);
        return (
          <div key={e.id} style={{ padding: '8px 0', borderTop: '1px solid #F0EEE6' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{e.kind} <span style={{ fontWeight: 400, color: '#6B675D' }}>· {formatShortDateTime(e.createdAt)}</span></div>
            <div style={{ fontSize: 12, color: '#5C5850', overflowWrap: 'anywhere' }}>Aan {e.to || 'onbekend'} · {e.subject}</div>
            <div style={{ fontSize: 12.5, fontWeight: bad ? 700 : 500, color: bad ? '#8A2E1E' : '#1D1D1D', marginTop: 2 }}>
              {bad ? '⚠ ' : e.status === 'delivered' ? '✓ ' : ''}{EMAIL_STATUS_LABELS[e.status] || e.status}{e.detail ? ' (' + e.detail + ')' : ''}
            </div>
          </div>
        );
      })}
    </section>
  );
}
