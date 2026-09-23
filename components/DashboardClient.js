'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  variationsSummaryLabel, variationsCountOf, parseVariationScripts, parseReviewRounds as parseReviewRoundsOf,
  reviewOverIncludedCap, PRODUCTION_STATUS_LABELS, INCLUDED_REVISIONS, formatRoundLabel, formatDateTime,
  formatAirDate, deliveryDeadlineMeta, TONE_LABELS, finalTrackOf,
} from './flowData';
import { diffWords, hasDiff, DiffPreview } from './textDiff';
import { SCRIPT_SOURCE_META, IMPRESSIONS_LABELS } from '../lib/reports';

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

// A brief counts as "new/unchecked" once it's been submitted but no
// producer has opened it since — i.e. never opened at all, or opened
// before this particular submission (edge case: a client could in theory
// resubmit-equivalent flows later; comparing timestamps rather than just
// checking seenAt's presence keeps this correct either way). Drives the
// bold row + dot in the dashboard table below; cleared the moment someone
// opens the brief (see handleOpenBrief).
function isUnseenBrief(b) {
  if (!b || !b.submittedAt) return false;
  if (!b.seenAt) return true;
  return new Date(b.seenAt).getTime() < new Date(b.submittedAt).getTime();
}

// The studio engineers a brief can be assigned to — a fixed dropdown instead
// of free text, since in practice it's always one of these two. Kept as a
// simple array (not an object with keys) since assignedTo is stored as the
// plain display name already (see lib/db.js's updateBriefTeamMeta) — no
// separate id/label mapping needed.
const ASSIGNEE_OPTIONS = ['Marco', 'Karim'];

// Which optional dashboard-table columns a producer has chosen to show,
// persisted per-browser (not per-account — there's no multi-device sync
// need for this) so the table stays configured the way they left it across
// visits. 'companyName' and 'status' aren't in here: those two are always
// shown (see COLUMN_DEFS' `core` flag below) since a row without a company
// name or a status to act on isn't useful at all.
const COLUMN_STORAGE_KEY = 'tfa-dashboard-columns-v1';
// Columns visible out of the box for anyone who's never touched the
// configurator — deliberately the exact same six the table always showed
// before this became configurable, so nothing changes for existing users
// until they actually open "Kolommen" and pick something new.
const DEFAULT_COLUMN_KEYS = ['hoofdspotLength', 'assignedTo', 'airDate', 'updatedAt'];

// Sections of the brief detail modal — see the `modalTab` state on
// DashboardClient. Grouped by what a producer actually comes to look at:
// the client's own answers (Overzicht), the post-production review
// workflow (Productie & review), the creative deliverables (Creatief), and
// internal team logistics (Team) each get their own tab instead of all six
// sections stacking in one long scroll. Productie & review sits second
// (not last) since it's the tab a producer needs most often once a brief
// is actually in production — see the modalTab default-tab logic below,
// which now opens straight to it in that case.
const MODAL_TABS = [
  { key: 'overzicht', label: 'Overzicht' },
  { key: 'productie', label: 'Productie & review' },
  { key: 'creatief', label: 'Creatief' },
  { key: 'team', label: 'Team' },
];
// Appended only once the client has approved (see modalTabsFor below) — the
// final WAV hand-off to whoever needs it (Advision Media today, potentially
// someone else later) makes no sense to show before there's anything
// approved to hand off. "Uitlevering" (release/dispatch) rather than
// "Levering" deliberately — "Levering" is already the client-facing step 2
// (the air-date question); reusing it here for a completely different,
// producer-only thing would read as the same feature.
const DELIVERY_TAB = { key: 'uitlevering', label: 'Uitlevering' };
function modalTabsFor(brief) {
  return brief && brief.reviewApprovedAt ? MODAL_TABS.concat([DELIVERY_TAB]) : MODAL_TABS;
}

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

// Short badge shown right in the table (and echoed at the top of the
// modal) so a review round in flight is visible without opening the brief
// at all. Separate from the producer-editable `status` pill — this reads
// productionStatus directly, which lib/db.js's addReviewRound/
// addReviewFeedback/approveReview keep in sync with `status` behind the
// scenes (awaiting_review -> pending_customer, in_revision -> in_progress,
// approved -> done), but the wording here is specific to the review step
// rather than the generic 4-value workflow status.
const PRODUCTION_BADGE_META = {
  awaiting_review: { label: 'Review verzonden', color: '#8C6D1F', bg: 'rgba(230,200,88,.22)' },
  in_revision: { label: 'Feedback ontvangen', color: '#C2513F', bg: 'rgba(194,81,63,.12)' },
  approved: { label: 'Goedgekeurd', color: '#1D7A46', bg: 'rgba(29,122,70,.12)' },
};
function ProductionBadge({ brief, small }) {
  const meta = PRODUCTION_BADGE_META[brief.productionStatus];
  if (!meta) return null;
  return (
    <span
      style={{
        display: 'inline-block', fontSize: small ? 10.5 : 11.5, fontWeight: 600, color: meta.color, background: meta.bg,
        borderRadius: 999, padding: small ? '2px 7px' : '3px 9px', whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
    </span>
  );
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

// One round's feedback list, in the dashboard's Productie & review tab.
// Two things this fixes over the old plain list:
//  1. `whiteSpace: 'pre-wrap'` on the actual text — a client's line breaks
//     and "- " bullet points were being silently collapsed onto one run-on
//     line by normal HTML whitespace rules, even though they typed it with
//     real formatting.
//  2. The most recent piece of feedback (the one a producer actually needs
//     to act on) is shown full-size and highlighted; anything older is
//     collapsed into a small "+N eerdere reacties" stack that expands on
//     hover, so the newest is never buried under a scroll of older notes.
function FeedbackStack({ feedback }) {
  const [hovered, setHovered] = useState(false);
  if (!feedback || !feedback.length) return null;
  const ordered = feedback.slice().reverse(); // newest first
  const latest = ordered[0];
  const older = ordered.slice(1);
  return (
    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #F3F1EA' }}>
      <div style={{ fontSize: 10.5, color: '#9C9890', marginBottom: 3 }}>{formatDateTime(latest.createdAt)} · nieuwste</div>
      <div
        style={{
          fontSize: 12.5, color: '#1D1D1D', lineHeight: 1.55, whiteSpace: 'pre-wrap', fontWeight: 500,
          background: '#FBF9EC', border: '1px solid #E6C858', borderLeft: '3px solid #E6C858', borderRadius: 6, padding: '7px 9px',
        }}
      >
        {latest.text}
      </div>
      {older.length > 0 && (
        <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{ marginTop: 6 }}>
          {!hovered ? (
            <div
              style={{
                fontSize: 11, color: '#9C9890', fontStyle: 'italic', padding: '5px 8px', borderRadius: 5, background: '#FCFBF7',
                boxShadow: '0 2px 0 -1px #EAE3C4, 0 4px 0 -2px #F3F1EA',
              }}
            >
              + {older.length} eerdere reactie{older.length === 1 ? '' : 's'} · hover om te bekijken
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {older.map((f) => (
                <div key={f.id} style={{ fontSize: 11.5, color: '#8C8880', lineHeight: 1.5, whiteSpace: 'pre-wrap', padding: '5px 7px', background: '#FAFAF7', borderRadius: 5 }}>
                  <span style={{ color: '#B4B0A5', fontSize: 10.5 }}>{formatDateTime(f.createdAt)}: </span>
                  {f.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Sort comparator overrides for table columns whose value on a brief isn't
// already the plain string/date the generic `a[field] || ''` comparison in
// the `sorted` useMemo below can handle directly — a computed count, a
// derived boolean, or (hoofdspotLength) a number stored as text ('20' vs
// '6' should sort as 6 < 20, not string-lexicographically as '20' < '6').
// Module-scope since none of these close over component state, just the
// brief itself.
const SORT_GETTERS = {
  hoofdspotLength: (b) => parseInt(b.hoofdspotLength, 10) || 20,
  variationsCount: (b) => variationsCountOf(b),
  reviewRoundsCount: (b) => parseReviewRoundsOf(b).length,
  internalNotesCount: (b) => parseInternalNotes(b).length,
  tracksCount: (b) => parseSelectedTracks(b).length,
  daysOpen: (b) => (b.createdAt ? Math.floor((Date.now() - new Date(b.createdAt).getTime()) / 86400000) : -1),
  isUnseen: (b) => (isUnseenBrief(b) ? 1 : 0),
  scriptApproved: (b) => (b.scriptApproved ? 1 : 0),
  overIncludedCap: (b) => (reviewOverIncludedCap(b) ? 1 : 0),
};

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
  // Free-text search across company name, contact person, and contact
  // email — the range/status filters above narrow by date/workflow stage,
  // but there was previously no way to just find "that one brief" once the
  // list grows past a page or two, short of paging through by eye.
  const [searchQuery, setSearchQuery] = useState('');

  // Which optional columns are on, plus whether the "Kolommen" picker
  // dropdown is open. Starts at DEFAULT_COLUMN_KEYS (matches the table's
  // pre-configurator look) on every render, including the server-rendered
  // one, then swaps to whatever's saved in localStorage right after mount
  // — reading localStorage during render would mismatch server/client
  // output, so it has to happen in an effect instead.
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_COLUMN_KEYS);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(COLUMN_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setVisibleColumns(parsed);
      }
    } catch (e) {}
  }, []);
  function toggleColumn(key) {
    setVisibleColumns((cur) => {
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      try {
        window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  }

  function toggleStatusFilter(status) {
    setStatusFilter((cur) => (cur === status ? null : status));
    setPage(1);
  }

  // Keep local editable copy in sync if the server-fetched prop ever changes
  // (e.g. a fresh navigation to the dashboard).
  useEffect(() => {
    setRows(briefs);
  }, [briefs]);

  // Fetched once, not per-brief — the remembered delivery-recipient address
  // book is shared across every brief's "Uitlevering" tab (see the
  // deliveryRecipients comment above). Best-effort: an empty/stale list just
  // means no suggestions yet, never blocks the tab from working.
  useEffect(() => {
    fetch('/api/dashboard/delivery-recipients')
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => setDeliveryRecipients(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, []);

  const [noteDraft, setNoteDraft] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState(false);
  // Click-to-edit state for an existing internal note — editingNoteId is
  // the note currently open for editing (only one at a time), editNoteDraft
  // its in-progress text. Separate from noteDraft/noteBusy/noteError above,
  // which are for the "add a new note" input.
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteDraft, setEditNoteDraft] = useState('');
  const [editNoteBusy, setEditNoteBusy] = useState(false);
  const [editNoteError, setEditNoteError] = useState(false);
  const [metaBusy, setMetaBusy] = useState(false);
  // Final delivery ("Uitlevering" tab) — deliveryLinkDraft/deliveryEmailDraft
  // are the two input fields, deliveryRecipients the remembered address book
  // (fetched once, not per-brief — it's shared across every brief's
  // delivery, see GET /api/dashboard/delivery-recipients).
  const [deliveryLinkDraft, setDeliveryLinkDraft] = useState('');
  const [deliveryEmailDraft, setDeliveryEmailDraft] = useState('');
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [deliveryError, setDeliveryError] = useState(false);
  const [deliveryRecipients, setDeliveryRecipients] = useState([]);
  const [reviewLinkDraft, setReviewLinkDraft] = useState('');
  // Free-text note that rides along with a shared/re-shared Frame.io round —
  // e.g. "we hebben de intro ingekort zoals gevraagd". lib/db.js already
  // stored a `note` per round (used internally for the round's own label),
  // but there was no actual input for a producer to type one — this is that
  // input. Cleared after each successful share since it's specific to that
  // one round, not something that should linger for the next one.
  const [reviewNoteDraft, setReviewNoteDraft] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState(false);
  // Which section of the brief detail modal is showing — see MODAL_TABS
  // below. Everything used to render stacked in one long scroll (Contact,
  // Levering, Team, Productie & review, Script, Stem, Muziek all on top of
  // each other); splitting it into tabs means only one section is on screen
  // at a time, so opening a brief reads as a focused view instead of a wall
  // of cards to scroll past.
  const [modalTab, setModalTab] = useState('overzicht');
  // The modal's scrollable content area (see the fixed-height dialog
  // restructure below) — scrolled back to the top on every tab switch so a
  // producer never lands mid-scroll on a tab they just clicked into.
  const modalBodyRef = useRef(null);

  // Clear any unsent note/review-link draft, and jump back to the first tab,
  // whenever a different brief's modal opens (or the modal closes) —
  // otherwise a half-typed value for one brief could get silently posted to
  // the next one the producer opens, and the modal would reopen wherever the
  // last brief happened to leave it.
  useEffect(() => {
    setNoteDraft('');
    // Prefill with the brief's existing master Frame.io link (if any) — see
    // the reviewRounds comment in lib/db.js: it's the SAME link every round,
    // only the dated folder inside it changes, so the producer normally
    // shouldn't have to retype it, just add a note for the new folder and
    // share again. Still editable in case the link itself ever needs fixing.
    setReviewLinkDraft((selected && selected.frameioLink) || '');
    // Same prefill idea as the Frame.io link above — if a delivery already
    // went out, show what was actually sent rather than a blank field, but
    // both stay editable in case a resend to a different/updated address
    // is needed.
    setDeliveryLinkDraft((selected && selected.deliveryLink) || '');
    setDeliveryEmailDraft((selected && selected.deliveryRecipientEmail) || '');
    setDeliveryError(false);
    // Default straight to Productie & review once a brief is actually IN
    // that stage — a producer opening a brief mid-production almost always
    // wants the Frame.io link/feedback, not the client's own answers, and
    // making them click "Productie & review" every single time before
    // reaching it was exactly the extra-clicks complaint. Anything earlier
    // in the process (still filling in the brief, nothing shared yet)
    // still opens on Overzicht as before.
    setModalTab(selected && selected.productionStatus ? 'productie' : 'overzicht');
  }, [selected && selected.id]);

  async function handleAddReviewRound(id) {
    const frameioLink = reviewLinkDraft.trim();
    if (!frameioLink) return;
    const note = reviewNoteDraft.trim();
    setReviewBusy(true);
    setReviewError(false);
    try {
      const res = await fetch(`/api/dashboard/briefs/${id}/review-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frameioLink, note }),
      });
      if (!res.ok) throw new Error('add review round failed');
      const brief = await res.json();
      setRows((cur) => cur.map((b) => (b.id === id ? brief : b)));
      setSelected((cur) => (cur && cur.id === id ? brief : cur));
      setReviewNoteDraft('');
    } catch (err) {
      console.error(err);
      // Was silent before — the input just went back to normal and the
      // producer had no way to tell whether the Frame.io link actually got
      // shared with the client or not. Now it says so.
      setReviewError(true);
    } finally {
      setReviewBusy(false);
    }
  }

  async function handleSendDelivery(id) {
    const link = deliveryLinkDraft.trim();
    const recipientEmail = deliveryEmailDraft.trim();
    if (!link || !recipientEmail) return;
    setDeliveryBusy(true);
    setDeliveryError(false);
    try {
      const res = await fetch(`/api/dashboard/briefs/${id}/delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link, recipientEmail }),
      });
      if (!res.ok) throw new Error('send delivery failed');
      const brief = await res.json();
      setRows((cur) => cur.map((b) => (b.id === id ? brief : b)));
      setSelected((cur) => (cur && cur.id === id ? brief : cur));
      // Newly-used address, remembered server-side by saveDelivery — refetch
      // so it shows up as a suggestion right away instead of only after the
      // next dashboard load.
      fetch('/api/dashboard/delivery-recipients')
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => setDeliveryRecipients(Array.isArray(list) ? list : []))
        .catch(() => {});
    } catch (err) {
      console.error(err);
      setDeliveryError(true);
    } finally {
      setDeliveryBusy(false);
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

  // Opens a brief's detail overlay and, the first time it's opened since
  // being submitted, marks it seen — clearing the "new" highlight in the
  // list. Optimistic (computes the timestamp client-side) same as the
  // other handlers above, so the bold/dot disappears the instant you
  // click, not after a round trip — but unlike a stray earlier version of
  // this function, it now checks the response the same way
  // handleMetaChange does above: if the write genuinely fails, the "seen"
  // state is rolled back instead of quietly pretending it worked. Without
  // this, a failed write looked identical to a successful one until the
  // page was refreshed and re-read the (unwritten) database state — which
  // reads exactly like "the badge goes away, then comes back on refresh."
  function handleOpenBrief(b) {
    setSelected(b);
    if (!isUnseenBrief(b)) return;
    const now = new Date().toISOString();
    setRows((cur) => cur.map((row) => (row.id === b.id ? { ...row, seenAt: now } : row)));
    setSelected((cur) => (cur && cur.id === b.id ? { ...cur, seenAt: now } : cur));
    fetch(`/api/dashboard/briefs/${b.id}/meta`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seen: true }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`mark-seen failed with status ${res.status}`);
      })
      .catch((err) => {
        console.error('[dashboard] mark-seen failed:', err);
        // Roll back — the row goes back to looking unseen, matching what
        // actually happened server-side, instead of lying to the producer
        // until their next refresh does it for us.
        setRows((cur) => cur.map((row) => (row.id === b.id ? { ...row, seenAt: b.seenAt || null } : row)));
        setSelected((cur) => (cur && cur.id === b.id ? { ...cur, seenAt: b.seenAt || null } : cur));
      });
  }

  async function handleAddNote(id) {
    const text = noteDraft.trim();
    if (!text) return;
    setNoteBusy(true);
    setNoteError(false);
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
      // Was silent before — deliberately keep noteDraft as-is (not cleared)
      // so the note text isn't lost, and surface the failure in the UI
      // instead of the input just quietly going back to normal.
      setNoteError(true);
    } finally {
      setNoteBusy(false);
    }
  }

  function startEditNote(note) {
    setEditingNoteId(note.id);
    setEditNoteDraft(note.text);
    setEditNoteError(false);
  }

  function cancelEditNote() {
    setEditingNoteId(null);
    setEditNoteDraft('');
    setEditNoteError(false);
  }

  async function handleEditNote(id, noteId) {
    const text = editNoteDraft.trim();
    if (!text) return;
    setEditNoteBusy(true);
    setEditNoteError(false);
    try {
      const res = await fetch(`/api/dashboard/briefs/${id}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId, text }),
      });
      if (!res.ok) throw new Error('edit note failed');
      const brief = await res.json();
      setRows((cur) => cur.map((b) => (b.id === id ? brief : b)));
      setSelected((cur) => (cur && cur.id === id ? brief : cur));
      setEditingNoteId(null);
      setEditNoteDraft('');
    } catch (err) {
      console.error(err);
      // Same "keep the draft, surface the error" approach as handleAddNote
      // — don't silently drop what the producer just typed.
      setEditNoteError(true);
    } finally {
      setEditNoteBusy(false);
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

  // Every column the dashboard table can show. 'companyName' and 'status'
  // are `core: true` — always shown, not in the "Kolommen" picker — since
  // a row without an identifiable company or an actionable status isn't
  // useful. Everything else is optional and off by default except the four
  // in DEFAULT_COLUMN_KEYS above, which is exactly what the table already
  // showed before it became configurable. `sortValue` is only spelled out
  // here for documentation; the actual lookup happens through SORT_GETTERS
  // above (module-scope, needed there before this array exists).
  const COLUMN_DEFS = [
    {
      key: 'companyName', core: true, label: 'Bedrijf',
      cell: (b, ctx) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {ctx.unseen && (
            <span title="Nieuw: nog niet bekeken" style={{ width: 8, height: 8, borderRadius: '50%', background: '#E6C858', flex: 'none', boxShadow: '0 0 0 3px rgba(230,200,88,.35)' }} />
          )}
          <span>{b.companyName || 'Nog geen bedrijfsnaam'}</span>
          {ctx.unseen && (
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#8C6D1F', background: 'rgba(230,200,88,.28)', borderRadius: 4, padding: '2px 6px' }}>Nieuw</span>
          )}
          <ProductionBadge brief={b} small />
        </div>
      ),
      cellStyle: (b, ctx) => ({ fontWeight: ctx.unseen ? 700 : 600, color: b.companyName ? '#1D1D1D' : '#9C9890' }),
    },
    { key: 'hoofdspotLength', label: 'Spot', cell: (b) => <>{b.hoofdspotLength || '20'}″{variationsSummaryLabel(b)}</> },
    { key: 'assignedTo', label: 'Toegewezen', cell: (b) => b.assignedTo || 'Niet toegewezen', cellStyle: (b) => ({ color: b.assignedTo ? '#1D1D1D' : '#9C9890' }) },
    {
      key: 'airDate', label: 'Op de radio',
      cell: (b, ctx) => <>{ctx.due.overdue ? '⚠ ' : ''}{ctx.due.label}</>,
      cellStyle: (b, ctx) => ({ color: ctx.due.color, fontWeight: ctx.due.overdue ? 700 : 400 }),
    },
    { key: 'updatedAt', label: 'Laatst gewijzigd', cell: (b) => new Date(b.updatedAt).toLocaleString('nl-NL') },
    {
      key: 'status', core: true, label: 'Status', sortable: false,
      cell: (b) => <StatusSelect brief={b} onChange={handleStatusChange} compact />,
    },
    { key: 'contactPerson', label: 'Contactpersoon', cell: (b) => b.contactPerson || '—', cellStyle: (b) => ({ color: b.contactPerson ? '#1D1D1D' : '#9C9890' }) },
    { key: 'contactEmail', label: 'E-mail', cell: (b) => b.contactEmail || '—', cellStyle: (b) => ({ color: b.contactEmail ? '#1D1D1D' : '#9C9890' }) },
    { key: 'createdAt', label: 'Aangemaakt', cell: (b) => (b.createdAt ? new Date(b.createdAt).toLocaleDateString('nl-NL') : '—') },
    { key: 'submittedAt', label: 'Verzonden', cell: (b) => (b.submittedAt ? new Date(b.submittedAt).toLocaleDateString('nl-NL') : 'Nog niet'), cellStyle: (b) => ({ color: b.submittedAt ? '#1D1D1D' : '#9C9890' }) },
    { key: 'audience', label: 'Doelgroep', cell: (b) => (b.audience === 'b2b' ? 'B2B' : b.audience === 'b2c' ? 'B2C' : '—') },
    { key: 'impressions', label: 'Impressies', cell: (b) => IMPRESSIONS_LABELS[b.impressions || ''] || b.impressions || '—' },
    { key: 'scriptSource', label: 'Script bron', cell: (b) => (SCRIPT_SOURCE_META[b.scriptSource || ''] || {}).label || b.scriptSource || '—' },
    {
      key: 'scriptApproved', label: 'Script goedgekeurd',
      cell: (b) => (b.scriptApproved ? 'Ja' : 'Nee'),
      cellStyle: (b) => ({ color: b.scriptApproved ? '#1D7A46' : '#9C9890', fontWeight: b.scriptApproved ? 600 : 400 }),
    },
    {
      // The specific thing that prompted this whole column picker — how
      // many variations a brief asked for wasn't visible anywhere in the
      // table at a glance before.
      key: 'variationsCount', label: 'Variaties',
      cell: (b) => variationsCountOf(b) || '—',
    },
    {
      // Same story — how many rounds of client feedback a production has
      // gone through, useful to scan for briefs eating more revision time
      // than usual (see INCLUDED_REVISIONS/reviewOverIncludedCap).
      key: 'reviewRoundsCount', label: 'Rondes feedback',
      cell: (b) => {
        const n = parseReviewRoundsOf(b).length;
        return n || '—';
      },
    },
    {
      key: 'overIncludedCap', label: 'Revisies > inbegrepen',
      cell: (b) => (reviewOverIncludedCap(b) ? `Ja (${INCLUDED_REVISIONS}+)` : 'Nee'),
      cellStyle: (b) => (reviewOverIncludedCap(b) ? { color: '#C2513F', fontWeight: 700 } : { color: '#9C9890' }),
    },
    { key: 'selectedVoiceLabel', label: 'Stem', cell: (b) => b.selectedVoiceLabel || '—', cellStyle: (b) => ({ color: b.selectedVoiceLabel ? '#1D1D1D' : '#9C9890' }) },
    { key: 'tracksCount', label: 'Aantal tracks', cell: (b) => parseSelectedTracks(b).length || '—' },
    {
      key: 'toneOfVoice', label: 'Tone of voice',
      cell: (b) => {
        try {
          const parsed = b.toneOfVoice ? JSON.parse(b.toneOfVoice) : [];
          if (!Array.isArray(parsed) || !parsed.length) return '—';
          return parsed.map((t) => TONE_LABELS[t] || t).join(', ');
        } catch (e) {
          return '—';
        }
      },
    },
    { key: 'internalNotesCount', label: 'Interne notities', cell: (b) => parseInternalNotes(b).length || '—' },
    {
      key: 'productionStatus', label: 'Productiestatus',
      cell: (b) => PRODUCTION_STATUS_LABELS[b.productionStatus || ''] || b.productionStatus || '—',
    },
    {
      key: 'isUnseen', label: 'Nieuw',
      cell: (b) => (isUnseenBrief(b) ? 'Ja' : 'Nee'),
      cellStyle: (b) => (isUnseenBrief(b) ? { color: '#8C6D1F', fontWeight: 700 } : { color: '#9C9890' }),
    },
    {
      // How long a brief has been sitting open — handy sorted descending to
      // surface whatever's been waiting longest without anyone touching it.
      key: 'daysOpen', label: 'Dagen open',
      cell: (b) => {
        const days = SORT_GETTERS.daysOpen(b);
        return days >= 0 ? days : '—';
      },
    },
  ];
  const activeColumns = COLUMN_DEFS.filter((c) => c.core || visibleColumns.includes(c.key));

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

  const searched = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter((b) => {
      const haystack = [b.companyName, b.contactPerson, b.contactEmail].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [visible, searchQuery]);

  const sorted = useMemo(() => {
    const list = searched.slice();
    list.sort((a, b) => {
      const getter = SORT_GETTERS[sortField];
      let av = getter ? getter(a) : a[sortField] || '';
      let bv = getter ? getter(b) : b[sortField] || '';
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [searched, sortField, sortDir]);

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
  // Two card styles inside the brief modal, used deliberately for two
  // different kinds of content — every card used to share modalCardStyle
  // (the gold-accented one), which is exactly why the modal read as "one
  // flat wall of identical boxes" regardless of whether a section was just
  // reference info or something the producer needed to act on. Now: gold
  // ONLY marks something actionable (an input, a dropdown, the Productie
  // tab), plain marks read-only reference info (Contact, Levering, Script,
  // Stem, Muziek) — so the gold accent actually means something again.
  const modalCardStyle = { background: '#FBF9EC', border: '1.5px solid #EAE3C4', borderLeft: '4px solid #E6C858', borderRadius: '4px 14px 14px 4px', padding: '14px 16px' };
  const refCardStyle = { background: '#FFFFFF', border: '1px solid #EEECE3', borderRadius: 12, padding: '14px 16px' };
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20, alignItems: 'center' }}>
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
        {/* Free-text search — filters on top of whichever range/status
            filter is already active, rather than replacing them, so
            "find this client within the last month" still works. */}
        <div style={{ marginLeft: 'auto', position: 'relative', minWidth: 220 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            placeholder="Zoek op bedrijf, contactpersoon of e-mail…"
            style={{ width: '100%', border: '1px solid #C9C5B9', borderRadius: 999, padding: '8px 14px', fontSize: 12.5, background: '#FFFFFF' }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              title="Zoekopdracht wissen"
              aria-label="Zoekopdracht wissen"
              style={{
                position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)', border: 'none', background: 'transparent',
                color: '#8C8880', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2,
              }}
            >
              ×
            </button>
          )}
        </div>
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

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: -14, marginBottom: 18 }}>
        {statusFilter ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#5C5850' }}>
            Gefilterd op <b style={{ color: STATUS_META[statusFilter].color }}>{STATUS_META[statusFilter].label}</b>
            <button type="button" onClick={() => setStatusFilter(null)} style={{ border: '1px solid #C9C5B9', borderRadius: 999, background: '#FFFFFF', padding: '3px 10px', fontSize: 11.5, cursor: 'pointer', color: '#5C5850' }}>
              ✕ Wis filter
            </button>
          </div>
        ) : <div />}

        {/* Column picker — which of the optional columns in COLUMN_DEFS
            show up in the table below, saved per-browser via toggleColumn
            (see COLUMN_STORAGE_KEY above). 'Bedrijf' and 'Status' aren't
            listed here since they're core and always shown. */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setColumnsMenuOpen((o) => !o)}
            style={{ border: '1px solid #C9C5B9', borderRadius: 8, background: '#FFFFFF', padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: '#1D1D1D', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            ⚙ Kolommen ({activeColumns.length - 2})
          </button>
          {columnsMenuOpen && (
            <>
              <div onClick={() => setColumnsMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
              <div
                style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 21, width: 280, maxHeight: 380, overflowY: 'auto',
                  background: '#FFFFFF', border: '1px solid #E3E0D5', borderRadius: 12, boxShadow: '0 12px 32px rgba(29,29,29,.16)', padding: '10px 0',
                }}
              >
                <div style={{ padding: '4px 14px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#8C8880' }}>
                  Kies welke kolommen je ziet
                </div>
                {COLUMN_DEFS.filter((c) => !c.core).map((c) => (
                  <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 14px', fontSize: 13, cursor: 'pointer', color: '#1D1D1D' }}>
                    <input type="checkbox" checked={visibleColumns.includes(c.key)} onChange={() => toggleColumn(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ background: '#FFFFFF', borderRadius: 14, boxShadow: '0 1px 10px rgba(29,29,29,.05)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 820 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #EEECE3', textAlign: 'left' }}>
                {activeColumns.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => (c.sortable === false ? null : toggleSort(c.key))}
                    style={{ padding: '12px 16px', cursor: c.sortable === false ? 'default' : 'pointer', color: '#5C5850', fontWeight: 600, whiteSpace: 'nowrap' }}
                  >
                    {c.label} {sortField === c.key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((b) => {
                const ctx = { due: deliveryDeadlineMeta(b, b.status), unseen: isUnseenBrief(b) };
                return (
                  <tr key={b.id} onClick={() => handleOpenBrief(b)} className="tfa-dash-row" style={{ borderBottom: '1px solid #F3F1EA', cursor: 'pointer', background: ctx.unseen ? '#FBF9EC' : undefined }}>
                    {activeColumns.map((c) => (
                      <td key={c.key} style={{ padding: '12px 16px', ...(c.cellStyle ? c.cellStyle(b, ctx) : null) }}>
                        {c.cell(b, ctx)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={activeColumns.length} style={{ padding: '24px 16px', textAlign: 'center', color: '#8C8880' }}>Geen briefs in deze periode.</td>
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
          {/* Fixed-height dialog, split into a fixed header/tabs block and a
              scrollable body — this used to just be maxHeight+overflow on
              the whole thing, so the dialog itself grew or shrank to fit
              whichever tab's content happened to be showing (a short
              "Team" tab, then a tall "Creatief" tab), which read as the
              window "jumping around" every time you switched tabs. Now the
              dialog is always the same size regardless of tab; only the
              inner content area scrolls, and it resets to the top on every
              tab switch (see setModalTab below) so you're never left
              scrolled halfway down a tab you just arrived at. */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#FFFFFF', borderRadius: 16, maxWidth: 640, width: '100%',
              height: '82vh', maxHeight: 720, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            <div style={{ padding: '26px 28px 0', flex: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 24, margin: 0 }}>{selected.companyName || 'Nog geen bedrijfsnaam'}</h2>
                <button type="button" onClick={() => setSelected(null)} style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', flex: 'none' }}>✕</button>
              </div>

              {/* Minimal header: just the workflow status here — the
                  approval badge and the Frame.io link both already show up
                  one tab away (Productie & review carries its own
                  "Goedgekeurd" badge right on the tab button below, and the
                  full approval/Frame.io detail lives in that tab's content),
                  so repeating them again in a standalone stack right under
                  the company name was pure duplication, not information.
                  This used to be a 4-row stack (name, status, approved
                  badge, Frame.io link) before the tabs even started. */}
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <StatusSelect brief={selected} onChange={handleStatusChange} />
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 16, borderBottom: '1px solid #EEECE3', paddingBottom: 10 }}>
                {modalTabsFor(selected).map((t) => {
                  const active = modalTab === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => { setModalTab(t.key); if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0; }}
                      style={{
                        border: 'none', borderRadius: 999, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                        background: active ? '#1D1D1D' : '#F3F1EA', color: active ? '#FFFFFF' : '#5C5850',
                      }}
                    >
                      {t.label}
                      {t.key === 'productie' && selected.productionStatus && (
                        <span style={{ marginLeft: 7 }}><ProductionBadge brief={selected} small /></span>
                      )}
                      {t.key === 'uitlevering' && (
                        <span style={{ marginLeft: 7, fontSize: 11, fontWeight: 700, color: selected.deliveredAt ? '#8FE0B0' : '#E6C858' }}>
                          {selected.deliveredAt ? '✓' : '●'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div ref={modalBodyRef} style={{ flex: 1, overflowY: 'auto', padding: '0 28px 26px' }}>

            {modalTab === 'productie' && (
            <div
              style={{
                marginTop: 16, background: '#FBF9EC', border: '1.5px solid #E6C858', borderRadius: 14, padding: '16px 18px',
                boxShadow: '0 4px 18px rgba(230,200,88,.18)',
              }}
            >
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
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#8C6D1F', background: 'rgba(230,200,88,.32)', borderRadius: 4, padding: '2px 6px' }}>
                          Boven inbegrepen aantal ({INCLUDED_REVISIONS})
                        </span>
                      )}
                    </div>

                    {rounds.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                        {rounds.slice().reverse().map((r) => (
                          <div key={r.id} style={{ background: '#FFFFFF', border: '1px solid #EAE3C4', borderRadius: 8, padding: '8px 10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1D' }}>
                                {formatRoundLabel(r)}
                              </span>
                              {r.approvedAt ? (
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#1D7A46' }}>Goedgekeurd {formatDateTime(r.approvedAt)}</span>
                              ) : (
                                <span style={{ fontSize: 11, color: '#8C8880' }}>gedeeld {formatDateTime(r.createdAt)}</span>
                              )}
                            </div>
                            <FeedbackStack feedback={r.feedback} />
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#8C8880' }}>
                            Frame.io-link {rounds.length > 0 ? '(zelfde link, alleen aanpassen indien nodig)' : ''}
                          </label>
                          {/* Moved here from the modal header, where it used to sit as its
                              own standalone row above the tabs — this is where the link
                              actually lives and gets edited, so opening it from right next
                              to that field reads clearer than a disconnected header chip. */}
                          {selected.frameioLink && (
                            <a
                              href={selected.frameioLink}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={{ fontSize: 11, fontWeight: 600, color: '#1F6F8C', textDecoration: 'none', whiteSpace: 'nowrap' }}
                            >
                              🎧 Open Frame.io ↗
                            </a>
                          )}
                        </div>
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
                            {rounds.length > 0 ? 'Nieuwe map delen' : 'Delen met klant'}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#8C8880', display: 'block', marginBottom: 4 }}>
                          Notitie voor de klant (optioneel)
                        </label>
                        <textarea
                          value={reviewNoteDraft}
                          onChange={(e) => setReviewNoteDraft(e.target.value)}
                          placeholder="Bijv. &quot;we hebben de intro ingekort en de muziek iets zachter gezet&quot;… verschijnt bij deze map op de reviewpagina en in de e-mail."
                          rows={2}
                          style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #C9C5B9', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical', background: '#FFFFFF' }}
                        />
                      </div>
                      <div style={{ fontSize: 11, color: '#8C8880' }}>
                        Voegt nu ({formatDateTime(new Date().toISOString())}) toe als nieuwe map binnen dezelfde Frame.io-link.
                      </div>
                      {reviewError && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#C2513F' }}>
                          Delen is niet gelukt, probeer het opnieuw.
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
            )}

            {modalTab === 'uitlevering' && selected.reviewApprovedAt && (
            <div
              style={{
                marginTop: 16, background: '#FBF9EC', border: '1.5px solid #E6C858', borderRadius: 14, padding: '16px 18px',
                boxShadow: '0 4px 18px rgba(230,200,88,.18)',
              }}
            >
              {/* Deliberately generic, not Advision-specific — this same tab
                  is meant to work unchanged the day TFA delivers to a
                  different agency or straight to a client. The recipient
                  field is a free-text + datalist combo so a producer can
                  either pick a previously-used address (remembered
                  automatically by saveDelivery in lib/db.js, shared across
                  every brief, not just this one) or type a brand new one. */}
              {selected.deliveredAt ? (
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1D7A46' }}>
                    ✓ Verzonden naar {selected.deliveryRecipientEmail} op {formatDateTime(selected.deliveredAt)}
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#5C5850', marginBottom: 12 }}>
                  Nog niet uitgeleverd
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#8C8880', display: 'block', marginBottom: 4 }}>
                    Frame.io-link (WAV-masters)
                  </label>
                  <input
                    type="text"
                    value={deliveryLinkDraft}
                    onChange={(e) => setDeliveryLinkDraft(e.target.value)}
                    placeholder="Plak hier de Frame.io-link met de WAV-bestanden…"
                    style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #C9C5B9', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#FFFFFF' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#8C8880', display: 'block', marginBottom: 4 }}>
                    E-mailadres ontvanger
                  </label>
                  <input
                    type="text"
                    list="delivery-recipients-list"
                    value={deliveryEmailDraft}
                    onChange={(e) => setDeliveryEmailDraft(e.target.value)}
                    placeholder="bijv. delivery@advisionmedia.nl"
                    style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #C9C5B9', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#FFFFFF' }}
                  />
                  <datalist id="delivery-recipients-list">
                    {deliveryRecipients.map((r) => (
                      <option key={r.id} value={r.email} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => handleSendDelivery(selected.id)}
                    disabled={deliveryBusy || !deliveryLinkDraft.trim() || !deliveryEmailDraft.trim()}
                    style={{
                      border: 'none', borderRadius: 8, background: '#1D1D1D', color: '#FFFFFF', fontSize: 12.5, fontWeight: 600,
                      padding: '8px 16px', cursor: deliveryBusy || !deliveryLinkDraft.trim() || !deliveryEmailDraft.trim() ? 'not-allowed' : 'pointer',
                      opacity: deliveryBusy || !deliveryLinkDraft.trim() || !deliveryEmailDraft.trim() ? 0.6 : 1,
                    }}
                  >
                    {selected.deliveredAt ? 'Opnieuw versturen' : 'Versturen'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#8C8880' }}>
                  Verstuurt direct een e-mail met deze link naar het opgegeven adres, met een overzicht van script, stem en gekozen muziek.
                </div>
                {deliveryError && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#C2513F' }}>
                    Versturen is niet gelukt, probeer het opnieuw.
                  </div>
                )}
              </div>
            </div>
            )}

            {modalTab === 'overzicht' && (
            <div className="tfa-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px', marginTop: 16 }}>
              <div style={refCardStyle}>
                <ModalSectionTitle>Contact</ModalSectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Field label="Contactpersoon" empty={!selected.contactPerson}>{selected.contactPerson || 'Nog niet opgegeven'}</Field>
                  <Field label="E-mail" empty={!selected.contactEmail}>{selected.contactEmail || 'Nog niet opgegeven'}</Field>
                  {parseAdditionalContacts(selected).map((c, i) => (
                    <Field key={i} label={c.name || `Extra contact ${i + 1}`} empty={!c.email}>{c.email || 'Nog niet opgegeven'}</Field>
                  ))}
                </div>
              </div>

              <div style={refCardStyle}>
                <ModalSectionTitle>Levering</ModalSectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Field label="Hoofdspot">{selected.hoofdspotLength || '20'}″{variationsSummaryLabel(selected)}</Field>
                  <Field label="Aangemaakt">{new Date(selected.createdAt).toLocaleString('nl-NL')}</Field>
                  {selected.submittedAt && <Field label="Verzonden">{new Date(selected.submittedAt).toLocaleString('nl-NL')}</Field>}
                  <Field label="Op de radio" empty={!selected.airDate && !selected.dateUnknown}>{formatAirDate(selected)}</Field>
                </div>
              </div>
            </div>
            )}

            {modalTab === 'team' && (
            <div style={{ marginTop: 16 }}>
              <div style={modalCardStyle}>
                <ModalSectionTitle>Team</ModalSectionTitle>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: '#8C8880', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Toegewezen aan</div>
                    <select
                      value={ASSIGNEE_OPTIONS.includes(selected.assignedTo) ? selected.assignedTo : ''}
                      onChange={(e) => handleMetaChange(selected.id, { assignedTo: e.target.value })}
                      disabled={metaBusy}
                      style={{ width: '100%', border: '1px solid #C9C5B9', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#FFFFFF' }}
                    >
                      <option value="">Niet toegewezen</option>
                      {ASSIGNEE_OPTIONS.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: '1 1 160px' }}>
                    {/* Used to be a free-pick internal deadline here — but
                        production always works as fast as possible rather
                        than against a producer-chosen date, so it never
                        reflected anything real. Read-only now, showing the
                        one deadline that actually matters: when the client
                        needs this on air (see formatAirDate in flowData.js).
                        Set on the client's own delivery step, not editable
                        by the team. */}
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: '#8C8880', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Op de radio</div>
                    <div
                      style={{
                        width: '100%', border: '1px solid #C9C5B9', borderRadius: 8, padding: '8px 10px', fontSize: 13,
                        background: '#F3F1EA', color: deliveryDeadlineMeta(selected, selected.status).color,
                        fontWeight: deliveryDeadlineMeta(selected, selected.status).overdue ? 700 : 400,
                      }}
                    >
                      {deliveryDeadlineMeta(selected, selected.status).overdue ? '⚠ ' : ''}{formatAirDate(selected)}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #EAE3C4' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: '#8C8880', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
                    Interne notities <span style={{ opacity: 0.7 }}>(niet zichtbaar voor de klant)</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto', marginBottom: 10 }}>
                    {parseInternalNotes(selected).slice().reverse().map((n) => (
                      <div key={n.id} style={{ background: '#FFFFFF', border: '1px solid #EAE3C4', borderRadius: 8, padding: '8px 10px' }}>
                        {editingNoteId === n.id ? (
                          <div>
                            <textarea
                              autoFocus
                              value={editNoteDraft}
                              onChange={(e) => setEditNoteDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey && !editNoteBusy) {
                                  e.preventDefault();
                                  handleEditNote(selected.id, n.id);
                                } else if (e.key === 'Escape') {
                                  cancelEditNote();
                                }
                              }}
                              style={{ width: '100%', minHeight: 50, border: '1px solid #C9C5B9', borderRadius: 6, padding: '6px 8px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
                            />
                            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                              <button
                                type="button"
                                onClick={() => handleEditNote(selected.id, n.id)}
                                disabled={editNoteBusy || !editNoteDraft.trim()}
                                style={{
                                  border: 'none', borderRadius: 6, background: '#1D1D1D', color: '#FFFFFF', fontSize: 12, fontWeight: 600,
                                  padding: '5px 12px', cursor: editNoteBusy || !editNoteDraft.trim() ? 'not-allowed' : 'pointer', opacity: editNoteBusy || !editNoteDraft.trim() ? 0.6 : 1,
                                }}
                              >
                                Opslaan
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditNote}
                                disabled={editNoteBusy}
                                style={{ border: '1px solid #C9C5B9', borderRadius: 6, background: '#FFFFFF', color: '#5C5850', fontSize: 12, fontWeight: 600, padding: '5px 12px', cursor: 'pointer' }}
                              >
                                Annuleren
                              </button>
                            </div>
                            {editNoteError && (
                              <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: '#C2513F' }}>
                                Opslaan is niet gelukt, probeer het opnieuw.
                              </div>
                            )}
                          </div>
                        ) : (
                          <div
                            onClick={() => startEditNote(n)}
                            title="Klik om te bewerken"
                            style={{ cursor: 'pointer' }}
                          >
                            <div style={{ fontSize: 13, color: '#1D1D1D', lineHeight: 1.5 }}>{n.text}</div>
                            <div style={{ fontSize: 11, color: '#8C8880', marginTop: 4 }}>
                              {n.author || 'Team'} · {new Date(n.createdAt).toLocaleString('nl-NL')}{n.editedAt ? ' · bewerkt' : ''}
                            </div>
                          </div>
                        )}
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
                  {noteError && (
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: '#C2513F' }}>
                      Opslaan is niet gelukt, probeer het opnieuw.
                    </div>
                  )}
                </div>
              </div>
            </div>
            )}

            {modalTab === 'creatief' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
              {(() => {
                // Was missing the brief's variations entirely — the client
                // could always see them on their own overview page and in
                // the confirmation email, but the dashboard's Script card
                // only ever rendered the main hoofdspot script. Same
                // "what's different" diff-against-the-main-script treatment
                // as those client-facing views (see overview/page.js),
                // since a producer needs to see what makes each variation
                // different at a glance, not read the whole thing again.
                const mainText = selected.editedScript !== null && selected.editedScript !== undefined ? selected.editedScript : selected.generatedScript;
                const variationCount = variationsCountOf(selected);
                const variationScripts = parseVariationScripts(selected);
                return (
                  <div style={refCardStyle}>
                    <ModalSectionTitle>Script{variationCount > 0 ? ' · hoofdspot' : ''}</ModalSectionTitle>
                    <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: mainText ? 'italic' : 'normal', fontSize: 14.5, lineHeight: 1.6, color: mainText ? '#1D1D1D' : '#9C9890' }}>
                      {mainText || 'Nog geen script goedgekeurd.'}
                    </div>
                    {variationCount > 0 && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #EAE3C4' }}>
                        {Array.from({ length: variationCount }).map((_, idx) => {
                          const varText = variationScripts[idx] !== undefined ? variationScripts[idx] : mainText;
                          const tokens = diffWords(mainText || '', varText || '');
                          const changed = hasDiff(tokens);
                          return (
                            <div key={idx} style={{ marginTop: idx === 0 ? 0 : 14 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#5C5850', textTransform: 'uppercase', letterSpacing: '.03em' }}>
                                {variationCount > 1 ? `Variatie ${idx + 1}` : 'Variatie'}{changed ? ': wat verschilt' : ''}
                              </div>
                              {changed ? (
                                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 14.5, lineHeight: 1.6, marginTop: 6 }}>
                                  <DiffPreview tokens={tokens} />
                                </div>
                              ) : (
                                <div style={{ fontSize: 13, color: '#8C8880', marginTop: 6, fontStyle: 'italic' }}>
                                  Nog identiek aan het hoofdscript.
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div style={refCardStyle}>
                <ModalSectionTitle>Stem</ModalSectionTitle>
                <Field label="Gekozen stem" empty={!selected.selectedVoiceLabel}>{selected.selectedVoiceLabel || 'Nog niet gekozen'}</Field>
              </div>

              <div style={refCardStyle}>
                <ModalSectionTitle>Muziek</ModalSectionTitle>
                {(() => {
                  const tracks = parseSelectedTracks(selected);
                  if (!tracks.length) return <div style={{ fontSize: 13.5, color: '#9C9890' }}>Nog niet gekozen</div>;
                  // With only 1 candidate there's no ambiguity to resolve —
                  // that one is simply what's used, no picker needed. With
                  // more than one, a producer has to say which one actually
                  // ended up in the final production (see finalTrackOf in
                  // components/flowData.js) — this feeds both the final
                  // delivery email and, eventually, the accountant's
                  // invoice, so leaving it unmarked is a real gap, not a
                  // cosmetic one.
                  const usedTrack = finalTrackOf(selected);
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {tracks.length > 1 && (
                        <div style={{ fontSize: 11, color: '#8C8880', marginBottom: 2 }}>
                          {usedTrack ? 'Klik om aan te passen welke track uiteindelijk gebruikt is.' : 'Nog niet vastgelegd welke track gebruikt is — klik er één aan.'}
                        </div>
                      )}
                      {tracks.map((t, i) => {
                        const isUsed = tracks.length === 1 || (usedTrack && usedTrack.id === t.id);
                        return (
                          <div
                            key={t.id || i}
                            onClick={tracks.length > 1 ? () => handleMetaChange(selected.id, { usedTrackId: t.id }) : undefined}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8,
                              background: isUsed ? '#FBF0C8' : '#F3F1EA', cursor: tracks.length > 1 ? 'pointer' : 'default',
                              border: isUsed && tracks.length > 1 ? '1px solid #E6C858' : '1px solid transparent',
                            }}
                          >
                            <div style={{ width: 16, height: 16, borderRadius: '50%', background: isUsed ? '#E6C858' : '#D9D5C7', fontSize: 10, fontWeight: 700, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {isUsed && tracks.length > 1 ? '✓' : i + 1}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t.title || 'Onbekende track'}{t.artist ? ` (${t.artist})` : ''}</div>
                              <div style={{ fontSize: 11, color: '#8C6D1F', fontWeight: 600 }}>{t.playlistName || 'categorie onbekend'}</div>
                            </div>
                            {tracks.length > 1 && isUsed && (
                              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#8C6D1F', flex: 'none' }}>GEBRUIKT</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
            )}
            </div>
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
