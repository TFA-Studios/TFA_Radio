'use client';

import { useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import {
  removeTrackAction, updateTrackAction, removeTracksBulkAction,
  removeVoiceAction, updateVoiceAction, removeVoicesBulkAction,
  addTracksBulkAction, addVoicesBulkAction,
} from '../app/dashboard/library/actions';

const cardStyle = { background: '#FBF9EC', border: '1.5px solid #EAE3C4', borderRadius: 12, padding: '14px 16px' };
const rowStyle = { display: 'flex', alignItems: 'center', gap: 12, background: '#FFFFFF', borderRadius: 10, padding: '10px 14px', boxShadow: '0 1px 6px rgba(29,29,29,.04)', flexWrap: 'wrap' };

// Uploads an audio file straight from the browser to Blob storage — see
// app/api/library/blob-upload/route.js for why this replaced routing the
// file through a Server Action's request body (that path silently failed
// on any real voice/music file over ~1-4.5MB). Degrades the same way the
// old server-side upload used to: if there's no Blob store configured yet,
// or the upload genuinely fails, the item still gets added, just without
// audio attached — never blocks the whole add over it.
async function uploadFileToBlob(file, prefix) {
  if (!file || typeof file === 'string' || !file.size) return { audioUrl: '', originalFilename: '' };
  try {
    const blob = await upload(`${prefix}/${file.name}`, file, {
      access: 'public',
      handleUploadUrl: '/api/library/blob-upload',
    });
    return { audioUrl: blob.url, originalFilename: file.name };
  } catch (err) {
    console.error('[library] audio upload failed', err);
    return { audioUrl: '', originalFilename: '' };
  }
}

function fileBaseName(file) {
  const name = file.name || '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function confirmDelete(message) {
  return (e) => {
    if (!window.confirm(message)) e.preventDefault();
  };
}

// Voice tags picker — a dropdown of existing tags (checkable) plus a small
// "add new tag" field, replacing the old free-text "comma-separated tags"
// input. Music has no tags field, so this is voice-only. `selected` is the
// array of chosen tag strings; `onChange` receives the updated array;
// `onAddTag` is called once when a genuinely new tag is added, so the
// caller can add it to the shared known-tags list (making it available in
// every other tag picker on the page too, not just this one).
function TagPicker({ allTags, selected, onChange, onAddTag }) {
  const [open, setOpen] = useState(false);
  const [newTag, setNewTag] = useState('');
  const wrapRef = useRef(null);

  // Close on any click outside the picker — previously only the "Sluiten"
  // button (or re-clicking the trigger) closed it, so clicking elsewhere on
  // the page (e.g. straight into another field) left the dropdown open.
  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function toggle(tag) {
    if (selected.includes(tag)) onChange(selected.filter((t) => t !== tag));
    else onChange([...selected, tag]);
  }

  function addNew() {
    const tag = newTag.trim();
    if (!tag) return;
    if (!allTags.includes(tag)) onAddTag(tag);
    if (!selected.includes(tag)) onChange([...selected, tag]);
    setNewTag('');
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', textAlign: 'left', border: '1px solid #C9C5B9', borderRadius: 8, padding: '9px 10px',
          fontSize: 13, background: '#FFFFFF', cursor: 'pointer', minHeight: 38, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center',
        }}
      >
        {selected.length === 0 && <span style={{ color: '#9C9890' }}>Kies tags…</span>}
        {selected.map((tag) => (
          <span key={tag} style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: '#FBF0C8', color: '#383209' }}>
            {tag}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', color: '#8C8880', fontSize: 11 }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4, background: '#FFFFFF', border: '1px solid #C9C5B9', borderRadius: 8, boxShadow: '0 4px 16px rgba(29,29,29,.12)', padding: 8, maxHeight: 220, overflowY: 'auto' }}>
          {allTags.map((tag) => (
            <label key={tag} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px', fontSize: 12.5, cursor: 'pointer', borderRadius: 6 }}>
              <input type="checkbox" checked={selected.includes(tag)} onChange={() => toggle(tag)} />
              {tag}
            </label>
          ))}
          {allTags.length === 0 && <div style={{ fontSize: 12, color: '#8C8880', padding: '4px 6px' }}>Nog geen tags beschikbaar.</div>}
          <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid #EEECE3', display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNew(); } }}
              placeholder="Nieuwe tag..."
              style={{ flex: 1, border: '1px solid #C9C5B9', borderRadius: 6, padding: '6px 8px', fontSize: 12.5 }}
            />
            <button type="button" onClick={addNew} style={{ border: 'none', borderRadius: 6, background: '#1D1D1D', color: '#FFFFFF', fontSize: 12, padding: '6px 12px', cursor: 'pointer' }}>
              Toevoegen
            </button>
          </div>
          <button type="button" onClick={() => setOpen(false)} style={{ marginTop: 6, width: '100%', border: 'none', background: 'transparent', color: '#8C8880', fontSize: 11.5, cursor: 'pointer', padding: '4px 0' }}>
            Sluiten
          </button>
        </div>
      )}
    </div>
  );
}

// The ONE way to add music or voices — drag-and-drop (or click-to-browse)
// for one file or many at once, each staged with its own editable fields
// before anything is actually imported. Replacing the old split of "one
// single-item form up top, a separate drag-and-drop batch zone below" with
// this single zone removes the confusing duplication: there is now only
// one place to add anything, whether it's one file or fifty.
function AddZone({ kind, categories, defaultGender, defaultAgeRange, onConfirm, allTags, onAddTag }) {
  const [staged, setStaged] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  function addFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f.name));
    if (!files.length) return;
    setStaged((cur) => [
      ...cur,
      ...files.map((file) => ({
        localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        title: fileBaseName(file),
        artist: '',
        category: categories ? categories[0] : '',
        name: fileBaseName(file),
        gender: defaultGender || 'vrouw',
        ageRange: defaultAgeRange || '35-54',
        tags: [],
        fileId: '',
      })),
    ]);
  }

  function updateStaged(localId, patch) {
    setStaged((cur) => cur.map((it) => (it.localId === localId ? { ...it, ...patch } : it)));
  }

  function removeStaged(localId) {
    setStaged((cur) => cur.filter((it) => it.localId !== localId));
  }

  async function confirmAll() {
    if (!staged.length) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(staged);
      setStaged([]);
    } catch (e) {
      setError('Toevoegen is niet gelukt — probeer het opnieuw.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current && fileInputRef.current.click()}
        style={{
          border: `2px dashed ${dragOver ? '#E6C858' : '#C9C5B9'}`, borderRadius: 12, padding: '30px 16px',
          textAlign: 'center', cursor: 'pointer', background: dragOver ? 'rgba(230,200,88,.08)' : '#FFFFFF',
          transition: 'background .15s ease, border-color .15s ease',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1D1D1D' }}>
          Sleep {kind === 'music' ? 'muziekbestanden' : 'stem-audio'} hierheen
        </div>
        <div style={{ fontSize: 12.5, color: '#8C8880', marginTop: 4 }}>
          of klik om te bladeren — kies één bestand of meerdere tegelijk, allebei werkt hier
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          onChange={(e) => addFiles(e.target.files)}
          style={{ display: 'none' }}
        />
      </div>

      {staged.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#5C5850' }}>
            {staged.length} bestand{staged.length === 1 ? '' : 'en'} klaar om toe te voegen — controleer de velden hieronder:
          </div>
          {staged.map((it) => (
            <div key={it.localId} style={{ position: 'relative', background: '#FFFFFF', border: '1px solid #EEECE3', borderRadius: 10, padding: '12px 40px 12px 14px' }}>
              <button
                type="button"
                onClick={() => removeStaged(it.localId)}
                title="Verwijderen uit import"
                aria-label="Verwijderen uit import"
                className="tfa-staged-remove"
                style={{
                  position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: '50%', border: 'none',
                  background: 'transparent', color: '#8C8880', cursor: 'pointer', fontSize: 15, lineHeight: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ×
              </button>
              <div style={{ fontSize: 11.5, color: '#8C8880', marginBottom: 8 }}>{it.file.name}</div>
              {kind === 'music' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }} className="tfa-lib-grid">
                  <input type="text" value={it.title} onChange={(e) => updateStaged(it.localId, { title: e.target.value })} placeholder="Titel" />
                  <input type="text" value={it.artist} onChange={(e) => updateStaged(it.localId, { artist: e.target.value })} placeholder="Artiest" />
                  <select value={it.category} onChange={(e) => updateStaged(it.localId, { category: e.target.value })}>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input type="text" value={it.fileId} onChange={(e) => updateStaged(it.localId, { fileId: e.target.value })} placeholder="File ID (optioneel)" />
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.4fr 1fr', gap: 8 }} className="tfa-lib-grid">
                  <input type="text" value={it.name} onChange={(e) => updateStaged(it.localId, { name: e.target.value })} placeholder="Naam" />
                  <select value={it.gender} onChange={(e) => updateStaged(it.localId, { gender: e.target.value })}>
                    <option value="vrouw">Vrouw</option>
                    <option value="man">Man</option>
                  </select>
                  <select value={it.ageRange} onChange={(e) => updateStaged(it.localId, { ageRange: e.target.value })}>
                    <option value="18-34">18–34</option>
                    <option value="35-54">35–54</option>
                    <option value="55+">55+</option>
                  </select>
                  <TagPicker allTags={allTags || []} selected={it.tags} onChange={(tags) => updateStaged(it.localId, { tags })} onAddTag={onAddTag} />
                  <input type="text" value={it.fileId} onChange={(e) => updateStaged(it.localId, { fileId: e.target.value })} placeholder="File ID (optioneel)" />
                </div>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={confirmAll}
            disabled={busy}
            className="btn-primary"
            style={{ alignSelf: 'flex-start', padding: '10px 18px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, opacity: busy ? 0.75 : 1, cursor: busy ? 'wait' : 'pointer' }}
          >
            {busy && (
              <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(29,29,29,.25)', borderTopColor: '#1D1D1D', display: 'inline-block', animation: 'tfa-spin .7s linear infinite' }} />
            )}
            {busy ? 'Bezig met toevoegen…' : `Voeg toe aan bibliotheek (${staged.length})`}
          </button>
          {error && (
            <div style={{ background: '#FBF3F1', border: '1px solid #C2513F', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#C2513F' }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Full-width preview player that drops down below a library row instead of
// squeezing a native <audio controls> into the row itself (which left it
// tiny and cramped on the right). Play/pause, a scrubber you can drag, a
// current/total time readout, and ±5s skip buttons for quickly checking a
// specific moment in a track or voice demo.
//
// autoPlay: starts playback the instant this mounts, so opening the preview
// (clicking "Beluister") and actually hearing it is one click instead of
// two — previously the row's button only revealed this player, and you
// still had to press its own play button separately.
function AudioPlayer({ src, autoPlay }) {
  const audioRef = useRef(null);
  const rafRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (autoPlay && audioRef.current) {
      const p = audioRef.current.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
    // Only on mount — this player is only ever mounted fresh per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll currentTime via requestAnimationFrame while playing instead of
  // relying on the <audio> element's own `timeupdate` event, which browsers
  // throttle to well below 60fps — that throttling is what made this
  // scrubber visibly stutter.
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return undefined;
    }
    function tick() {
      if (audioRef.current) setCurrent(audioRef.current.currentTime || 0);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play();
  }

  function skip(delta) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min((duration || 0), audio.currentTime + delta));
  }

  function seek(e) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = parseFloat(e.target.value);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#FBF9EC', border: '1px solid #EAE3C4', borderRadius: 10, width: '100%' }}>
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onEnded={() => { setPlaying(false); setCurrent(0); }}
        style={{ display: 'none' }}
      />
      <button type="button" onClick={() => skip(-5)} title="5 seconden terug" style={{ border: 'none', background: 'transparent', color: '#5C5850', cursor: 'pointer', fontSize: 15, flex: 'none', padding: '4px 2px' }}>
        ⏮
      </button>
      <button
        type="button"
        onClick={togglePlay}
        title={playing ? 'Pauzeer' : 'Speel af'}
        style={{
          width: 34, height: 34, borderRadius: '50%', border: 'none', background: '#1D1D1D', color: '#FFFFFF',
          cursor: 'pointer', fontSize: 13, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <button type="button" onClick={() => skip(5)} title="5 seconden vooruit" style={{ border: 'none', background: 'transparent', color: '#5C5850', cursor: 'pointer', fontSize: 15, flex: 'none', padding: '4px 2px' }}>
        ⏭
      </button>
      <span style={{ fontSize: 11.5, color: '#8C8880', flex: 'none', width: 36, textAlign: 'right' }}>{formatTime(current)}</span>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.01}
        value={Math.min(current, duration || 0)}
        onChange={seek}
        style={{ flex: 1, accentColor: '#E6C858', cursor: 'pointer' }}
      />
      <span style={{ fontSize: 11.5, color: '#8C8880', flex: 'none', width: 36 }}>{formatTime(duration)}</span>
    </div>
  );
}

function TrackRow({ track, categories, selected, onToggleSelect, activePreviewId, onTogglePreview }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Which row's preview is open lives in the parent (BrowsePanel), shared
  // across every row in the list, so opening one row's preview stops
  // whichever other one was playing instead of letting several play at once.
  const previewOpen = activePreviewId === track.id;

  // A plain onSubmit instead of a native form action — a replacement audio
  // file needs to go to Blob storage from the browser first (see
  // uploadFileToBlob above) before the small metadata FormData is handed to
  // the server action, which a native <form action> can't do in between.
  async function handleEditSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      const formData = new FormData(e.target);
      const audioFile = formData.get('audioFile');
      formData.delete('audioFile');
      if (audioFile && typeof audioFile !== 'string' && audioFile.size) {
        const { audioUrl, originalFilename } = await uploadFileToBlob(audioFile, 'tracks');
        formData.set('audioUrl', audioUrl);
        formData.set('originalFilename', originalFilename);
      }
      await updateTrackAction(track.id, formData);
      setEditing(false);
    } catch (err) {
      setSaveError('Opslaan is niet gelukt — probeer het opnieuw.');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <form onSubmit={handleEditSubmit} style={{ ...cardStyle, background: '#FFFFFF', border: '1.5px solid #C9C5B9' }} className="tfa-lib-form">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }} className="tfa-lib-grid">
          <input name="title" type="text" defaultValue={track.title} placeholder="Titel" required />
          <input name="artist" type="text" defaultValue={track.artist} placeholder="Artiest" />
          <select name="category" defaultValue={track.category}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input name="fileId" type="text" defaultValue={track.fileId} placeholder="File ID (optioneel)" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <input name="audioFile" type="file" accept="audio/*" style={{ flex: 1, fontSize: 12.5 }} />
          <span style={{ fontSize: 11, color: '#8C8880', whiteSpace: 'nowrap' }}>
            {track.audioUrl ? 'Laat leeg om huidige audio te behouden' : 'Nog geen audio geüpload'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            type="submit"
            className="btn-primary"
            disabled={saving}
            style={{ padding: '10px 16px', fontSize: 13, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8, opacity: saving ? 0.75 : 1, cursor: saving ? 'wait' : 'pointer' }}
          >
            {saving && (
              <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(29,29,29,.25)', borderTopColor: '#1D1D1D', display: 'inline-block', animation: 'tfa-spin .7s linear infinite' }} />
            )}
            {saving ? 'Bezig met opslaan…' : 'Opslaan'}
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={saving} className="ghost-btn" style={{ width: 'auto', padding: '10px 16px' }}>
            Annuleren
          </button>
        </div>
        {saveError && (
          <div style={{ marginTop: 10, background: '#FBF3F1', border: '1px solid #C2513F', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#C2513F' }}>
            {saveError}
          </div>
        )}
      </form>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div style={rowStyle}>
        <input type="checkbox" checked={selected} onChange={() => onToggleSelect(track.id)} style={{ width: 16, height: 16, accentColor: '#E6C858', cursor: 'pointer', flex: 'none' }} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{track.title}</div>
          <div style={{ fontSize: 12, color: '#8C8880' }}>
            {track.artist} · {track.category}{track.fileId ? ` · ID: ${track.fileId}` : ''}
          </div>
          {track.originalFilename && (
            <div style={{ fontSize: 11, color: '#B9B6AC', fontStyle: 'italic', marginTop: 2 }}>
              Geüpload bestand: {track.originalFilename}
            </div>
          )}
        </div>
        {track.audioUrl ? (
          <button
            type="button"
            onClick={() => onTogglePreview(track.id)}
            style={{
              border: '1px solid ' + (previewOpen ? '#E6C858' : '#C9C5B9'), background: previewOpen ? 'rgba(230,200,88,.14)' : '#FFFFFF',
              color: '#1D1D1D', cursor: 'pointer', fontSize: 12, borderRadius: 8, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {previewOpen ? '❚❚ Stop' : '▶ Beluister'}
          </button>
        ) : (
          <div style={{ fontSize: 11.5, color: '#B9B6AC', fontStyle: 'italic' }}>Geen audio geüpload</div>
        )}
        <button type="button" onClick={() => setEditing(true)} style={{ border: '1px solid #C9C5B9', background: '#FFFFFF', color: '#1D1D1D', cursor: 'pointer', fontSize: 12, borderRadius: 8, padding: '7px 12px' }}>
          Bewerken
        </button>
        <form action={removeTrackAction.bind(null, track.id)}>
          <button
            type="submit"
            onClick={confirmDelete(`Weet je zeker dat je "${track.title || 'deze track'}" wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`)}
            style={{ border: 'none', background: 'transparent', color: '#C2513F', cursor: 'pointer', fontSize: 12 }}
          >
            Verwijderen
          </button>
        </form>
      </div>
      {/* One click both opens and starts playback (AudioPlayer's autoPlay) —
          previously "Beluister" only revealed the player and still required
          a second press on its own play button, which read as one press
          too many. Metadata above stays visible the whole time either way. */}
      {previewOpen && track.audioUrl && <AudioPlayer src={track.audioUrl} autoPlay />}
    </div>
  );
}

function VoiceRow({ voice, allTags, onAddTag, selected, onToggleSelect, activePreviewId, onTogglePreview }) {
  const [editing, setEditing] = useState(false);
  const [editTags, setEditTags] = useState(voice.tags || []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // See TrackRow's identical comment above — preview-open state is shared
  // across the whole list via the parent, not local to this row.
  const previewOpen = activePreviewId === voice.id;

  // See TrackRow's identical handleEditSubmit above — same reason: a
  // replacement file has to reach Blob storage from the browser first.
  async function handleEditSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      const formData = new FormData(e.target);
      const audioFile = formData.get('audioFile');
      formData.delete('audioFile');
      if (audioFile && typeof audioFile !== 'string' && audioFile.size) {
        const { audioUrl, originalFilename } = await uploadFileToBlob(audioFile, 'voices');
        formData.set('audioUrl', audioUrl);
        formData.set('originalFilename', originalFilename);
      }
      await updateVoiceAction(voice.id, formData);
      setEditing(false);
    } catch (err) {
      setSaveError('Opslaan is niet gelukt — probeer het opnieuw.');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <form onSubmit={handleEditSubmit} style={{ ...cardStyle, background: '#FFFFFF', border: '1.5px solid #C9C5B9' }} className="tfa-lib-form">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr 1fr', gap: 8 }} className="tfa-lib-grid">
          <input name="name" type="text" defaultValue={voice.name} placeholder="Naam" required />
          <select name="gender" defaultValue={voice.gender}>
            <option value="vrouw">Vrouw</option>
            <option value="man">Man</option>
          </select>
          <select name="ageRange" defaultValue={voice.ageRange}>
            <option value="18-34">18–34</option>
            <option value="35-54">35–54</option>
            <option value="55+">55+</option>
          </select>
          <TagPicker allTags={allTags} selected={editTags} onChange={setEditTags} onAddTag={onAddTag} />
          <input name="fileId" type="text" defaultValue={voice.fileId} placeholder="File ID (optioneel)" />
        </div>
        <input type="hidden" name="tags" value={editTags.join(',')} readOnly />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <input name="audioFile" type="file" accept="audio/*" style={{ flex: 1, fontSize: 12.5 }} />
          <span style={{ fontSize: 11, color: '#8C8880', whiteSpace: 'nowrap' }}>
            {voice.audioUrl ? 'Laat leeg om huidige audio te behouden' : 'Nog geen audio geüpload'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            type="submit"
            className="btn-primary"
            disabled={saving}
            style={{ padding: '10px 16px', fontSize: 13, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8, opacity: saving ? 0.75 : 1, cursor: saving ? 'wait' : 'pointer' }}
          >
            {saving && (
              <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(29,29,29,.25)', borderTopColor: '#1D1D1D', display: 'inline-block', animation: 'tfa-spin .7s linear infinite' }} />
            )}
            {saving ? 'Bezig met opslaan…' : 'Opslaan'}
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={saving} className="ghost-btn" style={{ width: 'auto', padding: '10px 16px' }}>
            Annuleren
          </button>
        </div>
        {saveError && (
          <div style={{ marginTop: 10, background: '#FBF3F1', border: '1px solid #C2513F', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#C2513F' }}>
            {saveError}
          </div>
        )}
      </form>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div style={rowStyle}>
        <input type="checkbox" checked={selected} onChange={() => onToggleSelect(voice.id)} style={{ width: 16, height: 16, accentColor: '#E6C858', cursor: 'pointer', flex: 'none' }} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{voice.name}</div>
          <div style={{ fontSize: 12, color: '#8C8880' }}>
            {voice.gender} · {voice.ageRange} · {(voice.tags || []).join(', ')}{voice.fileId ? ` · ID: ${voice.fileId}` : ''}
          </div>
          {voice.originalFilename && (
            <div style={{ fontSize: 11, color: '#B9B6AC', fontStyle: 'italic', marginTop: 2 }}>
              Geüpload bestand: {voice.originalFilename}
            </div>
          )}
        </div>
        {voice.audioUrl ? (
          <button
            type="button"
            onClick={() => onTogglePreview(voice.id)}
            style={{
              border: '1px solid ' + (previewOpen ? '#E6C858' : '#C9C5B9'), background: previewOpen ? 'rgba(230,200,88,.14)' : '#FFFFFF',
              color: '#1D1D1D', cursor: 'pointer', fontSize: 12, borderRadius: 8, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {previewOpen ? '❚❚ Stop' : '▶ Beluister'}
          </button>
        ) : (
          <div style={{ fontSize: 11.5, color: '#B9B6AC', fontStyle: 'italic' }}>Geen audio geüpload</div>
        )}
        <button type="button" onClick={() => setEditing(true)} style={{ border: '1px solid #C9C5B9', background: '#FFFFFF', color: '#1D1D1D', cursor: 'pointer', fontSize: 12, borderRadius: 8, padding: '7px 12px' }}>
          Bewerken
        </button>
        <form action={removeVoiceAction.bind(null, voice.id)}>
          <button
            type="submit"
            onClick={confirmDelete(`Weet je zeker dat je "${voice.name || 'deze stem'}" wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`)}
            style={{ border: 'none', background: 'transparent', color: '#C2513F', cursor: 'pointer', fontSize: 12 }}
          >
            Verwijderen
          </button>
        </form>
      </div>
      {/* Same one-click play as TrackRow above — see its comment. Voice
          metadata (gender, age range, tags) stays fully visible in the row
          the whole time, autoPlay only affects the dropdown player itself. */}
      {previewOpen && voice.audioUrl && <AudioPlayer src={voice.audioUrl} autoPlay />}
    </div>
  );
}

// The browse/manage view: search, select-all, bulk delete, and the list
// itself — kept separate from AddZone so "adding new stuff" and "managing
// what's already there" read as two distinct tools instead of one long,
// blurred scroll.
function BrowsePanel({ kind, items, categories, allTags, onAddTag, selectedIds, setSelectedIds, onBulkDelete, bulkBusy, query, setQuery }) {
  // Only one row's preview plays at a time — opening another row's preview
  // (music or voice) stops whichever one was already playing, the same way
  // the client-facing voice/music picker steps behave.
  const [activePreviewId, setActivePreviewId] = useState(null);
  function toggleActivePreview(id) {
    setActivePreviewId((cur) => (cur === id ? null : id));
  }

  const filtered = items.filter((it) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const haystack = kind === 'music'
      ? [it.title, it.artist, it.category].join(' ')
      : [it.name, it.gender, it.ageRange, (it.tags || []).join(' ')].join(' ');
    return haystack.toLowerCase().includes(q);
  });
  const allVisibleSelected = filtered.length > 0 && filtered.every((it) => selectedIds.has(it.id));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((it) => next.delete(it.id));
      else filtered.forEach((it) => next.add(it.id));
      return next;
    });
  }

  function toggleOne(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={kind === 'music' ? 'Zoek op titel, artiest of categorie…' : 'Zoek op naam, tag, leeftijd…'}
          style={{ flex: '1 1 240px', minWidth: 200, border: '1px solid #C9C5B9', borderRadius: 8, padding: '9px 12px', fontSize: 13, background: '#FFFFFF' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#5C5850', cursor: filtered.length ? 'pointer' : 'default' }}>
          <input type="checkbox" checked={allVisibleSelected} disabled={!filtered.length} onChange={toggleSelectAll} style={{ width: 15, height: 15, accentColor: '#E6C858', cursor: 'pointer' }} />
          Selecteer alles
        </label>
        <span style={{ fontSize: 12.5, color: '#8C8880' }}>{selectedIds.size} geselecteerd</span>
        <button
          type="button"
          disabled={selectedIds.size === 0 || bulkBusy}
          onClick={onBulkDelete}
          style={{
            marginLeft: 'auto', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 600,
            background: selectedIds.size === 0 ? '#EAE7DE' : '#C2513F', color: selectedIds.size === 0 ? '#8C8880' : '#FFFFFF',
            cursor: selectedIds.size === 0 || bulkBusy ? 'not-allowed' : 'pointer', opacity: bulkBusy ? 0.7 : 1,
          }}
        >
          {bulkBusy ? 'Bezig met verwijderen…' : `Verwijder geselecteerde (${selectedIds.size})`}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((it) => (
          kind === 'music' ? (
            <TrackRow key={it.id} track={it} categories={categories} selected={selectedIds.has(it.id)} onToggleSelect={toggleOne} activePreviewId={activePreviewId} onTogglePreview={toggleActivePreview} />
          ) : (
            <VoiceRow key={it.id} voice={it} allTags={allTags} onAddTag={onAddTag} selected={selectedIds.has(it.id)} onToggleSelect={toggleOne} activePreviewId={activePreviewId} onTogglePreview={toggleActivePreview} />
          )
        ))}
        {filtered.length === 0 && items.length > 0 && (
          <div style={{ fontSize: 13, color: '#8C8880' }}>Niets gevonden voor "{query}".</div>
        )}
        {items.length === 0 && (
          <div style={{ fontSize: 13, color: '#8C8880' }}>
            {kind === 'music' ? 'Nog geen tracks — ga naar "Toevoegen" om er een paar toe te voegen.' : 'Nog geen stemmen — ga naar "Toevoegen" om er een paar toe te voegen.'}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LibraryClient({ tracks, voices, categories, defaultTags }) {
  const [tab, setTab] = useState('music');
  // Shared across both Muziek/Stemmen tabs: "Bibliotheek" (browse/manage
  // what's already there) is its own separate screen from "Toevoegen" (the
  // drag-and-drop import tool), instead of one long page mixing both.
  const [view, setView] = useState('browse');

  const [knownTags, setKnownTags] = useState(() => {
    const set = new Set(defaultTags || []);
    (voices || []).forEach((v) => (v.tags || []).forEach((t) => set.add(t)));
    return Array.from(set);
  });

  const [trackQuery, setTrackQuery] = useState('');
  const [voiceQuery, setVoiceQuery] = useState('');
  const [selectedTrackIds, setSelectedTrackIds] = useState(() => new Set());
  const [selectedVoiceIds, setSelectedVoiceIds] = useState(() => new Set());
  const [bulkBusyTracks, setBulkBusyTracks] = useState(false);
  const [bulkBusyVoices, setBulkBusyVoices] = useState(false);

  function addKnownTag(tag) {
    setKnownTags((cur) => (cur.includes(tag) ? cur : [...cur, tag]));
  }

  // Each staged file goes to Blob storage from the browser first (see
  // uploadFileToBlob above) — only the resulting URL, a plain string,
  // travels through the FormData handed to the server action.
  async function confirmTracksBulk(staged) {
    const formData = new FormData();
    formData.set('count', String(staged.length));
    for (let i = 0; i < staged.length; i++) {
      const it = staged[i];
      const { audioUrl, originalFilename } = await uploadFileToBlob(it.file, 'tracks');
      formData.set(`track_${i}_title`, it.title);
      formData.set(`track_${i}_artist`, it.artist);
      formData.set(`track_${i}_category`, it.category);
      formData.set(`track_${i}_fileId`, it.fileId);
      formData.set(`track_${i}_audioUrl`, audioUrl);
      formData.set(`track_${i}_originalFilename`, originalFilename);
    }
    await addTracksBulkAction(formData);
    setView('browse');
  }

  async function confirmVoicesBulk(staged) {
    const formData = new FormData();
    formData.set('count', String(staged.length));
    for (let i = 0; i < staged.length; i++) {
      const it = staged[i];
      const { audioUrl, originalFilename } = await uploadFileToBlob(it.file, 'voices');
      formData.set(`voice_${i}_name`, it.name);
      formData.set(`voice_${i}_gender`, it.gender);
      formData.set(`voice_${i}_ageRange`, it.ageRange);
      formData.set(`voice_${i}_tags`, (it.tags || []).join(','));
      formData.set(`voice_${i}_fileId`, it.fileId);
      formData.set(`voice_${i}_audioUrl`, audioUrl);
      formData.set(`voice_${i}_originalFilename`, originalFilename);
    }
    await addVoicesBulkAction(formData);
    setView('browse');
  }

  async function deleteSelectedTracks() {
    if (selectedTrackIds.size === 0) return;
    if (!window.confirm(`Weet je zeker dat je ${selectedTrackIds.size} track(s) wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    setBulkBusyTracks(true);
    try {
      const formData = new FormData();
      selectedTrackIds.forEach((id) => formData.append('id', id));
      await removeTracksBulkAction(formData);
      setSelectedTrackIds(new Set());
    } finally {
      setBulkBusyTracks(false);
    }
  }

  async function deleteSelectedVoices() {
    if (selectedVoiceIds.size === 0) return;
    if (!window.confirm(`Weet je zeker dat je ${selectedVoiceIds.size} stem(men) wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    setBulkBusyVoices(true);
    try {
      const formData = new FormData();
      selectedVoiceIds.forEach((id) => formData.append('id', id));
      await removeVoicesBulkAction(formData);
      setSelectedVoiceIds(new Set());
    } finally {
      setBulkBusyVoices(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => { setTab('music'); setView('browse'); }}
          style={{ border: 'none', borderRadius: 999, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: tab === 'music' ? '#1D1D1D' : '#FFFFFF', color: tab === 'music' ? '#FFFFFF' : '#5C5850' }}
        >
          Muziek <span style={{ opacity: 0.65, fontWeight: 500 }}>({tracks.length})</span>
        </button>
        <button
          type="button"
          onClick={() => { setTab('voice'); setView('browse'); }}
          style={{ border: 'none', borderRadius: 999, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: tab === 'voice' ? '#1D1D1D' : '#FFFFFF', color: tab === 'voice' ? '#FFFFFF' : '#5C5850' }}
        >
          Stemmen <span style={{ opacity: 0.65, fontWeight: 500 }}>({voices.length})</span>
        </button>

        {/* One visible, obvious action to add new music/voices — replacing the
            old "Bibliotheek / + Toevoegen" sub-tabs, which just duplicated the
            "library" concept the whole page already is. Opening a tab now
            drops you straight into its library; this button is the only way
            to get to the add-tool, and it flips to a clear way back. */}
        <button
          type="button"
          onClick={() => setView((v) => (v === 'add' ? 'browse' : 'add'))}
          className="btn-primary tfa-btn-glow"
          style={{ marginLeft: 'auto', padding: '9px 18px', fontSize: 13 }}
        >
          {view === 'add' ? '← Terug naar bibliotheek' : `+ ${tab === 'music' ? 'Muziek' : 'Stem'} toevoegen`}
        </button>
      </div>

      {tab === 'music' ? (
        view === 'add' ? (
          <AddZone kind="music" categories={categories} onConfirm={confirmTracksBulk} />
        ) : (
          <BrowsePanel
            kind="music"
            items={tracks}
            categories={categories}
            selectedIds={selectedTrackIds}
            setSelectedIds={setSelectedTrackIds}
            onBulkDelete={deleteSelectedTracks}
            bulkBusy={bulkBusyTracks}
            query={trackQuery}
            setQuery={setTrackQuery}
          />
        )
      ) : (
        view === 'add' ? (
          <AddZone kind="voice" defaultGender="vrouw" defaultAgeRange="35-54" onConfirm={confirmVoicesBulk} allTags={knownTags} onAddTag={addKnownTag} />
        ) : (
          <BrowsePanel
            kind="voice"
            items={voices}
            allTags={knownTags}
            onAddTag={addKnownTag}
            selectedIds={selectedVoiceIds}
            setSelectedIds={setSelectedVoiceIds}
            onBulkDelete={deleteSelectedVoices}
            bulkBusy={bulkBusyVoices}
            query={voiceQuery}
            setQuery={setVoiceQuery}
          />
        )
      )}

      <style>{`
        .tfa-lib-form input, .tfa-lib-form select {
          border: 1px solid #C9C5B9; border-radius: 8px; padding: 9px 10px; font-size: 13px; background: #FFFFFF;
        }
        @media (max-width: 720px) {
          .tfa-lib-grid { grid-template-columns: 1fr !important; }
        }
        @keyframes tfa-spin {
          to { transform: rotate(360deg); }
        }
        .tfa-btn-glow { transition: filter .12s ease; }
        .tfa-btn-glow:hover { filter: brightness(1.08); }
        .tfa-staged-remove { transition: background .12s ease, color .12s ease; }
        .tfa-staged-remove:hover { background: rgba(194,81,63,.12); color: #C2513F; }
      `}</style>
    </div>
  );
}
