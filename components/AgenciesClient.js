'use client';

import { useState } from 'react';
import { HIDEABLE, normalizeFormConfig } from '../lib/formProfile';

// Manages the dashboard's Agencies list — see app/dashboard/agencies/page.js
// and the agencies table in lib/db.js. Deliberately the same shape as
// PromptVersionsClient.js (a simple add-form + list, no separate edit
// modal): add/edit/delete, nothing fancier, since this is expected to be
// touched rarely (a handful of agency partners, added as they come on).
const cardStyle = { background: '#FFFFFF', borderRadius: 12, padding: '16px 18px', border: '1px solid #D2CFC8', boxShadow: '0 1px 8px rgba(29,29,29,.07)' };
const inputStyle = {
  fontSize: 13.5, padding: '9px 11px', borderRadius: 8, border: '1px solid #BDB9AE',
  background: '#fff', color: '#1D1D1D', width: '100%', boxSizing: 'border-box',
};
const labelStyle = { fontSize: 12.5, fontWeight: 500, color: '#1D1D1D', marginBottom: 5, display: 'block' };
const hintStyle = { fontSize: 12, color: '#5C5850', marginTop: 5, lineHeight: 1.5 };
const ghostBtn = { padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 500, border: '1px solid #BDB9AE', background: '#fff', color: '#1D1D1D', cursor: 'pointer' };

// One titled block of the edit form. The form used to be one long wall of
// fields; grouping them by purpose (basics, access, script, branding, form)
// makes it clear where to look for what.
function Section({ title, hint, children }) {
  return (
    <section style={{ background: '#FBF9EC', border: '1px solid #EAE3C4', borderLeft: '4px solid #E6C858', borderRadius: '4px 12px 12px 4px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 600 }}>{title}</h3>
        {hint && <div style={{ ...hintStyle, marginTop: 2 }}>{hint}</div>}
      </div>
      {children}
    </section>
  );
}

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
  const [editUserEmails, setEditUserEmails] = useState('');
  const [editScriptMode, setEditScriptMode] = useState('copywriter');
  const [editFormKey, setEditFormKey] = useState('standard');
  const [editLogoDark, setEditLogoDark] = useState('');
  const [editLogoLight, setEditLogoLight] = useState('');
  const [editLogoIcon, setEditLogoIcon] = useState('');
  const [editExtraCodes, setEditExtraCodes] = useState('');
  const [uploading, setUploading] = useState('');
  const [editHide, setEditHide] = useState([]);
  const [editQuestions, setEditQuestions] = useState([]);

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
    setEditUserEmails(agency.userEmails || '');
    setEditScriptMode(agency.scriptMode || 'copywriter');
    setEditFormKey(agency.formKey || 'standard');
    const cfg = normalizeFormConfig(agency.formConfig);
    setEditLogoDark(agency.logoDark || '');
    setEditLogoLight(agency.logoLight || '');
    setEditLogoIcon(agency.logoIcon || '');
    setEditExtraCodes((agency.extraCodes || '').split(/[,;\n]+/).map((c) => c.trim()).filter(Boolean).join('\n'));
    setEditHide(cfg.hide);
    setEditQuestions(cfg.extraQuestions.map((q) => ({ ...q, options: (q.options || []).join(', ') })));
  }

  async function saveEdit(id) {
    setBusyId(id);
    setError('');
    try {
      const res = await fetch(`/api/dashboard/agencies/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: editCode, name: editName, contactEmail: editContactEmail, userEmails: editUserEmails, scriptMode: editScriptMode, formKey: editFormKey, logoDark: editLogoDark, logoLight: editLogoLight, logoIcon: editLogoIcon, extraCodes: editExtraCodes, formConfig: { hide: editHide, extraQuestions: editQuestions } }),
      });
      if (res.status === 409) { setError('Een van deze codes wordt al door een ander agentschap gebruikt.'); return; }
      if (!res.ok) throw new Error('Opslaan mislukt');
      await refresh();
      setEditingId(null);
    } catch (err) {
      setError('Kon de wijziging niet opslaan. Probeer het opnieuw.');
    } finally {
      setBusyId(null);
    }
  }

  async function uploadLogo(kind, file, setter) {
    if (!file) return;
    setUploading(kind);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const res = await fetch('/api/dashboard/agencies/logo', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.status === 501) { setError('Uploaden staat nog niet aan (geen Blob-opslag). Plak een https-link naar het bestand.'); return; }
      if (!res.ok) { setError(data.error === 'too_large' ? 'Bestand is te groot (max 2 MB).' : data.error === 'unsupported_type' ? 'Gebruik PNG, WebP, JPG of SVG.' : 'Uploaden mislukt.'); return; }
      setter(data.url);
    } catch (e) {
      setError('Uploaden mislukt.');
    } finally {
      setUploading('');
    }
  }

  function logoField(label, kind, value, setter, dark) {
    return (
      <div>
        <label style={labelStyle}>{label}</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 64, height: 40, flexShrink: 0, borderRadius: 8, border: '1px solid #BDB9AE', background: dark ? '#1D1D1D' : '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {value ? <img src={value} alt="" style={{ maxWidth: '90%', maxHeight: '90%' }} /> : <span style={{ fontSize: 11, color: '#5C5850' }}>geen</span>}
          </div>
          <input style={inputStyle} value={value} onChange={(e) => setter(e.target.value)} placeholder="/agency-logos/… of https://…" />
        </div>
        <label style={{ ...ghostBtn, display: 'inline-block', marginTop: 8, padding: '5px 12px', fontSize: 12 }}>
          {uploading === kind ? 'Uploaden…' : 'Bestand uploaden'}
          <input type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" style={{ display: 'none' }} onChange={(e) => { uploadLogo(kind, e.target.files && e.target.files[0], setter); e.target.value = ''; }} />
        </label>
      </div>
    );
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>{agency.name} bewerken</h2>
              {/* auto-fit grid, not a fixed 2/3-column count — with the
                  640px cap on the whole tab gone, the card itself can now
                  be very wide, and three stacked single-column inputs at
                  that width look just as "empty on the right" as the old
                  narrow column did. minmax(200px, 1fr) lets the three
                  fields sit side by side once there's room, and wrap back
                  down on a narrower screen, with no separate breakpoint
                  needed. */}
              <Section title="Basis" hint="Hoe deze agency heet en welke codes bij haar horen.">
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
              <div>
                <label style={labelStyle}>Extra toegangscodes (één per regel)</label>
                <textarea
                  style={{ ...inputStyle, minHeight: 56, fontFamily: 'inherit' }}
                  value={editExtraCodes}
                  onChange={(e) => setEditExtraCodes(e.target.value)}
                  placeholder={'bijv. TFA 2026 Advision B'}
                />
                <div style={hintStyle}>
                  Elke code hierboven (hoofdcode + extra codes) opent dezelfde agency met hetzelfde logo en formulier. Op de brief wordt bewaard welke code is gebruikt.
                </div>
              </div>
              </Section>
              <Section title="Toegang" hint="Wie van dit agentschap mag inloggen op het dashboard.">
              <div>
                <div>
                  <label style={labelStyle}>Logins van dit agentschap (e-mailadressen)</label>
                  <textarea
                    style={{ ...inputStyle, minHeight: 56, fontFamily: 'inherit' }}
                    value={editUserEmails}
                    onChange={(e) => setEditUserEmails(e.target.value)}
                    placeholder="bijv. jan@advisionmedia.nl, els@advisionmedia.nl"
                  />
                  <div style={hintStyle}>
                    Deze personen zien na het inloggen alleen de briefs van hun eigen klanten (alleen lezen). Nodig ze eerst uit in Clerk, met dit e-mailadres.
                  </div>
                </div>
              </div>
              </Section>
              <Section title="Script en formulier" hint="Wie het script schrijft en welk formulier de klanten zien.">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Scripts</label>
                  <select style={inputStyle} value={editScriptMode} onChange={(e) => setEditScriptMode(e.target.value)}>
                    <option value="copywriter">TFA schrijft en geeft vrij</option>
                    <option value="provided">Agentschap levert eigen script</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Formulier</label>
                  <select style={inputStyle} value={editFormKey} onChange={(e) => setEditFormKey(e.target.value)}>
                    <option value="standard">Standaard</option>
                  </select>
                </div>
              </div>
              </Section>
              <Section title="Branding" hint="Logo's voor de samenwerking op het formulier, de statuspagina's en de e-mails.">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                {logoField('Logo voor donkere achtergrond', 'dark', editLogoDark, setEditLogoDark, true)}
                {logoField('Logo voor lichte achtergrond', 'light', editLogoLight, setEditLogoLight, false)}
                {logoField('Icoon (achtergrond-watermerk)', 'icon', editLogoIcon, setEditLogoIcon, false)}
                <div style={{ gridColumn: '1 / -1', fontSize: 11.5, color: '#8C8880', lineHeight: 1.5 }}>
                  Met een logo zien de klanten van dit agentschap &ldquo;in samenwerking met&rdquo; + het logo in het formulier, de statuspagina&apos;s en de e-mails. Het icoon komt als heel vage achtergrond (±4%) achter het formulier van deze klanten. Leeg laten = geen logo/icoon.
                </div>
              </div>
              </Section>
              <Section title="Formulier aanpassen" hint="Vragen verbergen of extra vragen toevoegen voor de klanten van dit agentschap.">
              <div>
                <label style={labelStyle}>Vragen die dit agentschap niet nodig heeft</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
                  {Object.keys(HIDEABLE).map((k) => (
                    <label key={k} style={{ fontSize: 13, color: '#1D1D1D', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editHide.includes(k)}
                        onChange={(e) => setEditHide((cur) => (e.target.checked ? cur.concat(k) : cur.filter((x) => x !== k)))}
                      />
                      {HIDEABLE[k].label} <span style={{ color: '#8C8880', fontSize: 11.5 }}>({HIDEABLE[k].step})</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Extra vragen (onderaan stap 3 &ldquo;Brief&rdquo;)</label>
                {editQuestions.map((q, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) 120px minmax(120px, 2fr) auto auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <input style={inputStyle} value={q.label} placeholder="De vraag" onChange={(e) => setEditQuestions((cur) => cur.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                    <select style={inputStyle} value={q.type} onChange={(e) => setEditQuestions((cur) => cur.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}>
                      <option value="text">Kort antwoord</option>
                      <option value="longtext">Lang antwoord</option>
                      <option value="choice">Keuze</option>
                    </select>
                    <input style={{ ...inputStyle, opacity: q.type === 'choice' ? 1 : 0.4 }} disabled={q.type !== 'choice'} value={q.options || ''} placeholder="Opties, gescheiden door komma" onChange={(e) => setEditQuestions((cur) => cur.map((x, j) => (j === i ? { ...x, options: e.target.value } : x)))} />
                    <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={!!q.required} onChange={(e) => setEditQuestions((cur) => cur.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} /> verplicht
                    </label>
                    <button type="button" onClick={() => setEditQuestions((cur) => cur.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: '#C2513F', fontSize: 16, cursor: 'pointer' }} aria-label="Vraag verwijderen">✕</button>
                  </div>
                ))}
                {editQuestions.length < 10 && (
                  <button type="button" onClick={() => setEditQuestions((cur) => cur.concat({ label: '', type: 'text', options: '', required: false }))} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12.5, border: '1px solid #D8D4C8', background: 'none', color: '#5C5850', cursor: 'pointer' }}>
                    + Vraag toevoegen
                  </button>
                )}
              </div>
              </Section>
              <div style={{ display: 'flex', gap: 8, position: 'sticky', bottom: 0, background: '#FFFFFF', borderTop: '1px solid #E3E0D5', margin: '0 -18px -16px', padding: '12px 18px', borderRadius: '0 0 8px 8px' }}>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busyId === agency.id}
                  onClick={() => saveEdit(agency.id)}
                  style={{ padding: '8px 20px', borderRadius: 999, fontSize: 13, fontWeight: 600, opacity: busyId === agency.id ? 0.6 : 1 }}
                >
                  Opslaan
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  style={{ ...ghostBtn, padding: '8px 16px', fontSize: 13 }}
                >
                  Annuleren
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: '#1D1D1D' }}>{agency.name}</div>
                <div style={{ fontSize: 12.5, color: '#5C5850', marginTop: 2 }}>
                  Code: <code>{agency.code}</code>
                  {agency.extraCodes ? agency.extraCodes.split(/[,;\n]+/).filter(Boolean).map((c) => <span key={c}> · <code>{c.trim()}</code></span>) : null}
                  {agency.contactEmail ? ' · ' + agency.contactEmail : ''}
                </div>
                <div style={{ fontSize: 12.5, color: '#5C5850', marginTop: 2 }}>
                  {agency.userEmails ? agency.userEmails.split(/[\s,;]+/).filter(Boolean).length + ' login(s)' : 'Geen logins'}
                  {' · '}{agency.scriptMode === 'provided' ? 'eigen script' : 'TFA schrijft scripts'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => startEdit(agency)}
                  style={ghostBtn}
                >
                  Bewerken
                </button>
                <button
                  type="button"
                  disabled={busyId === agency.id}
                  onClick={() => removeAgency(agency.id)}
                  style={{ ...ghostBtn, border: '1px solid #E3B0A8', color: '#A8402F', opacity: busyId === agency.id ? 0.6 : 1 }}
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
              style={{ padding: '8px 20px', borderRadius: 999, fontSize: 13, fontWeight: 600, opacity: busyId === 'new' || !code.trim() || !name.trim() ? 0.6 : 1 }}
            >
              {busyId === 'new' ? 'Bezig…' : 'Toevoegen'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={{ ...ghostBtn, padding: '8px 16px', fontSize: 13 }}
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
          style={{ alignSelf: 'flex-start', padding: '10px 20px', borderRadius: 999, fontSize: 13, fontWeight: 600 }}
        >
          + Nieuwe agency
        </button>
      )}
    </div>
  );
}
