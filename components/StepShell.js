'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import SpotFlowLogo from './SpotFlowLogo';
import { STEPS, computeReached } from './flowData';

function WaveIcon({ dim }) {
  const fill = dim ? '#514E44' : '#E6C858';
  const opacity = dim ? 0.5 : 1;
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" style={{ flex: 'none' }}>
      <rect x="0" y="3" width="1.6" height="4" rx="0.8" fill={fill} opacity={opacity} />
      <rect x="2.8" y="1.5" width="1.6" height="7" rx="0.8" fill={fill} opacity={opacity} />
      <rect x="5.6" y="0" width="1.6" height="10" rx="0.8" fill={fill} opacity={opacity} />
      <rect x="8.4" y="1.5" width="1.6" height="7" rx="0.8" fill={fill} opacity={opacity} />
      <rect x="11.2" y="3" width="1.6" height="4" rx="0.8" fill={fill} opacity={opacity} />
    </svg>
  );
}

// Reassures the client that leaving mid-form is safe (every field already
// autosaves as they type — see useBrief's schedulePatch) and gives them two
// ways back in: copy the current link, or have it emailed to them. Neither
// button changes what's saved — the brief is already persisted to the same
// row the whole time — they're purely a way to hold onto/retrieve the link.
function ResumeCard({ briefId, defaultEmail }) {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState('idle');
  const [email, setEmail] = useState(defaultEmail || '');
  const [emailState, setEmailState] = useState('idle');

  async function copyLink() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch (e) {
      setCopyState('error');
    }
    setTimeout(() => setCopyState('idle'), 2200);
  }

  async function sendLink() {
    const value = email.trim();
    if (!value || !briefId) return;
    setEmailState('sending');
    try {
      const res = await fetch(`/api/briefs/${briefId}/resume-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      });
      setEmailState(res.ok ? 'sent' : 'error');
    } catch (e) {
      setEmailState('error');
    }
    setTimeout(() => setEmailState('idle'), 3000);
  }

  return (
    <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px solid #33301F' }}>
      <div style={{ fontSize: 12, color: '#D8D5CB', lineHeight: 1.5 }}>
        Je voortgang wordt automatisch opgeslagen — je kunt altijd later verdergaan via deze link.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
        <button
          type="button"
          onClick={copyLink}
          style={{ flex: 1, border: '1px solid #514E44', background: 'transparent', color: '#FFFFFF', borderRadius: 7, padding: '7px 8px', fontSize: 11.5, cursor: 'pointer' }}
        >
          {copyState === 'copied' ? '✓ Gekopieerd' : copyState === 'error' ? 'Kon niet kopiëren' : 'Kopieer link'}
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{ flex: 1, border: '1px solid #514E44', background: 'transparent', color: '#FFFFFF', borderRadius: 7, padding: '7px 8px', fontSize: 11.5, cursor: 'pointer' }}
        >
          {open ? 'Sluiten' : 'E-mail mij de link'}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jouw@email.nl"
            style={{ flex: 1, minWidth: 0, border: '1px solid #514E44', background: '#26241A', color: '#FFFFFF', borderRadius: 7, padding: '7px 9px', fontSize: 12 }}
          />
          <button
            type="button"
            onClick={sendLink}
            disabled={emailState === 'sending' || !email.trim()}
            style={{
              flex: 'none', border: 'none', background: '#E6C858', color: '#1D1D1D', borderRadius: 7, padding: '7px 12px',
              fontSize: 11.5, fontWeight: 600, cursor: emailState === 'sending' ? 'wait' : 'pointer', opacity: emailState === 'sending' ? 0.7 : 1,
            }}
          >
            {emailState === 'sent' ? '✓ Verstuurd' : emailState === 'error' ? 'Mislukt' : emailState === 'sending' ? '…' : 'Verstuur'}
          </button>
        </div>
      )}
    </div>
  );
}

// The dark sidebar + big number + fixed-header content panel shared by every
// step of the client brief flow (contact/delivery/details/script/voice/
// music/overview) — ports the sidebar behavior from every original
// public/*.html page (applyReachableSteps) into one place.
//
// Fills the full viewport edge-to-edge, the same way /dashboard's shell does
// (no centered card, no outer gutters) — the sidebar and the white content
// panel both run the full height of the screen, and only the white content
// panel scrolls internally when a step's form is taller than the viewport,
// so the dark sidebar never looks shorter/taller than the content next to
// it and never scrolls out of view itself.
//
// On a narrow (<=900px) screen the sidebar stays down the LEFT EDGE as a
// slim step-number rail instead of stacking full-width above the form —
// see the mobile media query below for why and how.
export default function StepShell({ briefId, current, brief, subtitle, bigNum, kicker, title, hint, backHref, backLabel, children, showWipe = false }) {
  const reached = computeReached(brief);
  const companyName = brief && brief.companyName && brief.companyName.trim() ? brief.companyName : null;

  // Mobile rail: it starts collapsed to a slim strip of step numbers (see
  // the mobile media query below). Tapping it the first time only EXPANDS
  // it to show the full step list with labels — it does not jump straight
  // to whatever step was tapped, since on a strip that narrow a tap is too
  // easy to land on the wrong number by accident. A second tap, now that
  // the full row is visible, navigates normally. Tapping anywhere outside
  // the rail while it's expanded collapses it again.
  const sidebarRef = useRef(null);
  const [isMobileRail, setIsMobileRail] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const update = () => setIsMobileRail(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!railExpanded) return undefined;
    function handleClickOutside(e) {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target)) {
        setRailExpanded(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [railExpanded]);

  // Capture phase, ahead of next/link's own click handler — preventDefault()
  // here is enough to stop it from navigating (it bails out early when the
  // event already arrives with defaultPrevented), so the very first tap on
  // the collapsed rail only expands it instead of also firing the link.
  function handleRailClick(e) {
    if (isMobileRail && !railExpanded) {
      e.preventDefault();
      setRailExpanded(true);
    }
  }

  // The logo is the only way back to the public homepage from anywhere in
  // the flow. On step 1 there's nothing to lose yet, so it just navigates
  // straight there. From step 2 onward the client has real progress on the
  // brief — everything autosaves as they go, so nothing is actually at risk
  // of being lost, but leaving without any warning still reads as "did that
  // just throw away what I entered?" — so this confirms first and offers
  // the same copy-link affordance as the sidebar's resume card, in case
  // they want a way back in later.
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveCopyState, setLeaveCopyState] = useState('idle');

  function handleLogoClick(e) {
    if (current > 1) {
      e.preventDefault();
      setShowLeaveConfirm(true);
    }
  }

  async function copyLeaveLink() {
    try {
      await navigator.clipboard.writeText(typeof window !== 'undefined' ? window.location.href : '');
      setLeaveCopyState('copied');
    } catch (e) {
      setLeaveCopyState('error');
    }
    setTimeout(() => setLeaveCopyState('idle'), 2200);
  }

  return (
    <div style={{ background: '#DEDCD7', display: 'flex' }} className="tfa-shell">
      {/* The gold swipe transition — StepShell mounts exactly once per step
          (unlike Preloader, which mounts twice per transition — see the
          comment in Preloader.js), so this is the right place for it. The
          page underneath is already fully rendered the instant this mounts;
          the panel just covers it for a beat and then slides off, so the
          swipe reads as "the preloader hands off into this page" rather
          than a flash tacked onto the preloader itself.
          Only shown on the two "main transitions" in the flow — landing
          page into the tool (step 1, contact) and the hand-off into the
          script step (step 4) — everywhere else it fired on every single
          navigation between steps, which read as too flashy/repetitive. */}
      {showWipe && <span className="tfa-shell-wipe" aria-hidden="true" />}
      <div
        ref={sidebarRef}
        onClickCapture={handleRailClick}
        style={{
          flex: '0 0 300px', background: '#1D1D1D', color: '#FFFFFF', padding: '36px 26px',
          display: 'flex', flexDirection: 'column',
        }}
        className={`tfa-sidebar${railExpanded ? ' tfa-sidebar--expanded' : ''}`}
      >
        <Link href="/" onClick={handleLogoClick} style={{ textDecoration: 'none' }}>
          <SpotFlowLogo size={26} variant="dark" className="tfa-sidebar-brand" textClassName="tfa-sidebar-brand-label" />
        </Link>
        {/* On step 1 the client hasn't had a chance to fill in the company
            name yet (it's the very field this step asks for), so showing a
            "Nog geen bedrijfsnaam" placeholder here reads as if something's
            missing before they've even started. It only starts appearing
            from step 2 onward, once the name has actually been saved.
            Also hidden on the mobile rail (tfa-sidebar-extra) — see the
            comment on the rail's CSS below for why. */}
        {current !== 1 && (
          <h1
            className="tfa-sidebar-extra"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: 24,
              color: companyName ? '#FFFFFF' : '#8C897E', margin: '16px 0 0', lineHeight: 1.3,
            }}
          >
            {companyName || 'Nog geen bedrijfsnaam'}
          </h1>
        )}
        {subtitle ? <div className="tfa-sidebar-extra" style={{ fontSize: 11.5, color: '#B9B6AC', marginTop: 4 }}>{subtitle}</div> : null}

        <div className="tfa-step-nav" style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {STEPS.map((step) => {
            const isCurrent = step.n === current;
            const isDone = !isCurrent && (step.n < current || !!reached[step.n]);
            // Background/border-left are only set inline for the CURRENT
            // step. For every other row they're left to the "tfa-step-item"
            // CSS class below instead of being inlined as 'transparent' —
            // an inline style always wins over a stylesheet :hover rule for
            // the same property, so inlining 'transparent' here was silently
            // cancelling out the hover highlight on every clickable step.
            const rowStyle = {
              display: 'flex', alignItems: 'center', gap: 10, padding: isCurrent ? '10px 12px' : '9px 10px',
              borderRadius: '0 6px 6px 0', textDecoration: 'none', cursor: isDone ? 'pointer' : 'default',
              ...(isCurrent ? { borderLeft: '2px solid #E6C858', background: 'rgba(230,200,88,.10)' } : null),
            };
            const numColor = isCurrent || isDone ? '#E6C858' : '#77746A';
            const labelStyle = isCurrent
              ? { fontSize: 16.5, color: '#FFFFFF', fontWeight: 600 }
              : { fontSize: 14.5, color: isDone ? '#D8D5CB' : '#8C8880' };
            // On the mobile rail (see CSS below), the wave icon and text
            // label disappear and only this number is left — dressed up as
            // a small circle (filled gold for the current step, gold
            // outline for a completed one you can tap back into, dim
            // outline for one you haven't reached yet) so the rail still
            // reads as a step tracker at a glance, not just a column of
            // numbers.
            const numStateClass = isCurrent ? 'tfa-step-num--current' : isDone ? 'tfa-step-num--done' : 'tfa-step-num--upcoming';
            const inner = (
              <>
                <span className="tfa-step-wave"><WaveIcon dim={!isCurrent && !isDone} /></span>
                <span className={`tfa-step-num ${numStateClass}`} style={{ flex: 'none', color: numColor }}>
                  {String(step.n).padStart(2, '0')}
                </span>
                <span className="tfa-step-label" style={labelStyle}>{step.label}</span>
              </>
            );
            if (isDone && briefId) {
              return (
                <Link key={step.n} href={`/brief/${briefId}/${step.path}`} style={rowStyle} className="tfa-step-item tfa-step-row">
                  {inner}
                </Link>
              );
            }
            return (
              <div key={step.n} style={rowStyle} className="tfa-step-item">
                {inner}
              </div>
            );
          })}
        </div>

        <div className="tfa-sidebar-extra" style={{ display: 'flex', gap: 6, alignItems: 'flex-end', margin: '24px 0' }}>
          {[6, 10, 14, 10, 6].map((h, i) => (
            <span key={i} style={{ display: 'block', width: 3, height: h, borderRadius: 2, background: '#E6C858', opacity: 0.55 }} />
          ))}
        </div>

        {/* Replaces the old "Team TFA" contact card that used to sit here —
            a static blurb with nothing actionable in it. The autosave/resume
            card is more useful in this bottom-of-sidebar spot. Hidden on the
            mobile rail (there's no room, and it's not step-navigation) —
            autosave still runs exactly the same either way, the client just
            can't copy/email the resume link from here on a small screen. */}
        {brief && briefId && (
          <div className="tfa-sidebar-extra" style={{ marginTop: 'auto', paddingTop: 20, borderTop: '1px solid #33301F' }}>
            <ResumeCard briefId={briefId} defaultEmail={brief.contactEmail} />
          </div>
        )}
      </div>

      <div
        style={{
          flex: 1, minWidth: 0, background: '#FFFFFF', padding: '56px 60px',
          position: 'relative',
        }}
        className="tfa-content"
      >
        {bigNum ? (
          <div style={{ position: 'absolute', top: -2, right: 8, fontWeight: 700, fontSize: 130, lineHeight: 1, color: '#1D1D1D', opacity: 0.05, zIndex: 0, pointerEvents: 'none' }}>
            {bigNum}
          </div>
        ) : null}
        <div style={{ position: 'relative', zIndex: 1 }}>
          {backHref ? (
            <div style={{ marginBottom: 18 }}>
              <Link href={backHref} style={{ fontSize: 12, color: '#8C8880', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                ← {backLabel || 'Terug'}
              </Link>
            </div>
          ) : null}
          {kicker ? (
            <div style={{ fontSize: 13, letterSpacing: '.09em', textTransform: 'uppercase', color: '#383209', fontWeight: 500 }}>{kicker}</div>
          ) : null}
          {title ? (
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: 36, margin: '8px 0 6px', color: '#1D1D1D' }}>
              {title}
            </h2>
          ) : null}
          {hint ? <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#5C5850', margin: '0 0 26px' }}>{hint}</p> : null}
          {children}
        </div>
      </div>

      {showLeaveConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowLeaveConfirm(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(29,29,29,.55)', zIndex: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#FFFFFF', borderRadius: 16, padding: '26px 26px 24px', maxWidth: 360, width: '100%', boxShadow: '0 20px 60px rgba(29,29,29,.3)', position: 'relative' }}
          >
            <button
              type="button"
              onClick={() => setShowLeaveConfirm(false)}
              aria-label="Sluiten"
              style={{ position: 'absolute', top: 14, right: 14, border: 'none', background: 'transparent', color: '#8C8880', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: 4 }}
            >
              ×
            </button>
            <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: 19, margin: '0 26px 10px 0', color: '#1D1D1D' }}>
              Terug naar de homepage?
            </h3>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: '#5C5850', margin: '0 0 22px' }}>
              Je voortgang is al automatisch opgeslagen. Kopieer de link om later verder te gaan, of ga direct terug naar de homepage.
            </p>
            {/* Both actions share one button style — same size, padding and
                weight — instead of borrowing the app-wide .btn-primary
                (16.5px) and .ghost-btn (13.5px) classes, which read as two
                mismatched button sizes stacked in the same small dialog. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                onClick={copyLeaveLink}
                style={{
                  border: 'none', borderRadius: 10, background: '#E6C858', color: '#1D1D1D',
                  fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 600, fontSize: 13.5,
                  padding: '12px 14px', cursor: 'pointer', width: '100%',
                }}
              >
                {leaveCopyState === 'copied' ? '✓ Link gekopieerd' : leaveCopyState === 'error' ? 'Kon niet kopiëren' : 'Kopieer link om later verder te gaan'}
              </button>
              <Link
                href="/"
                style={{
                  border: '1px solid #C9C5B9', borderRadius: 10, background: 'transparent', color: '#5C5850',
                  fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 600, fontSize: 13.5,
                  padding: '12px 14px', cursor: 'pointer', width: '100%', textAlign: 'center',
                  textDecoration: 'none', display: 'block', boxSizing: 'border-box',
                }}
              >
                Ga toch naar de homepage
              </Link>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        /* Base height/overflow live here — NOT inline — specifically so the
           mobile rules below can actually override them. An inline height/
           overflow on these same three elements used to silently defeat
           this exact media query (inline always beats a plain stylesheet
           rule for the same property), which is what caused the
           inconsistent "can't scroll" behavior on phones: .tfa-content kept
           trying to be its own fixed-height, independently-scrolling panel
           inside a hard 100dvh shell no matter what the media query said.
           100dvh (dynamic viewport height) is used ahead of 100vh so the
           shell doesn't mis-size itself when a mobile browser's address bar
           shows/hides mid-scroll — browsers that don't understand dvh yet
           just ignore that line and keep the vh value above it. */
        .tfa-shell {
          height: 100vh;
          height: 100dvh;
          overflow: hidden;
        }
        .tfa-sidebar {
          height: 100%;
          overflow-y: auto;
        }
        .tfa-content {
          height: 100%;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        .tfa-shell-wipe {
          position: fixed;
          inset: 0;
          background: #E6C858;
          z-index: 9999;
          pointer-events: none;
          animation: tfa-shell-wipe-out .5s cubic-bezier(.76, 0, .24, 1) both;
        }
        @keyframes tfa-shell-wipe-out {
          0% { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
        /* Mobile: the sidebar stays a LEFT-EDGE RAIL rather than stacking
           full-width on top of the form (which used to shove every step's
           form below a tall block of nav — the client's actual complaint).
           It shrinks to a slim strip of just the step numbers — brand
           label, company name, subtitle, decorative bars and the resume
           card all step aside (tfa-sidebar-extra) since there's no room and
           none of it is step-navigation — so the rail stays "visible but
           out of the way" while every step (including the current one) is
           still one tap away. The numbers themselves are plain colored
           text, no circle/frame around them — just a brighter, bolder gold
           for the current step and a dim grey for ones not reached yet. */
        @media (max-width: 900px) {
          .tfa-sidebar {
            flex: 0 0 56px !important;
            padding: 18px 4px !important;
            align-items: center;
          }
          .tfa-sidebar-brand-label,
          .tfa-sidebar-extra {
            display: none;
          }
          .tfa-step-nav {
            width: 100%;
            margin-top: 20px !important;
            gap: 14px !important;
          }
          .tfa-step-item {
            justify-content: center;
            padding: 2px 0 !important;
            border-radius: 8px !important;
            border-left: none !important;
          }
          .tfa-step-wave,
          .tfa-step-label {
            display: none;
          }
          .tfa-step-num {
            width: auto;
            font-size: 15px !important;
            font-weight: 600;
          }
          .tfa-step-num--current {
            color: #E6C858 !important;
            font-weight: 700;
          }
          .tfa-step-num--done {
            color: #E6C858 !important;
            opacity: 0.6;
          }
          .tfa-step-num--upcoming {
            color: #6B6860 !important;
          }
          .tfa-content {
            padding: 28px 20px !important;
          }
          /* First tap on the collapsed rail expands it into this overlay
             instead of navigating — fixed positioning means it flies out
             over the form rather than pushing/reflowing it. A second tap,
             now that labels are visible, navigates normally. */
          .tfa-sidebar--expanded {
            position: fixed !important;
            left: 0;
            top: 0;
            bottom: 0;
            flex: 0 0 220px !important;
            width: 220px;
            align-items: flex-start !important;
            padding: 24px 18px !important;
            z-index: 60;
            box-shadow: 8px 0 28px rgba(0, 0, 0, 0.3);
          }
          .tfa-sidebar--expanded .tfa-step-nav {
            gap: 2px !important;
          }
          .tfa-sidebar--expanded .tfa-step-item {
            justify-content: flex-start;
            padding: 9px 10px !important;
          }
          .tfa-sidebar--expanded .tfa-step-wave,
          .tfa-sidebar--expanded .tfa-step-label {
            display: inline-flex !important;
          }
          .tfa-sidebar--expanded .tfa-step-num {
            font-size: 12px !important;
            font-weight: 500;
          }
        }
        .tfa-step-item {
          background: transparent;
          border-left: 2px solid transparent;
        }
        /* Base size/weight for the step number live here — not inline —
           so the mobile rules above (bigger, bolder, no inline value left
           to fight) can actually apply. See the file-level note on inline
           styles silently beating stylesheet rules. */
        .tfa-step-num {
          font-size: 12px;
          width: 16px;
          font-weight: 500;
        }
        .tfa-step-row {
          transition: background .15s ease, color .15s ease;
        }
        /* Same soft gold used to mark the CURRENT step (rgba(230,200,88,.10)
           on rowStyle above) — reusing that exact tint on hover, rather than
           a plain white tint, is what makes it read as "you can click this
           step" instead of just a generic hover state. Only .tfa-step-row
           gets this class, and it's only applied to steps that actually
           render as a <Link> (isDone && briefId) — an upcoming step you
           can't jump to renders as a plain div with no hover at all. */
        .tfa-step-row:hover {
          background: rgba(230, 200, 88, .16);
        }
      `}</style>
    </div>
  );
}
