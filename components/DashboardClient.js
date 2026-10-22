'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  variationsSummaryLabel, variationsCountOf, parseVariationScripts, parseReviewRounds as parseReviewRoundsOf,
  reviewOverIncludedCap, PRODUCTION_STATUS_LABELS, INCLUDED_REVISIONS, formatRoundLabel, formatDateTime, formatShortDateTime,
  formatAirDate, deliveryDeadlineMeta, TONE_LABELS, finalTrackOf, agencyNameOf, agencyContactEmailOf,
  parseVariationInfo, variationInfoLabelFull, safeWebsiteUrl, impressionsShort, audienceLabel, describeGenderSplit, scriptChangesOf, scriptCheckState,
} from './flowData';
import AutoTextarea from './AutoTextarea';
import Indicator from './Indicator';
import { scriptIndicator, productionIndicator } from './statusIndicators';
import { profileOfBrief, answersOfBrief } from '../lib/formProfile';
import { diffWords, hasDiff, DiffPreview } from './textDiff';
import { SCRIPT_SOURCE_META } from '../lib/reports';
import { jobState } from '../lib/scriptJobState';

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

// The dashboard's clickable summary tiles (below the range/search row) —
// each one is both a live count AND a one-click filter on the table below
// it (see toggleStatTile/activeTile). Deliberately a data-driven list, not
// four hardcoded JSX tiles, for two reasons: (1) the workflow has grown a
// real extra stage since these were first built — client approval
// ("Klaar"/status done) and actual final delivery to the agency
// (deliveredAt, via the Uitlevering tab) are now two different moments,
// and (2) which of these a producer wants to glance at is exactly the
// kind of thing that should be a per-browser choice, same as the table's
// own "⚙ Kolommen" picker — see STAT_TILE_STORAGE_KEY/DEFAULT_STAT_TILE_KEYS
// below. `total` isn't in here — it's rendered separately as a fixed,
// non-filtering, always-shown tile.
const STAT_TILE_DEFS = [
  { key: 'todo', label: 'To-do', color: STATUS_META.todo.color, filterFn: (b) => (b.status || 'todo') === 'todo' },
  { key: 'pending_customer', label: 'Wacht op klant', color: STATUS_META.pending_customer.color, filterFn: (b) => b.status === 'pending_customer' },
  { key: 'in_progress', label: 'In behandeling', color: STATUS_META.in_progress.color, filterFn: (b) => b.status === 'in_progress' },
  { key: 'done', label: 'Klaar', color: STATUS_META.done.color, filterFn: (b) => b.status === 'done' },
  {
    // Distinct from "Klaar" above: status flips to 'done' the moment the
    // client approves a round (see (mem|pg)ApproveReview in lib/db.js), but
    // the actual WAV hand-off — the "Uitlevering" tab, saveDelivery() — is a
    // separate producer action that can lag behind approval. This tile is
    // "how many are actually out the door", not just client-approved.
    key: 'delivered', label: 'Geleverd', color: '#6B4FA0', filterFn: (b) => !!b.deliveredAt,
  },
  {
    // The gap between the two tiles above, made explicit rather than making
    // a producer do the subtraction themselves: approved by the client, but
    // nothing's gone out to the agency yet.
    key: 'approvedNotDelivered', label: 'Goedgekeurd, nog niet geleverd', color: '#C2513F',
    filterFn: (b) => !!b.reviewApprovedAt && !b.deliveredAt,
  },
  { key: 'unseen', label: 'Nieuw, nog niet bekeken', color: '#8C6D1F', filterFn: (b) => isUnseenBrief(b) },
];
const STAT_TILE_STORAGE_KEY = 'tfa-dashboard-stat-tiles-v1';
// Matches the 4 tiles this dashboard already showed, plus "Geleverd" — the
// one genuinely new stage worth surfacing by default now that final
// delivery is tracked at all. Everything else in STAT_TILE_DEFS is opt-in.
const DEFAULT_STAT_TILE_KEYS = ['todo', 'pending_customer', 'in_progress', 'done', 'delivered'];

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

// Sections of the brief detail modal (see the `modalTab` state on DashboardClient).
// Order follows the pipeline: who the client is -> who owns it and when it
// must be live -> the scripts -> what the client picked (voice, music) ->
// production and review -> (once approved) hand-off.
const MODAL_TABS = [
  { key: 'overzicht', label: 'Overzicht' },
  { key: 'team', label: 'Team' },
  { key: 'script', label: 'Script' },
  { key: 'creatief', label: 'Stem & muziek' },
  { key: 'productie', label: 'Productie & review' },
];
// Appended only once the client has approved (see modalTabsFor below) — the
// final WAV hand-off to whoever needs it (Advision Media today, potentially
// someone else later) makes no sense to show before there's anything
// approved to hand off. "Uitlevering" (release/dispatch) rather than
// "Levering" deliberately — "Levering" is already the client-facing step 2
// (the air-date question); reusing it here for a completely different,
// producer-only thing would read as the same feature.
const DELIVERY_TAB = { key: 'uitlevering', label: 'Uitlevering' };
// Last and low-key: the full log of what was changed and decided, only for
// when you need to trace something back (see HistoryPanel).
const HISTORY_TAB = { key: 'historie', label: 'Historie' };
function modalTabsFor(brief) {
  const base = brief && brief.reviewApprovedAt ? MODAL_TABS.concat([DELIVERY_TAB]) : MODAL_TABS;
  return base.concat([HISTORY_TAB]);
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

function StatusSelect({ brief, onChange, compact, disabled }) {
  const meta = statusMetaOf(brief);
  return (
    <select
      value={brief.status || 'todo'}
      disabled={!!disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(brief.id, e.target.value)}
      style={{
        fontSize: compact ? 11 : 12.5,
        fontWeight: 600,
        padding: compact ? '3px 8px' : '6px 10px',
        borderRadius: 999,
        color: meta.color,
        background: '#F4F2EA',
        border: '1px solid #DAD6C8',
        cursor: disabled ? 'default' : 'pointer',
        appearance: 'none',
        WebkitAppearance: 'none',
        width: 'auto',
        paddingRight: compact ? 8 : 26,
        backgroundImage: compact ? 'none' : "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' stroke='%231D1D1D' stroke-width='1.6'%3E%3Cpath d='M1 1l4 4 4-4'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
      }}
      aria-label="Status van de brief"
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
      <div style={{ fontSize: 12, fontWeight: 500, color: '#5C5850' }}>{label}</div>
      <div style={{ fontSize: 13.5, marginTop: 3, color: empty ? '#9C9890' : '#1D1D1D' }}>{children}</div>
    </div>
  );
}

// Producer-side half of the "copywriter" workflow: the server drafts up to 3
// script versions when a client sends their brief. Here a producer checks and
// edits them, regenerates if they are off, and releases them to the client
// (who gets an email). Once released the drafts are read-only here — the
// client now owns the choice and their own edits.
// The one look for script text everywhere in the dashboard: readable width,
// generous line height, a calm highlight box. The script is the content;
// everything around it is quieter.
const SCRIPT_BOX = { background: '#FBF9EC', border: '1px solid #EAE3C4', borderRadius: 10, padding: '14px 16px', fontSize: 14.5, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: '#1D1D1D', maxWidth: '72ch' };
const META_TEXT = { fontSize: 12, color: '#6B675D', lineHeight: 1.5 };

// Copies a script to the clipboard (for pasting into the voice-over brief).
function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch (e) {}
      }}
      style={{ flex: 'none', border: '1px solid #D8D4C8', background: '#fff', borderRadius: 8, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', color: '#383209' }}
    >
      {done ? '✓ Gekopieerd' : 'Kopieer'}
    </button>
  );
}

// The full history of a brief, newest first: who did what and when, with
// the script texts behind a toggle so the list itself stays calm.
// Side padding that keeps the brief workspace content at most ~1100px wide, centred.
const PAGE_GUTTER = 'max(28px, calc((100% - 1100px) / 2))';
const navBtnStyle = (off) => ({ border: '1px solid #D2CFC8', background: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: off ? 'default' : 'pointer', opacity: off ? 0.4 : 1 });

function HistoryPanel({ brief, cardStyle }) {
  let events = [];
  try {
    const parsed = brief.eventLog ? JSON.parse(brief.eventLog) : [];
    if (Array.isArray(parsed)) events = parsed.slice().reverse();
  } catch (e) {}
  const [openAll, setOpenAll] = useState(false);
  const ACTOR = { klant: { label: 'Klant', color: '#6B4FA0' }, tfa: { label: 'TFA', color: '#8C6D1F' }, systeem: { label: 'Systeem', color: '#8C8880' } };
  return (
    <div style={cardStyle}>
      <ModalSectionTitle>Historie</ModalSectionTitle>
      <div style={{ fontSize: 12, color: '#5C5850', lineHeight: 1.5, marginBottom: 12 }}>
        Wat er met deze brief is gebeurd: wat de klant koos en aanpaste, en wat wij deden. Alleen zichtbaar voor TFA.
      </div>
      {events.some((e) => e.detail) && (
        <button type="button" onClick={() => setOpenAll((o) => !o)} style={{ marginBottom: 8, border: '1px solid #D8D4C8', background: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          {openAll ? 'Alle teksten inklappen' : 'Alle teksten uitklappen'}
        </button>
      )}
      {events.length === 0 && <div style={{ fontSize: 13, color: '#8C8880' }}>Nog niets vastgelegd. Alles vanaf nu komt hier te staan.</div>}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {events.map((e) => {
          const a = ACTOR[e.actor] || ACTOR.systeem;
          return (
            <div key={e.id} style={{ display: 'flex', gap: 12, padding: '9px 0', borderTop: '1px solid #F0EEE6' }}>
              <div style={{ flex: 'none', width: 118, fontSize: 11.5, color: '#8C8880' }}>{formatShortDateTime(e.at)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, lineHeight: 1.45 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: a.color, marginRight: 8 }}>{a.label}</span>
                  {e.text}
                </div>
                {e.detail && (
                  <details style={{ marginTop: 4 }} open={openAll}>
                    <summary style={{ cursor: 'pointer', fontSize: 11.5, color: '#8C8880' }}>Toon volledige tekst</summary>
                    <div style={{ marginTop: 6, background: '#FBF9EC', border: '1px solid #EAE3C4', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{e.detail}</div>
                  </details>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScriptDraftsPanel({ brief, onUpdated, cardStyle }) {
  let drafts = [];
  try {
    const parsed = brief.scriptHistory ? JSON.parse(brief.scriptHistory) : [];
    if (Array.isArray(parsed)) drafts = parsed;
  } catch (e) {}
  const released = !!brief.scriptsReleasedAt;
  const varCount = brief.needsVariations ? variationsCountOf(brief) : 0;
  const varInfos = parseVariationInfo(brief);
  const [edits, setEdits] = useState({});
  const [ownScript, setOwnScript] = useState('');
  const [ownVariations, setOwnVariations] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  // Per-proposal "opmerking voor opnieuw schrijven" and the one for a new extra proposal.
  const [comments, setComments] = useState({});
  const [addComment, setAddComment] = useState('');
  const [replaceOpen, setReplaceOpen] = useState(null);
  // The writer runs on the server in the background: follow it by reading the
  // brief. Leaving this screen or clicking elsewhere never interrupts it.
  const job = jobState(brief.scriptJob);
  const running = job.status === 'running';
  useEffect(() => {
    let cancelled = false;
    const sync = () => fetch(`/api/dashboard/briefs/${brief.id}/scripts`).then((r) => (r.ok ? r.json() : null)).then((data) => { if (data && !cancelled) onUpdated(data); }).catch(() => {});
    sync();
    if (!running) return () => { cancelled = true; };
    const timer = setInterval(sync, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [brief.id, running]); // eslint-disable-line react-hooks/exhaustive-deps
  // Optimistic recommendation tick: the checkbox flips instantly, the save
  // runs silently in the background and is rolled back if it fails.
  const [recPending, setRecPending] = useState(null);

  useEffect(() => { setEdits({}); setError(''); setActive(0); setRecPending(null); setReplaceOpen(null); }, [brief.id, brief.scriptGeneratedAt]);

  function isRec(d) {
    if (!recPending) return !!d.recommended;
    if (recPending.on) return d.id === recPending.id;
    return d.id === recPending.id ? false : !!d.recommended;
  }
  async function toggleRec(d, on) {
    setRecPending({ id: d.id, on });
    setError('');
    try {
      const res = await fetch(`/api/dashboard/briefs/${brief.id}/scripts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: d.id, recommended: on }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.message || 'Dat is niet gelukt. Probeer het opnieuw.');
      else onUpdated(data);
    } catch (e) {
      setError('Geen verbinding. Probeer het opnieuw.');
    }
    setRecPending(null);
  }

  function valueOf(d, field) {
    const e = edits[d.id];
    return e && e[field] !== undefined ? e[field] : d[field] || '';
  }
  // One text per requested variation: the draft's own list, falling back to
  // the legacy single `variation` for the first one.
  function variationsOf(d) {
    const e = edits[d.id];
    if (e && Array.isArray(e.variations)) return e.variations;
    if (Array.isArray(d.variations) && d.variations.length) return d.variations;
    return d.variation ? [d.variation] : [];
  }
  function setVariation(d, idx, value) {
    const arr = variationsOf(d).slice();
    while (arr.length < varCount) arr.push('');
    arr[idx] = value;
    setField(d, 'variations', arr);
  }
  function setField(d, field, value) {
    setEdits((cur) => ({ ...cur, [d.id]: { ...(cur[d.id] || {}), [field]: value } }));
  }
  async function call(method, body, label) {
    setBusy(label);
    setError('');
    try {
      const res = await fetch(`/api/dashboard/briefs/${brief.id}/scripts`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || 'Dat is niet gelukt. Probeer het opnieuw.');
        return null;
      }
      onUpdated(data);
      return data;
    } catch (e) {
      setError('Geen verbinding. Probeer het opnieuw.');
      return null;
    } finally {
      setBusy('');
    }
  }
  async function saveDraft(d) {
    const e = edits[d.id];
    if (!e) return null;
    const out = await call('PATCH', { versionId: d.id, ...e }, 'save-' + d.id);
    if (out) setEdits((cur) => { const n = { ...cur }; delete n[d.id]; return n; });
    return out;
  }
  // Rewrite / remove / add ONE proposal. The comment goes into the AI prompt
  // on top of the standing prompt (see lib/scriptgen.js).
  async function proposalAction(action, d) {
    const comment = action === 'add' ? addComment : (comments[d.id] || '');
    const out = await call('POST', { action, versionId: d ? d.id : undefined, comment }, (action === 'add' ? 'add' : action + '-' + d.id));
    if (!out) return;
    if (d) {
      setEdits((cur) => { const n = { ...cur }; delete n[d.id]; return n; });
      setComments((cur) => { const n = { ...cur }; delete n[d.id]; return n; });
    }
    if (action === 'add') { setAddComment(''); }
  }
  async function release() {
    // Save any unsaved edits first so the client gets what is on screen.
    for (const d of drafts) {
      if (edits[d.id]) {
        const ok = await saveDraft(d);
        if (!ok) return;
      }
    }
    if (typeof window !== 'undefined' && !window.confirm('Scripts vrijgeven aan de klant (' + drafts.length + ' voorstel' + (drafts.length === 1 ? '' : 'len') + ')? De klant krijgt hier meteen een e-mail over.')) return;
    await call('POST', { action: 'release' }, 'release');
  }

  const dirty = Object.keys(edits).length > 0;
  const scriptBox = SCRIPT_BOX;
  const arrowStyle = (off) => ({ flex: 'none', width: 30, height: 30, borderRadius: 8, border: '1px solid #D8D4C8', background: '#fff', fontSize: 18, lineHeight: 1, cursor: off ? 'default' : 'pointer', opacity: off ? 0.35 : 1 });
  const taStyle = { width: '100%', minHeight: 90, fontSize: 14, lineHeight: 1.65, padding: '10px 12px', border: '1px solid #DAD6C8', borderRadius: 8, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', maxWidth: '72ch' };

  return (
    <div style={{ ...cardStyle, border: '1.5px solid ' + (released ? '#EEECE3' : '#E6C858'), background: released ? '#FFFFFF' : '#FBF9EC' }}>
      <ModalSectionTitle>Scriptvoorstellen {released ? '· vrijgegeven' : '· nakijken'}</ModalSectionTitle>
      {released ? (
        <div style={{ fontSize: 12.5, color: '#5C5850', lineHeight: 1.5 }}>
          Vrijgegeven aan de klant op {formatShortDateTime(brief.scriptsReleasedAt)}.
          {brief.finalizedAt ? ' De klant heeft alles bevestigd.' : ' De klant kiest nu een voorstel.'}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: '#5C5850', lineHeight: 1.5, marginBottom: 10 }}>
          De klant ziet nu een wachtpagina. Pas de teksten aan waar nodig en geef ze vrij: de klant krijgt dan een e-mail en kiest een voorstel.
        </div>
      )}

      {released && !brief.finalizedAt && brief.scriptAuditStatus === 'nofit' && (
        <div style={{ margin: '10px 0 12px', background: '#FBF3F1', border: '1px solid #E3B8AF', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#8A2E1E' }}>De klant zegt dat geen van de voorstellen past</div>
          {brief.scriptAuditReply && <div style={{ fontSize: 13, color: '#1D1D1D', marginTop: 5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>&ldquo;{brief.scriptAuditReply}&rdquo;</div>}
          <div style={{ fontSize: 12, color: '#5C5850', marginTop: 6, lineHeight: 1.5 }}>
            Neem contact op met de klant, of neem de voorstellen terug, schrijf nieuwe en geef ze opnieuw vrij.
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {brief.contactEmail && (
              <a href={'mailto:' + brief.contactEmail + '?subject=' + encodeURIComponent('Je scriptvoorstellen: ' + (brief.companyName || ''))} style={{ fontSize: 12.5, fontWeight: 600, color: '#383209' }}>Mail de klant</a>
            )}
            <button
              type="button"
              disabled={!!busy}
              onClick={async () => {
                if (typeof window !== 'undefined' && !window.confirm('Voorstellen terugnemen? De klant ziet daarna weer de wachtpagina totdat je nieuwe voorstellen vrijgeeft.')) return;
                setBusy('reopen');
                try {
                  const res = await fetch(`/api/dashboard/briefs/${brief.id}/script-reopen`, { method: 'POST' });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) setError(data.message || 'Dat is niet gelukt.');
                  else onUpdated(data);
                } catch (e) { setError('Geen verbinding. Probeer het opnieuw.'); }
                setBusy('');
              }}
              style={{ border: '1px solid #D8D4C8', background: '#fff', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
            >
              {busy === 'reopen' ? 'Bezig…' : 'Voorstellen terugnemen en opnieuw schrijven'}
            </button>
          </div>
        </div>
      )}

      {drafts.length === 0 && !released && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, color: '#5C5850', marginBottom: 6, lineHeight: 1.5 }}>
            Script van het agentschap (of zelf geschreven)? Plak het hier, dan krijgt de klant dat als enig voorstel.
          </div>
          <AutoTextarea minHeight={150} style={taStyle} value={ownScript} onChange={(e) => setOwnScript(e.target.value)} placeholder="Plak hier het script" />
          {Array.from({ length: varCount }).map((_, i) => (
            <div key={i}>
              <div style={{ fontSize: 11, color: '#8C8880', margin: '8px 0 4px' }}>
                {varCount > 1 ? 'Variatie ' + (i + 1) : 'Variatie'}{variationInfoLabelFull(varInfos[i]) ? ' · ' + variationInfoLabelFull(varInfos[i]) : ''} (optioneel)
              </div>
              <textarea style={{ ...taStyle, minHeight: 64 }} value={ownVariations[i] || ''} onChange={(e) => setOwnVariations((cur) => { const n = cur.slice(); n[i] = e.target.value; return n; })} placeholder="Variatietekst" />
            </div>
          ))}
          <button
            type="button"
            disabled={!!busy || !ownScript.trim()}
            onClick={() => call('POST', { action: 'provide', main: ownScript, variations: ownVariations }, 'provide')}
            style={{ marginTop: 8, border: '1px solid #D8D4C8', background: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: !ownScript.trim() ? 0.6 : 1 }}
          >
            {busy === 'provide' ? 'Bezig…' : 'Script toevoegen'}
          </button>
        </div>
      )}
      {running && (
        <div style={{ marginBottom: 12, background: '#FFFFFF', border: '1px solid #E6C858', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: '#383209', lineHeight: 1.5 }}>
          <b>{job.kind === 'regenerate' || job.kind === 'initial' ? 'De scriptvoorstellen worden geschreven' : 'Er wordt een voorstel geschreven'}</b>
          {' '}op de achtergrond; dit kan tot een minuut duren. Je kunt gewoon verder werken of een andere brief openen: het verschijnt hier vanzelf.
        </div>
      )}
      {job.status === 'failed' && (
        <div style={{ marginBottom: 12, background: '#FBF3F1', border: '1px solid #E3B8AF', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: '#8A2E1E', lineHeight: 1.5 }}>
          {job.message || 'Genereren is niet gelukt.'}{' '}
          <button type="button" onClick={() => call('POST', { action: 'clear_job' }, 'clear')} style={{ border: 'none', background: 'transparent', color: '#8A2E1E', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 12.5 }}>Sluiten</button>
        </div>
      )}
      {drafts.length === 0 && !running && job.status !== 'failed' && (
        <div style={{ fontSize: 12.5, color: '#C2513F', marginBottom: 10 }}>
          De concepten worden nog geschreven (dat duurt even, ververs straks). Zijn ze er na een minuut nog niet, klik dan op &ldquo;Opnieuw schrijven&rdquo; of plak hierboven zelf een script.
        </div>
      )}

      {drafts.length > 0 && (() => {
        const i = Math.min(active, drafts.length - 1);
        const d = drafts[i];
        const rec = isRec(d);
        return (
          <div key={d.id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <button type="button" aria-label="Vorig voorstel" disabled={i === 0} onClick={() => setActive(i - 1)} style={arrowStyle(i === 0)}>‹</button>
              <div style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#8C6D1F' }}>
                Voorstel {i + 1} van {drafts.length}{d.source === 'template' ? ' · sjabloon (geen AI beschikbaar)' : d.source === 'agency' ? ' · script van agentschap' : ''}
                {rec && <span style={{ marginLeft: 8, background: '#E6C858', color: '#383209', borderRadius: 999, padding: '2px 8px', letterSpacing: 0, textTransform: 'none' }}>✓ Onze aanbeveling</span>}
              </div>
              <button type="button" aria-label="Volgend voorstel" disabled={i === drafts.length - 1} onClick={() => setActive(i + 1)} style={arrowStyle(i === drafts.length - 1)}>›</button>
            </div>
            {released ? (
              <>
                <div style={scriptBox}>{d.main}</div>
                {rec && d.reason && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#5C5850' }}>
                    <b style={{ color: '#8C6D1F' }}>Reden</b>: {d.reason}
                  </div>
                )}
                {Array.from({ length: varCount }).map((_, vi) => (variationsOf(d)[vi] ? (
                  <div key={vi} style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: '#8C8880', marginBottom: 3 }}>{varCount > 1 ? 'Variatie ' + (vi + 1) : 'Variatie'}{variationInfoLabelFull(varInfos[vi]) ? ' · ' + variationInfoLabelFull(varInfos[vi]) : ''}</div>
                    <div style={{ ...scriptBox, fontSize: 14 }}>{variationsOf(d)[vi]}</div>
                  </div>
                ) : null))}
              </>
            ) : (
              <>
                <AutoTextarea minHeight={150} style={taStyle} value={valueOf(d, 'main')} onChange={(e) => setField(d, 'main', e.target.value)} onBlur={() => saveDraft(d)} />
                {drafts.length > 1 && (
                  <div style={{ marginTop: 6 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5C5850', cursor: 'pointer' }}>
                      <input type="checkbox" checked={rec} onChange={(e) => toggleRec(d, e.target.checked)} />
                      Hier neigen wij naar (aanbeveling, optioneel)
                    </label>
                    {rec && (
                      <textarea
                        style={{ ...taStyle, minHeight: 48, marginTop: 6 }}
                        value={valueOf(d, 'reason')}
                        placeholder="Waarom neigen jullie hiernaar? (optioneel, de klant ziet dit onder het voorstel)"
                        maxLength={600}
                        onChange={(e) => setField(d, 'reason', e.target.value)}
                        onBlur={() => saveDraft(d)}
                      />
                    )}
                  </div>
                )}
                {Array.from({ length: varCount }).map((_, vi) => (
                  <div key={vi}>
                    <div style={{ fontSize: 11, color: '#8C8880', margin: '6px 0 4px' }}>
                      {varCount > 1 ? 'Variatie ' + (vi + 1) : 'Variatie'} bij dit voorstel{variationInfoLabelFull(varInfos[vi]) ? ' · ' + variationInfoLabelFull(varInfos[vi]) : ''}
                    </div>
                    <AutoTextarea minHeight={90} style={taStyle} value={variationsOf(d)[vi] || ''} onChange={(e) => setVariation(d, vi, e.target.value)} onBlur={() => saveDraft(d)} />
                  </div>
                ))}
                <div style={{ marginTop: 12, borderTop: '1px solid #EAE3C4', paddingTop: 10 }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" disabled={!!busy || running} onClick={() => setReplaceOpen(replaceOpen === d.id ? null : d.id)} style={{ border: '1px solid #D8D4C8', background: replaceOpen === d.id ? '#F4F1E4' : '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                      Vervang dit voorstel door een nieuw
                    </button>
                    <button
                      type="button"
                      disabled={!!busy || drafts.length <= 1}
                      title={drafts.length <= 1 ? 'Er moet minstens één voorstel overblijven' : ''}
                      onClick={() => { if (window.confirm('Dit voorstel weghalen? De klant krijgt dan ' + (drafts.length - 1) + ' voorstel' + (drafts.length - 1 === 1 ? '' : 'len') + '.')) proposalAction('remove', d); }}
                      style={{ border: 'none', background: 'transparent', color: '#C2513F', fontWeight: 600, fontSize: 12.5, textDecoration: 'underline', cursor: drafts.length <= 1 ? 'default' : 'pointer', padding: 0, opacity: drafts.length <= 1 ? 0.4 : 1 }}
                    >
                      {busy === 'remove-' + d.id ? 'Bezig…' : 'Voorstel weghalen'}
                    </button>
                  </div>
                  {replaceOpen === d.id && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 11.5, color: '#5C5850', marginBottom: 4, lineHeight: 1.5 }}>
                        Er komt een nieuw script (inclusief variaties) voor dit voorstel; de andere blijven staan. Een opmerking is optioneel en wordt aan de AI-instructie toegevoegd.
                      </div>
                      <AutoTextarea
                        minHeight={60}
                        style={taStyle}
                        value={comments[d.id] || ''}
                        maxLength={1000}
                        placeholder="Opmerking, bijv. 'minder commercieel, meer humor' of 'begin met de actie'"
                        onChange={(e) => setComments((cur) => ({ ...cur, [d.id]: e.target.value }))}
                      />
                      <div>
                      <button type="button" disabled={!!busy || running} onClick={async () => { await proposalAction('rewrite', d); setReplaceOpen(null); }} className="btn-primary" style={{ marginTop: 8, padding: '9px 16px', flex: 'none' }}>
                        {busy === 'rewrite-' + d.id ? 'Bezig met starten…' : 'Nieuw voorstel schrijven'}
                      </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {!released && drafts.length > 0 && drafts.length < 3 && (
        <div style={{ marginBottom: 14, background: '#FFFFFF', border: '1px solid #E6C858', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 12.5, color: '#383209', lineHeight: 1.5 }}>
            Er {drafts.length === 1 ? 'is' : 'zijn'} maar {drafts.length} voorstel{drafts.length === 1 ? '' : 'len'}. De klant kiest het liefst uit drie.
          </div>
          <AutoTextarea minHeight={44} style={{ ...taStyle, marginTop: 8 }} value={addComment} maxLength={1000} placeholder="Optionele opmerking voor het nieuwe voorstel, bijv. 'speelser, met een knipoog'" onChange={(e) => setAddComment(e.target.value)} />
          <button type="button" disabled={!!busy || running} onClick={() => proposalAction('add')} style={{ marginTop: 8, border: '1px solid #D8D4C8', background: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            {busy === 'add' ? 'Bezig met starten…' : 'Voorstel toevoegen (' + (drafts.length + 1) + ' van 3)'}
          </button>
        </div>
      )}

      {error && <div style={{ fontSize: 12.5, color: '#C2513F', fontWeight: 600, marginBottom: 8 }}>{error}</div>}

      {!released && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" disabled={!!busy || running || drafts.length === 0} onClick={release} className="btn-primary" style={{ padding: '10px 18px', flex: 'none' }}>
            {busy === 'release' ? 'Bezig…' : 'Vrijgeven aan klant' + (drafts.length ? ' (' + drafts.length + ' voorstel' + (drafts.length === 1 ? '' : 'len') + ')' : '')}
          </button>
          <button
            type="button"
            disabled={!!busy || running}
            onClick={() => {
              if (dirty && typeof window !== 'undefined' && !window.confirm('Je aanpassingen gaan verloren. Toch opnieuw schrijven?')) return;
              call('POST', { action: 'regenerate' }, 'regen');
            }}
            style={{ border: 'none', background: 'transparent', color: '#383209', fontWeight: 600, fontSize: 12.5, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
          >
            {busy === 'regen' ? 'Bezig met starten…' : 'Alles opnieuw schrijven (3 nieuwe voorstellen)'}
          </button>
        </div>
      )}
    </div>
  );
}

// The producer's check of what the client changed in the script after TFA's
// proposals. Nothing the client edited counts as approved until this panel
// says so: approve it, or send a counter proposal in the app (the client gets
// an email and answers on their status page).
function ScriptAuditPanel({ brief, cardStyle, onUpdated }) {
  const changes = scriptChangesOf(brief);
  const status = brief.scriptAuditStatus || '';
  const [note, setNote] = useState('');
  const mainNow = brief.editedScript !== null && brief.editedScript !== undefined ? brief.editedScript : brief.generatedScript || '';
  const [counter, setCounter] = useState(mainNow);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [showCounter, setShowCounter] = useState(false);
  useEffect(() => { setNote(''); setCounter(mainNow); setShowCounter(false); setError(''); }, [brief.id, brief.scriptAuditStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!brief.finalizedAt || (!changes.any && !status)) return null;

  async function act(body, label) {
    setBusy(label); setError('');
    try {
      const res = await fetch(`/api/dashboard/briefs/${brief.id}/script-audit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.message || 'Dat is niet gelukt. Probeer het opnieuw.');
      else onUpdated(data);
    } catch (e) { setError('Geen verbinding. Probeer het opnieuw.'); }
    setBusy('');
  }

  const generated = brief.generatedScript || '';
  const mainTokens = diffWords(generated, mainNow);
  const pill = status === 'approved'
    ? { t: 'Akkoord', tone: 'ok', icon: 'check' }
    : status === 'counter'
      ? { t: 'Wacht op klant', tone: 'neutral', icon: 'clock' }
      : { t: 'Controleren', tone: 'attention', icon: 'alert' };
  const btn = { border: '1px solid #D8D4C8', background: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };

  const body = (
    <div style={{ ...cardStyle, border: '1.5px solid ' + (status === 'approved' ? '#EEECE3' : '#E6C858') }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Scriptcontrole</div>
        <Indicator tone={pill.tone} icon={pill.icon} label={pill.t} />
      </div>
      <div style={{ ...META_TEXT, marginBottom: 10 }}>
        De klant paste het script aan na onze voorstellen en weet dat het pas definitief is na jouw controle.
      </div>

      {changes.main && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#5C5850', textTransform: 'uppercase', letterSpacing: '.03em' }}>Aanpassing in de hoofdspot (t.o.v. ons voorstel)</div>
          <div style={{ fontSize: 14, lineHeight: 1.6, marginTop: 5 }}><DiffPreview tokens={mainTokens} /></div>
        </div>
      )}
      {changes.variations.length > 0 && !changes.main && (
        <div style={{ fontSize: 12.5, color: '#5C5850', marginBottom: 10 }}>
          De klant heeft {changes.variations.length === 1 ? 'variatie ' + (changes.variations[0] + 1) : 'meerdere variaties'} aangepast; zie hieronder bij het script wat er verschilt.
        </div>
      )}

      {brief.scriptAuditReply && status === 'pending' && (
        <div style={{ margin: '0 0 10px', background: '#FBF9EC', border: '1px solid #EAE3C4', borderRadius: 8, padding: '9px 12px', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          <b>Reactie van de klant op ons voorstel:</b> {brief.scriptAuditReply}
        </div>
      )}
      {status === 'counter' && (
        <div style={{ margin: '0 0 10px', background: '#F6F4EC', border: '1px solid #E3DFD2', borderRadius: 8, padding: '9px 12px', fontSize: 13, lineHeight: 1.5 }}>
          {brief.scriptAuditNote && <div style={{ whiteSpace: 'pre-wrap' }}><b>Onze toelichting:</b> {brief.scriptAuditNote}</div>}
          {brief.scriptCounterText && <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}><b>Voorgestelde tekst:</b> {brief.scriptCounterText}</div>}
        </div>
      )}

      {status !== 'approved' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" disabled={!!busy} onClick={() => act({ action: 'approve', notify: true }, 'approve')} style={{ ...btn, background: '#1D1D1D', color: '#fff', border: '1px solid #1D1D1D' }}>
            {busy === 'approve' ? 'Bezig…' : 'Akkoord en klant laten weten'}
          </button>
          <button type="button" disabled={!!busy} onClick={() => act({ action: 'approve', notify: false }, 'approve-quiet')} style={btn}>
            {busy === 'approve-quiet' ? 'Bezig…' : 'Akkoord (zonder mail)'}
          </button>
          <button type="button" disabled={!!busy} onClick={() => setShowCounter((v) => !v)} style={btn}>Tegenvoorstel sturen</button>
          {brief.contactEmail && (
            <a href={'mailto:' + brief.contactEmail + '?subject=' + encodeURIComponent('Je script voor ' + (brief.companyName || 'je commercial'))} style={{ fontSize: 12.5, fontWeight: 600, color: '#383209' }}>
              Klant direct mailen
            </a>
          )}
        </div>
      )}
      {status !== 'approved' && showCounter && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: '#5C5850', marginBottom: 4 }}>Toelichting aan de klant</div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1500} placeholder="Bijv. de zin over de prijs past niet in 20 seconden, daarom stellen we dit voor" style={{ width: '100%', minHeight: 60, fontSize: 13, lineHeight: 1.5, padding: '8px 10px', border: '1px solid #DAD6C8', borderRadius: 8, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          <div style={{ fontSize: 12, color: '#5C5850', margin: '8px 0 4px' }}>Voorgestelde tekst (optioneel, de klant kan die met één klik overnemen)</div>
          <textarea value={counter} onChange={(e) => setCounter(e.target.value)} maxLength={4000} style={{ width: '100%', minHeight: 90, fontSize: 13, lineHeight: 1.55, padding: '8px 10px', border: '1px solid #DAD6C8', borderRadius: 8, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              disabled={!!busy || (!note.trim() && !counter.trim())}
              onClick={() => act({ action: 'counter', note, counterText: counter.trim() === mainNow.trim() ? '' : counter }, 'counter')}
              style={{ ...btn, background: '#E6C858', border: '1px solid #E6C858', color: '#1D1D1D' }}
            >
              {busy === 'counter' ? 'Bezig…' : 'Verstuur tegenvoorstel (e-mail naar klant)'}
            </button>
          </div>
        </div>
      )}
      {error && <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: '#C2513F' }}>{error}</div>}
    </div>
  );
  // A finished check folds away: it is history, not something to act on.
  if (status === 'approved') {
    return (
      <details style={{ padding: '0 4px' }}>
        <summary style={{ cursor: 'pointer', fontSize: 12.5, color: '#6B675D', display: 'flex', alignItems: 'center', gap: 8, listStyle: 'revert' }}>
          <Indicator tone="ok" icon="check" label="Scriptcontrole afgerond" /> <span>{brief.scriptAuditedAt ? formatShortDateTime(brief.scriptAuditedAt) : ''}</span>
        </summary>
        <div style={{ marginTop: 8 }}>{body}</div>
      </details>
    );
  }
  return body;
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
      <div style={{ fontSize: 11, color: '#9C9890', marginBottom: 3 }}>{formatDateTime(latest.createdAt)} · nieuwste</div>
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
                  <span style={{ color: '#B4B0A5', fontSize: 11 }}>{formatDateTime(f.createdAt)}: </span>
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
  scriptStage: (b) => scriptIndicator(b).rank,
  productionStage: (b) => productionIndicator(b).rank,
  overIncludedCap: (b) => (reviewOverIncludedCap(b) ? 1 : 0),
};

export default function DashboardClient({ briefs, readOnly = false }) {
  const [rows, setRows] = useState(briefs);
  const [range, setRange] = useState('30d');
  const [sortField, setSortField] = useState('updatedAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  // Clicking a summary tile (To-do / Wacht op klant / ... / Geleverd, see
  // STAT_TILE_DEFS) filters the table below it to just that tile's briefs;
  // clicking the same tile again (or picking a different one) toggles back
  // to the full overview. Stores the tile KEY now, not a raw status string,
  // since a tile's filter can be based on something other than `status`
  // (delivered/approvedNotDelivered/unseen all read other fields).
  const [activeTile, setActiveTile] = useState(null);
  // Free-text search across company name, contact person, and contact
  // email — the range/status filters above narrow by date/workflow stage,
  // but there was previously no way to just find "that one brief" once the
  // list grows past a page or two, short of paging through by eye.
  const [searchQuery, setSearchQuery] = useState('');
  // Soft archive ("opruimen"): archived briefs are hidden from the working
  // view, never deleted. Staff can look at them and restore them.
  const [showArchived, setShowArchived] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState('');

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

  function toggleStatTile(key) {
    setActiveTile((cur) => (cur === key ? null : key));
    setPage(1);
  }

  // Which optional stat tiles are on, plus whether its picker dropdown is
  // open — same persistence pattern as visibleColumns/columnsMenuOpen above
  // (start at the default on every render including SSR, then swap to
  // whatever's saved in localStorage right after mount).
  const [visibleStatTiles, setVisibleStatTiles] = useState(DEFAULT_STAT_TILE_KEYS);
  const [statTilesMenuOpen, setStatTilesMenuOpen] = useState(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STAT_TILE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setVisibleStatTiles(parsed);
      }
    } catch (e) {}
  }, []);
  function toggleStatTileVisible(key) {
    setVisibleStatTiles((cur) => {
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      try {
        window.localStorage.setItem(STAT_TILE_STORAGE_KEY, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
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
  useEffect(() => {
    const onPop = () => setSelected(null);
    const onKey = (e) => { if (e.key === 'Escape') closeBrief(); };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('keydown', onKey); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Prefill order: an address already sent to (above) beats everything;
    // failing that, this brief's own agency contact (see the /dashboard/
    // agencies screen) is a much better default than an empty field or
    // whatever was typed for a previous, unrelated brief.
    setDeliveryEmailDraft((selected && selected.deliveryRecipientEmail) || (selected && agencyContactEmailOf(selected)) || '');
    setDeliveryError(false);
    // Default straight to Productie & review once a brief is actually IN
    // that stage — a producer opening a brief mid-production almost always
    // wants the Frame.io link/feedback, not the client's own answers, and
    // making them click "Productie & review" every single time before
    // reaching it was exactly the extra-clicks complaint. Anything earlier
    // in the process (still filling in the brief, nothing shared yet)
    // still opens on Overzicht as before.
    // A brief whose scripts are waiting for TFA opens straight on Script.
    const scriptsWaiting = !!(selected && selected.submittedAt && !selected.scriptsReleasedAt && !selected.finalizedAt);
    setModalTab(!readOnly && scriptsWaiting ? 'script' : !readOnly && selected && selected.productionStatus ? 'productie' : 'overzicht');
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

  // Archive or restore briefs: optimistic, rolled back if the save fails.
  async function setArchived(ids, archived) {
    if (!ids.length) return;
    const prev = rows;
    const stamp = archived ? new Date().toISOString() : null;
    const idSet = new Set(ids);
    setRows((cur) => cur.map((b) => (idSet.has(b.id) ? { ...b, archivedAt: stamp } : b)));
    setArchiveBusy(true);
    setArchiveError('');
    try {
      const res = await fetch('/api/dashboard/briefs/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, archived }),
      });
      if (!res.ok) throw new Error('archive failed');
      setSelected((cur) => (cur && idSet.has(cur.id) ? null : cur));
      setCleanupOpen(false);
      setExportDone(false);
    } catch (err) {
      setRows(prev);
      setArchiveError('Archiveren is niet gelukt. Er is niets aangepast.');
    } finally {
      setArchiveBusy(false);
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
  function closeBrief() {
    if (typeof window !== 'undefined' && window.history.state && window.history.state.tfaBrief) window.history.back();
    else setSelected(null);
  }

  function handleOpenBrief(b) {
    setSelected(b);
    // One history entry for the whole workspace, so the browser's back
    // button returns to the dashboard instead of leaving the page.
    if (typeof window !== 'undefined' && !(window.history.state && window.history.state.tfaBrief)) {
      window.history.pushState({ tfaBrief: true }, '');
    }
    if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0;
    // Agency logins are read-only: they never mark briefs as seen.
    if (readOnly) setModalTab('overzicht');
    if (readOnly || !isUnseenBrief(b)) return;
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
            <span role="img" aria-label="Nieuw, nog niet bekeken" title="Nieuw: nog niet bekeken" style={{ width: 8, height: 8, borderRadius: '50%', background: '#E6C858', flex: 'none', boxShadow: '0 0 0 3px rgba(230,200,88,.35)' }} />
          )}
          <span>{b.companyName || 'Nog geen bedrijfsnaam'}</span>
        </div>
      ),
      cellStyle: (b, ctx) => ({ fontWeight: ctx.unseen ? 700 : 600, color: b.companyName ? '#1D1D1D' : '#9C9890' }),
    },
    {
      key: 'scriptStage', core: true, label: 'Script',
      cell: (b) => { const i = scriptIndicator(b); return <Indicator tone={i.tone} icon={i.icon} label={i.label} title={i.title} />; },
    },
    {
      key: 'productionStage', core: true, label: 'Productie',
      cell: (b) => { const i = productionIndicator(b); return <Indicator tone={i.tone} icon={i.icon} label={i.label} title={i.title} />; },
    },
    { key: 'hoofdspotLength', label: 'Spot', cell: (b) => <>{b.hoofdspotLength || '20'}″{variationsSummaryLabel(b)}</> },
    { key: 'assignedTo', label: 'Toegewezen', cell: (b) => b.assignedTo || 'Niet toegewezen', cellStyle: (b) => ({ color: b.assignedTo ? '#1D1D1D' : '#9C9890' }) },
    {
      key: 'airDate', label: 'Op de radio',
      cell: (b, ctx) => <>{ctx.due.overdue ? '⚠ ' : ''}{ctx.due.label}</>,
      cellStyle: (b, ctx) => ({ color: ctx.due.color, fontWeight: ctx.due.overdue ? 700 : 400 }),
    },
    { key: 'updatedAt', label: 'Laatst gewijzigd', cell: (b) => formatShortDateTime(b.updatedAt), cellStyle: () => ({ color: '#5C5850', whiteSpace: 'nowrap' }) },
    {
      key: 'status', core: true, label: 'Status', sortable: false,
      cell: (b) => <StatusSelect disabled={readOnly} brief={b} onChange={handleStatusChange} compact />,
    },
    { key: 'contactPerson', label: 'Contactpersoon', cell: (b) => b.contactPerson || '—', cellStyle: (b) => ({ color: b.contactPerson ? '#1D1D1D' : '#9C9890' }) },
    { key: 'contactEmail', label: 'E-mail', cell: (b) => b.contactEmail || '—', cellStyle: (b) => ({ color: b.contactEmail ? '#1D1D1D' : '#9C9890' }) },
    {
      // Which referring agency this brief came in through — see the
      // agencyCode/agencyName comment in lib/db.js and the new
      // /dashboard/agencies screen. agencyNameOf falls back to "Advision
      // Media" for anything with no agency code attached, same fallback
      // used everywhere else this shows (client emails, status page).
      key: 'agencyName', label: 'Agency',
      cell: (b) => agencyNameOf(b),
      cellStyle: (b) => ({ color: b.agencyName ? '#1D1D1D' : '#9C9890' }),
    },
    { key: 'createdAt', label: 'Aangemaakt', cell: (b) => (b.createdAt ? new Date(b.createdAt).toLocaleDateString('nl-NL') : '—') },
    { key: 'submittedAt', label: 'Verzonden', cell: (b) => (b.submittedAt ? new Date(b.submittedAt).toLocaleDateString('nl-NL') : 'Nog niet'), cellStyle: (b) => ({ color: b.submittedAt ? '#1D1D1D' : '#9C9890' }) },
    { key: 'audience', label: 'Doelgroep', cell: (b) => audienceLabel(b) || '—' },
    { key: 'impressions', label: 'Impressies', cell: (b) => impressionsShort(b) || '—' },
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

  const archivedCount = useMemo(() => rows.filter((b) => !!b.archivedAt).length, [rows]);
  const scopeRows = useMemo(() => rows.filter((b) => (showArchived ? !!b.archivedAt : !b.archivedAt)), [rows, showArchived]);

  const filtered = useMemo(() => {
    const ms = rangeToMs(range);
    if (!ms) return scopeRows;
    const cutoff = Date.now() - ms;
    return scopeRows.filter((b) => new Date(b.createdAt).getTime() >= cutoff);
  }, [scopeRows, range]);

  const visible = useMemo(() => {
    if (!activeTile) return filtered;
    const tile = STAT_TILE_DEFS.find((t) => t.key === activeTile);
    return tile ? filtered.filter(tile.filterFn) : filtered;
  }, [filtered, activeTile]);

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

  // Previous / next client in the list as currently filtered and sorted.
  const briefNav = (() => {
    const index = selected ? sorted.findIndex((b) => b.id === selected.id) : -1;
    return { index, total: sorted.length, prev: index > 0 ? sorted[index - 1] : null, next: index >= 0 && index < sorted.length - 1 ? sorted[index + 1] : null };
  })();

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = sorted.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  // One count per STAT_TILE_DEFS entry, keyed by tile key — replaces the
  // old fixed { total, todo, pendingCustomer, inProgress, done } shape now
  // that the set of tiles is data-driven/configurable rather than four
  // hardcoded fields.
  const stats = useMemo(() => {
    const byTile = {};
    for (const tile of STAT_TILE_DEFS) byTile[tile.key] = filtered.filter(tile.filterFn).length;
    return { total: filtered.length, ...byTile };
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

  const cardStyle = { background: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #D2CFC8', boxShadow: '0 1px 8px rgba(29,29,29,.07)' };
  // Two card styles inside the brief modal, used deliberately for two
  // different kinds of content — every card used to share modalCardStyle
  // (the gold-accented one), which is exactly why the modal read as "one
  // flat wall of identical boxes" regardless of whether a section was just
  // reference info or something the producer needed to act on. Now: gold
  // ONLY marks something actionable (an input, a dropdown, the Productie
  // tab), plain marks read-only reference info (Contact, Levering, Script,
  // Stem, Muziek) — so the gold accent actually means something again.
  const modalCardStyle = { background: '#FBF9EC', border: '1.5px solid #EAE3C4', borderLeft: '4px solid #E6C858', borderRadius: '4px 12px 12px 4px', padding: '14px 16px', boxShadow: '0 1px 6px rgba(29,29,29,.05)' };
  const refCardStyle = { background: '#FFFFFF', border: '1px solid #E3E0D5', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 6px rgba(29,29,29,.05)' };
  // Active tile always highlights in the brand's gold, regardless of that
  // status's own accent color (used only for its number/label) — one
  // consistent "this is the active filter" signal instead of a color that
  // changes depending on which tile you clicked.
  function tileStyle(key) {
    const active = activeTile === key;
    return {
      ...cardStyle,
      padding: '13px 16px',
      cursor: 'pointer',
      textAlign: 'left',
      width: '100%',
      font: 'inherit',
      color: 'inherit',
      background: active ? '#FBF0C8' : cardStyle.background,
      border: active ? '1.5px solid #E6C858' : cardStyle.border,
      boxShadow: active ? '0 2px 14px rgba(230,200,88,.45)' : cardStyle.boxShadow,
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
        {!readOnly && (
          <>
            <button
              type="button"
              onClick={() => { setShowArchived((v) => !v); setCleanupOpen(false); setPage(1); }}
              style={{ border: '1px solid #C9C5B9', borderRadius: 999, padding: '7px 14px', fontSize: 12.5, cursor: 'pointer', background: showArchived ? '#1D1D1D' : '#FFFFFF', color: showArchived ? '#FFFFFF' : '#5C5850' }}
            >
              {showArchived ? '← Terug naar dashboard' : `Archief (${archivedCount})`}
            </button>
            {!showArchived && (
              <button
                type="button"
                onClick={() => { setCleanupOpen((v) => !v); setExportDone(false); setArchiveError(''); }}
                style={{ border: '1px solid #C9C5B9', borderRadius: 999, padding: '7px 14px', fontSize: 12.5, cursor: 'pointer', background: cleanupOpen ? '#FBF0C8' : '#FFFFFF', color: '#5C5850' }}
              >
                Opruimen…
              </button>
            )}
          </>
        )}
        {/* Free-text search — filters on top of whichever range/status
            filter is already active, rather than replacing them, so
            "find this client within the last month" still works. */}
        <div style={{ marginLeft: 'auto', position: 'relative', width: 'min(360px, 100%)' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            placeholder="Zoek bedrijf, contact of e-mail" aria-label="Zoek in briefs"
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

      {!readOnly && cleanupOpen && !showArchived && (
        <div style={{ ...cardStyle, marginBottom: 20, border: '1.5px solid #E6C858', background: '#FBF9EC' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>Dashboard opruimen</div>
          <div style={{ fontSize: 12.5, color: '#5C5850', lineHeight: 1.55, marginBottom: 12 }}>
            Er wordt niets verwijderd. De briefs in de huidige weergave ({searched.length}) gaan naar het archief en kunnen daar op elk moment worden teruggezet. Download eerst een export, zodat je de gegevens ook buiten de app hebt.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <a
              href="/api/dashboard/reports/export"
              onClick={() => setExportDone(true)}
              style={{ border: '1px solid #D8D4C8', background: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, color: '#1D1D1D', textDecoration: 'none' }}
            >
              1. Download export (CSV, alle briefs)
            </a>
            <button
              type="button"
              disabled={!exportDone || archiveBusy || searched.length === 0}
              onClick={() => setArchived(searched.map((b) => b.id), true)}
              className="btn-primary"
              style={{ padding: '9px 16px', flex: 'none', opacity: !exportDone || searched.length === 0 ? 0.5 : 1 }}
            >
              {archiveBusy ? 'Bezig…' : `2. Archiveer ${searched.length} brief${searched.length === 1 ? '' : 's'}`}
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: '#8C8880', marginTop: 8 }}>
            Tip: gebruik de periode- of statusfilters en de zoekbalk om precies te kiezen wat er in het archief komt.
          </div>
          {archiveError && <div style={{ fontSize: 12.5, color: '#C2513F', fontWeight: 600, marginTop: 8 }}>{archiveError}</div>}
        </div>
      )}

      {!readOnly && showArchived && (
        <div style={{ ...cardStyle, marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12.5, color: '#5C5850' }}>Je bekijkt het archief ({searched.length}). Niets hiervan is verwijderd.</div>
          <button
            type="button"
            disabled={archiveBusy || searched.length === 0}
            onClick={() => setArchived(searched.map((b) => b.id), false)}
            style={{ border: '1px solid #D8D4C8', background: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
          >
            {archiveBusy ? 'Bezig…' : `Zet ${searched.length} brief${searched.length === 1 ? '' : 's'} terug`}
          </button>
          {archiveError && <div style={{ width: '100%', fontSize: 12.5, color: '#C2513F', fontWeight: 600 }}>{archiveError}</div>}
        </div>
      )}

      <div
        style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(visibleStatTiles.length + 1, 6)}, 1fr)`, gap: 14, marginBottom: 26 }}
        className="tfa-stats-grid"
      >
        <div style={{ ...cardStyle, padding: '13px 16px' }}>
          <div className="tfa-stat-label" style={{ fontSize: 12.5, color: '#5C5850', display: 'flex', alignItems: 'center', gap: 7 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: '#1D1D1D' }} />Totaal briefs
          </div>
          <div className="tfa-stat-num" style={{ fontSize: 26, fontWeight: 500, marginTop: 4, letterSpacing: '-.01em', fontFeatureSettings: '"ss01","ss03"' }}>{stats.total}</div>
        </div>
        {/* Data-driven, and editable — see STAT_TILE_DEFS/visibleStatTiles
            above. Each tile doubles as a click-to-filter toggle (the whole
            point being to make clear these ARE clickable, not just numbers
            — see the glow-on-hover .tfa-stat-tile CSS below) and as a live
            count of exactly what it filters to. */}
        {STAT_TILE_DEFS.filter((t) => visibleStatTiles.includes(t.key)).map((t) => (
          <button key={t.key} type="button" onClick={() => toggleStatTile(t.key)} style={tileStyle(t.key)} className="tfa-stat-tile">
            <div className="tfa-stat-label" style={{ fontSize: 12.5, color: '#5C5850', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: t.color, flex: 'none' }} />{t.label}
            </div>
            <div className="tfa-stat-num" style={{ fontSize: 26, fontWeight: 500, marginTop: 4, letterSpacing: '-.01em', color: t.color }}>{stats[t.key]}</div>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: -14, marginBottom: 18 }}>
        {activeTile ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#5C5850' }}>
            Gefilterd op <b style={{ color: (STAT_TILE_DEFS.find((t) => t.key === activeTile) || {}).color }}>{(STAT_TILE_DEFS.find((t) => t.key === activeTile) || {}).label}</b>
            <button type="button" onClick={() => setActiveTile(null)} style={{ border: '1px solid #C9C5B9', borderRadius: 999, background: '#FFFFFF', padding: '3px 10px', fontSize: 11.5, cursor: 'pointer', color: '#5C5850' }}>
              ✕ Wis filter
            </button>
          </div>
        ) : <div />}

        {/* Both pickers live together on the right: "⚙ Kaarten" (which
            summary tiles show above, see STAT_TILE_DEFS/visibleStatTiles)
            and "⚙ Kolommen" (which table columns show below, unchanged from
            before). */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setStatTilesMenuOpen((o) => !o)}
              style={{ border: '1px solid #C9C5B9', borderRadius: 8, background: '#FFFFFF', padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: '#1D1D1D', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              ⚙ Kaarten ({visibleStatTiles.length})
            </button>
            {statTilesMenuOpen && (
              <>
                <div onClick={() => setStatTilesMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                <div
                  style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 21, width: 300, maxHeight: 380, overflowY: 'auto',
                    background: '#FFFFFF', border: '1px solid #E3E0D5', borderRadius: 8, boxShadow: '0 8px 24px rgba(29,29,29,.12)', padding: '10px 0',
                  }}
                >
                  <div style={{ padding: '4px 14px 8px', fontSize: 12, fontWeight: 500, color: '#5C5850' }}>
                    Kies welke kaarten je ziet
                  </div>
                  {STAT_TILE_DEFS.map((t) => (
                    <label key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 14px', fontSize: 13, cursor: 'pointer', color: '#1D1D1D' }}>
                      <input type="checkbox" checked={visibleStatTiles.includes(t.key)} onChange={() => toggleStatTileVisible(t.key)} />
                      {t.label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

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
                    background: '#FFFFFF', border: '1px solid #E3E0D5', borderRadius: 8, boxShadow: '0 8px 24px rgba(29,29,29,.12)', padding: '10px 0',
                  }}
                >
                  <div style={{ padding: '4px 14px 8px', fontSize: 12, fontWeight: 500, color: '#5C5850' }}>
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
      </div>

      <div style={{ background: '#FFFFFF', borderRadius: 8, border: '1px solid #D2CFC8', boxShadow: '0 1px 8px rgba(29,29,29,.07)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 820 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E3E0D5', textAlign: 'left' }}>
                {activeColumns.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => (c.sortable === false ? null : toggleSort(c.key))}
                    className={c.sortable === false ? '' : 'tfa-sortable-th'}
                    style={{ padding: '11px 16px', cursor: c.sortable === false ? 'default' : 'pointer', color: '#5C5850', fontWeight: 500, fontSize: 12.5, whiteSpace: 'nowrap', background: '#FAF9F6' }}
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
                  <tr key={b.id} onClick={() => handleOpenBrief(b)} className="tfa-dash-row" style={{ borderBottom: '1px solid #EEECE3', cursor: 'pointer', background: ctx.unseen ? '#FBF9EC' : undefined }}>
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
          role="dialog"
          aria-label={'Brief van ' + (selected.companyName || 'klant')}
          style={{ position: 'fixed', inset: 0, background: '#F6F4EC', display: 'flex', zIndex: 50 }}
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
            style={{ background: '#FFFFFF', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            <div style={{ padding: '14px ' + PAGE_GUTTER + ' 0', flex: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                <button type="button" onClick={closeBrief} style={{ border: '1px solid #D2CFC8', background: '#FFFFFF', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#1D1D1D' }}>
                  ← Terug naar dashboard
                </button>
                {briefNav.total > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#5C5850' }}>
                    <button type="button" disabled={!briefNav.prev} onClick={() => briefNav.prev && handleOpenBrief(briefNav.prev)} title={briefNav.prev ? briefNav.prev.companyName || 'Vorige' : ''} style={navBtnStyle(!briefNav.prev)}>‹ Vorige</button>
                    <span>{briefNav.index + 1} van {briefNav.total}</span>
                    <button type="button" disabled={!briefNav.next} onClick={() => briefNav.next && handleOpenBrief(briefNav.next)} title={briefNav.next ? briefNav.next.companyName || 'Volgende' : ''} style={navBtnStyle(!briefNav.next)}>Volgende ›</button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-.01em', margin: 0, lineHeight: 1.25 }}>{selected.companyName || 'Nog geen bedrijfsnaam'}</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
                  <StatusSelect disabled={readOnly} brief={selected} onChange={handleStatusChange} />
                  {!readOnly && (
                    <button
                      type="button"
                      disabled={archiveBusy}
                      onClick={() => setArchived([selected.id], !selected.archivedAt)}
                      style={{ border: '1px solid #D2CFC8', background: '#FFFFFF', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#5C5850' }}
                    >
                      {selected.archivedAt ? 'Terugzetten' : 'Archiveren'}
                    </button>
                  )}
                </div>
              </div>

              {!readOnly && selected.submittedAt && !selected.scriptsReleasedAt && !selected.finalizedAt && modalTab !== 'script' && (
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', background: '#FBF3F1', border: '1px solid #E3B0A8', borderRadius: 8, padding: '10px 14px' }}>
                  <span style={{ fontSize: 13, color: '#8E3B2D', fontWeight: 600 }}>De scripts wachten op jou: nakijken en vrijgeven aan de klant.</span>
                  <button type="button" onClick={() => setModalTab('script')} style={{ border: 'none', background: '#C2513F', color: '#fff', borderRadius: 999, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Naar Script →</button>
                </div>
              )}

              {/* Underline tabs on one line (they used to be pills that
                  wrapped onto two rows in the narrow dialog). The small dot
                  after Productie / Uitlevering replaces the badge that used
                  to be embedded in the tab itself. */}
              <div role="tablist" style={{ display: 'flex', gap: 6, marginTop: 16, padding: '0 0 12px', borderBottom: '1px solid #E3E0D5', overflowX: 'auto' }}>
                {modalTabsFor(selected).filter((t) => !readOnly || t.key === 'overzicht' || t.key === 'script' || t.key === 'creatief').map((t) => {
                  const active = modalTab === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className="tfa-modal-tab"
                      onClick={() => { setModalTab(t.key); if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0; }}
                      style={{
                        border: 'none', borderRadius: 999, padding: '8px 15px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                        background: active ? '#1D1D1D' : '#F3F1EA', color: active ? '#FFFFFF' : '#5C5850', boxShadow: active ? '0 0 0 2px rgba(230,200,88,.55)' : 'none',
                      }}
                    >
                      {t.label}
                      {t.key === 'script' && (scriptCheckState(selected) === 'pending' || scriptCheckState(selected) === 'nofit') && (
                        <span aria-hidden="true" title="Script check nodig" style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 999, background: '#C2513F', marginLeft: 7, verticalAlign: 'middle' }} />
                      )}
                      {t.key === 'productie' && selected.productionStatus && (
                        <span aria-hidden="true" title={PRODUCTION_STATUS_LABELS[selected.productionStatus] || selected.productionStatus} style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 999, background: selected.reviewApprovedAt ? '#1D7A46' : '#E6C858', marginLeft: 7, verticalAlign: 'middle' }} />
                      )}
                      {t.key === 'uitlevering' && (
                        <span aria-hidden="true" title={selected.deliveredAt ? 'Geleverd' : 'Nog te leveren'} style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 999, background: selected.deliveredAt ? '#1D7A46' : '#E6C858', marginLeft: 7, verticalAlign: 'middle' }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div ref={modalBodyRef} style={{ flex: 1, overflowY: 'auto', padding: '0 ' + PAGE_GUTTER + ' 26px', background: '#F6F4EC' }}>

            {modalTab === 'productie' && (
            <div
              style={{
                marginTop: 16, background: '#FBF9EC', border: '1.5px solid #E6C858', borderRadius: 12, padding: '16px 18px', boxShadow: '0 4px 18px rgba(230,200,88,.18)',
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
                marginTop: 16, background: '#FBF9EC', border: '1.5px solid #E6C858', borderRadius: 12, padding: '16px 18px', boxShadow: '0 4px 18px rgba(230,200,88,.18)',
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
              <div style={{ ...refCardStyle, gridColumn: '1 / -1' }}>
                <ModalSectionTitle>Over het bedrijf</ModalSectionTitle>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                  <Field label="Wat voor bedrijf" empty={!selected.companyDescription}>{selected.companyDescription || 'Nog niet opgegeven'}</Field>
                  <Field label="Website" empty={!selected.website}>
                    {selected.website
                      ? (safeWebsiteUrl(selected.website)
                        ? <a href={safeWebsiteUrl(selected.website)} target="_blank" rel="noopener noreferrer" style={{ color: '#1F6F8C', textDecoration: 'none', wordBreak: 'break-all' }}>{selected.website} ↗</a>
                        : selected.website)
                      : 'Nog niet opgegeven'}
                  </Field>
                </div>
              </div>

              <div style={refCardStyle}>
                <ModalSectionTitle>Contact</ModalSectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Field label="Contactpersoon" empty={!selected.contactPerson}>{selected.contactPerson || 'Nog niet opgegeven'}</Field>
                  <Field label="E-mail" empty={!selected.contactEmail}>{selected.contactEmail || 'Nog niet opgegeven'}</Field>
                  {parseAdditionalContacts(selected).map((c, i) => (
                    <Field key={i} label={c.name || `Extra contact ${i + 1}`} empty={!c.email}>{c.email || 'Nog niet opgegeven'}</Field>
                  ))}
                  {/* Which referring agency this brief came in through — see
                      /dashboard/agencies. Shown here rather than only as a
                      table column since this is where a producer looks for
                      "who does the finished audio actually go to". */}
                  <Field label="Agency" empty={!selected.agencyName}>{agencyNameOf(selected)}</Field>
                </div>
              </div>

              <div style={refCardStyle}>
                <ModalSectionTitle>Levering</ModalSectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Field label="Hoofdspot">{selected.hoofdspotLength || '20'}″{variationsSummaryLabel(selected)}</Field>
                  {selected.needsVariations && parseVariationInfo(selected).map((v, i, arr) => (
                    <Field key={'vi' + i} label={arr.length > 1 ? `Variatie ${i + 1}` : 'Variatie'} empty={!variationInfoLabelFull(v)}>{variationInfoLabelFull(v) || 'Nog niet toegelicht'}</Field>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <Field label="Op de radio" empty={!selected.airDate && !selected.dateUnknown}>{formatAirDate(selected)}</Field>
                    <Field label="Impressies" empty={!selected.impressions}>{impressionsShort(selected) || 'Nog niet opgegeven'}</Field>
                  </div>
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: '2px 18px', fontSize: 12, color: '#8C8880', padding: '0 4px' }}>
                <span>Aangemaakt {formatShortDateTime(selected.createdAt)}</span>
                {selected.submittedAt && <span>Verzonden {formatShortDateTime(selected.submittedAt)}</span>}
              </div>

              {selected.audience && (
                <div style={{ ...refCardStyle, gridColumn: '1 / -1' }}>
                  <ModalSectionTitle>Doelgroep</ModalSectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                    <Field label="Gekozen">{audienceLabel(selected)}</Field>
                    {selected.decisionMaker && <Field label="Beslisser (B2B)">{selected.decisionMaker}</Field>}
                    {selected.audienceAgeInterests && <Field label="Leeftijd en interesses (B2C)">{selected.audienceAgeInterests}</Field>}
                    {selected.genderSplit && (
                      <Field label="Man / vrouw">
                        {selected.genderSplit}
                        {describeGenderSplit(selected.genderSplit) ? ' → ' + describeGenderSplit(selected.genderSplit) : ''}
                      </Field>
                    )}
                  </div>
                </div>
              )}

              {profileOfBrief(selected).extraQuestions.length > 0 && (
                <div style={{ ...refCardStyle, gridColumn: '1 / -1' }}>
                  <ModalSectionTitle>Extra vragen van {agencyNameOf(selected)}</ModalSectionTitle>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {profileOfBrief(selected).extraQuestions.map((q) => {
                      const a = answersOfBrief(selected)[q.key];
                      return <Field key={q.key} label={q.label} empty={!a}>{a || 'Nog niet ingevuld'}</Field>;
                    })}
                  </div>
                </div>
              )}
            </div>
            )}

            {modalTab === 'team' && (
            <div style={{ marginTop: 16 }}>
              <div style={modalCardStyle}>
                <ModalSectionTitle>Team</ModalSectionTitle>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#5C5850', marginBottom: 4 }}>Toegewezen aan</div>
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
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#5C5850', marginBottom: 4 }}>Live-datum (op de radio)</div>
                    {/* The client often only knows a month when filling in the
                        form, so the real first live date is fixed here by the
                        team once it is known. */}
                    <input
                      type="date"
                      value={selected.dateUnknown ? '' : (selected.airDate || '')}
                      onChange={(e) => handleMetaChange(selected.id, { airDate: e.target.value, dateUnknown: e.target.value ? false : selected.dateUnknown, airMonth: e.target.value ? '' : selected.airMonth })}
                      disabled={metaBusy}
                      style={{
                        width: '100%', border: '1px solid #C9C5B9', borderRadius: 8, padding: '8px 10px', fontSize: 13,
                        background: '#FFFFFF', color: deliveryDeadlineMeta(selected, selected.status).color,
                        fontWeight: deliveryDeadlineMeta(selected, selected.status).overdue ? 700 : 400,
                      }}
                    />
                    <div style={{ fontSize: 11.5, color: '#8C8880', marginTop: 4, lineHeight: 1.4 }}>
                      {deliveryDeadlineMeta(selected, selected.status).overdue ? '⚠ Datum is verstreken. ' : ''}
                      {selected.dateUnknown ? 'Klant gaf: ' + formatAirDate(selected) + '. Vul hier de definitieve datum in zodra die bekend is.' : 'Alleen hier aan te passen door het team.'}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #EAE3C4' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#5C5850', marginBottom: 8 }}>
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
                              {n.author || 'Team'} · {formatShortDateTime(n.createdAt)}{n.editedAt ? ' · bewerkt' : ''}
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

            {modalTab === 'script' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
              {!selected.submittedAt && (
                <div style={{ ...refCardStyle, fontSize: 13.5, color: '#8C8880' }}>
                  De klant heeft de brief nog niet verstuurd, dus er is nog geen script.
                </div>
              )}
              {!readOnly && selected.submittedAt && !selected.finalizedAt && (
                <ScriptDraftsPanel
                  brief={selected}
                  cardStyle={refCardStyle}
                  onUpdated={(updated) => {
                    setRows((cur) => cur.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)));
                    setSelected((cur) => (cur && cur.id === updated.id ? { ...cur, ...updated } : cur));
                  }}
                />
              )}
              <ScriptAuditPanel
                brief={selected}
                cardStyle={refCardStyle}
                onUpdated={(updated) => {
                  setRows((cur) => cur.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)));
                  setSelected((cur) => (cur && cur.id === updated.id ? { ...cur, ...updated } : cur));
                }}
              />
              {!(selected.submittedAt && !selected.scriptsReleasedAt) && (() => {
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
                const variationInfos = parseVariationInfo(selected);
                const finalState = selected.finalizedAt ? scriptCheckState(selected) : null;
                const isFinal = !!selected.finalizedAt;
                const title = isFinal
                  ? (finalState ? 'Script (nog niet definitief)' : 'Definitief script om te produceren')
                  : selected.scriptsReleasedAt && !selected.scriptApproved ? 'Script (huidige keuze van de klant)' : 'Script';
                const metaBits = [
                  (selected.hoofdspotLength || '20') + '″',
                  variationCount > 0 ? variationCount + (variationCount === 1 ? ' variatie' : ' variaties') : '',
                  isFinal && !finalState ? 'Akkoord van de klant op ' + formatShortDateTime(selected.finalizedAt) : '',
                ].filter(Boolean);
                return (
                  <div style={{ ...refCardStyle, ...(isFinal && !finalState ? { border: '1.5px solid #E6C858' } : null) }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1D1D1D' }}>{title}</div>
                        <div style={{ ...META_TEXT, marginTop: 2 }}>{metaBits.join(' · ')}</div>
                      </div>
                      {mainText && <CopyButton text={mainText} />}
                    </div>
                    {isFinal && finalState && (
                      <div style={{ marginBottom: 10 }}><Indicator tone="attention" icon="alert" label="Eerst controleren: de klant paste het script aan" /></div>
                    )}
                    <div style={mainText ? SCRIPT_BOX : { fontSize: 13.5, color: '#9C9890' }}>
                      {mainText || 'Nog geen script goedgekeurd.'}
                    </div>
                    {variationCount > 0 && (
                      <div style={{ marginTop: 18 }}>
                        <div style={{ ...META_TEXT, marginBottom: 8 }}>
                          Variaties volgen het hoofdscript: een wijziging in gedeelde tekst zit al in elke variatie.
                        </div>
                        <div style={{ borderTop: '1px solid #EEECE3' }}>
                          {Array.from({ length: variationCount }).map((_, idx) => {
                            const varText = variationScripts[idx] !== undefined ? variationScripts[idx] : mainText;
                            const tokens = diffWords(mainText || '', varText || '');
                            const changed = hasDiff(tokens);
                            const infoLabel = variationInfoLabelFull(variationInfos[idx]);
                            return (
                              <details key={idx} open={variationCount <= 2} style={{ borderBottom: '1px solid #EEECE3', padding: '10px 0' }}>
                                <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, listStyle: 'revert' }}>
                                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>
                                    {variationCount > 1 ? `Variatie ${idx + 1}` : 'Variatie'}
                                    {infoLabel && <span style={{ fontWeight: 400, color: '#6B675D' }}> · {infoLabel}</span>}
                                  </span>
                                  {varText && <span onClick={(e) => e.stopPropagation()}><CopyButton text={varText} /></span>}
                                </summary>
                                <div style={{ ...SCRIPT_BOX, marginTop: 8, fontSize: 14 }}>{varText || ''}</div>
                                {changed && (
                                  <details style={{ marginTop: 6 }}>
                                    <summary style={{ cursor: 'pointer', fontSize: 11.5, color: '#8C8880' }}>Wat verschilt met het hoofdscript</summary>
                                    <div style={{ fontSize: 13.5, lineHeight: 1.65, marginTop: 6, whiteSpace: 'pre-wrap', maxWidth: '72ch' }}>
                                      <DiffPreview tokens={tokens} />
                                    </div>
                                  </details>
                                )}
                              </details>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div style={{ marginTop: 12, ...META_TEXT, fontSize: 11.5 }}>
                      Wie wat wanneer wijzigde, staat in <button type="button" onClick={() => setModalTab('historie')} style={{ border: 'none', background: 'none', padding: 0, color: '#383209', textDecoration: 'underline', cursor: 'pointer', fontSize: 11.5 }}>Historie</button>.
                    </div>
                  </div>
                );
              })()}

            </div>
            )}

            {modalTab === 'historie' && !readOnly && (
            <div style={{ marginTop: 16 }}>
              <HistoryPanel brief={selected} cardStyle={refCardStyle} />
            </div>
            )}

            {modalTab === 'creatief' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
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
                            <div style={{ width: 16, height: 16, borderRadius: '50%', background: isUsed ? '#E6C858' : '#D9D5C7', fontSize: 11, fontWeight: 700, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {isUsed && tracks.length > 1 ? '✓' : i + 1}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t.title || 'Onbekende track'}{t.artist ? ` (${t.artist})` : ''}</div>
                              <div style={{ fontSize: 11, color: '#8C6D1F', fontWeight: 600 }}>{t.playlistName || 'categorie onbekend'}</div>
                            </div>
                            {tracks.length > 1 && isUsed && (
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#8C6D1F', flex: 'none' }}>GEBRUIKT</div>
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
          .tfa-stats-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 8px !important; }
          .tfa-stats-grid > * { padding: 10px 11px !important; }
          .tfa-stats-grid .tfa-stat-label { font-size: 11px !important; gap: 5px !important; }
          .tfa-stats-grid .tfa-stat-num { font-size: 22px !important; margin-top: 2px !important; }
        }
        .tfa-dash-row { transition: background .12s ease, box-shadow .12s ease; }
        .tfa-dash-row:hover { background: rgba(230,200,88,.12); box-shadow: inset 3px 0 0 #E6C858, inset 0 0 0 1px rgba(230,200,88,.3); }
        .tfa-btn-glow { transition: filter .12s ease; }
        .tfa-btn-glow:hover { filter: brightness(1.08); }
        /* Summary tiles ("To-do", "Geleverd", ...) act as click-to-filter
           toggles, which wasn't obvious before — per Karim's note, this
           glow (on top of tileStyle's own active-state highlight above) is
           what signals "this is clickable" on hover, same gold-glow
           language used on the sidebar and the client-portal step rail. */
        .tfa-stat-tile:hover { box-shadow: 0 0 0 1px rgba(230,200,88,.5), 0 4px 18px rgba(230,200,88,.4) !important; border-color: #E6C858 !important; }
        .tfa-modal-tab:hover { box-shadow: 0 0 0 1px rgba(230,200,88,.5), 0 2px 10px rgba(230,200,88,.35) !important; }
        .tfa-modal-tab:focus-visible, .tfa-stat-tile:focus-visible { outline: 2px solid #1D1D1D; outline-offset: 2px; }
        /* Sortable table headers — another spot that was clickable with no
           visual hint at all. */
        .tfa-sortable-th { transition: color .12s ease, box-shadow .12s ease; cursor: pointer; }
        .tfa-sortable-th:hover { color: #1D1D1D; box-shadow: inset 0 -2px 0 rgba(230,200,88,.7); }
        @media (max-width: 560px) {
          .tfa-modal-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
