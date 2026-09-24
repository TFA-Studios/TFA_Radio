'use client';

import { useState } from 'react';

// Manages the dashboard's Agencies list — see app/dashboard/agencies/page.js
// and the agencies table in lib/db.js. Deliberately the same shape as
// PromptVersionsClient.js (a simple add-form + list, no separate edit
// modal): add/edit/delete, nothing fancier, since this is expected to be
// touched rarely (a handful of agency partners, added as they come on).
const cardStyle = { background: '#FFFFFF', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 6px rgba(29,29,29,.04)' };
const inputStyle = {
  fontSize: 13.5, padding: '9px 11px', borderRadius: 8, border: '1px solid #D8D4C8',
  background: '#fff', color: '#1D1D1D', width: '100%', boxSizing: 'border-box',
};
const labelStyle = { fontSize: 11.5, fontWeight: 600, color: '#5C5850', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4, display: 'block' };

export default function AgenciesClient({ initialAgencies }) {
  const [agencies, setAgencies] = useState(initialAgencies);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [busyId, setBusyId] = useState(null); // 'new' while creating, or an agency id while saving/deleting
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [editContactEmail, setEditContactEmail] = useState('');

  async function refresh() {
    try {
      const res = await fetch('/api/dashboard/agencies');
      if (res.ok) setAgencies(await res.json());
    } catch (e) {}
  }

  async function createAgency(e) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    setBusyId('new');
    setError('');
    try {
      const res = await fetch('/api/dashboard/agencies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, name, contactEmail }),
      });
      if (res.status === 409) throw new Error('Deze code is al in gebruik door een andere agency.');
      if (!res.ok) throw new Error('Opslaan mislukt');
      await refresh();
      setShowForm(false);
      setCode('');
      setName('');
      setContactEmail('');
    } catch (err) {
      setError(err.message || 'Kon de agency niet opslaan. Probeer het opnieuw.');
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(agency) {
    setEditingId(agency.id);
    setEditCode(agency.code);
    setEditName(agency.name);
    setEditContactEmail(agency.contactEmail || '');
  }

  async function saveEdit(id) {
    setBusyId(id);
    setError('');
    try {
      const res = await fetch(`/api/dashboard/agencies/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: editCode, name: editName, contactEmail: editContactEmail }),
      });
      if (!res.ok) throw new Error('Opslaan mislukt');
      await refresh();
      setEditingId(null);
    } catch (err) {
      setError('Kon de wijziging niet opslaan. Probeer het opnieuw.');
    } finally {
      setBusyId(null);
    }
  }

  async function removeAgency(id) {
    setBusyId(id);
    setError('');
    try {
      const res = await fetch(`/api/dashboard/agencies/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Verwijderen mislukt');
      await refresh();
    } catch (err) {
      setError('Kon de agency niet verwijderen. Probeer het opnieuw.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    // No maxWidth cap here (unlike the intro paragraph in
    // app/dashboard/agencies/page.js, which keeps one deliberately for
    // readable line length) — this list/cards should fill the same full
    // width as every other dashboard list (PromptVersionsClient, the
    // briefs table, ...). A leftover 640px cap here used to leave the
    // whole tab huddled in a narrow left column with the rest of the
    // page's width sitting empty on wide screens.
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && (
        <div style={{ background: '#FBF3F1', border: '1px solid #C2513F', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#C2513F' }}>
          {error}
        </div>
      )}

      {agencies.length === 0 && !showForm && (
        <div style={{ ...cardStyle, fontSize: 13, color: '#8C8880' }}>
          Nog geen agencies toegevoegd — elke brief valt tot dan onder &quot;Advision Media&quot;.
        </div>
      )}

      {agencies.map((agency) => (
        <div key={agency.id} style={cardStyle}>
          {editingId === agency.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* auto-fit grid, not a fixed 2/3-column count — with the
                  640px cap on the whole tab gone, the card itself can now
                  be very wide, and three stacked single-column inputs at
                  that width look just as "empty on the right" as the old
                  narrow column did. minmax(200px, 1fr) lets the three
                  fields sit side by side once there's room, and wrap back
                  down on a narrower screen, with no separate breakpoint
                  needed. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Toegangscode</label>
                  <input style={inputStyle} value={editCode} onChange={(e) => setEditCode(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Naam</label>
                  <input style={inputStyle} value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Contact-e-mailadres</label>
                  <input style={inputStyle} value={editContactEmail} onChange={(e) => setEditContactEmail(e.target.value)} placeholder="bijv. delivery@advisionmedia.nl" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busyId === agency.id}
                  onClick={() => saveEdit(agency.id)}
                  style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, opacity: busyId === agency.id ? 0.6 : 1 }}
                >
                  Opslaan
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, border: '1px solid #D8D4C8', background: 'none', color: '#5C5850' }}
                >
                  Annuleren
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: '#1D1D1D' }}>{agency.name}</div>
                <div style={{ fontSize: 12.5, color: '#8C8880', marginTop: 2 }}>
                  Code: <code>{agency.code}</code>
                  {agency.contactEmail ? ' · ' + agency.contactEmail : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => startEdit(agency)}
                  style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12.5, border: '1px solid #D8D4C8', background: 'none', color: '#5C5850' }}
                >
                  Bewerken
                </button>
                <button
                  type="button"
                  disabled={busyId === agency.id}
                  onClick={() => removeAgency(agency.id)}
                  style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12.5, border: '1px solid #E3B0A8', background: 'none', color: '#C2513F', opacity: busyId === agency.id ? 0.6 : 1 }}
                >
                  Verwijderen
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {showForm ? (
        <form onSubmit={createAgency} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <div>
              <label style={labelStyle}>Toegangscode</label>
              <input style={inputStyle} value={code} onChange={(e) => setCode(e.target.value)} placeholder="bijv. TFA2026ADVISION" autoFocus />
            </div>
            <div>
              <label style={labelStyle}>Naam</label>
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="bijv. Advision Media" />
            </div>
            <div>
              <label style={labelStyle}>Contact-e-mailadres</label>
              <input style={inputStyle} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="bijv. delivery@advisionmedia.nl" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              className="btn-primary"
              disabled={busyId === 'new' || !code.trim() || !name.trim()}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, opacity: busyId === 'new' || !code.trim() || !name.trim() ? 0.6 : 1 }}
            >
              {busyId === 'new' ? 'Bezig…' : 'Toevoegen'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, border: '1px solid #D8D4C8', background: 'none', color: '#5C5850' }}
            >
              Annuleren
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="btn-primary"
          style={{ alignSelf: 'flex-start', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}
        >
          + Nieuwe agency
        </button>
      )}
    </div>
  );
}
