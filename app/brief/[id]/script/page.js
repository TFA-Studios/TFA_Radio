'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import StepShell from '../../../../components/StepShell';
import Preloader from '../../../../components/Preloader';
import useMinDelay from '../../../../components/useMinDelay';
import LengthMeter from '../../../../components/LengthMeter';
import { lengthLevel, blocksEdit } from '../../../../lib/lengthLevel';
import { TONE_LABELS, estimateSeconds, wordCountOf, variationsCountOf, briefStageOf } from '../../../../components/flowData';

const DEFAULT_DISCLAIMER = 'Nog geen verplichte tekst ontvangen, deze verschijnt hier zodra ingevuld in de brief.';
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
  const [selectingVersionId, setSelectingVersionId] = useState(null);
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const showLoader = useMinDelay(!firstLoadDone, 700);
  // Set the instant a "continue" action is clicked, before its save call
  // resolves — see the identical comment in contact/page.js.
  const [navigating, setNavigating] = useState(false);
  const [scriptText, setScriptText] = useState('');
  // The quiet "none of these fit" route (see the small link under the proposals).
  const [noFitOpen, setNoFitOpen] = useState(false);
  const [noFitText, setNoFitText] = useState('');
  const [noFitBusy, setNoFitBusy] = useState(false);
  // The text as last saved on the server — drives the explicit "Wijziging opslaan" button.
  const [savedValue, setSavedValue] = useState('');
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
      // The script step only opens once TFA's copywriters have released the
      // scripts. Anything earlier goes to the status page.
      if (b) {
        const stage = briefStageOf(b);
        if (stage === 'writing') { router.replace(`/brief/${id}/review`); return; }
        if (stage === 'filling') { router.replace(`/brief/${id}/details`); return; }
      }
      setFirstLoadDone(true);
    })();
    const interval = setInterval(async () => {
      if (scriptFocused.current || scriptSavePending.current) return;
      await fetchBrief();
    }, 4000);
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
    if (!scriptFocused.current && !scriptSavePending.current) { setScriptText(text); setSavedValue(text); }
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
          setSavedValue(value);
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

  // Explicit "save my edit" — same save as the automatic one, just immediate,
  // so it is obvious the edit has been kept. It does not approve anything.
  async function saveEditNow() {
    clearTimeout(saveTimer.current);
    scriptSavePending.current = true;
    try {
      const res = await fetch(`/api/briefs/${id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editedScript: scriptText }),
      });
      if (res.ok) {
        setSavedValue(scriptText);
        setScriptSavedFlash(true);
        clearTimeout(scriptSavedFlashTimer.current);
        scriptSavedFlashTimer.current = setTimeout(() => setScriptSavedFlash(false), 2500);
      }
    } catch (e) {}
    scriptSavePending.current = false;
  }

  function onScriptChange(e) {
    // Too long: removing or swapping words is fine, adding more is not.
    const nextText = e.target.value;
    const nextWords = wordCountOf(nextText.trim());
    if (blocksEdit(wordCountOf((scriptText || '').trim()), nextWords, estimateSeconds(nextWords), target)) return;
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

  async function sendNoFit() {
    if (noFitBusy) return;
    setNoFitBusy(true);
    try {
      const res = await fetch(`/api/briefs/${id}/no-fit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: noFitText }),
      });
      if (res.ok) setBrief(await res.json());
    } catch (e) {}
    setNoFitBusy(false);
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
        // syncVariations: the server carries this edit into the variations
        // too, so they build on the script the client actually chose.
        body: JSON.stringify({ editedScript: scriptText, syncVariations: true }),
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
      <StepShell briefId={id} current={4} brief={null} bigNum="04" kicker="Voorstellen van onze copywriter" title="Jouw script" backHref={`/brief/${id}/review`} backLabel="Terug naar de status" showWipe>
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
  const generatedText = brief.generatedScript || '';

  const history = parseHistory(brief);
  const finalized = !!brief.finalizedAt;
  // Which stored version is currently "active" (what generatedScript points
  // at) — matched by generation timestamp, which is unique per entry.
  const activeVersionId = (history.find((h) => h.createdAt === brief.scriptGeneratedAt) || {}).id || null;

  const trimmed = (scriptText || '').trim();
  const words = wordCountOf(trimmed);
  const seconds = estimateSeconds(words);
  const tooLong = lengthLevel(seconds, target) === 'long';
  const unchanged = trimmed === generatedText.trim();

  // The big button only ever means "approve and go on" (it also keeps any
  // pending edit). Saving an edit has its own small button under the text box.
  const dirty = trimmed !== (savedValue || '').trim();
  let approveLabel;
  if (!hasVariation) approveLabel = returnToOverview ? 'Terug naar overzicht' : 'Goedkeuren en verder naar de stem';
  else if (!scriptApproved) approveLabel = 'Goedkeuren en verder naar de variatie' + (variationCount > 1 ? 's' : '');
  else approveLabel = 'Verder naar de variatie' + (variationCount > 1 ? 's' : '') + ' →';

  return (
    <StepShell
      briefId={id}
      current={4}
      brief={brief}
      subtitle={'Hoofdspot · ' + spotLength + '″'}
      bigNum="04"
      showWipe
      kicker="Voorstellen van onze copywriter"
      title="Jouw script"
      hint="Onze copywriter schreef scriptvoorstellen op basis van je brief. Kies er een en pas het zo nodig aan."
      backHref={`/brief/${id}/review`}
      backLabel="Terug naar de status"
    >
      {tones.length > 0 && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#8C6D1F', background: 'rgba(230,200,88,.18)', borderRadius: 20, padding: '5px 12px', margin: '0 0 4px' }}>
          Toon uit je brief: {tones.map((t) => TONE_LABELS[t]).join(' & ')}
        </div>
      )}

      {hasGenerated && history.length > 0 && (
        <div style={{ margin: '18px 0 4px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8C6D1F' }}>
            {history.length > 1 ? 'Onze scriptvoorstellen voor jou' : 'Ons scriptvoorstel voor jou'}
          </div>
          <p style={{ fontSize: 12.5, color: '#5C5850', margin: '6px 0 12px', lineHeight: 1.5 }}>
            {history.length > 1 ? 'Kies het voorstel dat het best bij je past. Daarna kun je het hieronder nog aanpassen.' : 'Je kunt het script hieronder nog aanpassen.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {history.map((h, i) => {
              const isActive = h.id === activeVersionId;
              const isBusy = selectingVersionId === h.id;
              return (
                <div
                  key={h.id}
                  style={{
                    border: '1.5px solid ' + (isActive ? '#E6C858' : '#E3DFD2'),
                    background: isActive ? '#FBF9EC' : '#FFFFFF',
                    borderRadius: 14, padding: '16px 18px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: isActive ? '#8C6D1F' : '#8C8880' }}>
                        Voorstel {i + 1}{isActive && history.length > 1 ? ' · gekozen ✓' : ''}
                      </div>
                      {h.recommended && history.length > 1 && (
                        <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.04em', color: '#8C6D1F', border: '1px solid #E6D9A3', borderRadius: 999, padding: '2px 8px', background: '#FFFDF3' }}>
                          Onze aanbeveling
                        </span>
                      )}
                    </div>
                    {history.length > 1 && !isActive && !finalized && (
                      <button
                        type="button"
                        className="ghost-btn"
                        disabled={isBusy}
                        onClick={() => selectVersion(h.id)}
                        style={{ width: 'auto', flex: 'none', padding: '6px 14px', fontSize: 12 }}
                      >
                        {isBusy ? 'Bezig…' : 'Kies dit voorstel'}
                      </button>
                    )}
                  </div>
                  {/* The script is the most important text in the whole flow: plain
                      body font (like the rest of the form) but set apart with a
                      tinted block and a gold edge so it stands out. */}
                  <div style={{ fontSize: 15.5, lineHeight: 1.65, fontWeight: 500, color: '#1D1D1D', background: isActive ? '#FFF8D9' : '#FBF9EC', borderLeft: '3px solid #E6C858', borderRadius: 8, padding: '12px 14px' }}>
                    {h.main}
                  </div>
                  {h.recommended && h.reason && history.length > 1 && (
                    <div style={{ marginTop: 9, fontSize: 12.5, lineHeight: 1.5, color: '#5C5850' }}>
                      <span style={{ fontWeight: 600, color: '#8C6D1F' }}>Waarom wij hiervoor kiezen: </span>{h.reason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {hasGenerated && history.length > 0 && !finalized && (
        <div style={{ margin: '10px 0 0' }}>
          {brief.scriptAuditStatus === 'nofit' ? (
            <div style={{ background: '#F6F4EC', border: '1px solid #E3DFD2', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: '#5C5850', lineHeight: 1.5 }}>
              Bedankt voor je terugkoppeling. We hebben doorgekregen dat deze voorstellen nog niet passen en nemen contact met je op.
            </div>
          ) : !noFitOpen ? (
            <button
              type="button"
              onClick={() => setNoFitOpen(true)}
              style={{ background: 'none', border: 'none', padding: 0, fontSize: 11.5, color: '#9C9890', textDecoration: 'underline', cursor: 'pointer' }}
            >
              Past geen van deze voorstellen bij je?
            </button>
          ) : (
            <div style={{ background: '#F6F4EC', border: '1px solid #E3DFD2', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 12.5, color: '#5C5850', marginBottom: 8, lineHeight: 1.5 }}>
                Geen probleem. Vertel kort wat je mist of wat anders moet, dan komen we hierop terug.
              </div>
              <textarea
                style={{ minHeight: 70 }}
                maxLength={800}
                value={noFitText}
                placeholder="Bijv. de toon is te zakelijk, of het aanbod komt te weinig terug"
                onChange={(e) => setNoFitText(e.target.value)}
              />
              <div style={{ marginTop: 8, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="ghost-btn" onClick={() => setNoFitOpen(false)} style={{ width: 'auto', flex: 'none', padding: '6px 14px', fontSize: 12 }}>Annuleren</button>
                <button type="button" className="ghost-btn" disabled={noFitBusy} onClick={sendNoFit} style={{ width: 'auto', flex: 'none', padding: '6px 14px', fontSize: 12 }}>{noFitBusy ? 'Bezig…' : 'Verstuur'}</button>
              </div>
            </div>
          )}
        </div>
      )}
      {!hasGenerated && (
        <div style={{ margin: '16px 0 4px', fontSize: 12.5, color: '#8C8880' }}>
          De scriptvoorstellen zijn nog niet beschikbaar.
        </div>
      )}

      <div className="box" style={{ marginTop: 8, background: '#FBF9EC', border: '1px solid #EAE3C4', borderRadius: 14, padding: '16px 24px' }}>
        <div>
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
          zoals je zelf een tekstbericht zou aanpassen. Alles wat je typt wordt automatisch bewaard; met &ldquo;Aanpassing
          opslaan&rdquo; onder het vak zie je meteen dat het is vastgelegd. Goedkeuren doe je pas met de grote knop onderaan. Let er wel op dat het script in {spotLength} seconden moet blijven passen.
          {hasVariation && ' Je variaties bouwen voort op dit hoofdscript: een aanpassing aan tekst die in alle versies hetzelfde is, nemen wij automatisch mee in je ' + (variationCount > 1 ? 'variaties' : 'variatie') + '. Je hoeft dat dus niet per variatie opnieuw te doen.'}
        </p>
        <textarea
          style={{ minHeight: 140, fontSize: 15.5, lineHeight: 1.65, fontWeight: 500, background: '#FFFDF3', borderLeft: '3px solid #E6C858' }}
          value={scriptText}
          onFocus={() => { scriptFocused.current = true; }}
          onBlur={() => { scriptFocused.current = false; }}
          onChange={onScriptChange}
        />
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: scriptSavedFlash || !dirty ? '#1D7A46' : '#9C9890' }}>
            {scriptSavedFlash ? '✓ Je aanpassing is opgeslagen' : dirty ? 'Wordt automatisch opgeslagen terwijl je typt' : '✓ Alles is opgeslagen'}
          </div>
          <button
            type="button"
            className="ghost-btn"
            disabled={!dirty}
            onClick={saveEditNow}
            style={{ width: 'auto', flex: 'none', padding: '6px 14px', fontSize: 12.5, opacity: dirty ? 1 : 0.5 }}
          >
            Aanpassing opslaan
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          <LengthMeter seconds={seconds} target={target} />
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
            ↺ Terugzetten naar het voorstel
          </button>
        )}
        <button type="button" className="btn-primary" disabled={!hasGenerated || tooLong} title={tooLong ? 'Het script is te lang: haal eerst woorden weg' : undefined} onClick={approveAndContinue}>{approveLabel}</button>
      </div>

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
