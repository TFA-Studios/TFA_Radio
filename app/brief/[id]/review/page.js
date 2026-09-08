'use client';

import { useState } from 'react';
import Preloader from '../../../../components/Preloader';
import useMinDelay from '../../../../components/useMinDelay';
import { useBrief } from '../../../../components/useBrief';
import { parseReviewRounds, currentReviewRound } from '../../../../components/flowData';

// Post-production review — reached via a private link emailed to the
// client once a producer pastes a Frame.io link from the dashboard (see
// app/api/dashboard/briefs/[id]/review-round). Same private-link/no-accounts
// access model as every other step (the brief id IS the key), but this page
// is standalone rather than part of the numbered 1–7 flow: it only exists
// once a brief has already been submitted and gone into production, so it
// doesn't use StepShell's step-numbered sidebar.
export default function ReviewPage({ params }) {
  const { id } = params;
  const { brief, loading, reload } = useBrief(id);
  const showLoader = useMinDelay(loading, 700);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [justSent, setJustSent] = useState('');

  if (showLoader) return <Preloader />;

  if (!brief) {
    return (
      <Shell>
        <div style={{ background: '#FBF3F1', border: '1px solid #C2513F', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: '#C2513F' }}>
          Geen brief gevonden bij deze link.
        </div>
      </Shell>
    );
  }

  const companyName = brief.companyName && brief.companyName.trim() ? brief.companyName : 'jouw commercial';
  const rounds = parseReviewRounds(brief);
  const round = currentReviewRound(brief);

  if (!round) {
    return (
      <Shell companyName={companyName}>
        <div style={{ background: '#F7F6F1', border: '1.5px solid #E3E0D5', borderRadius: 14, padding: '22px 24px', fontSize: 14, color: '#5C5850' }}>
          Er staat nog niets klaar om te bekijken. Zodra TFA een versie deelt, ontvang je een e-mail en verschijnt de link hier.
        </div>
      </Shell>
    );
  }

  const isApproved = !!round.approvedAt;

  async function sendFeedback() {
    const text = feedbackText.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/briefs/' + id + '/review-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('failed');
      setFeedbackText('');
      setJustSent('feedback');
      await reload();
    } catch (e) {
      setError('Kon je feedback niet versturen — probeer het nog eens.');
    } finally {
      setSubmitting(false);
    }
  }

  async function approve() {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/briefs/' + id + '/review-approve', { method: 'POST' });
      if (!res.ok) throw new Error('failed');
      setJustSent('approved');
      await reload();
    } catch (e) {
      setError('Kon je goedkeuring niet versturen — probeer het nog eens.');
    } finally {
      setSubmitting(false);
    }
  }

  const cardStyle = {
    background: '#FBF9EC', border: '1.5px solid #E6C858', borderRadius: 16, padding: '28px 30px',
    boxShadow: '0 10px 32px rgba(230,200,88,.18)', marginBottom: 22,
  };

  return (
    <Shell companyName={companyName}>
      <div style={cardStyle}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8C6D1F' }}>
          {rounds.length > 1 ? `Ronde ${rounds.length}` : 'Jouw productie'}
        </div>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: 24, margin: '10px 0 14px', color: '#1D1D1D' }}>
          {isApproved ? 'Goedgekeurd' : 'Klaar om te bekijken'}
        </h1>
        <a
          href={round.frameioLink}
          target="_blank"
          rel="noreferrer"
          className="btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', whiteSpace: 'nowrap', padding: '13px 22px' }}
        >
          Bekijk op Frame.io
        </a>
      </div>

      {isApproved ? (
        <div style={{ background: '#F0F7EE', border: '1.5px solid #A9CF9E', borderRadius: 14, padding: '18px 20px', fontSize: 13.5, color: '#3A6B32' }}>
          Je hebt deze versie goedgekeurd op {new Date(round.approvedAt).toLocaleDateString('nl-NL')}. TFA is op de hoogte en rondt de levering af.
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 8, fontSize: 12.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8C8880' }}>
            Wat vind je ervan?
          </div>
          <div style={{ background: '#FFFFFF', border: '1px solid #EEECE3', borderRadius: 14, padding: '20px 22px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>Nog iets aanpassen?</div>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Beschrijf hier wat je graag anders zou zien…"
              rows={5}
              style={{
                width: '100%', boxSizing: 'border-box', border: '1.5px solid #E3E0D5', borderRadius: 10, padding: '12px 14px',
                fontSize: 14, fontFamily: 'inherit', resize: 'vertical', color: '#1D1D1D',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                type="button"
                disabled={!feedbackText.trim() || submitting}
                onClick={sendFeedback}
                style={{
                  border: '1px solid #C9C5B9', borderRadius: 10, background: 'transparent', color: '#5C5850',
                  fontWeight: 600, fontSize: 13.5, padding: '11px 20px', cursor: feedbackText.trim() ? 'pointer' : 'default',
                }}
              >
                Feedback versturen
              </button>
            </div>

            {rounds.some((r) => r.feedback && r.feedback.length) && (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #EEECE3' }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: '#8C8880', textTransform: 'uppercase', marginBottom: 8 }}>Eerder verstuurd</div>
                {rounds.flatMap((r) => r.feedback || []).map((f) => (
                  <div key={f.id} style={{ fontSize: 13, color: '#5C5850', marginBottom: 8, lineHeight: 1.5 }}>
                    <span style={{ color: '#9C9890', fontSize: 11.5 }}>{new Date(f.createdAt).toLocaleDateString('nl-NL')} — </span>
                    {f.text}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 22, paddingTop: 22, borderTop: '1px solid #EAE7DE', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-primary" style={{ minWidth: 260, padding: '14px 26px' }} disabled={submitting} onClick={approve}>
              Goedkeuren
            </button>
          </div>
        </>
      )}

      {justSent === 'feedback' && (
        <div style={{ marginTop: 14, fontSize: 12.5, color: '#8C6D1F' }}>Je feedback is verstuurd naar TFA.</div>
      )}
      {error && <div style={{ marginTop: 14, fontSize: 12.5, color: '#C2513F' }}>{error}</div>}
    </Shell>
  );
}

function Shell({ companyName, children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#DEDCD7', fontFamily: "'Geist', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 20px' }}>
        <div style={{ fontSize: 11, letterSpacing: '.09em', textTransform: 'uppercase', color: '#8C8880', fontWeight: 700, marginBottom: 6 }}>
          TFA SpotFlow
        </div>
        {companyName && (
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1D1D1D', marginBottom: 22 }}>{companyName}</div>
        )}
        {children}
      </div>
    </div>
  );
}
