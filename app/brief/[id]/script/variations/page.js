'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import StepShell from '../../../../../components/StepShell';
import Preloader from '../../../../../components/Preloader';
import useMinDelay from '../../../../../components/useMinDelay';
import { estimateSeconds, wordCountOf, variationsCountOf, parseVariationScripts } from '../../../../../components/flowData';
import { diffWords, DiffPreview } from '../../../../../components/textDiff';

// Dedicated subpage for reviewing/customizing each requested variation of
// the (already-approved) hoofdspot script — split out of script/page.js per
// Karim's feedback: variations used to be tab-buttons revealed further down
// the SAME script page once approved, which read as misleading ("tabs" that
// weren't really separate pages) and left no way to come back and adjust a
// variation later except by re-approving the script. Now it's a real
// subpage, reachable any time via the sidebar (see StepShell's
// showVariationsSubnav) or the button on the script step itself.
export default function ScriptVariationsPage({ params }) {
  const { id } = params;
  const router = useRouter();
  // See the identical comment in contact/page.js.
  const returnToOverview = useSearchParams().get('from') === 'overview';
  const [brief, setBrief] = useState(null);
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const showLoader = useMinDelay(!firstLoadDone, 700);
  const [navigating, setNavigating] = useState(false);
  const [variations, setVariations] = useState([]);
  const [activeVarIdx, setActiveVarIdx] = useState(0);
  const [savedFlash, setSavedFlash] = useState({});
  const savedFlashTimers = useRef({});
  const varFocusedMap = useRef({});
  const variationsSaveTimer = useRef(null);
  const variationsSavePending = useRef(false);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchBrief();
      if (!cancelled) setFirstLoadDone(true);
    })();
    const interval = setInterval(async () => {
      const anyVarFocused = Object.values(varFocusedMap.current).some(Boolean);
      if (anyVarFocused) return;
      await fetchBrief();
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchBrief]);

  useEffect(() => {
    if (!brief) return;
    const generatedText = brief.generatedScript || '';
    const text = brief.editedScript !== null && brief.editedScript !== undefined ? brief.editedScript : generatedText;
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
            next.push(text);
          } else if (storedVal === prevMain) {
            next.push(text);
          } else {
            next.push(storedVal);
          }
        }
        return next;
      });
    }
    prevMainRef.current = text;
  }, [brief]);

  function scheduleVariationsSave(arr, savedIdx) {
    variationsSavePending.current = true;
    clearTimeout(variationsSaveTimer.current);
    variationsSaveTimer.current = setTimeout(() => {
      fetch(`/api/briefs/${id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variationScripts: JSON.stringify(arr) }),
      })
        .then((res) => {
          if (!res.ok || savedIdx === undefined) return;
          setSavedFlash((f) => ({ ...f, [savedIdx]: true }));
          clearTimeout(savedFlashTimers.current[savedIdx]);
          savedFlashTimers.current[savedIdx] = setTimeout(() => {
            setSavedFlash((f) => ({ ...f, [savedIdx]: false }));
          }, 2000);
        })
        .catch(() => {})
        .finally(() => {
          variationsSavePending.current = false;
        });
    }, 350);
  }

  function onVarChange(idx, value) {
    setSavedFlash((f) => (f[idx] ? { ...f, [idx]: false } : f));
    setVariations((current) => {
      const next = current.slice();
      next[idx] = value;
      scheduleVariationsSave(next, idx);
      return next;
    });
  }

  function resetVar(idx, mainText) {
    setVariations((current) => {
      const next = current.slice();
      next[idx] = mainText;
      fetch(`/api/briefs/${id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variationScripts: JSON.stringify(next) }),
      }).catch(() => {});
      return next;
    });
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
    router.push(returnToOverview ? `/brief/${id}/overview` : `/brief/${id}/voice`);
  }

  if (showLoader || navigating) return <Preloader />;

  if (!brief || !brief.scriptApproved || !variationsCountOf(brief)) {
    return (
      <StepShell briefId={id} current={4} brief={brief} bigNum="04" kicker="Klaar voor je review" title="Jouw variaties" backHref={`/brief/${id}/script`} backLabel="Terug naar je script">
        <div style={{ background: '#FBF3F1', border: '1px solid #C2513F', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, color: '#C2513F' }}>
          {!brief
            ? 'Geen brief gevonden bij deze link.'
            : 'Keur eerst je hoofdscript goed op de vorige pagina, dan verschijnen je variaties hier.'}
        </div>
      </StepShell>
    );
  }

  const spotLength = brief.hoofdspotLength || '20';
  const target = parseInt(spotLength, 10) || 20;
  const variationCount = variationsCountOf(brief);
  const scriptText = brief.editedScript !== null && brief.editedScript !== undefined ? brief.editedScript : (brief.generatedScript || '');

  return (
    <StepShell
      briefId={id}
      current={4}
      brief={brief}
      subtitle={'Hoofdspot · ' + spotLength + '″'}
      bigNum="04"
      kicker="Script goedgekeurd"
      title={variationCount > 1 ? 'Jouw variaties' : 'Jouw variatie'}
      hint={
        'Je gaf bij levering aan ' + (variationCount > 1 ? `${variationCount} variaties` : 'ook een variatie') +
        ' nodig te hebben. Hieronder staat je goedgekeurde script ' + (variationCount > 1 ? `${variationCount}x` : 'nogmaals') +
        ': dit is dezelfde tekst, klaar om aan te passen. Typ zelf de stukjes tekst aan die anders moeten zijn; de rest laat je gewoon staan. Alles wordt automatisch bewaard zodra je typt.'
      }
      backHref={`/brief/${id}/script`}
      backLabel="Terug naar je script"
    >
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
        if (varSeconds > target * 1.2) { varStatusLabel = 'Te lang, graag inkorten.'; varBarColor = '#C2513F'; }
        else if (varSeconds > target * 1.05) { varStatusLabel = 'Net iets te lang, bekort het wat.'; varBarColor = '#383209'; }
        const varBarPct = Math.min((varSeconds / target) * 100, 140) + '%';
        const varUnchanged = varTrimmed === scriptText.trim();
        const tokens = diffWords(scriptText, varText);

        return (
          <div>
            <textarea
              style={{ minHeight: 130 }}
              value={varText}
              onFocus={() => { varFocusedMap.current[idx] = true; }}
              onBlur={() => { varFocusedMap.current[idx] = false; }}
              onChange={(e) => onVarChange(idx, e.target.value)}
            />
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: savedFlash[idx] ? '#1D7A46' : '#9C9890' }}>
              {savedFlash[idx] ? <>✓ Opgeslagen</> : <>Wordt automatisch opgeslagen terwijl je typt</>}
            </div>
            <div style={{ marginTop: 14 }}>
              <label className="field-label">Wat is er veranderd?</label>
              {varUnchanged ? (
                <div className="hint">
                  Nog geen wijzigingen, pas de tekst hierboven aan op het punt waar deze variatie moet verschillen van je hoofdscript.
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
            {!varUnchanged && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #EAE7DE', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => resetVar(idx, scriptText)}
                  style={{ width: 'auto', flex: 'none', border: '1.5px solid #B06156', color: '#B06156' }}
                >
                  ↺ Terugzetten naar origineel
                </button>
              </div>
            )}
          </div>
        );
      })()}

      <div style={{ marginTop: 20, paddingTop: 22, borderTop: '1px solid #EAE7DE', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn-primary" style={{ minWidth: 320, flex: 'none', whiteSpace: 'nowrap', padding: '14px 26px' }} onClick={continueToVoice}>
          {returnToOverview ? 'Terug naar overzicht' : 'Doorgaan naar de stem'}
        </button>
      </div>
    </StepShell>
  );
}
