'use client';

import { useEffect, useState } from 'react';
import Preloader from '../../../../components/Preloader';
import useMinDelay from '../../../../components/useMinDelay';
import SpotFlowLogo from '../../../../components/SpotFlowLogo';
import { useBrief } from '../../../../components/useBrief';
import { parseReviewRounds, currentReviewRound, formatRoundLabel, formatDateTime, revisionDisclaimerText, agencyNameOf } from '../../../../components/flowData';
import StudioPhotoLoop from '../../../../components/StudioPhotoLoop';

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
  // Optional note that can ride along with an approval (a thank-you, a
  // last remark) — separate from feedbackText, which is the "I want a
  // change" field below. Kept intentionally small/optional so it never
  // reads as a second required field.
  const [approveNote, setApproveNote] = useState('');
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
  // First name only, pulled from the same contactPerson field the brief and
  // dashboard already show — turns the page from a flat company-name label
  // into an actual greeting ("Hallo Marc —") without asking the client for
  // anything new.
  const firstName = brief.contactPerson && brief.contactPerson.trim() ? brief.contactPerson.trim().split(/\s+/)[0] : '';
  // Whoever is assigned in the dashboard's Team tab (lib/db.js's
  // assignedTo) — shown as a small "someone real is on this" touch rather
  // than the page reading as fully automated. Left out entirely when
  // nobody's assigned yet, so it never implies work is happening when it
  // might not be.
  const assignedTo = brief.assignedTo && brief.assignedTo.trim() ? brief.assignedTo.trim() : '';
  const rounds = parseReviewRounds(brief);
  const round = currentReviewRound(brief);

  if (!round) {
    return (
      <Shell companyName={companyName} firstName={firstName} agencyName={agencyNameOf(brief)}>
        <InProductionCard brief={brief} assignedTo={assignedTo} />
      </Shell>
    );
  }

  const isApproved = !!round.approvedAt;
  // Every round except the current one — see the comment above the
  // "Geschiedenis" section for why the current round is excluded here.
  const pastRounds = rounds.filter((r) => r.id !== round.id).slice().reverse();

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
      setError('Kon je feedback niet versturen, probeer het nog eens.');
    } finally {
      setSubmitting(false);
    }
  }

  async function approve() {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      // The optional thank-you/note rides along as an ordinary feedback
      // entry (same history, same visibility to TFA) sent just before the
      // approval itself — reuses the existing feedback plumbing rather than
      // needing a separate field on the brief, and still ends up attached
      // to the same round in the history below.
      const note = approveNote.trim();
      if (note) {
        await fetch('/api/briefs/' + id + '/review-feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: note }),
        }).catch(() => {});
      }
      const res = await fetch('/api/briefs/' + id + '/review-approve', { method: 'POST' });
      if (!res.ok) throw new Error('failed');
      setApproveNote('');
      setJustSent('approved');
      await reload();
    } catch (e) {
      setError('Kon je goedkeuring niet versturen, probeer het nog eens.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell companyName={companyName} firstName={firstName} agencyName={agencyNameOf(brief)}>
      {/* One centered "hero" moment instead of a left-aligned status card
          followed by a whole separate box restating the same thing (the old
          layout said "Goedgekeurd" in the title, then a full green banner
          below saying "Je hebt deze versie goedgekeurd..." again). Now the
          icon, title, timestamp and Frame.io button are one unit, big and
          centered — a real focal point on the page instead of competing
          with everything below it — and the approval message lives in the
          hero's own subtitle rather than getting a second box of its own. */}
      <div
        style={{
          background: isApproved ? '#F0F7EE' : '#FBF9EC',
          border: '1.5px solid ' + (isApproved ? '#A9CF9E' : '#E6C858'),
          borderRadius: 20, padding: '38px 30px 32px', marginBottom: 22, textAlign: 'center',
          boxShadow: isApproved ? '0 10px 32px rgba(58,107,50,.14)' : '0 10px 32px rgba(230,200,88,.18)',
        }}
      >
        <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isApproved && (
            <span className="tfa-pulse-ring" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid #6FA85E' }} />
          )}
          <span
            style={{
              width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, background: isApproved ? '#3A6B32' : '#E6C858', color: isApproved ? '#FFFFFF' : '#1D1D1D',
            }}
          >
            {isApproved ? '✓' : '🎧'}
          </span>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: isApproved ? '#3A6B32' : '#8C6D1F' }}>
          {rounds.length > 1 ? formatRoundLabel(round) : 'Jouw productie'}
        </div>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: 28, margin: '10px 0 8px', color: '#1D1D1D' }}>
          {isApproved ? 'Goedgekeurd, bedankt!' : 'Klaar om te bekijken'}
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: isApproved ? '#3A6B32' : '#5C5850', margin: '0 auto 20px', maxWidth: 420 }}>
          {isApproved
            ? `Je hebt deze versie goedgekeurd op ${formatDateTime(round.approvedAt)}. TFA is op de hoogte en rondt de levering af.`
            : assignedTo
              ? `🎧 ${assignedTo} heeft deze versie voor je klaargezet.`
              : 'Er staat een nieuwe versie voor je klaar om te beluisteren.'}
        </p>
        <a
          href={brief.frameioLink}
          target="_blank"
          rel="noreferrer"
          className="btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', whiteSpace: 'nowrap', padding: '15px 28px', fontSize: 14.5 }}
        >
          Bekijk op Frame.io
        </a>
        <div style={{ marginTop: 12, fontSize: 12, color: isApproved ? '#5C8C52' : '#8C6D1F' }}>
          Gedeeld op {formatDateTime(round.createdAt)}
          {rounds.length > 1 ? ' (zelfde link als voorheen, open de ' + formatRoundLabel(round).replace(/^Map/, 'map') + ' binnenin)' : ''}
        </div>
        {/* A producer-written note attached to this specific round (typed in
            the dashboard when the link was shared) — e.g. "we hebben de
            intro ingekort". Shown as its own clearly-styled block rather
            than folded into the "Gedeeld op..." caption above, since that's
            easy to skim past and this is meant to actually be read. */}
        {round.note && round.note.trim() && (
          <div
            style={{
              marginTop: 16, textAlign: 'left', background: 'rgba(255,255,255,.6)', border: '1px solid ' + (isApproved ? '#A9CF9E' : '#E6C858'),
              borderRadius: 10, padding: '12px 14px', fontSize: 13, lineHeight: 1.55, color: '#1D1D1D',
            }}
          >
            <span style={{ fontWeight: 700 }}>📝 Notitie van TFA: </span>
            {round.note.trim()}
          </div>
        )}
        {/* The single question every client asks right after approving:
            "wat nu?". Answered here directly instead of leaving it implicit
            — TFA hands the approved audio off to whichever agency this
            brief is attributed to (agencyNameOf falls back to "Advision
            Media" — see components/flowData.js) from this point, and it's
            worth saying so plainly rather than the client having to email
            and ask. */}
        {isApproved && (
          <div
            style={{
              marginTop: 16, textAlign: 'left', background: '#FFFFFF', border: '1.5px solid #A9CF9E',
              borderRadius: 10, padding: '14px 16px', fontSize: 13, lineHeight: 1.6, color: '#1D1D1D',
            }}
          >
            <span style={{ fontWeight: 700 }}>Wat gebeurt er nu? </span>
            TFA draagt deze goedgekeurde audio nu over aan {agencyNameOf(brief)}, zij nemen het vanaf hier over. Neem gerust rechtstreeks contact met hen op voor de verdere afhandeling.
          </div>
        )}
      </div>

      {/* Two clearly separate actions, not one shared row — this used to be
          a single card with a paragraph field and "Feedback versturen" /
          "Goedkeuren" sitting right next to each other, which read as one
          choice between two buttons rather than two different actions (a
          client could type a thank-you and hit the wrong one, or not
          realize approving was final). Now: approving is its own big,
          centered, brand-gold action on top — the thing most clients will
          actually do — and asking for a change is a visually separate,
          plainer card below it, with its own heading and its own button. */}
      {!isApproved && (
        <div
          style={{
            background: '#FBF0C8', border: '2px solid #E6C858', borderRadius: 16,
            padding: '28px 24px', textAlign: 'center', marginBottom: 18,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: '#8C6D1F', marginBottom: 12 }}>
            Helemaal tevreden?
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ padding: '16px 40px', fontSize: 15.5, fontWeight: 700 }}
            disabled={submitting}
            onClick={approve}
          >
            ✓ Goedkeuren
          </button>
          <div style={{ marginTop: 16, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
            <input
              type="text"
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              placeholder="Optioneel: een bedankje of laatste opmerking"
              style={{
                width: '100%', boxSizing: 'border-box', border: '1px solid #E3D9A8', borderRadius: 8, padding: '9px 12px',
                fontSize: 13, fontFamily: 'inherit', color: '#1D1D1D', background: '#FFFFFF', textAlign: 'center',
              }}
            />
          </div>
        </div>
      )}

      {/* This is the ONE place feedback happens — no Frame.io comment, no
          separate e-mail thread. Everything typed here is saved straight
          onto this brief and stays visible below, round by round, so both
          the client and TFA always see the full history in one place. The
          heading above the card is only shown pre-approval — once approved,
          the card's own internal "Geschiedenis" heading (below) already
          covers it, so this would otherwise just duplicate that label. */}
      {!isApproved && (
        <div style={{ marginBottom: 8, fontSize: 12.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8C8880' }}>
          Nog iets aanpassen?
        </div>
      )}
      <div style={{ background: '#FFFFFF', border: '1px solid #EEECE3', borderRadius: 14, padding: '20px 22px' }}>
        {!isApproved && (
          <>
            <div style={{ fontSize: 12, color: '#9C9890', marginBottom: 8 }}>
              Wil je liever eerst nog iets laten aanpassen? Typ het hieronder: TFA ziet dit direct en het blijft hier zichtbaar staan. Dit is een aparte stap van goedkeuren hierboven.
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
          </>
        )}

        {/* Full history, grouped per dated folder (round) — oldest feedback
            and newest feedback both stay visible, split out per round, so
            it's always clear which feedback belongs to which version. The
            CURRENT round is deliberately excluded here — it's already
            shown in full at the top of the page (the hero card above has
            its date, its approval timestamp, and its Frame.io link), so
            repeating the exact same "Map van X, gedeeld HH:MM, Goedgekeurd
            op HH:MM" a second time down here was pure duplication, not new
            information. This section is now genuinely just what came
            before, and disappears entirely once there's nothing left to
            show (a brand-new brief with only one round shows no empty
            "Geschiedenis" heading over nothing). It's also dropped
            entirely once the client has approved — all the back-and-forth
            of earlier revision rounds is production history that's no
            longer relevant to the client once the job is done, and this
            keeps the approved state clean rather than scrolling into old
            feedback. The full history stays intact in the dashboard's own
            Productie & review tab for the producer's own reference. */}
        {!isApproved && pastRounds.length > 0 && (
          <div style={{ marginTop: isApproved ? 0 : 18, paddingTop: isApproved ? 0 : 16, borderTop: isApproved ? 'none' : '1px solid #EEECE3' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#8C8880', textTransform: 'uppercase', marginBottom: 10 }}>Eerdere versies</div>
            {pastRounds.map((r) => (
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
                      <div key={f.id} style={{ fontSize: 13, color: '#5C5850', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        <span style={{ color: '#9C9890', fontSize: 11.5 }}>{formatDateTime(f.createdAt)}: </span>
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

      <style jsx>{`
        @keyframes tfa-pulse-ring {
          0% { transform: scale(1); opacity: .7; }
          100% { transform: scale(1.7); opacity: 0; }
        }
        .tfa-pulse-ring { animation: tfa-pulse-ring 1.8s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .tfa-pulse-ring { animation: none; }
        }
      `}</style>
    </Shell>
  );
}

// Replaces the old flat "er staat nog niets klaar" box — same honest
// message (nothing to preview yet, no false progress %), but dressed up so
// it reads as "TFA is actively on this" rather than "nothing has
// happened". The waveform is a pure CSS loop (no real progress tracking
// behind it — we genuinely don't know if a producer is mid-recording or
// mid-mix), so it's deliberately generic "studio at work" motion rather
// than a progress bar that would imply a percentage we don't have.
// Small rotating line of studio process/craft trivia — purely a warmth/
// texture touch while the client waits, never a stand-in for real progress
// info (see the comment above this function). Generic enough to apply to
// any brief, so it needs no per-client data. Skips rotating (shows one
// fixed line) under prefers-reduced-motion.
const STUDIO_TIPS = [
  'Elk script wordt hardop ingelezen voordat het de studio ingaat, zo klinkt het nooit als opgelezen tekst.',
  'Stem en muziek worden pas op elkaar afgestemd zodra allebei er zijn, nooit andersom.',
  'Zelfs 20 seconden radio doorloopt bij ons script, opname, montage én mix.',
  'We luisteren elk eindresultaat minstens twee keer terug voordat het naar jou toe gaat.',
  'Timing is alles: een goede commercial wordt vaker geknipt dan je zou denken.',
];

function InProductionCard({ brief, assignedTo }) {
  const spotLength = brief.hoofdspotLength || '20';
  const [tipIdx, setTipIdx] = useState(0);
  useEffect(() => {
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;
    // Slowed down from 5000ms — the tips were rotating faster than a client
    // could comfortably read them, per Karim's feedback.
    const interval = setInterval(() => {
      setTipIdx((i) => (i + 1) % STUDIO_TIPS.length);
    }, 9000);
    return () => clearInterval(interval);
  }, []);
  const stages = [
    { label: 'In productie', detail: assignedTo ? assignedTo + ' is bezig met de opname en montage van jouw commercial.' : 'Opname en montage van jouw commercial zijn bezig.', state: 'active' },
    { label: 'Review & goedkeuring', detail: 'Je ontvangt een e-mail zodra er een versie klaarstaat om te beluisteren.', state: 'upcoming' },
    { label: 'Levering', detail: 'Na jouw goedkeuring rondt TFA de levering af.', state: 'upcoming' },
  ];

  return (
    <div>
      {/* Centered hero, matching the "klaar om te bekijken" / "goedgekeurd"
          states below (see the main ReviewPage return) so all three states
          of this page — busy, in review, approved — read as one consistent
          design instead of this one being a different, left-aligned layout. */}
      <div
        style={{
          background: '#FBF9EC', border: '1.5px solid #E6C858', borderRadius: 20, padding: '38px 30px 32px',
          boxShadow: '0 10px 32px rgba(230,200,88,.18)', marginBottom: 22, textAlign: 'center',
        }}
      >
        <div className="tfa-waveform" aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 5, height: 40, marginBottom: 18 }}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span
              key={i}
              style={{
                display: 'block', width: 6, borderRadius: 3, background: '#E6C858',
                animation: 'tfa-wave 1.1s ease-in-out infinite',
                animationDelay: (i * -0.13).toFixed(2) + 's',
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8C6D1F' }}>
          TFA is aan het werk
        </div>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: 28, margin: '10px 0 10px', color: '#1D1D1D' }}>
          Je {spotLength}″ commercial wordt opgenomen
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: '#5C5850', margin: '0 auto', maxWidth: 460 }}>
          Er is nog niets te bekijken en dat is helemaal normaal op dit moment. Zodra de eerste versie klaarstaat, ontvang
          je automatisch een e-mail met een link om deze te beluisteren, feedback te geven of goed te keuren. Deze pagina
          werkt dan meteen mee: je hoeft deze niet te verversen of ergens anders naar te zoeken.
        </p>
        <div
          key={tipIdx}
          className="tfa-tip-fade"
          style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed #E6C858', fontSize: 12.5, color: '#8C6D1F', lineHeight: 1.5, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}
        >
          ✦ {STUDIO_TIPS[tipIdx]}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {stages.map((s, i) => {
          const active = s.state === 'active';
          return (
            <div
              key={s.label}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 14, background: '#FFFFFF',
                border: '1px solid ' + (active ? '#E6C858' : '#EEECE3'), borderRadius: 12, padding: '14px 16px',
              }}
            >
              <div style={{ flex: 'none', width: 22, height: 22, marginTop: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {active ? (
                  <>
                    <span className="tfa-pulse-ring" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid #E6C858' }} />
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E6C858' }} />
                  </>
                ) : (
                  <span style={{ width: 9, height: 9, borderRadius: '50%', border: '1.5px solid #C9C5B9' }} />
                )}
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: active ? '#1D1D1D' : '#9C9890' }}>{s.label}</div>
                <div style={{ fontSize: 12.5, color: active ? '#5C5850' : '#B4B0A5', marginTop: 2, lineHeight: 1.5 }}>{s.detail}</div>
              </div>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        @keyframes tfa-wave {
          0%, 100% { height: 8px; opacity: .55; }
          50% { height: 32px; opacity: 1; }
        }
        @keyframes tfa-pulse-ring {
          0% { transform: scale(1); opacity: .7; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .tfa-pulse-ring { animation: tfa-pulse-ring 1.8s ease-out infinite; }
        @keyframes tfa-tip-fade {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .tfa-tip-fade { animation: tfa-tip-fade .5s ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .tfa-waveform span, .tfa-pulse-ring, .tfa-tip-fade { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

// The page's outer chrome — used by every state (waiting, ready to review,
// approved). Used to be a flat gray page with just a small "TFA SpotFlow"
// text label and the bare company name — no branding, no warmth, and no
// acknowledgment that a real person is on the other end. Now carries the
// real logo lockup (same one used across the rest of the app), a warm
// cream/gold gradient instead of flat gray (matching the cards' own
// palette), and — when the brief has a contact name — an actual greeting
// instead of just the company name sitting alone.
function Shell({ companyName, firstName, children, agencyName }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #F6F0DC 0%, #E9E4D3 42%, #DEDCD7 100%)',
        fontFamily: "'Geist', system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 20px' }}>
        <div style={{ marginBottom: 22 }}>
          <SpotFlowLogo size={26} variant="light" />
        </div>
        {companyName && (
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1D1D1D', marginBottom: 22, lineHeight: 1.4 }}>
            {firstName ? `Hallo ${firstName}, h` : 'H'}ier is de status van je {companyName}-commercial
          </div>
        )}
        {/* Small personal touch, shown on every state of this page — a
            quiet reminder that a real studio in Amsterdam is working on
            this, not just a status tracker. Same component/photos as the
            landing page hero, just smaller and without pulling focus from
            the actual status content below it. */}
        <StudioPhotoLoop height={140} borderRadius={14} caption={null} />
        <div style={{ height: 22 }} />
        {children}
        {/* Shown unconditionally, on every state of this page (busy, in
            review, approved) — not just once in the Voorwaarden the client
            agreed to before submitting — so the included-rounds expectation
            is visible wherever the client actually checks status, per the
            explicit request that this be clear "everywhere", not buried in
            terms shown only pre-submit. */}
        <div style={{ marginTop: 22, fontSize: 11.5, lineHeight: 1.6, color: '#8C8880', textAlign: 'center' }}>
          {revisionDisclaimerText({ agencyName })}
        </div>
      </div>
    </div>
  );
}
