'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import StepShell from '../../../../components/StepShell';
import Preloader from '../../../../components/Preloader';
import useMinDelay from '../../../../components/useMinDelay';
import { TONE_LABELS, estimateSeconds, wordCountOf, variationsCountOf } from '../../../../components/flowData';

const DEFAULT_DISCLAIMER = 'Nog geen verplichte tekst ontvangen, deze verschijnt hier zodra ingevuld in de brief.';
// Mirrors lib/db.js's MAX_SCRIPT_HISTORY — how many script generations a
// client can request per brief before "Opnieuw genereren" is disabled.
const MAX_VERSIONS = 3;

function briefHasEnoughContent(b) {
  return !!(b && (b.product || b.usp || b.mainMessage));
}

function parseHistory(brief) {
  try {
    const parsed = brief && brief.scriptHistory ? JSON.parse(brief.scriptHistory) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// Step 4 — mirrors public/script.html: generation, live "estimated
// seconds" bar, hand-edit, approve. Once approved (and if the client asked
// for variation(s) back on the delivery step), approving navigates on to
// the dedicated variations subpage instead of revealing anything further
// down this same page — see app/brief/[id]/script/variations/page.js and
// StepShell's showVariationsSubnav for the matching sidebar entry.
export default function ScriptPage({ params }) {
  const { id } = params;
  const router = useRouter();
  // See the identical comment in contact/page.js. Only applies to the
  // "no variations needed" path below — when variations ARE needed, the
  // client still has to go through the variations subpage first (its own
  // "Doorgaan naar de stem" step honors the same flag for the same reason).
  const returnToOverview = useSearchParams().get('from') === 'overview';
  const [brief, setBrief] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null); // { message, debugId } | null
  const [selectingVersionId, setSelectingVersionId] = useState(null);
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const showLoader = useMinDelay(!firstLoadDone, 700);
  // Set the instant a "continue" action is clicked, before its save call
  // resolves — see the identical comment in contact/page.js.
  const [navigating, setNavigating] = useState(false);
  const [scriptText, setScriptText] = useState('');
  // Same "✓ Opgeslagen" confirmation the variations subpage also uses for
  // its own textareas — this used to save silently on every debounced edit
  // with no visible feedback at all, which is exactly why a client could
  // type a change, move to the next step, and have no way to tell whether
  // it had actually been kept.
  const [scriptSavedFlash, setScriptSavedFlash] = useState(false);
  const scriptSavedFlashTimer = useRef(null);
  const scriptFocused = useRef(false);
  const saveTimer = useRef(null);
  // Set the instant an edit is made, cleared only once the debounced PATCH
  // for it actually resolves. Blur clears *Focused immediately, but the
  // save itself is still debounced 350ms behind it — without this, a poll
  // landing in that window would overwrite the textarea with the
  // not-yet-saved server value, which looks exactly like the client's edit
  // was silently discarded.
  const scriptSavePending = useRef(false);

  const fetchBrief = useCallback(async () => {
    try {
      const res = await fetch(`/api/briefs/${id}`);
      if (!res.ok) return null;
      const data = await res.json();
      setBrief(data);
      return data;
    } catch (e) {
      return null;
    }
  }, [id]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch(`/api/briefs/${id}/generate-script`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setBrief(data);
      } else {
        // The AI provider is configured but the call failed — show this
        // explicitly instead of silently downgrading to a template script.
        // The brief (and any previously generated script/history) is left
        // untouched server-side, so nothing is lost here either.
        setGenError({
          message: data.message || 'De scriptservice is momenteel niet beschikbaar. Probeer het straks opnieuw.',
          debugId: data.debugId || null,
        });
      }
    } catch (e) {
      setGenError({ message: 'Kon geen verbinding maken met de scriptservice. Controleer je internetverbinding en probeer het opnieuw.', debugId: null });
    }
    setGenerating(false);
  }, [id]);

  const selectVersion = useCallback(async (versionId) => {
    setSelectingVersionId(versionId);
    try {
      const res = await fetch(`/api/briefs/${id}/select-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      });
      if (res.ok) setBrief(await res.json());
    } catch (e) {}
    setSelectingVersionId(null);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const b = await fetchBrief();
      if (cancelled) return;
      if (b && !b.generatedScript && briefHasEnoughContent(b)) {
        await generate();
      }
      setFirstLoadDone(true);
    })();
    const interval = setInterval(async () => {
      if (scriptFocused.current) return;
      await fetchBrief();
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Sync local text from brief, but never clobber what's focused or has an
  // unsaved edit in flight.
  useEffect(() => {
    if (!brief) return;
    const generatedText = brief.generatedScript || '';
    const text = brief.editedScript !== null && brief.editedScript !== undefined ? brief.editedScript : generatedText;
    if (!scriptFocused.current && !scriptSavePending.current) setScriptText(text);
  }, [brief]);

  function scheduleScriptSave(value) {
    scriptSavePending.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch(`/api/briefs/${id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editedScript: value }),
      })
        .then((res) => {
          if (!res.ok) return;
          setScriptSavedFlash(true);
          clearTimeout(scriptSavedFlashTimer.current);
          scriptSavedFlashTimer.current = setTimeout(() => setScriptSavedFlash(false), 2000);
        })
        .catch(() => {})
        .finally(() => {
          scriptSavePending.current = false;
        });
    }, 350);
  }

  function onScriptChange(e) {
    setScriptSavedFlash(false);
    setScriptText(e.target.value);
    scheduleScriptSave(e.target.value);
  }
  function resetScript() {
    setScriptText(brief ? brief.generatedScript || '' : '');
    fetch(`/api/briefs/${id}/edit`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editedScript: null }),
    }).catch(() => {});
    setBrief((b) => (b ? { ...b, editedScript: null } : b));
  }

  async function approveAndContinue() {
    if (!brief || !brief.generatedScript) return;
    // Approving now always navigates somewhere — either on to the voice
    // step, or on to the dedicated variations subpage
    // (app/brief/[id]/script/variations) — instead of the old behavior of
    // silently revealing a variations section further down this same page,
    // which read as the page just "growing" with no real transition. See
    // StepShell's showVariationsSubnav for the matching sidebar entry.
    setNavigating(true);
    clearTimeout(saveTimer.current);
    try {
      await fetch(`/api/briefs/${id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editedScript: scriptText }),
      });
    } catch (e) {}

    if (brief.needsVariations) {
      try {
        await fetch(`/api/briefs/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scriptApproved: true }),
        });
      } catch (e) {}
      router.push(`/brief/${id}/script/variations${returnToOverview ? '?from=overview' : ''}`);
      return;
    }

    router.push(returnToOverview ? `/brief/${id}/overview` : `/brief/${id}/voice`);
  }

  if (showLoader || navigating) return <Preloader />;

  if (!brief) {
    return (
      <StepShell briefId={id} current={4} brief={null} bigNum="04" kicker="Klaar voor je review" title="Jouw script" backHref={`/brief/${id}/details`} backLabel="Terug naar de brief" showWipe>
        <div style={{ background: '#FBF3F1', border: '1px solid #C2513F', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, color: '#C2513F' }}>
          Geen brief gevonden bij deze link.
        </div>
      </StepShell>
    );
  }

  const spotLength = brief.hoofdspotLength || '20';
  const target = parseInt(spotLength, 10) || 20;
  const hasVariation = !!brief.needsVariations;
  const variationCount = variationsCountOf(brief);
  const scriptApproved = !!brief.scriptApproved;
  const disclaimerText = brief.disclaimerText && brief.disclaimerText.trim() ? brief.disclaimerText : DEFAULT_DISCLAIMER;
  const hasRealDisclaimer = !!(brief.disclaimerText && brief.disclaimerText.trim());

  let tones = [];
  try {
    const parsed = brief.toneOfVoice ? JSON.parse(brief.toneOfVoice) : [];
    tones = Array.isArray(parsed) ? parsed.filter((t) => TONE_LABELS[t]) : [];
  } catch (e) {}

  const hasGenerated = !!brief.generatedScript;
  const canGenerate = briefHasEnoughContent(brief);
  const generatedText = brief.generatedScript || '';

  const history = parseHistory(brief);
  const canRegenerate = history.length < MAX_VERSIONS;
  // Which stored version is currently "active" (what generatedScript points
  // at) — matched by generation timestamp, which is unique per entry.
  const activeVersionId = (history.find((h) => h.createdAt === brief.scriptGeneratedAt) || {}).id || null;

  const trimmed = (scriptText || '').trim();
  const words = wordCountOf(trimmed);
  const seconds = estimateSeconds(words);
  let statusLabel = 'Past goed binnen ' + target + ' seconden.';
  let barColor = '#1D1D1D';
  if (seconds > target * 1.2) { statusLabel = 'Te lang, graag inkorten.'; barColor = '#C2513F'; }
  else if (seconds > target * 1.05) { statusLabel = 'Net iets te lang, bekort het wat.'; barColor = '#383209'; }
  const barPct = Math.min((seconds / target) * 100, 140) + '%';
  const unchanged = trimmed === generatedText.trim();

  let approveLabel;
  if (!hasVariation) approveLabel = returnToOverview ? 'Wijzigingen opslaan: terug naar overzicht' : (unchanged ? 'Goedkeuren, dit is prima zo' : 'Wijzigingen opslaan en goedkeuren');
  else if (!scriptApproved) approveLabel = unchanged ? 'Goedkeuren en verder naar de variatie' + (variationCount > 1 ? 's' : '') : 'Wijzigingen opslaan en verder naar de variatie' + (variationCount > 1 ? 's' : '');
  else approveLabel = unchanged ? 'Goedgekeurd ✓: bekijk je variatie' + (variationCount > 1 ? 's' : '') : 'Wijzigingen opslaan';

  return (
    <StepShell
      briefId={id}
      current={4}
      brief={brief}
      subtitle={'Hoofdspot · ' + spotLength + '″'}
      bigNum="04"
      showWipe
      kicker="Klaar voor je review"
      title="Jouw script"
      hint="Zo vertelt TFA jouw verhaal in je hoofdspot, volledig geschreven op basis van je brief."
      backHref={`/brief/${id}/details`}
      backLabel="Terug naar de brief"
    >
      {tones.length > 0 && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#8C6D1F', background: 'rgba(230,200,88,.18)', borderRadius: 20, padding: '5px 12px', margin: '0 0 4px' }}>
          Toon uit je brief: {tones.map((t) => TONE_LABELS[t]).join(' & ')}
        </div>
      )}

      {genError && (
        <div style={{ margin: '16px 0 4px', background: '#FBF3F1', border: '1px solid #C2513F', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 12.5, color: '#C2513F', fontWeight: 600 }}>Scriptservice niet beschikbaar</div>
          <div style={{ fontSize: 12.5, color: '#8A3A2E', marginTop: 4, lineHeight: 1.5 }}>{genError.message}</div>
          {genError.debugId && (
            <div style={{ fontSize: 11, color: '#B06156', marginTop: 6, fontFamily: 'monospace' }}>Foutcode: {genError.debugId}</div>
          )}
          <button type="button" onClick={generate} style={{ marginTop: 8, border: 'none', background: 'transparent', color: '#C2513F', fontWeight: 600, fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
            Probeer opnieuw
          </button>
        </div>
      )}

      {generating && (
        <div style={{ margin: '16px 0 4px', display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: '#5C5850' }}>
          <span
            style={{
              width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(56,50,9,.2)', borderTopColor: '#383209',
              display: 'inline-block', animation: 'tfa-script-spin .7s linear infinite', flex: 'none',
            }}
          />
          TFA&apos;s AI schrijft een scriptvoorstel op basis van je brief, dit kan een paar seconden duren…
        </div>
      )}

      {!generating && hasGenerated && (
        <div style={{ margin: '16px 0 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-block', fontSize: 10.5, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase',
                padding: '3px 9px', borderRadius: 999,
                background: brief.scriptSource === 'ai' ? '#E6C858' : '#EAE7DE',
                color: brief.scriptSource === 'ai' ? '#1D1D1D' : '#5C5850',
              }}
            >
              {brief.scriptSource === 'ai' ? 'Gegenereerd met AI' : 'Automatisch samengesteld (sjabloon)'}
            </span>
            {canRegenerate ? (
              <button type="button" onClick={generate} style={{ border: 'none', background: 'transparent', color: '#383209', fontWeight: 600, fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
                Opnieuw genereren ({history.length}/{MAX_VERSIONS})
              </button>
            ) : (
              <span style={{ fontSize: 11.5, color: '#8C8880' }}>Maximaal aantal versies bereikt ({MAX_VERSIONS}/{MAX_VERSIONS})</span>
            )}
          </div>

          {history.length > 1 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11.5, color: '#8C8880', marginBottom: 6 }}>Bekijk je eerdere versies en kies je favoriet:</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {history.map((h, i) => {
                  const isActive = h.id === activeVersionId;
                  const isBusy = selectingVersionId === h.id;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      disabled={isActive || isBusy}
                      onClick={() => selectVersion(h.id)}
                      title={h.main}
                      style={{
                        border: '1.5px solid ' + (isActive ? '#E6C858' : '#C9C5B9'),
                        background: isActive ? '#FBF0C8' : '#FFFFFF',
                        borderRadius: 999, padding: '6px 13px', fontSize: 12, fontWeight: isActive ? 700 : 500,
                        color: '#1D1D1D', cursor: isActive ? 'default' : 'pointer', opacity: isBusy ? 0.6 : 1,
                      }}
                    >
                      {isBusy ? 'Bezig…' : `Versie ${i + 1}${isActive ? ' ✓' : ''}`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {!generating && !hasGenerated && !genError && (
        <div style={{ margin: '16px 0 4px', fontSize: 12.5, color: '#8C8880' }}>
          Nog geen scriptvoorstel. Vul eerst product/dienst, USP of je kernboodschap in op de brief.
          <button type="button" disabled={!canGenerate} onClick={generate} style={{ display: 'block', marginTop: 8, border: 'none', background: 'transparent', color: '#383209', fontWeight: 600, fontSize: 12.5, textDecoration: 'underline', cursor: canGenerate ? 'pointer' : 'not-allowed', padding: 0 }}>
            Genereer scriptvoorstel
          </button>
        </div>
      )}

      {hasGenerated && (
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8C6D1F', marginTop: 18 }}>
          Dit is jouw script
        </div>
      )}
      <div className="box" style={{ marginTop: 8, background: '#FBF9EC', border: '1px solid #EAE3C4', borderRadius: 14, padding: '22px 24px' }}>
        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontSize: 16, lineHeight: 1.6, color: generatedText ? '#1D1D1D' : '#9C9890' }}>
          {generatedText || 'Hier verschijnt het scriptvoorstel van TFA, zodra je genoeg velden in je brief hebt ingevuld.'}
        </div>
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed #E6C858' }}>
          <div style={{ fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: '#383209', fontWeight: 500 }}>
            Verplichte tekst uit je brief: TFA neemt dit altijd op
          </div>
          <div style={{ fontSize: 12.5, color: hasRealDisclaimer ? '#1D1D1D' : '#9C9890', marginTop: 4, lineHeight: 1.5 }}>&ldquo;{disclaimerText}&rdquo;</div>
        </div>
      </div>

      <div style={{ marginTop: 30, paddingTop: 22, borderTop: '2px solid #EAE7DE' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8C8880' }}>
          Script aanpassen
        </div>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '6px 0 4px' }}>Wil je iets aanpassen?</h3>
        <p style={{ fontSize: 12.5, color: '#5C5850', margin: '0 0 10px', lineHeight: 1.5 }}>
          Dit vak hieronder is van jou: typ er zelf in om woorden toe te voegen, te wijzigen of te verwijderen, precies
          zoals je zelf een tekstbericht zou aanpassen. Alles wat je typt wordt automatisch bewaard, je hoeft dus nergens
          apart op &ldquo;opslaan&rdquo; te klikken. Let er wel op dat het script in {spotLength} seconden moet blijven passen.
        </p>
        <textarea
          style={{ minHeight: 130 }}
          value={scriptText}
          onFocus={() => { scriptFocused.current = true; }}
          onBlur={() => { scriptFocused.current = false; }}
          onChange={onScriptChange}
        />
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: scriptSavedFlash ? '#1D7A46' : '#9C9890' }}>
          {scriptSavedFlash ? (
            <>✓ Opgeslagen</>
          ) : (
            <>Wordt automatisch opgeslagen terwijl je typt</>
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#5C5850' }}>
            <span>Geschatte lengte</span>
            <span style={{ fontWeight: 500, color: barColor }}>{seconds.toFixed(1)}s van {target}″</span>
          </div>
          <div style={{ marginTop: 6, height: 8, borderRadius: 4, background: '#EAE7DE', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 4, width: barPct, background: barColor }} />
          </div>
          <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 500, color: barColor }}>{statusLabel}</div>
        </div>
      </div>

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #EAE7DE', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {!unchanged && (
          <button
            type="button"
            className="ghost-btn"
            onClick={resetScript}
            style={{ width: 'auto', flex: 'none', border: '1.5px solid #B06156', color: '#B06156' }}
          >
            ↺ Terugzetten naar scriptvoorstel
          </button>
        )}
        <button type="button" className="btn-primary" disabled={!hasGenerated} onClick={approveAndContinue}>{approveLabel}</button>
      </div>

      {hasVariation && scriptApproved && (
        <div style={{ marginTop: 30, padding: '16px 18px', background: '#FBF9EC', border: '1px solid #EAE3C4', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, color: '#5C5850' }}>
            Script goedgekeurd. Je variatie{variationCount > 1 ? 's staan' : ' staat'} klaar om aan te passen.
          </div>
          <a
            href={`/brief/${id}/script/variations`}
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', whiteSpace: 'nowrap', padding: '11px 20px', flex: 'none' }}
          >
            Bekijk variatie{variationCount > 1 ? 's' : ''} →
          </a>
        </div>
      )}

      <p style={{ marginTop: 20, fontSize: 11.5, color: '#8C8880', lineHeight: 1.5 }}>
        Je krijgt na deze stap nog één moment om het script bij te stellen, voordat de opname start.
      </p>

      <style>{`
        @keyframes tfa-script-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </StepShell>
  );
}
