// Pure aggregation helpers for /dashboard/reports — takes the array of
// briefs already loaded via listBriefs() and produces plain-object summaries
// the reports page renders as stat tiles and simple bar breakdowns. No
// database access here on purpose: this is just number-crunching over data
// the caller already has, so it's trivial to unit-test and reuse (e.g. for
// the CSV export route, which wants the same "one row per brief" shape).

import { variationsCountOf, TONE_LABELS } from '../components/flowData';

const STATUS_META = {
  todo: { label: 'To-do', color: '#5C5850' },
  pending_customer: { label: 'Wacht op klant', color: '#8C6D1F' },
  in_progress: { label: 'In behandeling', color: '#1F6F8C' },
  done: { label: 'Klaar', color: '#1D7A46' },
};
const STATUS_ORDER = ['todo', 'pending_customer', 'in_progress', 'done'];

const SCRIPT_SOURCE_META = {
  claude: { label: 'Claude (AI)', color: '#8C6D1F' },
  gemini: { label: 'Gemini (AI)', color: '#1F6F8C' },
  ollama: { label: 'Ollama (AI)', color: '#5C5850' },
  template: { label: 'Sjabloon (geen AI)', color: '#8C8880' },
  error: { label: 'Mislukt', color: '#C2513F' },
  '': { label: 'Nog niet gegenereerd', color: '#C9C5B9' },
};

const IMPRESSIONS_LABELS = {
  '25000': '25.000', '50000': '50.000', '100000': '100.000',
  '150000': '150.000', '250000': '250.000', '500000': '500.000',
  meer: 'Meer dan 500.000', '': 'Nog niet gekozen',
};

// bucketCounts() below needs { label, color } entries, not the plain
// value->label strings above (those are shared with the CSV row-builder,
// which just wants the plain string) — derive one from the other so the
// two never drift out of sync.
const IMPRESSIONS_META = Object.fromEntries(
  Object.entries(IMPRESSIONS_LABELS).map(([key, label]) => [key, { label, color: '#8C6D1F' }])
);

function parseHistory(brief) {
  try {
    const parsed = brief.scriptHistory ? JSON.parse(brief.scriptHistory) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function parseSelectedTracks(brief) {
  try {
    const parsed = brief.selectedTracks ? JSON.parse(brief.selectedTracks) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function parseTones(brief) {
  try {
    const parsed = brief.toneOfVoice ? JSON.parse(brief.toneOfVoice) : [];
    return Array.isArray(parsed) ? parsed.filter((t) => TONE_LABELS[t]) : [];
  } catch (e) {
    return [];
  }
}

// Ranks items by frequency across all briefs, for the "most used X" cards
// (tracks, playlists, voices) — unlike bucketCounts, a single brief can
// contribute zero, one, or several items here (e.g. a brief can have
// multiple selectedTracks), so this isn't just "which bucket does this one
// brief fall into".
function topCounts(briefs, extractFn, n = 8, color = '#8C6D1F') {
  const counts = new Map();
  briefs.forEach((b) => {
    extractFn(b).forEach(({ key, label }) => {
      if (!key) return;
      const entry = counts.get(key) || { label, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    });
  });
  const total = Array.from(counts.values()).reduce((a, e) => a + e.count, 0);
  return Array.from(counts.entries())
    .map(([key, e]) => ({ key, label: e.label, count: e.count, color, pct: total ? Math.round((e.count / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

// Most frequent non-empty string in a plain array — used to answer "of the
// briefs that chose this tone, what did they mostly pick for music/voice".
function mostCommonLabel(items) {
  const counts = {};
  items.forEach((s) => { if (s) counts[s] = (counts[s] || 0) + 1; });
  let best = null;
  Object.entries(counts).forEach(([label, count]) => {
    if (!best || count > best.count) best = { label, count };
  });
  return best;
}

function bucketCounts(items, keyFn, meta) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item) ?? '';
    counts[key] = (counts[key] || 0) + 1;
  }
  const total = items.length;
  return Object.entries(counts)
    .map(([key, count]) => ({
      key,
      label: (meta && meta[key] && meta[key].label) || key || 'Onbekend',
      color: (meta && meta[key] && meta[key].color) || '#8C8880',
      count,
      pct: total ? Math.round((count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function monthKey(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTH_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

// Last `months` calendar months (oldest first), each with how many briefs
// were created in it — a simple intake-volume trend line without needing
// any charting library, just a row of bars sized by percent-of-max.
function monthlyTrend(briefs, months = 6) {
  const now = new Date();
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONTH_SHORT[d.getMonth()], count: 0 });
  }
  const byKey = {};
  buckets.forEach((b) => { byKey[b.key] = b; });
  briefs.forEach((b) => {
    const key = monthKey(b.createdAt);
    if (key && byKey[key]) byKey[key].count += 1;
  });
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return buckets.map((b) => ({ ...b, pct: Math.round((b.count / max) * 100) }));
}

export function buildReportData(briefs) {
  const total = briefs.length;

  const statusBreakdown = STATUS_ORDER.map((key) => {
    const count = briefs.filter((b) => (b.status || 'todo') === key).length;
    return { key, label: STATUS_META[key].label, color: STATUS_META[key].color, count, pct: total ? Math.round((count / total) * 1000) / 10 : 0 };
  });

  const audienceBreakdown = bucketCounts(briefs, (b) => b.audience || 'onbekend', {
    b2b: { label: 'B2B — vooral bedrijven', color: '#8C6D1F' },
    b2c: { label: 'B2C — vooral consumenten', color: '#1F6F8C' },
    onbekend: { label: 'Nog niet ingevuld', color: '#C9C5B9' },
  });

  const scriptSourceBreakdown = bucketCounts(briefs, (b) => b.scriptSource || '', SCRIPT_SOURCE_META);

  const withScript = briefs.filter((b) => !!b.generatedScript);
  const approvedCount = withScript.filter((b) => b.scriptApproved).length;
  const approvalRate = withScript.length ? Math.round((approvedCount / withScript.length) * 1000) / 10 : null;

  const regenCounts = briefs.map((b) => parseHistory(b).length).filter((n) => n > 0);
  const avgRegenerations = regenCounts.length
    ? Math.round((regenCounts.reduce((a, c) => a + c, 0) / regenCounts.length) * 10) / 10
    : 0;

  const variationsBreakdown = bucketCounts(briefs, (b) => {
    const n = variationsCountOf(b);
    return n > 0 ? String(n) : 'nee';
  }, {
    nee: { label: 'Nee, alleen hoofdspot', color: '#5C5850' },
    1: { label: '1 variatie', color: '#8C6D1F' },
    2: { label: '2 variaties', color: '#A67D14' },
    3: { label: '3 variaties', color: '#B08900' },
    4: { label: '4 variaties', color: '#C29E1F' },
    5: { label: '5 variaties', color: '#D9B33C' },
    6: { label: '6 variaties', color: '#E6C858' },
  });

  const impressionsBreakdown = bucketCounts(briefs, (b) => b.impressions || '', IMPRESSIONS_META);

  const thisMonthKey = monthKey(new Date().toISOString());
  const newThisMonth = briefs.filter((b) => monthKey(b.createdAt) === thisMonthKey).length;

  // Rough turnaround: days between a brief being created and being marked
  // "done" — approximated as (done brief's updatedAt - createdAt), since we
  // don't separately log the moment a status changed. Good enough for a
  // "roughly how long does a brief take" read; not a precise SLA metric.
  const doneDurationsDays = briefs
    .filter((b) => b.status === 'done' && b.createdAt && b.updatedAt)
    .map((b) => (new Date(b.updatedAt).getTime() - new Date(b.createdAt).getTime()) / 86400000)
    .filter((n) => isFinite(n) && n >= 0);
  const avgTurnaroundDays = doneDurationsDays.length
    ? Math.round((doneDurationsDays.reduce((a, c) => a + c, 0) / doneDurationsDays.length) * 10) / 10
    : null;

  // Briefs with a deadline in the past that aren't marked done yet — the
  // same "overdue" definition the dashboard table itself uses per row.
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const overdueCount = briefs.filter((b) => {
    if (!b.dueDate || b.status === 'done') return false;
    const d = new Date(b.dueDate + 'T00:00:00');
    return !isNaN(d.getTime()) && d.getTime() < todayStart;
  }).length;

  // How work is spread across the team — only briefs that have actually
  // been assigned to someone are counted, so an all-unassigned library
  // doesn't just show one big "onbekend" bar.
  const assignedBreakdown = bucketCounts(
    briefs.filter((b) => b.assignedTo && b.assignedTo.trim()),
    (b) => b.assignedTo.trim(),
    {}
  );

  // Music/voice usage — which actual tracks, playlists and voices get
  // picked most often, for curating the library rather than guessing.
  const topTracks = topCounts(
    briefs,
    (b) => parseSelectedTracks(b)
      .filter((t) => t && (t.title || t.id))
      .map((t) => ({ key: t.id || t.title + '|' + (t.artist || ''), label: t.title + (t.artist ? ' — ' + t.artist : '') })),
    8,
    '#8C6D1F'
  );
  const topPlaylists = topCounts(
    briefs,
    (b) => parseSelectedTracks(b)
      .filter((t) => t && t.playlistName)
      .map((t) => ({ key: t.playlistId || t.playlistName, label: t.playlistName })),
    8,
    '#1F6F8C'
  );
  const topVoices = topCounts(
    briefs,
    (b) => (b.selectedVoiceId ? [{ key: b.selectedVoiceId, label: b.selectedVoiceLabel || 'Onbekende stem' }] : []),
    8,
    '#8C6D1F'
  );

  // Tone -> music/voice links: of the briefs that chose a given tone (from
  // the brief step's "Hoe moet de commercial klinken?"), what track/
  // playlist and voice did they end up choosing most often. Meant to
  // surface patterns like "Energiek briefs consistently land on the same
  // upbeat playlist and a particular kind of voice" — useful signal for
  // curating playlists and designing new voices around each tone, instead
  // of guessing.
  const toneLinks = Object.keys(TONE_LABELS)
    .map((toneKey) => {
      const withTone = briefs.filter((b) => parseTones(b).includes(toneKey));
      if (!withTone.length) return null;
      const playlists = [];
      withTone.forEach((b) => parseSelectedTracks(b).forEach((t) => { if (t && t.playlistName) playlists.push(t.playlistName); }));
      const voiceLabels = withTone.map((b) => b.selectedVoiceLabel).filter(Boolean);
      const topPlaylist = mostCommonLabel(playlists);
      const topVoice = mostCommonLabel(voiceLabels);
      return {
        key: toneKey,
        label: TONE_LABELS[toneKey],
        count: withTone.length,
        topPlaylist: topPlaylist ? `${topPlaylist.label} (${topPlaylist.count}/${withTone.length})` : '—',
        topVoice: topVoice ? `${topVoice.label} (${topVoice.count}/${withTone.length})` : '—',
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count);

  return {
    total,
    newThisMonth,
    statusBreakdown,
    audienceBreakdown,
    scriptSourceBreakdown,
    variationsBreakdown,
    impressionsBreakdown,
    assignedBreakdown,
    topTracks,
    topPlaylists,
    topVoices,
    toneLinks,
    approvalRate,
    approvedCount,
    scriptedCount: withScript.length,
    avgRegenerations,
    avgTurnaroundDays,
    overdueCount,
    monthlyTrend: monthlyTrend(briefs, 6),
  };
}

// One flat row per brief — shared by the CSV export route so the download
// matches exactly what the report page is summarizing.
export function briefsToRows(briefs) {
  return briefs.map((b) => ({
    id: b.id,
    bedrijf: b.companyName || '',
    contactpersoon: b.contactPerson || '',
    email: b.contactEmail || '',
    extraContacten: (() => {
      try {
        const parsed = b.additionalContacts ? JSON.parse(b.additionalContacts) : [];
        return Array.isArray(parsed) ? parsed.filter((c) => c && c.email).map((c) => c.email).join('; ') : '';
      } catch (e) {
        return '';
      }
    })(),
    status: (STATUS_META[b.status] || STATUS_META.todo).label,
    toegewezenAan: b.assignedTo || '',
    deadline: b.dueDate || '',
    doelgroep: b.audience === 'b2b' ? 'B2B' : b.audience === 'b2c' ? 'B2C' : '',
    lengte: b.hoofdspotLength ? `${b.hoofdspotLength}s` : '',
    variaties: String(variationsCountOf(b)),
    impressies: IMPRESSIONS_LABELS[b.impressions || ''] || b.impressions || '',
    scriptBron: (SCRIPT_SOURCE_META[b.scriptSource || ''] || {}).label || b.scriptSource || '',
    scriptGoedgekeurd: b.scriptApproved ? 'Ja' : 'Nee',
    aangemaakt: b.createdAt || '',
    ingediend: b.submittedAt || '',
  }));
}

export function rowsToCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(';')];
  rows.forEach((row) => lines.push(headers.map((h) => escape(row[h])).join(';')));
  return lines.join('\r\n');
}
