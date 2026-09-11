'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import StepShell from '../../../../components/StepShell';
import Preloader from '../../../../components/Preloader';
import useMinDelay from '../../../../components/useMinDelay';
import { TONE_LABELS, estimateSeconds, wordCountOf, variationsCountOf } from '../../../../components/flowData';
import { diffWords, DiffPreview } from '../../../../components/textDiff';

const DEFAULT_DISCLAIMER = 'Nog geen verplichte tekst ontvangen — deze verschijnt hier zodra ingevuld in de brief.';
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

function parseVariationScripts(brief) {
  try {
    const parsed = brief && brief.variationScripts ? JSON.parse(brief.variationScripts) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// Step 4 — mirrors public/script.html: generation, live "estimated
// seconds" bar, hand-edit, approve, and (once approved + variation(s)
// wanted) one variation panel per requested variation.
export default function ScriptPage({ params }) {
  const { id } = params;
  const router = useRouter();
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
  // One entry per requested variation (length driven by variationsCount).
  const [variations, setVariations] = useState([]);
  // Which variation is currently shown — with more than one, they're
  // reviewed one at a time (same page, no navigation) instead of all
  // stacked underneath each other, which got unwieldy past two.
  const [activeVarIdx, setActiveVarIdx] = useState(0);
  // Per-variation "just saved" confirmation — the approve button used to
  // give no feedback at all (it just fires a PATCH), which reads as "this
  // button does nothing". Flips true right after a successful save, then
  // clears itself after a moment.
  const [savedFlash, setSavedFlash] = useState({});
  const savedFlashTimers = useRef({});
  const scriptFocused = useRef(false);
  const saveTimer = useRef(null);
  // Set the instant an edit is made, cleared only once the debounced PATCH
  // for it actually resolves. Blur clears *Focused immediately, but the
  // save itself is still debounced 350ms behind it — without this, a poll
  // landing in that window would overwrite the textarea with the
  // not-yet-saved server value, which looks exactly like the client's edit
  // was silently discarded.
  const scriptSavePending = useRef(false);
  // Per-variation focus (keyed by index) — which variation textarea(s) are
  // currently being typed in, so the sync effect below never clobbers one
  // mid-edit.
  const varFocusedMap = useRef({});
  const variationsSaveTimer = useRef(null);
  const variationsSavePending = useRef(false);
  // The main script text the variations were last synced against — lets the
  // sync effect tell "this variation was never customized, so it should
  // keep mirroring the main script" apart from "this variation was
  // hand-edited, leave it alone". Without this, fixing a typo in the main
  // script after approval silently stopped applying to any variation that
  // was still an untouched copy of it.
  const prevMainRef = useRef('');

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
      const anyVarFocused = Object.values(varFocusedMap.current).some(Boolean);
      if (scriptFocused.current || anyVarFocused) return;
      await fetchBrief();
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Sync local text fields from brief, but never clobber what's focused or
  // has an unsaved edit in flight.
  useEffect(() => {
    if (!brief) return;
    const generatedText = brief.generatedScript || '';
    const text = brief.editedScript !== null && brief.editedScript !== undefined ? brief.editedScript : generatedText;
    if (!scriptFocused.current && !scriptSavePending.current) setScriptText(text);

    const count = variationsCountOf(brief);
    const stored = parseVariationScripts(brief);
    const prevMain = prevMainRef.current;
    if (!variationsSavePending.current) {
      setVariations((current) => {
        const next = [];
        for (let idx = 0; idx < count; idx++) {
          if (varFocusedMap.current[idx]) {
            next.push(current[idx] !== undefined ? current[idx] : (stored[idx] !== undefined ? stored[idx] : text));
            continue;
          }
          const storedVal = stored[idx];
          if (storedVal === undefined) {
            // Brand-new variation slot (count just went up, or nothing saved
            // yet) — start it as a copy of the main script.
            next.push(text);
          } else if (storedVal === prevMain) {
            // Never hand-edited relative to the main script — keep it
            // mirroring the main script's own edits.
            next.push(text);
          } else {
            // Customized by the client — leave it alone.
            next.push(storedVal);
          }
        }
        return next;
      });
    }
    prevMainRef.current = text;
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
        .catch(() => {})
        .finally(() => {
          scriptSavePending.current = false;
        });
    }, 350);
  }

  function scheduleVariationsSave(arr) {
    variationsSavePending.current = true;
    clearTimeout(variationsSaveTimer.current);
    variationsSaveTimer.current = setTimeout(() => {
      fetch(`/api/briefs/${id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variationScripts: JSON.stringify(arr) }),
      })
        .catch(() => {})
        .finally(() => {
          variationsSavePending.current = false;
        });
    }, 350);
  }

  function onScriptChange(e) {
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

  function onVarChange(idx, value) {
    setSavedFlash((f) => (f[idx] ? { ...f, [idx]: false } : f));
    setVariations((current) => {
      const next = current.slice();
      next[idx] = value;
      scheduleVariationsSave(next);
      return next;
    });
  }
  function resetVar(idx) {
    setVariations((current) => {
      const next = current.slice();
      next[idx] = scriptText;
      fetch(`/api/briefs/${id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variationScripts: JSON.stringify(next) }),
      }).catch(() => {});
      return next;
    });
  }
  async function varApprove(idx) {
    clearTimeout(variationsSaveTimer.current);
    try {
      await fetch(`/api/briefs/${id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variationScripts: JSON.stringify(variations) }),
      });
    } catch (e) {}
    setSavedFlash((f) => ({ ...f, [idx]: true }));
    clearTimeout(savedFlashTimers.current[idx]);
    savedFlashTimers.current[idx] = setTimeout(() => {
      setSavedFlash((f) => ({ ...f, [idx]: false }));
    }, 2000);
  }

  async function approveAndContinue() {
    if (!brief || !brief.generatedScript) return;
    // Only the "no variation needed" path actually navigates away (the
    // variation path just reveals the variation panel(s) further down this
    // same page) — so only that path shows the preloader.
    if (!brief.needsVariations) setNavigating(true);
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
        const res = await fetch(`/api/briefs/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scriptApproved: true }),
        });
        if (res.ok) setBrief(await res.json());
      } catch (e) {}
      return;
    }

    router.push(`/brief/${id}/voice`);
  }

  async function continueToVoice() {
    setNavigating(true);
    clearTimeout(variationsSaveTimer.current);
    try {
      await fetch(`/api/briefs/${id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variationScripts: JSON.stringify(variations) }),
      });
    } catch (e) {}
    router.push(`/brief/${id}/voice`);
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
  const extraNote = brief.extraNote || '';

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
  if (seconds > target * 1.2) { statusLabel = 'Te lang — graag inkorten.'; barColor = '#C2513F'; }
  else if (seconds > target * 1.05) { statusLabel = 'Net iets te lang — bekort het wat.'; barColor = '#383209'; }
  const barPct = Math.min((seconds / target) * 100, 140) + '%';
  const unchanged = trimmed === generatedText.trim();

  let approveLabel;
  if (!hasVariation) approveLabel = unchanged ? 'Goedkeuren, dit is prima zo' : 'Wijzigingen opslaan en goedkeuren';
  else if (!scriptApproved) approveLabel = unchanged ? 'Goedkeuren en verder naar de variatie' + (variationCount > 1 ? 's' : '') : 'Wijzigingen opslaan en verder naar de variatie' + (variationCount > 1 ? 's' : '');
  else approveLabel = unchanged ? 'Goedgekeurd ✓ — wijzigingen opslaan' : 'Wijzigingen opslaan';

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
      hint="Zo vertelt TFA jouw verhaal in je hoofdspot — volledig geschreven op basis van je brief."
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
          TFA&apos;s AI schrijft een scriptvoorstel op basis van je brief — dit kan een paar seconden duren…
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

      <div className="box" style={{ marginTop: 14, background: '#FBF9EC', border: '1px solid #EAE3C4', borderRadius: 14, padding: '22px 24px' }}>
        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontSize: 16, lineHeight: 1.6, color: generatedText ? '#1D1D1D' : '#9C9890' }}>
          {generatedText || 'Hier verschijnt het scriptvoorstel van TFA, zodra je genoeg velden in je brief hebt ingevuld.'}
        </div>
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed #E6C858' }}>
          <div style={{ fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: '#383209', fontWeight: 500 }}>
            Verplichte tekst uit je brief — TFA neemt dit altijd op
          </div>
          <div style={{ fontSize: 12.5, color: hasRealDisclaimer ? '#1D1D1D' : '#9C9890', marginTop: 4, lineHeight: 1.5 }}>&ldquo;{disclaimerText}&rdquo;</div>
        </div>
      </div>

      <div style={{ marginTop: 26 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Wil je iets aanpassen?</h3>
        <p style={{ fontSize: 12.5, color: '#5C5850', margin: '0 0 10px', lineHeight: 1.5 }}>
          TFA schreef dit script op basis van jouw brief — pas het hieronder aan waar je wilt. Het moet in {spotLength} seconden passen.
        </p>
        <textarea
          style={{ minHeight: 130 }}
          value={scriptText}
          onFocus={() => { scriptFocused.current = true; }}
          onBlur={() => { scriptFocused.current = false; }}
          onChange={onScriptChange}
        />
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

      {extraNote.trim() && (
        <div style={{ marginTop: 18, display: 'flex', gap: 10, background: '#FBF9EC', border: '1px solid #EAE3C4', borderRadius: 12, padding: '12px 14px' }}>
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8C8880', fontWeight: 500 }}>Opmerking uit je brief</div>
            <div style={{ fontSize: 12.5, color: '#5C5850', marginTop: 4, lineHeight: 1.5 }}>{extraNote}</div>
          </div>
        </div>
      )}

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
        <div style={{ marginTop: 34, paddingTop: 26, borderTop: '1px solid #EAE3C4' }}>
          <div style={{ fontSize: 13, letterSpacing: '.09em', textTransform: 'uppercase', color: '#383209', fontWeight: 500 }}>Script goedgekeurd</div>
          <h3 style={{ fontWeight: 600, fontSize: 18, margin: '8px 0 4px' }}>{variationCount > 1 ? 'Jouw variaties' : 'Jouw variatie'}</h3>
          <p style={{ fontSize: 12.5, color: '#5C5850', margin: '0 0 14px', lineHeight: 1.5 }}>
            Je gaf bij levering aan {variationCount > 1 ? `${variationCount} variaties` : 'ook een variatie'} nodig te hebben. Hieronder staat je zojuist
            goedgekeurde script {variationCount > 1 ? `${variationCount}x` : 'nogmaals'} — pas {variationCount > 1 ? 'ze' : 'm'} handmatig aan op de punten
            waar {variationCount > 1 ? 'elke variatie' : 'deze variatie'} moet verschillen.
          </p>

          {variationCount > 1 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
              {Array.from({ length: variationCount }).map((_, i) => {
                const vt = variations[i] !== undefined ? variations[i] : scriptText;
                const customized = (vt || '').trim() !== scriptText.trim();
                const isActive = i === activeVarIdx;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveVarIdx(i)}
                    style={{
                      border: '1.5px solid ' + (isActive ? '#E6C858' : '#C9C5B9'),
                      background: isActive ? '#FBF0C8' : '#FFFFFF',
                      borderRadius: 999, padding: '6px 13px', fontSize: 12, fontWeight: isActive ? 700 : 500,
                      color: '#1D1D1D', cursor: 'pointer',
                    }}
                  >
                    Variatie {i + 1}{customized ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>
          )}

          {(() => {
            const idx = activeVarIdx;
            const varText = variations[idx] !== undefined ? variations[idx] : scriptText;
            const varTrimmed = (varText || '').trim();
            const varWords = wordCountOf(varTrimmed);
            const varSeconds = estimateSeconds(varWords);
            let varStatusLabel = 'Past goed binnen ' + target + ' seconden.';
            let varBarColor = '#1D1D1D';
            if (varSeconds > target * 1.2) { varStatusLabel = 'Te lang — graag inkorten.'; varBarColor = '#C2513F'; }
            else if (varSeconds > target * 1.05) { varStatusLabel = 'Net iets te lang — bekort het wat.'; varBarColor = '#383209'; }
            const varBarPct = Math.min((varSeconds / target) * 100, 140) + '%';
            const varUnchanged = varTrimmed === scriptText.trim();
            const tokens = diffWords(scriptText, varText);

            return (
              <div>
                <textarea
                  style={{ minHeight: 90 }}
                  value={varText}
                  onFocus={() => { varFocusedMap.current[idx] = true; }}
                  onBlur={() => { varFocusedMap.current[idx] = false; }}
                  onChange={(e) => onVarChange(idx, e.target.value)}
                />
                <div style={{ marginTop: 14 }}>
                  <label className="field-label">Wat is er veranderd?</label>
                  {varUnchanged ? (
                    <div className="hint">
                      Nog geen wijzigingen — pas de tekst hierboven aan op het punt waar deze variatie moet verschillen van je hoofdscript.
                    </div>
                  ) : (
                    <div style={{ background: '#FBF9EC', border: '1px solid #EAE3C4', borderRadius: 10, padding: '12px 14px', fontSize: 13.5, lineHeight: 1.65, color: '#1D1D1D' }}>
                      <DiffPreview tokens={tokens} />
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#5C5850' }}>
                    <span>Geschatte lengte</span>
                    <span style={{ fontWeight: 500, color: varBarColor }}>{varSeconds.toFixed(1)}s van {target}″</span>
                  </div>
                  <div style={{ marginTop: 6, height: 8, borderRadius: 4, background: '#EAE7DE', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 4, width: varBarPct, background: varBarColor }} />
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 500, color: varBarColor }}>{varStatusLabel}</div>
                </div>
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #EAE7DE', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {savedFlash[idx] && (
                    <span style={{ fontSize: 12.5, color: '#1D7A46', fontWeight: 600 }}>✓ Opgeslagen</span>
                  )}
                  {!varUnchanged && (
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => resetVar(idx)}
                      style={{ width: 'auto', flex: 'none', border: '1.5px solid #B06156', color: '#B06156' }}
                    >
                      ↺ Terugzetten naar origineel
                    </button>
                  )}
                  <button type="button" className="btn-primary" onClick={() => varApprove(idx)}>{varUnchanged ? 'Goedkeuren, dit is prima zo' : 'Wijzigingen opslaan en goedkeuren'}</button>
                </div>
              </div>
            );
          })()}

          <div style={{ marginTop: 20, paddingTop: 22, borderTop: '1px solid #EAE7DE', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {activeVarIdx > 0 && (
              <button type="button" className="ghost-btn" style={{ width: 'auto', flex: 'none' }} onClick={() => setActiveVarIdx(activeVarIdx - 1)}>
                ← Vorige variatie
              </button>
            )}
            {activeVarIdx < variationCount - 1 ? (
              <button type="button" className="btn-primary" onClick={() => setActiveVarIdx(activeVarIdx + 1)}>Volgende variatie →</button>
            ) : (
              <button type="button" className="btn-primary" style={{ minWidth: 320, flex: 'none', whiteSpace: 'nowrap', padding: '14px 26px' }} onClick={continueToVoice}>Doorgaan naar de stem</button>
            )}
          </div>
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
