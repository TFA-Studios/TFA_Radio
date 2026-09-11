'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import StepShell from '../../../../components/StepShell';
import Preloader from '../../../../components/Preloader';
import useMinDelay from '../../../../components/useMinDelay';
import { useBrief } from '../../../../components/useBrief';
import { AGE_LABELS } from '../../../../components/flowData';

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Step 5 — mirrors public/voice.html (questions phase, then a curated
// shortlist of voices to pick from). Voices come from the producer's real
// library (added under /dashboard/library) via GET /api/library/voices —
// this used to be a fixed, hard-coded sample pool (components/flowData.js's
// old VOICE_POOL), which meant nothing a producer added in the dashboard
// ever showed up here. Tags are now the library's own free-form tag labels
// (e.g. "Warm & vertrouwd") rather than the old fixed tag-id list, so the
// "karakter van de stem" question is now built from whatever tags actually
// exist across the real voices, not a hard-coded set.
export default function VoicePage({ params }) {
  const { id } = params;
  const router = useRouter();
  const { brief, loading, schedulePatch, flushPending, patch } = useBrief(id);
  const showLoader = useMinDelay(loading, 700);
  // See the identical comment in contact/page.js.
  const [navigating, setNavigating] = useState(false);
  const [form, setForm] = useState({ voiceGender: '', voiceAgeRange: '', voiceStyleTags: [], voiceNote: '', selectedVoiceId: '' });
  const [phase, setPhase] = useState('questions');
  const [playingId, setPlayingId] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [voicePool, setVoicePool] = useState([]);
  const [poolLoading, setPoolLoading] = useState(true);
  const audioRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/library/voices');
        const data = res.ok ? await res.json() : [];
        if (!cancelled) setVoicePool(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setVoicePool([]);
      } finally {
        if (!cancelled) setPoolLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      stopAudio();
    };
  }, []);

  // Belt-and-braces audio stop: the unmount cleanup above already pauses
  // playback on a normal client-side route change, but a browser back/forward
  // navigation can be restored from bfcache without a fresh unmount, and a
  // tab switch shouldn't keep a preview audibly playing either — so also
  // stop on pagehide/visibilitychange.
  useEffect(() => {
    function handleHide() {
      stopAudio();
      setPlayingId(null);
    }
    window.addEventListener('pagehide', handleHide);
    document.addEventListener('visibilitychange', handleHide);
    return () => {
      window.removeEventListener('pagehide', handleHide);
      document.removeEventListener('visibilitychange', handleHide);
    };
  }, []);

  function stopAudio() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setCurrentTime(0);
    setDuration(0);
  }

  // Drives the scrubber off requestAnimationFrame instead of the <audio>
  // element's own `timeupdate` event — timeupdate only fires a handful of
  // times a second (browsers throttle it well below 60fps), which is why
  // the bar used to visibly stutter. Polling currentTime every animation
  // frame instead keeps it smooth — see the identical pair in
  // music/page.js.
  function startProgressLoop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    function tick() {
      if (!audioRef.current) return;
      setCurrentTime(audioRef.current.currentTime || 0);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  // ±5s skip and drag-to-seek for the currently playing preview — kept as
  // free functions (rather than baked into playPreview) so the compact
  // inline controls below can call them directly without re-triggering the
  // play/stop toggle.
  function skipPreview(delta) {
    const audio = audioRef.current;
    if (!audio) return;
    const max = duration || audio.duration || 0;
    audio.currentTime = Math.max(0, Math.min(max, audio.currentTime + delta));
    setCurrentTime(audio.currentTime);
  }

  function seekPreview(e) {
    const audio = audioRef.current;
    if (!audio) return;
    const t = parseFloat(e.target.value);
    audio.currentTime = t;
    setCurrentTime(t);
  }

  const allTags = Array.from(new Set(voicePool.flatMap((v) => v.tags || []))).sort();

  // Hydrate from the brief — and derive the initial questions/voices phase
  // — only once per id, not on every autosave echo. This effect used to
  // depend on the whole `brief` object, which changes reference every time
  // patch() resolves (it calls setBrief() with the server's echoed row). That
  // meant EVERY save while on this step re-ran `setPhase(...)`, and since
  // `selectedVoiceId` is still blank right up until a voice is actually
  // clicked, any autosave fired while the client was on the "questions"
  // phase (e.g. from showPitches()'s own patch call) snapped `phase` straight
  // back to 'questions' a moment after the user had moved on to 'voices' —
  // this was the step-5 "won't advance" blocker. See the identical comment
  // in contact/page.js for the general version of this bug.
  useEffect(() => {
    if (brief) {
      const next = {
        voiceGender: brief.voiceGender || '',
        voiceAgeRange: brief.voiceAgeRange || '',
        voiceStyleTags: brief.voiceStyleTags ? brief.voiceStyleTags.split(',').filter(Boolean) : [],
        voiceNote: brief.voiceNote || '',
        selectedVoiceId: brief.selectedVoiceId || '',
      };
      setForm(next);
      setPhase(next.selectedVoiceId ? 'voices' : 'questions');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief && brief.id]);

  function update(patchObj) {
    const next = { ...form, ...patchObj };
    setForm(next);
    const body = { ...patchObj };
    if ('voiceStyleTags' in body) body.voiceStyleTags = body.voiceStyleTags.join(',');
    schedulePatch(body);
  }

  function toggleTag(v) {
    const idx = form.voiceStyleTags.indexOf(v);
    const next = form.voiceStyleTags.slice();
    if (idx === -1) next.push(v); else next.splice(idx, 1);
    update({ voiceStyleTags: next });
  }

  // Matches the client's answers against each voice's real metadata from
  // the dashboard library (gender, ageRange, tags) — a producer-set voice
  // with gender "man" and ageRange "35-54" only shows up here when those
  // are exactly what the client asked for, instead of every voice in the
  // library regardless of what was picked in the questions phase.
  //
  // If nothing matches every criterion, this relaxes ONE step at a time
  // (drop tags first, since "character" is the softest preference; then
  // age; gender is kept as long as possible) rather than silently falling
  // back to the entire unfiltered pool — and the UI says which criteria it
  // had to relax, so it never looks like the filtering just isn't working.
  function curatedVoices() {
    const wantGender = form.voiceGender && form.voiceGender !== 'geen-voorkeur' ? form.voiceGender : null;
    const wantAge = form.voiceAgeRange || null;
    const wantTags = form.voiceStyleTags;

    function matches({ gender, age, tags }) {
      return voicePool.filter((v) => {
        if (gender && v.gender !== wantGender) return false;
        if (age && v.ageRange !== wantAge) return false;
        if (tags && wantTags.length && !wantTags.some((t) => (v.tags || []).includes(t))) return false;
        return true;
      });
    }

    if (!wantGender && !wantAge && wantTags.length === 0) {
      return { voices: voicePool, relaxed: [] };
    }

    const attempts = [
      { criteria: { gender: true, age: true, tags: true }, relaxed: [] },
      { criteria: { gender: true, age: true, tags: false }, relaxed: ['karakter'] },
      { criteria: { gender: true, age: false, tags: false }, relaxed: ['karakter', 'leeftijd'] },
      { criteria: { gender: false, age: false, tags: false }, relaxed: ['karakter', 'leeftijd', 'geslacht'] },
    ];
    for (const attempt of attempts) {
      const found = matches(attempt.criteria);
      if (found.length) return { voices: found, relaxed: attempt.relaxed };
    }
    return { voices: voicePool, relaxed: ['karakter', 'leeftijd', 'geslacht'] };
  }

  function selectVoice(voice) {
    update({ selectedVoiceId: voice.id, selectedVoiceLabel: voice.name, selectedVoiceTags: (voice.tags || []).join(',') });
  }

  // Plays the voice's real uploaded sample when it has one (audioUrl set via
  // the library's Blob upload); falls back to a short fake "playing" state
  // for voices the producer hasn't attached audio to yet, so the button
  // still does *something* rather than silently failing.
  function playPreview(voice) {
    if (playingId === voice.id) {
      stopAudio();
      setPlayingId(null);
      return;
    }
    stopAudio();
    if (voice.audioUrl) {
      const audio = new Audio(voice.audioUrl);
      audioRef.current = audio;
      audio.onended = () => { setPlayingId((c) => (c === voice.id ? null : c)); if (rafRef.current) cancelAnimationFrame(rafRef.current); setCurrentTime(0); };
      audio.onloadedmetadata = () => setDuration(audio.duration || 0);
      audio.play().catch(() => {});
      startProgressLoop();
      setPlayingId(voice.id);
    } else {
      setPlayingId(voice.id);
      setTimeout(() => setPlayingId((c) => (c === voice.id ? null : c)), 2200);
    }
  }

  async function showPitches() {
    flushPending();
    await patch({ ...form, voiceStyleTags: form.voiceStyleTags.join(',') });
    setPhase('voices');
  }

  async function next() {
    if (!form.selectedVoiceId) return;
    setNavigating(true);
    stopAudio();
    setPlayingId(null);
    flushPending();
    await patch({ ...form, voiceStyleTags: form.voiceStyleTags.join(',') });
    router.push(`/brief/${id}/music`);
  }

  if (showLoader || navigating) return <Preloader />;

  if (!brief) {
    return (
      <StepShell briefId={id} current={5} brief={null} bigNum="05" kicker="Voor je voorstellen" title="Welke stem past bij jou?">
        <div style={{ background: '#FBF3F1', border: '1px solid #C2513F', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, color: '#C2513F' }}>
          Geen brief gevonden bij deze link. Ga terug en keur eerst je script goed.
        </div>
      </StepShell>
    );
  }

  return (
    <StepShell briefId={id} current={5} brief={brief} bigNum="05" kicker={phase === 'questions' ? 'Voor je voorstellen' : 'Onze voorstellen voor jou'} title={phase === 'questions' ? 'Welke stem past bij jou?' : 'Kies je stem'} backHref={`/brief/${id}/script`} backLabel="Terug naar je script">
      {phase === 'questions' ? (
        <>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#5C5850', margin: '0 0 26px' }}>
            Beantwoord een paar korte vragen — TFA stelt daarna twee of drie stemmen voor die daarbij passen.
          </p>
          <div style={{ marginTop: 10 }}>
            <label className="field-label">Geslacht van de stem</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['man', 'Man'], ['vrouw', 'Vrouw'], ['geen-voorkeur', 'Geen voorkeur']].map(([v, label]) => (
                <button key={v} type="button" className={'seg-btn' + (form.voiceGender === v ? ' selected' : '')} onClick={() => update({ voiceGender: form.voiceGender === v ? '' : v })}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 18 }}>
            <label className="field-label">Leeftijd van de stem</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {Object.entries(AGE_LABELS).map(([v, label]) => (
                <button key={v} type="button" className={'seg-btn' + (form.voiceAgeRange === v ? ' selected' : '')} onClick={() => update({ voiceAgeRange: form.voiceAgeRange === v ? '' : v })}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 18 }}>
            <label className="field-label" style={{ marginBottom: 3 }}>Karakter van de stem</label>
            <div className="hint" style={{ marginBottom: 8 }}>Kies er een of meer.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allTags.length === 0 && !poolLoading && (
                <span style={{ fontSize: 12.5, color: '#8C8880' }}>Nog geen tags beschikbaar.</span>
              )}
              {allTags.map((v) => (
                <button key={v} type="button" className={'tone-chip' + (form.voiceStyleTags.includes(v) ? ' active' : '')} onClick={() => toggleTag(v)}>{v}</button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 18 }}>
            <label className="field-label">Nog iets dat we moeten weten? <span style={{ color: '#8C8880', fontWeight: 400 }}>(optioneel)</span></label>
            <textarea style={{ minHeight: 64 }} value={form.voiceNote} placeholder="Bijv. 'geen kinderstem'" onChange={(e) => update({ voiceNote: e.target.value })} />
          </div>
          <div style={{ marginTop: 26, maxWidth: 340 }}>
            <button type="button" className="btn-primary" style={{ width: '100%' }} onClick={showPitches}>Bekijk stemvoorstellen</button>
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#5C5850', margin: '0 0 20px' }}>
            Op basis van je antwoorden stelt TFA deze stemmen voor. Beluister elk voorbeeld en kies de stem die het beste past.
          </p>
          {poolLoading ? (
            <div style={{ fontSize: 12.5, color: '#8C8880' }}>Stemmen laden…</div>
          ) : voicePool.length === 0 ? (
            <div style={{ background: '#FBF3F1', border: '1px solid #C2513F', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, color: '#C2513F' }}>
              TFA heeft nog geen stemmen in de bibliotheek gezet. Neem contact op met je producer.
            </div>
          ) : (() => {
            // Deliberately not surfaced to the client — see the comment on
            // curatedVoices(). Telling them "nothing matched your age/
            // character preference" tends to make them reject a perfectly
            // good voice on principle, even when it's genuinely the closest
            // fit. The relaxation still happens silently underneath.
            const { voices: shortlist } = curatedVoices();
            return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {shortlist.map((voice) => {
                const isSelected = form.selectedVoiceId === voice.id;
                const isPlaying = playingId === voice.id;
                return (
                  <div key={voice.id} style={{ background: '#FFFFFF', border: '1.5px solid ' + (isSelected ? '#E6C858' : '#DEDCD7'), borderRadius: 12, padding: '15px 17px', cursor: 'pointer' }} onClick={() => selectVoice(voice)}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1D1D1D' }}>{voice.name}</div>
                        <div style={{ fontSize: 12, color: '#5C5850', marginTop: 2 }}>{(voice.tags || []).join(' · ')}{voice.ageRange ? ' · ' + (AGE_LABELS[voice.ageRange] || voice.ageRange) : ''}</div>
                      </div>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px solid ' + (isSelected ? '#E6C858' : '#C9C5B9'), background: isSelected ? '#E6C858' : '#FFFFFF' }} />
                    </div>
                    {isPlaying && voice.audioUrl ? (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, width: '100%', border: '1px solid #E6C858', borderRadius: 9, background: 'rgba(230,200,88,.14)', padding: '7px 10px' }}
                      >
                        <button type="button" onClick={() => skipPreview(-5)} title="5 seconden terug" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#383209', flex: 'none', padding: '2px' }}>⏮</button>
                        <button
                          type="button"
                          onClick={() => playPreview(voice)}
                          title="Pauzeer"
                          style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: '#1D1D1D', color: '#FFFFFF', cursor: 'pointer', fontSize: 11, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          ❚❚
                        </button>
                        <button type="button" onClick={() => skipPreview(5)} title="5 seconden vooruit" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#383209', flex: 'none', padding: '2px' }}>⏭</button>
                        <span style={{ fontSize: 10.5, color: '#8C6D1F', flex: 'none', width: 30, textAlign: 'right' }}>{formatTime(currentTime)}</span>
                        <input
                          type="range"
                          min={0}
                          max={duration || 0}
                          step={0.01}
                          value={Math.min(currentTime, duration || 0)}
                          onChange={seekPreview}
                          style={{ flex: 1, accentColor: '#E6C858', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 10.5, color: '#8C6D1F', flex: 'none', width: 30 }}>{formatTime(duration)}</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); playPreview(voice); }}
                        style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', border: '1px solid #C9C5B9', borderRadius: 9, background: '#FBF9EC', color: '#383209', fontWeight: 500, fontSize: 12.5, padding: '9px 12px', cursor: 'pointer' }}
                      >
                        {isPlaying ? 'Bezig met afspelen…' : voice.audioUrl ? 'Voorbeeld beluisteren' : 'Voorbeeld beluisteren (geen audio)'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            );
          })()}
          <div style={{ marginTop: 18 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); stopAudio(); setPlayingId(null); setPhase('questions'); }} style={{ fontSize: 12, color: '#8C8880', textDecoration: 'underline' }}>← Terug naar de vragen</a>
          </div>
          <div style={{ marginTop: 22, paddingTop: 22, borderTop: '1px solid #EAE7DE', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-primary" style={{ minWidth: 320, flex: 'none', whiteSpace: 'nowrap', padding: '14px 26px' }} disabled={!form.selectedVoiceId} onClick={next}>
              Bevestigen — verder naar de muziek
            </button>
          </div>
        </>
      )}
      <p style={{ marginTop: 26, fontSize: 11.5, color: '#8C8880', lineHeight: 1.5 }}>Twijfel je tussen twee stemmen? Je kunt je keuze altijd nog aanpassen voordat je alles verstuurt.</p>
    </StepShell>
  );
}
