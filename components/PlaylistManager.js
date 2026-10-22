'use client';

import { useState } from 'react';
import { addPlaylistAction, updatePlaylistAction, movePlaylistAction, removePlaylistAction } from '../app/dashboard/library/actions';

const ERRORS = {
  empty: 'Geef de playlist een naam.',
  duplicate: 'Er bestaat al een playlist met die naam.',
  not_empty: 'Deze playlist bevat nog tracks. Verberg hem in plaats van hem te verwijderen, of verplaats de tracks eerst.',
  not_found: 'Playlist niet gevonden. Ververs de pagina.',
};

const btn = { border: '1px solid #D8D4C8', background: '#fff', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' };

// Add seasonal playlists (e.g. Kerst), hide them when the season is over and
// set the order clients see them in. Hidden playlists, and the tracks in
// them, are not shown to clients but stay in the library.
export default function PlaylistManager({ playlists, trackCounts }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ name: '', description: '' });

  async function run(label, fn) {
    setBusy(label);
    setError('');
    try {
      const out = await fn();
      if (out && out.error) { setError(ERRORS[out.error] || 'Dat is niet gelukt.'); return false; }
      return true;
    } catch (e) {
      setError('Dat is niet gelukt. Probeer het opnieuw.');
      return false;
    } finally {
      setBusy('');
    }
  }

  async function add(e) {
    e.preventDefault();
    if (await run('add', () => addPlaylistAction(name, description))) { setName(''); setDescription(''); }
  }

  const hiddenCount = playlists.filter((p) => p.hidden).length;

  return (
    <details style={{ background: '#FFFFFF', border: '1px solid #E3E0D5', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
      <summary style={{ cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}>
        Playlists beheren <span style={{ fontWeight: 500, color: '#8C8880' }}>({playlists.length}{hiddenCount ? ', ' + hiddenCount + ' verborgen' : ''})</span>
      </summary>
      <div style={{ fontSize: 12, color: '#5C5850', lineHeight: 1.5, margin: '8px 0 12px' }}>
        De volgorde hieronder is de volgorde waarin klanten de playlists zien. Een verborgen playlist (bijvoorbeeld Kerst buiten het seizoen) verdwijnt voor klanten, maar blijft hier staan.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {playlists.map((p, i) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid #F0EEE6', flexWrap: 'wrap', opacity: p.hidden ? 0.65 : 1 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" aria-label="Omhoog" disabled={!!busy || i === 0} onClick={() => run('move', () => movePlaylistAction(p.id, -1))} style={{ ...btn, padding: '4px 8px', opacity: i === 0 ? 0.35 : 1 }}>↑</button>
              <button type="button" aria-label="Omlaag" disabled={!!busy || i === playlists.length - 1} onClick={() => run('move', () => movePlaylistAction(p.id, 1))} style={{ ...btn, padding: '4px 8px', opacity: i === playlists.length - 1 ? 0.35 : 1 }}>↓</button>
            </div>
            {editing === p.id ? (
              <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input value={draft.name} maxLength={60} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} style={{ border: '1px solid #C9C5B9', borderRadius: 6, padding: '7px 9px', fontSize: 13 }} />
                <input value={draft.description} maxLength={200} placeholder="Korte omschrijving voor de klant" onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} style={{ border: '1px solid #C9C5B9', borderRadius: 6, padding: '7px 9px', fontSize: 13 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" disabled={!!busy} onClick={async () => { if (await run('save', () => updatePlaylistAction(p.id, draft))) setEditing(null); }} className="btn-primary" style={{ padding: '6px 14px', flex: 'none', fontSize: 12.5 }}>Opslaan</button>
                  <button type="button" onClick={() => setEditing(null)} style={btn}>Annuleren</button>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {p.name}
                  {p.hidden && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#8C6D1F', background: '#F3E6C9', borderRadius: 999, padding: '2px 8px' }}>Verborgen voor klanten</span>}
                </div>
                <div style={{ fontSize: 12, color: '#8C8880' }}>{(trackCounts[p.name] || 0)} track{(trackCounts[p.name] || 0) === 1 ? '' : 's'}{p.description ? ' · ' + p.description : ''}</div>
              </div>
            )}
            {editing !== p.id && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" disabled={!!busy} onClick={() => run('hide', () => updatePlaylistAction(p.id, { hidden: !p.hidden }))} style={btn}>{p.hidden ? 'Tonen' : 'Verbergen'}</button>
                <button type="button" disabled={!!busy} onClick={() => { setEditing(p.id); setDraft({ name: p.name, description: p.description }); }} style={btn}>Bewerken</button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => { if (window.confirm('Playlist "' + p.name + '" verwijderen?')) run('del', () => removePlaylistAction(p.id)); }}
                  style={{ ...btn, color: '#C2513F' }}
                >
                  Verwijderen
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={add} style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #E3E0D5', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Nieuwe playlist, bijv. Kerst" style={{ flex: '1 1 200px', border: '1px solid #C9C5B9', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
        <input value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} placeholder="Omschrijving (optioneel)" style={{ flex: '2 1 260px', border: '1px solid #C9C5B9', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
        <button type="submit" disabled={!!busy || !name.trim()} className="btn-primary" style={{ padding: '8px 16px', flex: 'none', fontSize: 13 }}>{busy === 'add' ? 'Bezig…' : '+ Playlist toevoegen'}</button>
      </form>
      {error && <div style={{ marginTop: 8, fontSize: 12.5, color: '#C2513F', fontWeight: 600 }}>{error}</div>}
    </details>
  );
}
