'use client';

import { useEffect, useMemo, useState } from 'react';
import { variationsSummaryLabel, parseReviewRounds as parseReviewRoundsOf, PRODUCTION_STATUS_LABELS, INCLUDED_REVISIONS } from './flowData';

const RANGES = [
  { key: '7d', label: 'Laatste week' },
  { key: '30d', label: 'Laatste maand' },
  { key: '182d', label: 'Laatste 6 maanden' },
  { key: '365d', label: 'Laatste jaar' },
  { key: 'all', label: 'Alles' },
];
const PAGE_SIZE = 8;

// Producer-editable workflow status. Persisted server-side via
// PATCH /api/dashboard/briefs/:id/status — replaces the old auto-derived
// (submittedAt / selectedVoiceId-based) status guess.
const STATUS_META = {
  todo: { label: 'To-do', color: '#5C5850', bg: 'rgba(92,88,80,.1)' },
  pending_customer: { label: 'Wacht op klant', color: '#8C6D1F', bg: 'rgba(230,200,88,.18)' },
  in_progress: { label: 'In behandeling', color: '#1F6F8C', bg: 'rgba(88,170,230,.16)' },
  done: { label: 'Klaar', color: '#1D7A46', bg: 'rgba(29,122,70,.12)' },
};
const STATUS_ORDER = ['todo', 'pending_customer', 'in_progress', 'done'];

function rangeToMs(key) {
  const days = { '7d': 7, '30d': 30, '182d': 182, '365d': 365 }[key];
  return days ? days * 24 * 60 * 60 * 1000 : null;
}

function parseSelectedTracks(brief) {
  try {
    const parsed = brief.selectedTracks ? JSON.parse(brief.selectedTracks) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function parseInternalNotes(brief) {
  try {
    const parsed = brief.internalNotes ? JSON.parse(brief.internalNotes) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// Extra contact people added on the client's contact step beyond the
// primary contactPerson/contactEmail — the submission confirmation email
// goes to all of them (see lib/email.js's recipientsFor()).
function parseAdditionalContacts(brief) {
  try {
    const parsed = brief.additionalContacts ? JSON.parse(brief.additionalContacts) : [];
    return Array.isArray(parsed) ? parsed.filter((c) => c && (c.name || c.email)) : [];
  } catch (e) {
    return [];
  }
}

function statusMetaOf(brief) {
  return STATUS_META[brief.status] || STATUS_META.todo;
}

function StatusSelect({ brief, onChange, compact }) {
  const meta = statusMetaOf(brief);
  return (
    <select
      value={brief.status || 'todo'}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(brief.id, e.target.value)}
      style={{
        fontSize: compact ? 11 : 12.5,
        fontWeight: 600,
        padding: compact ? '3px 8px' : '6px 10px',
        borderRadius: 999,
        color: meta.color,
        background: meta.bg,
        border: `1px solid ${meta.color}33`,
        cursor: 'pointer',
        appearance: 'none',
        WebkitAppearance: 'none',
      }}
    >
      {STATUS_ORDER.map((key) => (
        <option key={key} value={key} style={{ color: '#1D1D1D', background: '#FFFFFF' }}>
          {STATUS_META[key].label}
        </option>
      ))}
    </select>
  );
}

function Field({ label, children, empty }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: '#8C8880', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 13.5, marginTop: 3, color: empty ? '#9C9890' : '#1D1D1D' }}>{children}</div>
    </div>
  );
}

function ModalSectionTitle({ children }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: '#1D1D1D', marginBottom: 10 }}>{children}</div>;
}

// Deadline coloring — overdue is only meaningful for a brief that isn't done
// yet; a finished brief with a past due date isn't a problem.
function dueDateMeta(dueDate, status) {
  if (!dueDate) return { label: 'Geen deadline', color: '#9C9890', overdue: false };
  const d = new Date(dueDate + 'T00:00:00');
  if (isNaN(d.getTime())) return { label: dueDate, color: '#9C9890', overdue: false };
  const label = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  const overdue = status !== 'done' && d.getTime() < new Date().setHours(0, 0, 0, 0);
  return { label, color: overdue ? '#C2513F' : '#1D1D1D', overdue };
}

export default function DashboardClient({ briefs }) {
  const [rows, setRows] = useState(briefs);
  const [range, setRange] = useState('30d');
  const [sortField, setSortField] = useState('updatedAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  // Clicking a status tile (To-do / Wacht op klant / In behandeling / Klaar)
  // filters the table below it to just that status; clicking the same tile
  // again (or picking a different one) toggles back to the full overview.
  const [statusFilter, setStatusFilter] = useState(null);

  function toggleStatusFilter(status) {
    setStatusFilter((cur) => (cur === status ? null : status));
    setPage(1);
  }

  // Keep local editable copy in sync if the server-fetched prop ever changes
  // (e.g. a fresh navigation to the dashboard).
  useEffect(() => {
    setRows(briefs);
  }, [briefs]);

  const [noteDraft, setNoteDraft] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [metaBusy, setMetaBusy] = useState(false);
  const [reviewLinkDraft, setReviewLinkDraft] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);

  // Clear any unsent note/review-link draft whenever a different brief's
  // modal opens (or the modal closes) — otherwise a half-typed value for one
  // brief could get silently posted to the next one the producer opens.
  useEffect(() => {
    setNoteDraft('');
    setReviewLinkDraft('');
  }, [selected && selected.id]);

  async function handleAddReviewRound(id) {
    const frameioLink = reviewLinkDraft.trim();
    if (!frameioLink) return;
    setReviewBusy(true);
    try {
      const res = await fetch(`/api/dashboard/briefs/${id}/review-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frameioLink }),
      });
      if (!res.ok) throw new Error('add review round failed');
      const brief = await res.json();
      setRows((cur) => cur.map((b) => (b.id === id ? brief : b)));
      setSelected((cur) => (cur && cur.id === id ? brief : cur));
      setReviewLinkDraft('');
    } catch (err) {
      console.error(err);
    } finally {
      setReviewBusy(false);
    }
  }

  async function handleMetaChange(id, patch) {
    const prev = rows;
    setRows((cur) => cur.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    setSelected((cur) => (cur && cur.id === id ? { ...cur, ...patch } : cur));
    setMetaBusy(true);
    try {
      const res = await fetch(`/api/dashboard/briefs/${id}/meta`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('meta update failed');
    } catch (err) {
      console.error(err);
      setRows(prev);
      setSelected((cur) => (cur && cur.id === id ? prev.find((b) => b.id === id) || cur : cur));
    } finally {
      setMetaBusy(false);
    }
  }

  async function handleAddNote(id) {
    const text = noteDraft.trim();
    if (!text) return;
    setNoteBusy(true);
    try {
      const res = await fetch(`/api/dashboard/briefs/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('add note failed');
      const brief = await res.json();
      setRows((cur) => cur.map((b) => (b.id === id ? brief : b)));
      setSelected((cur) => (cur && cur.id === id ? brief : cur));
      setNoteDraft('');
    } catch (err) {
      console.error(err);
    } finally {
      setNoteBusy(false);
    }
  }

  async function handleStatusChange(id, status) {
    const prev = rows;
    // Optimistic update — including inside the open detail overlay, if any.
    setRows((cur) => cur.map((b) => (b.id === id ? { ...b, status } : b)));
    setSelected((cur) => (cur && cur.id === id ? { ...cur, status } : cur));
    try {
      const res = await fetch(`/api/dashboard/briefs/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('status update failed');
    } catch (err) {
      console.error(err);
      // Roll back on failure.
      setRows(prev);
      setSelected((cur) => (cur && cur.id === id ? { ...cur, status: prev.find((b) => b.id === id)?.status } : cur));
    }
  }

  const filtered = useMemo(() => {
    const ms = rangeToMs(range);
    if (!ms) return rows;
    const cutoff = Date.now() - ms;
    return rows.filter((b) => new Date(b.createdAt).getTime() >= cutoff);
  }, [rows, range]);

  const visible = useMemo(() => {
    if (!statusFilter) return filtered;
    return filtered.filter((b) => (b.status || 'todo') === statusFilter);
  }, [filtered, statusFilter]);

  const sorted = useMemo(() => {
    const list = visible.slice();
    list.sort((a, b) => {
      let av = a[sortField] || '';
      let bv = b[sortField] || '';
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [visible, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = sorted.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const stats = useMemo(() => {
    const total = filtered.length;
    const todo = filtered.filter((b) => (b.status || 'todo') === 'todo').length;
    const pendingCustomer = filtered.filter((b) => b.status === 'pending_customer').length;
    const inProgress = filtered.filter((b) => b.status === 'in_progress').length;
    const done = filtered.filter((b) => b.status === 'done').length;
    return { total, todo, pendingCustomer, inProgress, done };
  }, [filtered]);

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(1);
  }

  const cardStyle = { background: '#FFFFFF', borderRadius: 14, padding: '20px 22px', boxShadow: '0 1px 10px rgba(29,29,29,.05)' };
  const modalCardStyle = { background: '#FBF9EC', border: '1.5px solid #EAE3C4', borderLeft: '4px solid #E6C858', borderRadius: '4px 14px 14px 4px', padding: '14px 16px' };
  // Active tile always highlights in the brand's gold, regardless of that
  // status's own accent color (used only for its number/label) — one
  // consistent "this is the active filter" signal instead of a color that
  // changes depending on which tile you clicked.
  function tileStyle(status) {
    const active = statusFilter === status;
    return {
      ...cardStyle,
      cursor: 'pointer',
      textAlign: 'left',
      width: '100%',
      font: 'inherit',
      color: 'inherit',
      background: active ? '#FBF0C8' : cardStyle.background,
      border: active ? '1.5px solid #E6C858' : '1.5px solid transparent',
      boxShadow: active ? '0 2px 14px rgba(230,200,88,.4)' : cardStyle.boxShadow,
      transition: 'background .12s ease, border-color .12s ease, box-shadow .12s ease',
    };
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => { setRange(r.key); setPage(1); }}
            style={{
              border: '1px solid #C9C5B9', borderRadius: 999, padding: '7px 14px', fontSize: 12.5, cursor: 'pointer',
              background: range === r.key ? '#1D1D1D' : '#FFFFFF', color: range === r.key ? '#FFFFFF' : '#5C5850',
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 26 }} className="tfa-stats-grid">
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#8C8880', textTransform: 'uppercase', letterSpacing: '.04em' }}>Totaal briefs</div>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 32, fontWeight: 600, marginTop: 6 }}>{stats.total}</div>
        </div>
        <button type="button" onClick={() => toggleStatusFilter('todo')} style={tileStyle('todo')}>
          <div style={{ fontSize: 12, color: '#8C8880', textTransform: 'uppercase', letterSpacing: '.04em' }}>To-do</div>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 32, fontWeight: 600, marginTop: 6 }}>{stats.todo}</div>
        </button>
        <button type="button" onClick={() => toggleStatusFilter('pending_customer')} style={tileStyle('pending_customer')}>
          <div style={{ fontSize: 12, color: '#8C8880', textTransform: 'uppercase', letterSpacing: '.04em' }}>Wacht op klant</div>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 32, fontWeight: 600, marginTop: 6, color: '#8C6D1F' }}>{stats.pendingCustomer}</div>
        </button>
        <button type="button" onClick={() => toggleStatusFilter('in_progress')} style={tileStyle('in_progress')}>
          <div style={{ fontSize: 12, color: '#8C8880', textTransform: 'uppercase', letterSpacing: '.04em' }}>In behandeling</div>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 32, fontWeight: 600, marginTop: 6, color: '#1F6F8C' }}>{stats.inProgress}</div>
        </button>
        <button type="button" onClick={() => toggleStatusFilter('done')} style={tileStyle('done')}>
          <div style={{ fontSize: 12, color: '#8C8880', textTransform: 'uppercase', letterSpacing: '.04em' }}>Klaar</div>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 32, fontWeight: 600, marginTop: 6, color: '#1D7A46' }}>{stats.done}</div>
        </button>
      </div>

      {statusFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -14, marginBottom: 18, fontSize: 12.5, color: '#5C5850' }}>
          Gefilterd op <b style={{ color: STATUS_META[statusFilter].color }}>{STATUS_META[statusFilter].label}</b>
          <button type="button" onClick={() => setStatusFilter(null)} style={{ border: '1px solid #C9C5B9', borderRadius: 999, background: '#FFFFFF', padding: '3px 10px', fontSize: 11.5, cursor: 'pointer', color: '#5C5850' }}>
            ✕ Wis filter
          </button>
        </div>
      )}

      <div style={{ background: '#FFFFFF', borderRadius: 14, boxShadow: '0 1px 10px rgba(29,29,29,.05)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 820 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #EEECE3', textAlign: 'left' }}>
                {[
                  ['companyName', 'Bedrijf'],
                  ['hoofdspotLength', 'Spot'],
                  ['assignedTo', 'Toegewezen'],
                  ['dueDate', 'Deadline'],
                  ['updatedAt', 'Laatst gewijzigd'],
                  ['status', 'Status'],
                ].map(([field, label]) => (
                  <th
                    key={field}
                    onClick={() => (field === 'status' ? null : toggleSort(field))}
                    style={{ padding: '12px 16px', cursor: field === 'status' ? 'default' : 'pointer', color: '#5C5850', fontWeight: 600, whiteSpace: 'nowrap' }}
                  >
                    {label} {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((b) => {
                const due = dueDateMeta(b.dueDate, b.status);
                return (
                  <tr key={b.id} onClick={() => setSelected(b)} className="tfa-dash-row" style={{ borderBottom: '1px solid #F3F1EA', cursor: 'pointer' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: b.companyName ? '#1D1D1D' : '#9C9890' }}>
                      {b.companyName || 'Nog geen bedrijfsnaam'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>{b.hoofdspotLength || '20'}″</td>
                    <td style={{ padding: '12px 16px', color: b.assignedTo ? '#1D1D1D' : '#9C9890' }}>{b.assignedTo || '—'}</td>
                    <td style={{ padding: '12px 16px', color: due.color, fontWeight: due.overdue ? 700 : 400 }}>
                      {due.overdue ? '⚠ ' : ''}{due.label}
                    </td>
                    <td style={{ padding: '12px 16px' }}>{new Date(b.updatedAt).toLocaleString('nl-NL')}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <StatusSelect brief={b} onChange={handleStatusChange} compact />
                    </td>
                  </tr>
                );
              })}
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '24px 16px', textAlign: 'center', color: '#8C8880' }}>Geen briefs in deze periode.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #EEECE3', fontSize: 12.5, color: '#5C5850' }}>
          <span>Pagina {pageSafe} van {totalPages}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={pageSafe <= 1} onClick={() => setPage((p) => p - 1)} style={{ border: '1px solid #C9C5B9', borderRadius: 8, background: '#FFFFFF', padding: '6px 12px', cursor: pageSafe <= 1 ? 'not-allowed' : 'pointer' }}>← Vorige</button>
            <button type="button" disabled={pageSafe >= totalPages} onClick={() => setPage((p) => p + 1)} style={{ border: '1px solid #C9C5B9', borderRadius: 8, background: '#FFFFFF', padding: '6px 12px', cursor: pageSafe >= totalPages ? 'not-allowed' : 'pointer' }}>Volgende →</button>
          </div>
        </div>
      </div>

      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(29,29,29,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#FFFFFF', borderRadius: 16, padding: '26px 28px', maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 24, margin: 0 }}>{selected.companyName || 'Nog geen bedrijfsnaam'}</h2>
                <div style={{ marginTop: 8 }}>
                  <StatusSelect brief={selected} onChange={handleStatusChange} />
                </div>
              </div>
              <button type="button" onClick={() => setSelected(null)} style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', flex: 'none' }}>✕</button>
            </div>

            <div className="tfa-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px', marginTop: 18 }}>
              <div style={modalCardStyle}>
                <ModalSectionTitle>Contact</ModalSectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Field label="Contactpersoon" empty={!selected.contactPerson}>{selected.contactPerson || 'Nog niet opgegeven'}</Field>
                  <Field label="E-mail" empty={!selected.contactEmail}>{selected.contactEmail || 'Nog niet opgegeven'}</Field>
                  {parseAdditionalContacts(selected).map((c, i) => (
                    <Field key={i} label={c.name || `Extra contact ${i + 1}`} empty={!c.email}>{c.email || 'Nog niet opgegeven'}</Field>
                  ))}
                </div>
              </div>

              <div style={modalCardStyle}>
                <ModalSectionTitle>Levering</ModalSectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Field label="Hoofdspot">{selected.hoofdspotLength || '20'}″{variationsSummaryLabel(selected)}</Field>
                  <Field label="Aangemaakt">{new Date(selected.createdAt).toLocaleString('nl-NL')}</Field>
                  {selected.submittedAt && <Field label="Verzonden">{new Date(selected.submittedAt).toLocaleString('nl-NL')}</Field>}
                </div>
              </div>

              <div style={{ ...modalCardStyle, gridColumn: '1 / -1' }}>
                <ModalSectionTitle>Team</ModalSectionTitle>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: '#8C8880', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Toegewezen aan</div>
                    <input
                      type="text"
                      defaultValue={selected.assignedTo || ''}
                      placeholder="Naam van teamlid"
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        if (value !== (selected.assignedTo || '')) handleMetaChange(selected.id, { assignedTo: value });
                      }}
                      disabled={metaBusy}
                      style={{ width: '100%', border: '1px solid #C9C5B9', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#FFFFFF' }}
                    />
                  </div>
                  <div style={{ flex: '1 1 160px' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: '#8C8880', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Deadline</div>
                    <input
                      type="date"
                      defaultValue={selected.dueDate || ''}
                      onChange={(e) => handleMetaChange(selected.id, { dueDate: e.target.value })}
                      disabled={metaBusy}
                      style={{ width: '100%', border: '1px solid #C9C5B9', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#FFFFFF' }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #EAE3C4' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: '#8C8880', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
                    Interne notities <span style={{ opacity: 0.7 }}>(niet zichtbaar voor de klant)</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto', marginBottom: 10 }}>
                    {parseInternalNotes(selected).slice().reverse().map((n) => (
                      <div key={n.id} style={{ background: '#FFFFFF', border: '1px solid #EAE3C4', borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ fontSize: 13, color: '#1D1D1D', lineHeight: 1.5 }}>{n.text}</div>
                        <div style={{ fontSize: 11, color: '#8C8880', marginTop: 4 }}>
                          {n.author || 'Team'} · {new Date(n.createdAt).toLocaleString('nl-NL')}
                        </div>
                      </div>
                    ))}
                    {parseInternalNotes(selected).length === 0 && (
                      <div style={{ fontSize: 12.5, color: '#9C9890' }}>Nog geen notities.</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !noteBusy) handleAddNote(selected.id); }}
                      placeholder="Voeg een interne notitie toe…"
                      style={{ flex: 1, border: '1px solid #C9C5B9', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#FFFFFF' }}
                    />
                    <button
                      type="button"
                      onClick={() => handleAddNote(selected.id)}
                      disabled={noteBusy || !noteDraft.trim()}
                      style={{
                        border: 'none', borderRadius: 8, background: '#1D1D1D', color: '#FFFFFF', fontSize: 12.5, fontWeight: 600,
                        padding: '8px 16px', cursor: noteBusy || !noteDraft.trim() ? 'not-allowed' : 'pointer', opacity: noteBusy || !noteDraft.trim() ? 0.6 : 1,
                      }}
                    >
                      Toevoegen
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ ...modalCardStyle, gridColumn: '1 / -1' }}>
                <ModalSectionTitle>Productie & review</ModalSectionTitle>
                {(() => {
                  const rounds = parseReviewRoundsOf(selected);
                  const overCap = rounds.length > INCLUDED_REVISIONS;
                  const statusLabel = PRODUCTION_STATUS_LABELS[selected.productionStatus || ''] || selected.productionStatus;
                  return (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#5C5850' }}>{statusLabel}</span>
                        {rounds.length > 0 && (
                          <span style={{ fontSize: 11.5, color: '#8C8880' }}>· {rounds.length} {rounds.length === 1 ? 'ronde' : 'rondes'} gedeeld</span>
                        )}
                        {overCap && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#8C6D1F', background: 'rgba(230,200,88,.22)', borderRadius: 4, padding: '2px 6px' }}>
                            Boven inbegrepen aantal ({INCLUDED_REVISIONS})
                          </span>
                        )}
                      </div>

                      {rounds.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                          {rounds.slice().reverse().map((r, i) => (
                            <div key={r.id} style={{ background: '#FFFFFF', border: '1px solid #EAE3C4', borderRadius: 8, padding: '8px 10px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <a href={r.frameioLink} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 600, color: '#1F6F8C', textDecoration: 'underline', wordBreak: 'break-all' }}>
                                  Ronde {rounds.length - i} — Frame.io
                                </a>
                                {r.approvedAt ? (
                                  <span style={{ fontSize: 11, fontWeight: 600, color: '#1D7A46' }}>Goedgekeurd</span>
                                ) : (
                                  <span style={{ fontSize: 11, color: '#8C8880' }}>{new Date(r.createdAt).toLocaleDateString('nl-NL')}</span>
                                )}
                              </div>
                              {r.feedback && r.feedback.length > 0 && (
                                <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #F3F1EA', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {r.feedback.map((f) => (
                                    <div key={f.id} style={{ fontSize: 12, color: '#5C5850', lineHeight: 1.5 }}>
                                      <span style={{ color: '#9C9890', fontSize: 11 }}>{new Date(f.createdAt).toLocaleDateString('nl-NL')} — </span>
                                      {f.text}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="text"
                          value={reviewLinkDraft}
                          onChange={(e) => setReviewLinkDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !reviewBusy) handleAddReviewRound(selected.id); }}
                          placeholder="Plak hier de Frame.io-link…"
                          style={{ flex: 1, border: '1px solid #C9C5B9', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#FFFFFF' }}
                        />
                        <button
                          type="button"
                          onClick={() => handleAddReviewRound(selected.id)}
                          disabled={reviewBusy || !reviewLinkDraft.trim()}
                          style={{
                            border: 'none', borderRadius: 8, background: '#1D1D1D', color: '#FFFFFF', fontSize: 12.5, fontWeight: 600,
                            padding: '8px 16px', whiteSpace: 'nowrap', cursor: reviewBusy || !reviewLinkDraft.trim() ? 'not-allowed' : 'pointer', opacity: reviewBusy || !reviewLinkDraft.trim() ? 0.6 : 1,
                          }}
                        >
                          {rounds.length > 0 ? 'Nieuwe ronde delen' : 'Delen met klant'}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>

              {(selected.editedScript || selected.generatedScript) && (
                <div style={{ ...modalCardStyle, gridColumn: '1 / -1' }}>
                  <ModalSectionTitle>Script</ModalSectionTitle>
                  <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontSize: 14.5, lineHeight: 1.6, color: '#1D1D1D' }}>
                    {selected.editedScript !== null && selected.editedScript !== undefined ? selected.editedScript : selected.generatedScript}
                  </div>
                </div>
              )}

              <div style={modalCardStyle}>
                <ModalSectionTitle>Stem</ModalSectionTitle>
                <Field label="Gekozen stem" empty={!selected.selectedVoiceLabel}>{selected.selectedVoiceLabel || 'Nog niet gekozen'}</Field>
              </div>

              <div style={modalCardStyle}>
                <ModalSectionTitle>Muziek</ModalSectionTitle>
                {(() => {
                  const tracks = parseSelectedTracks(selected);
                  if (!tracks.length) return <div style={{ fontSize: 13.5, color: '#9C9890' }}>Nog niet gekozen</div>;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {tracks.map((t, i) => (
                        <div key={t.id || i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#FBF0C8', borderRadius: 8 }}>
                          <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#E6C858', fontSize: 10, fontWeight: 700, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t.title || 'Onbekende track'}{t.artist ? ` — ${t.artist}` : ''}</div>
                            <div style={{ fontSize: 11, color: '#8C6D1F', fontWeight: 600 }}>{t.playlistName || 'categorie onbekend'}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            <a
              href={`/api/dashboard/briefs/${selected.id}/pdf`}
              className="btn-primary tfa-btn-glow"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 20, padding: '9px 16px', fontSize: 12.5, textDecoration: 'none' }}
            >
              ⤓ Download als PDF
            </a>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          .tfa-stats-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 560px) {
          .tfa-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        .tfa-dash-row { transition: background .12s ease; }
        .tfa-dash-row:hover { background: rgba(230,200,88,.1); }
        .tfa-btn-glow { transition: filter .12s ease; }
        .tfa-btn-glow:hover { filter: brightness(1.08); }
        @media (max-width: 560px) {
          .tfa-modal-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
