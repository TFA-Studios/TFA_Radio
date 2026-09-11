'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import StepShell from '../../../../components/StepShell';
import Preloader from '../../../../components/Preloader';
import useMinDelay from '../../../../components/useMinDelay';
import { useBrief } from '../../../../components/useBrief';

const MAX_TRACKS = 3;

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Step 6 — mirrors public/music.html: browse curated playlists, pick up to
// 3 favorite tracks. Tracks come from the producer's real library (added
// under /dashboard/library) via GET /api/library/tracks, grouped by their
// category — this used to be a fixed, hard-coded sample pool
// (components/flowData.js's old PLAYLISTS), which meant nothing a producer
// added in the dashboard ever showed up here.
export default function MusicPage({ params }) {
  const { id } = params;
  const router = useRouter();
  const { brief, loading, schedulePatch, flushPending, patch } = useBrief(id);
  const showLoader = useMinDelay(loading, 700);
  // See the identical comment in contact/page.js.
  const [navigating, setNavigating] = useState(false);
  const [selectedTracks, setSelectedTracks] = useState([]);
  const [openPlaylistId, setOpenPlaylistId] = useState(null);
  const [playingTrackId, setPlayingTrackId] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [tracks, setTracks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [poolLoading, setPoolLoading] = useState(true);
  const audioRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tracksRes, categoriesRes] = await Promise.all([
          fetch('/api/library/tracks'),
          fetch('/api/library/categories'),
        ]);
        const tracksData = tracksRes.ok ? await tracksRes.json() : [];
        const categoriesData = categoriesRes.ok ? await categoriesRes.json() : [];
        if (!cancelled) {
          setTracks(Array.isArray(tracksData) ? tracksData : []);
          setCategories(Array.isArray(categoriesData) ? categoriesData : []);
        }
      } catch (e) {
        if (!cancelled) { setTracks([]); setCategories([]); }
      } finally {
        if (!cancelled) setPoolLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      stopAudio();
    };
  }, []);

  // Belt-and-braces audio stop — see the identical comment in voice/page.js:
  // the unmount cleanup above covers a normal client-side route change, but
  // not a bfcache-restored back/forward navigation or a tab switch.
  useEffect(() => {
    function handleHide() {
      stopAudio();
      setPlayingTrackId(null);
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
  // frame instead keeps it smooth.
  function startProgressLoop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    function tick() {
      if (!audioRef.current) return;
      setCurrentTime(audioRef.current.currentTime || 0);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  // ±5s skip and drag-to-seek for the currently playing preview — see the
  // identical pair in voice/page.js.
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

  // Group the real track list into "playlists" by category — a category
  // with no tracks in it simply doesn't appear, rather than every one of
  // the 6 fixed categories always showing (possibly empty).
  // Every known category always shows as its own playlist — even with zero
  // tracks uploaded yet — instead of only categories that happen to have at
  // least one track. Any track whose category isn't in the known list
  // (shouldn't normally happen) still gets its own group, appended after.
  const byCategory = {};
  categories.forEach((cat) => { byCategory[cat.name] = { id: cat.name, name: cat.name, description: cat.description || '', tracks: [] }; });
  tracks.forEach((t) => {
    const cat = t.category || 'Overig';
    if (!byCategory[cat]) byCategory[cat] = { id: cat, name: cat, description: '', tracks: [] };
    byCategory[cat].tracks.push(t);
  });
  const known = categories.filter((c) => byCategory[c.name]).map((c) => byCategory[c.name]);
  const extra = Object.values(byCategory)
    .filter((pl) => !categories.some((c) => c.name === pl.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  const playlists = known.concat(extra);

  // Hydrate from the brief once per id, not on every autosave echo — see the
  // long comment in contact/page.js's identical effect for why.
  useEffect(() => {
    if (brief) {
      let saved = [];
      try {
        saved = brief.selectedTracks ? JSON.parse(brief.selectedTracks) : [];
        if (!Array.isArray(saved)) saved = [];
      } catch (e) {
        saved = [];
      }
      setSelectedTracks(saved);
      if (saved.length) setOpenPlaylistId(saved[0].playlistId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief && brief.id]);

  function selectedIndex(trackId) {
    return selectedTracks.findIndex((t) => t.id === trackId);
  }

  function saveTracks(next) {
    setSelectedTracks(next);
    schedulePatch({ selectedTracks: JSON.stringify(next) });
  }

  function toggleTrack(track, playlist) {
    const i = selectedIndex(track.id);
    if (i !== -1) {
      const next = selectedTracks.slice();
      next.splice(i, 1);
      saveTracks(next);
    } else {
      if (selectedTracks.length >= MAX_TRACKS) return;
      saveTracks(selectedTracks.concat({ id: track.id, title: track.title, artist: track.artist, playlistId: playlist.id, playlistName: playlist.name }));
    }
  }

  function removeTrack(trackId) {
    const i = selectedIndex(trackId);
    if (i === -1) return;
    const next = selectedTracks.slice();
    next.splice(i, 1);
    saveTracks(next);
  }

  // Plays the track's real uploaded audio when it has one (audioUrl set via
  // the library's Blob upload); falls back to a short fake "playing" state
  // for tracks the producer hasn't attached audio to yet.
  function playPreview(track) {
    if (playingTrackId === track.id) {
      stopAudio();
      setPlayingTrackId(null);
      return;
    }
    stopAudio();
    if (track.audioUrl) {
      const audio = new Audio(track.audioUrl);
      audioRef.current = audio;
      audio.onended = () => { setPlayingTrackId((c) => (c === track.id ? null : c)); if (rafRef.current) cancelAnimationFrame(rafRef.current); setCurrentTime(0); };
      audio.onloadedmetadata = () => setDuration(audio.duration || 0);
      audio.play().catch(() => {});
      startProgressLoop();
      setPlayingTrackId(track.id);
    } else {
      setPlayingTrackId(track.id);
      setTimeout(() => setPlayingTrackId((c) => (c === track.id ? null : c)), 2200);
    }
  }

  async function next() {
    if (selectedTracks.length === 0) return;
    setNavigating(true);
    stopAudio();
    setPlayingTrackId(null);
    flushPending();
    await patch({ selectedTracks: JSON.stringify(selectedTracks) });
    router.push(`/brief/${id}/overview`);
  }

  if (showLoader || navigating) return <Preloader />;

  if (!brief) {
    return (
      <StepShell briefId={id} current={6} brief={null} bigNum="06" kicker="Onze voorstellen voor jou" title="Kies je muziek">
        <div style={{ background: '#FBF3F1', border: '1px solid #C2513F', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, color: '#C2513F' }}>
          Geen brief gevonden bij deze link. Ga terug en kies eerst je stem.
        </div>
      </StepShell>
    );
  }

  const name = brief.companyName && brief.companyName.trim() ? brief.companyName : 'je merk';
  const atLimit = selectedTracks.length >= MAX_TRACKS;

  return (
    <StepShell briefId={id} current={6} brief={brief} bigNum="06" kicker="Onze voorstellen voor jou" title="Kies je muziek" hint={'TFA curateert deze playlists. Open een categorie, beluister een track en kies degene die het beste bij ' + name + ' past.'} backHref={`/brief/${id}/voice`} backLabel="Terug naar de stem">
      <div className="box" style={{ border: '1px dashed #E6C858', fontSize: 12, color: '#383209', marginBottom: 20 }}>
        Je kunt tot <b>3 tracks</b> kiezen als favoriet. TFA combineert er uiteindelijk één met de gekozen stem tot je definitieve mix.
      </div>

      {poolLoading ? (
        <div style={{ fontSize: 12.5, color: '#8C8880' }}>Muziek laden…</div>
      ) : playlists.length === 0 ? (
        <div style={{ background: '#FBF3F1', border: '1px solid #C2513F', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, color: '#C2513F' }}>
          TFA heeft nog geen muziek in de bibliotheek gezet. Neem contact op met je producer.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {playlists.map((pl) => {
            const hasSelection = pl.tracks.some((t) => selectedIndex(t.id) !== -1);
            const isOpen = openPlaylistId === pl.id;
            return (
              <div key={pl.id} style={{ background: '#FFFFFF', border: '1.5px solid ' + (hasSelection ? '#E6C858' : '#DEDCD7'), borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '15px 17px', cursor: 'pointer' }} onClick={() => setOpenPlaylistId(isOpen ? null : pl.id)}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{pl.name}</div>
                      {hasSelection && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#E6C858' }} />}
                    </div>
                    {pl.description && (
                      <div style={{ fontSize: 12, color: '#5C5850', marginTop: 3, lineHeight: 1.4, maxWidth: 460 }}>{pl.description}</div>
                    )}
                    <div style={{ fontSize: 11.5, color: '#8C8880', marginTop: 3, lineHeight: 1.4 }}>{pl.tracks.length} track{pl.tracks.length === 1 ? '' : 's'}</div>
                  </div>
                  <span style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }}>▾</span>
                </div>
                {isOpen && (
                  <div style={{ borderTop: '1px solid #DEDCD7', padding: '4px 12px 10px' }}>
                    {pl.tracks.length === 0 && (
                      <div style={{ padding: '10px 8px', fontSize: 12, color: '#8C8880', fontStyle: 'italic' }}>
                        Nog geen tracks in deze categorie.
                      </div>
                    )}
                    {pl.tracks.map((track) => {
                      const selected = selectedIndex(track.id) !== -1;
                      const isPlaying = playingTrackId === track.id;
                      return (
                        <div
                          key={track.id}
                          onClick={() => { if (!atLimit || selected) toggleTrack(track, pl); }}
                          className="tfa-track-row"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6,
                            background: selected ? '#FBF0C8' : 'transparent', opacity: atLimit && !selected ? 0.45 : 1,
                            cursor: atLimit && !selected ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <button type="button" onClick={(e) => { e.stopPropagation(); playPreview(track); }} style={{ flex: 'none', width: 30, height: 30, borderRadius: '50%', border: '1px solid #C9C5B9', background: '#FBF9EC', cursor: 'pointer' }}>
                            {isPlaying ? '❚❚' : '▶'}
                          </button>
                          {/* The title stays visible whether or not this track is
                              playing — it used to be swapped out for the scrubber,
                              which made it impossible to tell which track was
                              playing once you'd pressed play. While playing, the
                              title/artist just shrinks to make room for a compact
                              scrubber alongside it, rather than dropping open a
                              panel below. */}
                          <div style={{ flex: isPlaying && track.audioUrl ? '0 1 34%' : '1 1 auto', minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: selected ? 600 : 500, color: '#1D1D1D', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</div>
                            <div style={{ fontSize: 11, color: '#8C8880', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artist}{track.artist && track.duration ? ' · ' : ''}{track.duration}</div>
                          </div>
                          {isPlaying && track.audioUrl && (
                            <div onClick={(e) => e.stopPropagation()} style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <button type="button" onClick={() => skipPreview(-5)} title="5 seconden terug" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#5C5850', flex: 'none', padding: '2px' }}>⏮</button>
                              <span style={{ fontSize: 10.5, color: '#8C6D1F', flex: 'none', width: 28, textAlign: 'right' }}>{formatTime(currentTime)}</span>
                              <input
                                type="range"
                                min={0}
                                max={duration || 0}
                                step={0.01}
                                value={Math.min(currentTime, duration || 0)}
                                onChange={seekPreview}
                                style={{ flex: 1, minWidth: 0, accentColor: '#E6C858', cursor: 'pointer' }}
                              />
                              <span style={{ fontSize: 10.5, color: '#8C6D1F', flex: 'none', width: 28 }}>{formatTime(duration)}</span>
                              <button type="button" onClick={() => skipPreview(5)} title="5 seconden vooruit" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#5C5850', flex: 'none', padding: '2px' }}>⏭</button>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleTrack(track, pl); }}
                            title={selected ? 'Track gekozen — klik om te verwijderen' : 'Kies deze track'}
                            className="tfa-track-select"
                            style={{
                              flex: 'none', width: 26, height: 26, borderRadius: '50%',
                              border: '1.5px solid ' + (selected ? '#E6C858' : '#C9C5B9'), background: selected ? '#E6C858' : '#FFFFFF',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1D1D1D', fontSize: 13, fontWeight: 700,
                            }}
                          >
                            {selected ? '✓' : ''}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedTracks.length > 0 && (
        <div style={{ marginTop: 16, borderRadius: 10, padding: '14px 16px', fontSize: 12.5, color: '#383209', lineHeight: 1.5, background: '#E6C858' }}>
          <div>{selectedTracks.length > 1 ? 'Gekozen tracks (max. 3, TFA levert er 1):' : 'Gekozen track:'}</div>
          {selectedTracks.map((t, i) => {
            // The saved selection only stores id/title/artist/playlist — not
            // audioUrl — so look the full track up in the loaded pool to get
            // something playable. Falls back to no preview button if the
            // track can't be found (pool still loading, or since removed
            // from the library).
            const fullTrack = tracks.find((tt) => tt.id === t.id);
            const isPlaying = playingTrackId === t.id;
            return (
              <div key={t.id} style={{ marginTop: 7, marginLeft: 8, padding: '7px 10px', background: '#FFFFFF', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                {fullTrack && fullTrack.audioUrl && (
                  <button
                    type="button"
                    onClick={() => playPreview(fullTrack)}
                    style={{ flex: 'none', width: 26, height: 26, borderRadius: '50%', border: '1px solid #C9C5B9', background: '#FBF9EC', cursor: 'pointer', fontSize: 11 }}
                  >
                    {isPlaying ? '❚❚' : '▶'}
                  </button>
                )}
                <div style={{ flex: isPlaying && fullTrack && fullTrack.audioUrl ? '0 1 34%' : '1 1 auto', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: '#1D1D1D', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: '#5C5850', marginTop: 1 }}>{t.playlistName}</div>
                </div>
                {isPlaying && fullTrack && fullTrack.audioUrl && (
                  <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button type="button" onClick={() => skipPreview(-5)} title="5 seconden terug" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#5C5850', flex: 'none', padding: '2px' }}>⏮</button>
                    <span style={{ fontSize: 10.5, color: '#8C6D1F', flex: 'none', width: 28, textAlign: 'right' }}>{formatTime(currentTime)}</span>
                    <input
                      type="range"
                      min={0}
                      max={duration || 0}
                      step={0.01}
                      value={Math.min(currentTime, duration || 0)}
                      onChange={seekPreview}
                      style={{ flex: 1, minWidth: 0, accentColor: '#E6C858', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 10.5, color: '#8C6D1F', flex: 'none', width: 28 }}>{formatTime(duration)}</span>
                    <button type="button" onClick={() => skipPreview(5)} title="5 seconden vooruit" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#5C5850', flex: 'none', padding: '2px' }}>⏭</button>
                  </div>
                )}
                <button type="button" onClick={() => removeTrack(t.id)} aria-label="Verwijderen" style={{ flex: 'none', width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 20, paddingTop: 22, borderTop: '1px solid #EAE7DE', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn-primary" style={{ minWidth: 320, flex: 'none', whiteSpace: 'nowrap', padding: '14px 26px' }} disabled={selectedTracks.length === 0} onClick={next}>
          Bevestigen — verder naar het overzicht
        </button>
      </div>
      <p style={{ marginTop: 20, fontSize: 11.5, color: '#8C8880', lineHeight: 1.5 }}>Twijfel je tussen twee tracks? Je kunt je keuze altijd nog aanpassen voordat je alles verstuurt.</p>

      <style jsx>{`
        .tfa-track-row:hover {
          background: rgba(230, 200, 88, 0.08);
        }
        .tfa-track-select {
          transition: box-shadow 0.12s ease, transform 0.12s ease;
        }
        .tfa-track-row:hover .tfa-track-select {
          box-shadow: 0 0 0 4px rgba(230, 200, 88, 0.25);
        }
      `}</style>
    </StepShell>
  );
}
