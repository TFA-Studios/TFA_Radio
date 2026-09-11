'use client';

import { useState } from 'react';

const cardStyle = { background: '#FFFFFF', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 6px rgba(29,29,29,.04)' };

function StatusBadge({ status }) {
  const live = status === 'live';
  return (
    <span
      style={{
        fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
        color: live ? '#1D7A46' : '#5C5850', background: live ? 'rgba(29,122,70,.12)' : 'rgba(92,88,80,.1)',
      }}
    >
      {live ? 'Live' : 'Inactief'}
    </span>
  );
}

export default function PromptVersionsClient({ initialVersions }) {
  const [versions, setVersions] = useState(initialVersions);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [content, setContent] = useState((initialVersions.find((v) => v.status === 'live') || {}).content || '');
  const [busyId, setBusyId] = useState(null); // 'new' while creating, or a version id while activating/deactivating/saving
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [editContent, setEditContent] = useState('');

  async function refresh() {
    try {
      const res = await fetch('/api/dashboard/prompt-versions');
      if (res.ok) setVersions(await res.json());
    } catch (e) {}
  }

  async function createVersion(e) {
    e.preventDefault();
    if (!content.trim()) return;
    setBusyId('new');
    setError('');
    try {
      const res = await fetch('/api/dashboard/prompt-versions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label, content }),
      });
      if (!res.ok) throw new Error('Opslaan mislukt');
      await refresh();
      setShowForm(false);
      setLabel('');
    } catch (err) {
      setError('Kon de nieuwe versie niet opslaan. Probeer het opnieuw.');
    } finally {
      setBusyId(null);
    }
  }

  async function setAction(id, action) {
    setBusyId(id);
    setError('');
    try {
      const res = await fetch(`/api/dashboard/prompt-versions/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error('Actie mislukt');
      await refresh();
    } catch (err) {
      setError('Actie is niet gelukt. Probeer het opnieuw.');
    } finally {
      setBusyId(null);
    }
  }

  const liveVersion = versions.find((v) => v.status === 'live');

  function startEdit(v) {
    setEditingId(v.id);
    setEditLabel(v.label);
    setEditContent(v.content);
  }
  function cancelEdit() {
    setEditingId(null);
  }
  async function deleteVersion(v) {
    if (!window.confirm(`Weet je zeker dat je "${v.label || 'deze versie'}" (v${v.version || '1.0'}) wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    setBusyId(v.id);
    setError('');
    try {
      const res = await fetch(`/api/dashboard/prompt-versions/${v.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Verwijderen mislukt');
      await refresh();
    } catch (err) {
      setError('Kon de versie niet verwijderen. Probeer het opnieuw.');
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit(id) {
    if (!editContent.trim()) return;
    setBusyId(id);
    setError('');
    try {
      const res = await fetch(`/api/dashboard/prompt-versions/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'update', label: editLabel, content: editContent }),
      });
      if (!res.ok) throw new Error('Bewerken mislukt');
      await refresh();
      setEditingId(null);
    } catch (err) {
      setError('Kon de wijzigingen niet opslaan. Probeer het opnieuw.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {error && (
        <div style={{ background: '#FBF3F1', border: '1px solid #C2513F', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: '#C2513F', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {!liveVersion && (
        <div style={{ background: '#FBF9EC', border: '1px solid #EAE3C4', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: '#383209', marginBottom: 16 }}>
          Er is momenteel geen live versie — scriptgeneratie gebruikt de ingebouwde standaardinstructies totdat je een versie live zet.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => { setShowForm((s) => !s); if (!showForm) setContent((liveVersion || {}).content || ''); }}
          className="btn-primary"
          style={{ padding: '9px 16px', fontSize: 13 }}
        >
          {showForm ? 'Annuleren' : '+ Nieuwe versie'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={createVersion} style={{ ...cardStyle, marginBottom: 18, border: '1.5px solid #EAE3C4' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Nieuwe promptversie</div>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Naam (bijv. Zakelijker toon)"
            style={{ width: '100%', border: '1px solid #C9C5B9', borderRadius: 8, padding: '9px 10px', fontSize: 13, marginBottom: 10 }}
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="De instructies die Claude vertellen hoe te schrijven..."
            style={{ width: '100%', minHeight: 220, border: '1px solid #C9C5B9', borderRadius: 8, padding: '10px 12px', fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit' }}
          />
          <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="submit" disabled={busyId === 'new' || !content.trim()} className="btn-primary" style={{ padding: '9px 16px', fontSize: 13, opacity: busyId === 'new' ? 0.7 : 1 }}>
              {busyId === 'new' ? 'Bezig...' : 'Opslaan als nieuwe (inactieve) versie'}
            </button>
            <span style={{ fontSize: 11.5, color: '#8C8880' }}>Wordt niet meteen live — dat doe je hieronder.</span>
          </div>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {versions.map((v) => {
          const isEditing = editingId === v.id;
          return (
            <div key={v.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 160 }}>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      placeholder="Naam"
                      style={{ fontSize: 14, fontWeight: 600, border: '1px solid #C9C5B9', borderRadius: 6, padding: '4px 8px', flex: 1, minWidth: 0 }}
                    />
                  ) : (
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{v.label}</span>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#8C6D1F', background: 'rgba(230,200,88,.18)', borderRadius: 999, padding: '2px 8px' }}>v{v.version || '1.0'}</span>
                  <StatusBadge status={v.status} />
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {!isEditing && <span style={{ fontSize: 11, color: '#8C8880' }}>{new Date(v.createdAt).toLocaleString('nl-NL')}</span>}
                  {isEditing ? (
                    <>
                      <button type="button" disabled={busyId === v.id} onClick={cancelEdit} className="tfa-btn-ghost" style={{ border: '1px solid #C9C5B9', borderRadius: 8, background: '#FFFFFF', padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
                        Annuleren
                      </button>
                      <button type="button" disabled={busyId === v.id || !editContent.trim()} onClick={() => saveEdit(v.id)} className="btn-primary tfa-btn-glow" style={{ padding: '6px 12px', fontSize: 12, opacity: busyId === v.id ? 0.7 : 1 }}>
                        {busyId === v.id ? 'Bezig...' : 'Opslaan als nieuwe versie'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" disabled={busyId === v.id} onClick={() => startEdit(v)} className="tfa-btn-ghost" style={{ border: '1px solid #C9C5B9', borderRadius: 8, background: '#FFFFFF', padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
                        Bewerken
                      </button>
                      {v.status === 'live' ? (
                        <button type="button" disabled={busyId === v.id} onClick={() => setAction(v.id, 'deactivate')} className="tfa-btn-ghost" style={{ border: '1px solid #C9C5B9', borderRadius: 8, background: '#FFFFFF', padding: '6px 12px', fontSize: 12, cursor: 'pointer', opacity: busyId === v.id ? 0.6 : 1 }}>
                          {busyId === v.id ? 'Bezig...' : 'Deactiveren'}
                        </button>
                      ) : (
                        <button type="button" disabled={busyId === v.id} onClick={() => setAction(v.id, 'activate')} className="btn-primary tfa-btn-glow" style={{ padding: '6px 12px', fontSize: 12, opacity: busyId === v.id ? 0.7 : 1 }}>
                          {busyId === v.id ? 'Bezig...' : 'Maak live'}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === v.id}
                        onClick={() => deleteVersion(v)}
                        className="tfa-btn-ghost"
                        style={{ border: '1px solid #C9C5B9', borderRadius: 8, background: '#FFFFFF', padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: '#C2513F', opacity: busyId === v.id ? 0.6 : 1 }}
                      >
                        Verwijderen
                      </button>
                    </>
                  )}
                </div>
              </div>
              {isEditing ? (
                <>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    style={{ marginTop: 10, width: '100%', minHeight: 220, border: '1px solid #C9C5B9', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.55, fontFamily: 'inherit' }}
                  />
                  <div style={{ fontSize: 11.5, color: '#8C8880', marginTop: 6 }}>
                    Opslaan maakt hier een nieuwe versie van (v{(() => {
                      const maxMinor = versions.reduce((m, ver) => Math.max(m, parseInt((ver.version || '1.0').split('.')[1] || '0', 10)), 0);
                      return '1.' + (maxMinor + 1);
                    })()}) — v{v.version || '1.0'} zelf blijft ongewijzigd bewaard.
                  </div>
                </>
              ) : (
                <pre style={{ marginTop: 10, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12.5, lineHeight: 1.55, color: '#383209', background: '#FBF9EC', border: '1px solid #EAE3C4', borderRadius: 8, padding: '10px 12px', maxHeight: 160, overflowY: 'auto' }}>
                  {v.content}
                </pre>
              )}
            </div>
          );
        })}
        {versions.length === 0 && <div style={{ fontSize: 13, color: '#8C8880' }}>Nog geen versies.</div>}
      </div>

      <style jsx>{`
        .tfa-btn-ghost { transition: background .12s ease, border-color .12s ease; }
        .tfa-btn-ghost:hover:not(:disabled) { background: #F3F1EA; border-color: #B9B6AC; }
        .tfa-btn-glow { transition: filter .12s ease; }
        .tfa-btn-glow:hover:not(:disabled) { filter: brightness(1.08); }
      `}</style>
    </div>
  );
}
