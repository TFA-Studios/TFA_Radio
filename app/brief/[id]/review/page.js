'use client';

import { useState } from 'react';
import Preloader from '../../../../components/Preloader';
import useMinDelay from '../../../../components/useMinDelay';
import { useBrief } from '../../../../components/useBrief';
import { parseReviewRounds, currentReviewRound, formatRoundLabel, formatDateTime } from '../../../../components/flowData';

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
          {rounds.length > 1 ? formatRoundLabel(round) : 'Jouw productie'}
        </div>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: 24, margin: '10px 0 14px', color: '#1D1D1D' }}>
          {isApproved ? 'Goedgekeurd' : 'Klaar om te bekijken'}
        </h1>
        <a
          href={brief.frameioLink}
          target="_blank"
          rel="noreferrer"
          className="btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', whiteSpace: 'nowrap', padding: '13px 22px' }}
        >
          Bekijk op Frame.io
        </a>
        <div style={{ marginTop: 10, fontSize: 12, color: '#8C6D1F' }}>
          Gedeeld op {formatDateTime(round.createdAt)}
          {rounds.length > 1 ? ' — zelfde link als voorheen, open de ' + formatRoundLabel(round).replace(/^Map/, 'map') + ' binnenin.' : ''}
        </div>
      </div>

      {isApproved && (
        <div style={{ background: '#F0F7EE', border: '1.5px solid #A9CF9E', borderRadius: 14, padding: '18px 20px', fontSize: 13.5, color: '#3A6B32', marginBottom: 22 }}>
          Je hebt deze versie goedgekeurd op {formatDateTime(round.approvedAt)}. TFA is op de hoogte en rondt de levering af.
        </div>
      )}

      {/* This is the ONE place feedback happens — no Frame.io comment, no
          separate e-mail thread. Everything typed here is saved straight
          onto this brief and stays visible below, round by round, so both
          the client and TFA always see the full history in one place. */}
      <div style={{ marginBottom: 8, fontSize: 12.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8C8880' }}>
        Feedback & goedkeuring
      </div>
      <div style={{ background: '#FFFFFF', border: '1px solid #EEECE3', borderRadius: 14, padding: '20px 22px' }}>
        {!isApproved && (
          <>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Nog iets aanpassen?</div>
            <div style={{ fontSize: 12, color: '#9C9890', marginBottom: 8 }}>
              Typ het hieronder — TFA ziet dit direct, en het blijft hier zichtbaar staan.
            </div>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 10, flexWrap: 'wrap' }}>
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
              <button type="button" className="btn-primary" style={{ padding: '13px 24px' }} disabled={submitting} onClick={approve}>
                Goedkeuren
              </button>
            </div>
          </>
        )}

        {/* Full history, grouped per dated folder (round) — oldest feedback
            and newest feedback both stay visible, split out per round, so
            it's always clear which feedback belongs to which version. */}
        {rounds.length > 0 && (
          <div style={{ marginTop: isApproved ? 0 : 18, paddingTop: isApproved ? 0 : 16, borderTop: isApproved ? 'none' : '1px solid #EEECE3' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#8C8880', textTransform: 'uppercase', marginBottom: 10 }}>Geschiedenis</div>
            {rounds.slice().reverse().map((r) => (
              <div key={r.id} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1D' }}>
                  {formatRoundLabel(r)}
                  <span style={{ fontWeight: 400, color: '#9C9890', marginLeft: 6 }}>gedeeld {formatDateTime(r.createdAt)}</span>
                </div>
                {r.approvedAt && (
                  <div style={{ fontSize: 12, color: '#3A6B32', marginTop: 2 }}>Goedgekeurd op {formatDateTime(r.approvedAt)}</div>
                )}
                {r.feedback && r.feedback.length > 0 ? (
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {r.feedback.map((f) => (
                      <div key={f.id} style={{ fontSize: 13, color: '#5C5850', lineHeight: 1.5 }}>
                        <span style={{ color: '#9C9890', fontSize: 11.5 }}>{formatDateTime(f.createdAt)} — </span>
                        {f.text}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#9C9890', fontStyle: 'italic', marginTop: 2 }}>Geen feedback op deze map.</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

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
