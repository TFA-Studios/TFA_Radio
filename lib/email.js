// Sends the client a confirmation email once they submit their brief on the
// final overview step. Same tiered-fallback philosophy as scriptgen.js:
// this module never throws — a broken provider key, a missing env var, or a
// network hiccup should never block a client's submission from succeeding.
//
// Two ways it can happen:
//  1. Real delivery via Resend (https://resend.com), a simple HTTP email
//     API — runs when RESEND_API_KEY is set.
//  2. DB fallback: no provider configured, so the rendered HTML is stored
//     as a row in the `sent_emails` table (or the in-memory equivalent)
//     instead of a file — Vercel serverless functions have no persistent
//     filesystem, so a file-based fallback (as the original Express app
//     used) would silently vanish. A producer can inspect what would have
//     gone out via listSentEmails() in lib/db.js.

import { nanoid } from 'nanoid';
import { insertSentEmail } from './db';
import { variationsSummaryLabel } from '../components/flowData';

// The client considered planning@tfa.studio vs planning@topformat.nl — kept
// as a single constant so it's a one-line change either way.
export const SENDER_EMAIL = process.env.SENDER_EMAIL || 'planning@tfa.studio';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

const MONTH_NAMES = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

const TONE_LABELS = {
  energiek: 'Energiek', rustig: 'Rustig', warm: 'Warm', zakelijk: 'Zakelijk',
  urgent: 'Urgent', premium: 'Premium', speels: 'Speels', grappig: 'Grappig',
  betrouwbaar: 'Betrouwbaar', gedurfd: 'Gedurfd', inspirerend: 'Inspirerend',
  nostalgisch: 'Nostalgisch',
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// contactEmail (the primary contact) plus every email added via the "+" on
// the contact step (brief.additionalContacts, a JSON string of
// [{ name, email }]) — deduped and trimmed. Used so the submission
// confirmation goes to everyone on the brief, not just the first person.
function recipientsFor(brief) {
  const emails = [];
  const primary = (brief.contactEmail && brief.contactEmail.trim()) || '';
  if (primary) emails.push(primary);
  try {
    const extra = brief.additionalContacts ? JSON.parse(brief.additionalContacts) : [];
    if (Array.isArray(extra)) {
      for (const c of extra) {
        const email = c && c.email ? String(c.email).trim() : '';
        if (email) emails.push(email);
      }
    }
  } catch (e) {
    // malformed JSON — fall back to just the primary contact
  }
  return Array.from(new Set(emails.map((e) => e.toLowerCase()))).map((lower) => emails.find((e) => e.toLowerCase() === lower));
}

// Mirrors formatImpressions() in the overview page.
function formatImpressions(brief) {
  const v = brief.impressions;
  if (!v) return 'Niet opgegeven';
  if (v === 'meer') {
    return brief.impressionsCustom ? brief.impressionsCustom + ' impressies' : 'Meer dan 500.000 impressies';
  }
  const n = parseInt(v, 10);
  return (isNaN(n) ? v : n.toLocaleString('nl-NL')) + ' impressies';
}

// Mirrors formatAirDate() in the overview page.
function formatAirDate(brief) {
  if (brief.dateUnknown) {
    if (brief.airMonth) {
      const idx = parseInt(brief.airMonth, 10) - 1;
      const name = MONTH_NAMES[idx];
      return name ? 'Nog niet exact bekend — gepland voor ' + name : 'Nog niet bekend';
    }
    return 'Nog niet bekend';
  }
  if (brief.airDate) {
    const d = new Date(brief.airDate + 'T00:00:00');
    if (!isNaN(d.getTime())) {
      return d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
    }
    return brief.airDate;
  }
  return 'Nog niet opgegeven';
}

function formatTones(brief) {
  try {
    const parsed = brief.toneOfVoice ? JSON.parse(brief.toneOfVoice) : [];
    if (!Array.isArray(parsed) || !parsed.length) return '';
    return parsed.filter((t) => TONE_LABELS[t]).map((t) => TONE_LABELS[t]).join(' & ');
  } catch (e) {
    return '';
  }
}

function formatSelectedTracks(brief) {
  try {
    const parsed = brief.selectedTracks ? JSON.parse(brief.selectedTracks) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// Shared by buildEmailHtml (client) and buildTeamNotificationHtml (planning
// inbox) — the same field table and script block go to both, so planning
// gets the full overview, not just a one-line "a brief came in" ping. The
// script label reads generically ("Script") here rather than "Jouw script"
// so it works verbatim in either email.
function buildOverviewFields(brief) {
  const spotLength = brief.hoofdspotLength || '20';
  const scriptText = (brief.editedScript !== null && brief.editedScript !== undefined) ? brief.editedScript : (brief.generatedScript || '');
  const voiceLabel = brief.selectedVoiceLabel || '';
  const tracks = formatSelectedTracks(brief);
  const tones = formatTones(brief);

  const rows = [];
  rows.push(['Hoofdspot', esc(spotLength) + '″' + esc(variationsSummaryLabel(brief))]);
  rows.push(['Impressies', esc(formatImpressions(brief))]);
  rows.push(['Eerste uitzending', esc(formatAirDate(brief))]);
  if (tones) rows.push(['Toon van stem', esc(tones)]);
  rows.push(['Gekozen stem', voiceLabel ? esc(voiceLabel) : 'Nog niet gekozen']);
  rows.push(['Gekozen muziek', tracks.length ? tracks.map((t) => esc(t.title) + (t.playlistName ? ' (' + esc(t.playlistName) + ')' : '')).join('<br>') : 'Nog niet gekozen']);

  const rowsHtml = rows.map(([label, value]) =>
    '<tr>' +
      '<td style="padding:8px 0; font-size:12.5px; color:#8C8880; vertical-align:top; white-space:nowrap; padding-right:16px;">' + label + '</td>' +
      '<td style="padding:8px 0; font-size:13.5px; color:#1D1D1D;">' + value + '</td>' +
    '</tr>'
  ).join('');

  const scriptBlock = scriptText
    ? '<div style="margin-top:22px; background:#FBF9EC; border:1px solid #EAE3C4; border-radius:12px; padding:18px 20px;">' +
        '<div style="font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:#383209; font-weight:600;">Script</div>' +
        '<div style="margin-top:8px; font-family:Georgia, serif; font-style:italic; font-size:14px; line-height:1.6; color:#1D1D1D;">' + esc(scriptText).replace(/\n/g, '<br>') + '</div>' +
      '</div>'
    : '';

  return { rowsHtml, scriptBlock };
}

function buildEmailHtml(brief, appUrl) {
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'jouw bedrijf';
  const { rowsHtml: fieldsHtml, scriptBlock } = buildOverviewFields(brief);
  const rowsHtml = '<tr>' +
      '<td style="padding:8px 0; font-size:12.5px; color:#8C8880; vertical-align:top; white-space:nowrap; padding-right:16px;">Bedrijf</td>' +
      '<td style="padding:8px 0; font-size:13.5px; color:#1D1D1D;">' + esc(companyName) + '</td>' +
    '</tr>' + fieldsHtml;

  // Link back into the app's own overview/thank-you view — without this,
  // the confirmation email was the only way back and a client who'd closed
  // the tab had no way to re-open their overview from inside the app itself.
  const overviewUrl = appUrl ? appUrl.replace(/\/$/, '') + '/brief/' + brief.id + '/overview' : '';
  const overviewLink = overviewUrl
    ? '<a href="' + esc(overviewUrl) + '" style="display:inline-block; margin-top:22px; background:#E6C858; color:#1D1D1D; font-weight:700; font-size:14px; text-decoration:none; padding:13px 22px; border-radius:8px;">Bekijk mijn aanvraag</a>'
    : '';

  return (
    '<!doctype html><html lang="nl"><head><meta charset="utf-8"></head>' +
    '<body style="margin:0; padding:0; background:#DEDCD7; font-family:Arial, Helvetica, sans-serif;">' +
      '<div style="max-width:560px; margin:0 auto; padding:32px 20px;">' +
        '<div style="background:#FFFFFF; border-radius:16px; padding:36px 32px;">' +
          '<div style="font-size:11px; letter-spacing:.09em; text-transform:uppercase; color:#B08B00; font-weight:700;">TFA SpotFlow</div>' +
          '<h1 style="font-family:Georgia, serif; font-weight:600; font-size:22px; margin:14px 0 4px; color:#1D1D1D;">Bedankt, ' + esc(companyName) + '!</h1>' +
          '<p style="font-size:14px; line-height:1.6; color:#5C5850; margin:0 0 20px;">' +
            'Je radiocommercial-aanvraag is bij ons binnengekomen. We hebben alles hieronder nog even voor je op een rijtje gezet — TFA gaat er nu mee aan de slag, en je hoort van je producer zodra er nieuws is.' +
          '</p>' +
          '<table style="width:100%; border-collapse:collapse;">' + rowsHtml + '</table>' +
          scriptBlock +
          overviewLink +
          '<p style="margin-top:26px; font-size:12.5px; line-height:1.6; color:#8C8880;">' +
            (overviewUrl
              ? 'Je kunt je aanvraag op elk moment terugvinden via de knop hierboven. Vragen? Antwoord gewoon op deze e-mail, dan komt het bij ons terecht.'
              : 'Vragen? Antwoord gewoon op deze e-mail, dan komt het bij ons terecht.') +
          '</p>' +
          '<p style="margin-top:18px; font-size:12px; color:#8C8880;">— Het TFA-team</p>' +
        '</div>' +
      '</div>' +
    '</body></html>'
  );
}

async function sendViaResend(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + RESEND_API_KEY,
    },
    body: JSON.stringify({
      from: SENDER_EMAIL,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('Resend API error ' + res.status + ': ' + body.slice(0, 300));
  }
}

async function writeFallbackRow(briefId, to, subject, html) {
  await insertSentEmail({ id: nanoid(12), briefId, to: to || '', subject, html });
  console.log('[email] RESEND_API_KEY not set — saved confirmation email as a sent_emails row instead of sending it (brief ' + briefId + ').');
}

function buildResumeLinkHtml(brief, resumeUrl) {
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'jouw radiocommercial';
  return (
    '<!doctype html><html lang="nl"><head><meta charset="utf-8"></head>' +
    '<body style="margin:0; padding:0; background:#DEDCD7; font-family:Arial, Helvetica, sans-serif;">' +
      '<div style="max-width:560px; margin:0 auto; padding:32px 20px;">' +
        '<div style="background:#FFFFFF; border-radius:16px; padding:36px 32px;">' +
          '<div style="font-size:11px; letter-spacing:.09em; text-transform:uppercase; color:#B08B00; font-weight:700;">TFA SpotFlow</div>' +
          '<h1 style="font-family:Georgia, serif; font-weight:600; font-size:22px; margin:14px 0 4px; color:#1D1D1D;">Ga verder met ' + esc(companyName) + '</h1>' +
          '<p style="font-size:14px; line-height:1.6; color:#5C5850; margin:0 0 22px;">' +
            'Alles wat je tot nu toe hebt ingevuld staat klaar — klik op de knop hieronder om verder te gaan waar je gebleven was.' +
          '</p>' +
          '<a href="' + esc(resumeUrl) + '" style="display:inline-block; background:#E6C858; color:#1D1D1D; font-weight:700; font-size:14px; text-decoration:none; padding:13px 22px; border-radius:8px;">Verder gaan met mijn aanvraag</a>' +
          '<p style="margin-top:26px; font-size:12.5px; line-height:1.6; color:#8C8880;">' +
            'Werkt de knop niet? Kopieer dan deze link: ' + esc(resumeUrl) +
          '</p>' +
          '<p style="margin-top:18px; font-size:12px; color:#8C8880;">— Het TFA-team</p>' +
        '</div>' +
      '</div>' +
    '</body></html>'
  );
}

// Sends the client a link back to their in-progress brief so they can pick
// up later without having to bookmark the URL themselves — every field
// already autosaves as they go, so this just re-delivers the way back in.
// Same never-throws, tiered-fallback shape as sendConfirmationEmail.
export async function sendResumeLinkEmail(brief, to, resumeUrl) {
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'je bedrijf';
  const subject = 'Ga verder met je radiocommercial-aanvraag — ' + companyName;
  const html = buildResumeLinkHtml(brief, resumeUrl);
  const cleanTo = (to || '').trim();

  if (RESEND_API_KEY && cleanTo) {
    try {
      await sendViaResend(cleanTo, subject, html);
      console.log('[email] Resume link sent to ' + cleanTo + ' via Resend.');
      return { ok: true };
    } catch (err) {
      console.error('[email] Resend send failed, falling back to DB row:', err.message);
    }
  }

  try {
    await writeFallbackRow(brief.id, cleanTo, subject, html);
  } catch (err) {
    console.error('[email] Failed to save fallback email row:', err.message);
  }
  return { ok: !RESEND_API_KEY };
}

// Comma-separated list of team inboxes to ping the moment a brief is
// submitted — e.g. "planning@tfa.studio,karim@tfa.studio". Optional: if
// unset, no team notification email is sent.
const TEAM_NOTIFY_EMAILS = (process.env.TEAM_NOTIFY_EMAILS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Sent to TEAM_NOTIFY_EMAILS (planning@tfa.studio, typically) the moment a
// brief is submitted — the SAME overview fields + script the client's own
// confirmation email gets (via buildOverviewFields), not just a one-line
// ping, so planning can check and plan the job from the email itself
// without necessarily opening the dashboard first.
function buildTeamNotificationHtml(brief, dashboardUrl) {
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'Onbekend bedrijf';
  const { rowsHtml, scriptBlock } = buildOverviewFields(brief);
  return (
    '<!doctype html><html lang="nl"><head><meta charset="utf-8"></head>' +
    '<body style="margin:0; padding:0; background:#DEDCD7; font-family:Arial, Helvetica, sans-serif;">' +
      '<div style="max-width:560px; margin:0 auto; padding:32px 20px;">' +
        '<div style="background:#FFFFFF; border-radius:16px; padding:36px 32px;">' +
          '<div style="font-size:11px; letter-spacing:.09em; text-transform:uppercase; color:#B08B00; font-weight:700;">TFA SpotFlow</div>' +
          '<h1 style="font-family:Georgia, serif; font-weight:600; font-size:22px; margin:14px 0 4px; color:#1D1D1D;">Nieuwe brief: ' + esc(companyName) + '</h1>' +
          '<p style="font-size:14px; line-height:1.6; color:#5C5850; margin:0 0 20px;">' +
            esc(companyName) + ' heeft zojuist een radiocommercial-aanvraag ingediend. Overzicht hieronder — plan deze in en wijs een engineer toe in het dashboard.' +
          '</p>' +
          '<table style="width:100%; border-collapse:collapse;">' + rowsHtml + '</table>' +
          scriptBlock +
          (dashboardUrl
            ? '<a href="' + esc(dashboardUrl) + '" style="display:inline-block; margin-top:22px; background:#E6C858; color:#1D1D1D; font-weight:700; font-size:14px; text-decoration:none; padding:13px 22px; border-radius:8px;">Bekijk in het dashboard</a>'
            : '') +
          '<p style="margin-top:18px; font-size:12px; color:#8C8880;">— TFA SpotFlow</p>' +
        '</div>' +
      '</div>' +
    '</body></html>'
  );
}

// Pings the team's own inboxes (separate from the client's confirmation
// email above) the moment a brief is submitted — so the team hears about a
// new brief without having to keep the dashboard open and refresh it. Same
// never-throws shape as sendConfirmationEmail; silently does nothing if
// TEAM_NOTIFY_EMAILS isn't configured.
export async function sendTeamNotificationEmail(brief, dashboardUrl) {
  if (!TEAM_NOTIFY_EMAILS.length) {
    console.log('[email] TEAM_NOTIFY_EMAILS not set — skipping team notification for brief ' + brief.id + '.');
    return;
  }
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'Onbekend bedrijf';
  const subject = 'Nieuwe brief: ' + companyName;
  const html = buildTeamNotificationHtml(brief, dashboardUrl);

  if (RESEND_API_KEY) {
    try {
      await sendViaResend(TEAM_NOTIFY_EMAILS, subject, html);
      console.log('[email] Team notification sent to ' + TEAM_NOTIFY_EMAILS.join(', ') + '.');
      return;
    } catch (err) {
      console.error('[email] Team notification via Resend failed, falling back to DB row:', err.message);
    }
  }

  try {
    await writeFallbackRow(brief.id, TEAM_NOTIFY_EMAILS.join(','), subject, html);
  } catch (err) {
    console.error('[email] Failed to save team-notification fallback row:', err.message);
  }
}

// Always resolves — never throws. A broken key, an unreachable provider, or
// a missing config never blocks a client's submission from succeeding.
// appUrl (the request's own origin — see app/api/briefs/[id]/route.js) lets
// the email link back to the client's own overview page inside the app.
export async function sendConfirmationEmail(brief, appUrl) {
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'je bedrijf';
  const subject = 'Je radiocommercial-aanvraag is binnen bij TFA — ' + companyName;
  const html = buildEmailHtml(brief, appUrl);
  const to = recipientsFor(brief);

  if (RESEND_API_KEY && to.length) {
    try {
      await sendViaResend(to, subject, html);
      console.log('[email] Confirmation email sent to ' + to.join(', ') + ' via Resend.');
      return;
    } catch (err) {
      console.error('[email] Resend send failed, falling back to DB row:', err.message);
    }
  } else if (RESEND_API_KEY && !to.length) {
    console.log('[email] No contact email on brief ' + brief.id + ' — saving as a DB row instead of sending.');
  }

  try {
    await writeFallbackRow(brief.id, to.join(', '), subject, html);
  } catch (err) {
    console.error('[email] Failed to save fallback email row:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Assignment notification — sent to a studio engineer (Marco or Karim, see
// components/DashboardClient.js's ASSIGNEE_OPTIONS) the moment a producer
// assigns a brief to them from the dashboard's Team tab, so they know to
// start working without having to notice it themselves in the table.
// Each engineer's actual inbox is a separate env var (not hardcoded, and
// not derived from the name) so it can be set/changed in Vercel without a
// code change. Optional per-engineer: assigning to someone whose env var
// isn't set just silently skips the email (same "never blocks the actual
// action" philosophy as every other email in this file).
const ENGINEER_EMAILS = {
  Marco: process.env.ENGINEER_EMAIL_MARCO || '',
  Karim: process.env.ENGINEER_EMAIL_KARIM || '',
};

function buildAssignmentHtml(brief, dashboardUrl) {
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'Onbekend bedrijf';
  const { rowsHtml, scriptBlock } = buildOverviewFields(brief);
  return (
    '<!doctype html><html lang="nl"><head><meta charset="utf-8"></head>' +
    '<body style="margin:0; padding:0; background:#DEDCD7; font-family:Arial, Helvetica, sans-serif;">' +
      '<div style="max-width:560px; margin:0 auto; padding:32px 20px;">' +
        '<div style="background:#FFFFFF; border-radius:16px; padding:36px 32px;">' +
          '<div style="font-size:11px; letter-spacing:.09em; text-transform:uppercase; color:#B08B00; font-weight:700;">TFA SpotFlow</div>' +
          '<h1 style="font-family:Georgia, serif; font-weight:600; font-size:22px; margin:14px 0 4px; color:#1D1D1D;">Aan jou toegewezen: ' + esc(companyName) + '</h1>' +
          '<p style="font-size:14px; line-height:1.6; color:#5C5850; margin:0 0 20px;">' +
            'Je bent toegewezen als engineer op deze productie. Overzicht hieronder.' +
          '</p>' +
          '<table style="width:100%; border-collapse:collapse;">' + rowsHtml + '</table>' +
          scriptBlock +
          (dashboardUrl
            ? '<a href="' + esc(dashboardUrl) + '" style="display:inline-block; margin-top:22px; background:#E6C858; color:#1D1D1D; font-weight:700; font-size:14px; text-decoration:none; padding:13px 22px; border-radius:8px;">Bekijk in het dashboard</a>'
            : '') +
          '<p style="margin-top:18px; font-size:12px; color:#8C8880;">— TFA SpotFlow</p>' +
        '</div>' +
      '</div>' +
    '</body></html>'
  );
}

// Fired when a brief's assignedTo changes to a non-empty engineer name (see
// app/api/dashboard/briefs/[id]/meta/route.js, which compares before/after
// and only calls this on an actual change — not on every meta save). Skips
// silently if that engineer's ENGINEER_EMAIL_* env var isn't set.
export async function sendAssignmentEmail(brief, assigneeName, dashboardUrl) {
  const to = (ENGINEER_EMAILS[assigneeName] || '').trim();
  if (!to) {
    console.log('[email] No email configured for engineer "' + assigneeName + '" — skipping assignment email for brief ' + brief.id + '.');
    return;
  }
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'Onbekend bedrijf';
  const subject = 'Aan jou toegewezen: ' + companyName;
  const html = buildAssignmentHtml(brief, dashboardUrl);

  if (RESEND_API_KEY) {
    try {
      await sendViaResend(to, subject, html);
      console.log('[email] Assignment email sent to ' + to + ' for brief ' + brief.id + '.');
      return;
    } catch (err) {
      console.error('[email] Assignment email via Resend failed, falling back to DB row:', err.message);
    }
  }
  try {
    await writeFallbackRow(brief.id, to, subject, html);
  } catch (err) {
    console.error('[email] Failed to save assignment fallback row:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Post-production review workflow emails — see lib/db.js's addReviewRound/
// addReviewFeedback/approveReview and app/brief/[id]/review/page.js. All
// follow the same never-throws, tiered-fallback shape as the emails above.

// Optional: the single TFA inbox that gets the final Frame.io link the
// moment a client approves a review round. If unset, that specific email is
// skipped (the internal team-notification ping to TEAM_NOTIFY_EMAILS still
// fires, if configured, so approval isn't silently invisible either way).
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || '';

// Turns a round's 'YYYY-MM-DD' folderDate into a Dutch long date ("8
// september 2026") for use in email copy — every review email below refers
// to the DATED FOLDER a round represents (see the reviewRounds comment in
// lib/db.js), not a separate link, since it's the same Frame.io link every
// round.
function formatFolderDate(folderDate) {
  if (!folderDate) return '';
  const d = new Date(folderDate + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch (e) {
    return folderDate;
  }
}

// One-line label for a round: "map van 8 september 2026", plus its note in
// parentheses if the producer added one.
function roundLabel(round) {
  if (!round) return '';
  const dateLabel = formatFolderDate(round.folderDate);
  const base = dateLabel ? 'map van ' + dateLabel : '';
  if (round.note && round.note.trim()) {
    return base ? base + ' (' + round.note.trim() + ')' : round.note.trim();
  }
  return base;
}

function buildReviewReadyHtml(brief, reviewUrl, round) {
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'jouw radiocommercial';
  const label = roundLabel(round);
  return (
    '<!doctype html><html lang="nl"><head><meta charset="utf-8"></head>' +
    '<body style="margin:0; padding:0; background:#DEDCD7; font-family:Arial, Helvetica, sans-serif;">' +
      '<div style="max-width:560px; margin:0 auto; padding:32px 20px;">' +
        '<div style="background:#FFFFFF; border-radius:16px; padding:36px 32px;">' +
          '<div style="font-size:11px; letter-spacing:.09em; text-transform:uppercase; color:#B08B00; font-weight:700;">TFA SpotFlow</div>' +
          '<h1 style="font-family:Georgia, serif; font-weight:600; font-size:22px; margin:14px 0 4px; color:#1D1D1D;">Je commercial staat klaar om te bekijken</h1>' +
          '<p style="font-size:14px; line-height:1.6; color:#5C5850; margin:0 0 22px;">' +
            'De productie van ' + esc(companyName) + ' is klaar voor jouw review' + (label ? ' — ' + esc(label) : '') + '. Bekijk hem via de knop hieronder — je kunt feedback achterlaten of direct goedkeuren.' +
          '</p>' +
          '<a href="' + esc(reviewUrl) + '" style="display:inline-block; background:#E6C858; color:#1D1D1D; font-weight:700; font-size:14px; text-decoration:none; padding:13px 22px; border-radius:8px;">Bekijk en reageer</a>' +
          '<p style="margin-top:26px; font-size:12.5px; line-height:1.6; color:#8C8880;">' +
            'Werkt de knop niet? Kopieer dan deze link: ' + esc(reviewUrl) +
          '</p>' +
          '<p style="margin-top:18px; font-size:12px; color:#8C8880;">— Het TFA-team</p>' +
        '</div>' +
      '</div>' +
    '</body></html>'
  );
}

// Sent to the client when a producer shares a new review round (a fresh
// dated folder inside the brief's Frame.io link) — the "your round is
// ready" ping, modeled directly on sendResumeLinkEmail above. `round` is the
// round object just created (see app/api/dashboard/briefs/[id]/review-round)
// — optional, only used to mention its folder date/note in the copy.
export async function sendReviewReadyEmail(brief, reviewUrl, round) {
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'je bedrijf';
  const subject = 'Je commercial staat klaar om te bekijken — ' + companyName;
  const html = buildReviewReadyHtml(brief, reviewUrl, round);
  const to = recipientsFor(brief);

  if (RESEND_API_KEY && to.length) {
    try {
      await sendViaResend(to, subject, html);
      console.log('[email] Review-ready email sent to ' + to.join(', ') + '.');
      return;
    } catch (err) {
      console.error('[email] Review-ready email via Resend failed, falling back to DB row:', err.message);
    }
  }

  try {
    await writeFallbackRow(brief.id, to.join(', '), subject, html);
  } catch (err) {
    console.error('[email] Failed to save review-ready fallback row:', err.message);
  }
}

function buildInternalReviewEventHtml(brief, { heading, bodyText, dashboardUrl }) {
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'Onbekend bedrijf';
  return (
    '<!doctype html><html lang="nl"><head><meta charset="utf-8"></head>' +
    '<body style="margin:0; padding:0; background:#DEDCD7; font-family:Arial, Helvetica, sans-serif;">' +
      '<div style="max-width:560px; margin:0 auto; padding:32px 20px;">' +
        '<div style="background:#FFFFFF; border-radius:16px; padding:36px 32px;">' +
          '<div style="font-size:11px; letter-spacing:.09em; text-transform:uppercase; color:#B08B00; font-weight:700;">TFA SpotFlow</div>' +
          '<h1 style="font-family:Georgia, serif; font-weight:600; font-size:22px; margin:14px 0 4px; color:#1D1D1D;">' + esc(heading) + '</h1>' +
          '<p style="font-size:14px; line-height:1.6; color:#5C5850; margin:0 0 20px;">' + esc(companyName) + ': ' + esc(bodyText) + '</p>' +
          (dashboardUrl
            ? '<a href="' + esc(dashboardUrl) + '" style="display:inline-block; background:#E6C858; color:#1D1D1D; font-weight:700; font-size:14px; text-decoration:none; padding:13px 22px; border-radius:8px;">Bekijk in het dashboard</a>'
            : '') +
          '<p style="margin-top:18px; font-size:12px; color:#8C8880;">— TFA SpotFlow</p>' +
        '</div>' +
      '</div>' +
    '</body></html>'
  );
}

// Pings TEAM_NOTIFY_EMAILS the moment a client leaves feedback on a review
// round — same optional/never-throws shape as sendTeamNotificationEmail.
// `round` (the round the feedback landed on) is optional, only used to name
// its dated folder in the copy.
export async function sendReviewFeedbackNotification(brief, dashboardUrl, round) {
  if (!TEAM_NOTIFY_EMAILS.length) return;
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'Onbekend bedrijf';
  const label = roundLabel(round);
  const subject = 'Feedback ontvangen: ' + companyName;
  const html = buildInternalReviewEventHtml(brief, {
    heading: 'Nieuwe reviewfeedback',
    bodyText: 'heeft feedback achtergelaten' + (label ? ' op de ' + label : ' op de laatste review-ronde') + '.',
    dashboardUrl,
  });

  if (RESEND_API_KEY) {
    try {
      await sendViaResend(TEAM_NOTIFY_EMAILS, subject, html);
      return;
    } catch (err) {
      console.error('[email] Review-feedback notification via Resend failed, falling back to DB row:', err.message);
    }
  }
  try {
    await writeFallbackRow(brief.id, TEAM_NOTIFY_EMAILS.join(','), subject, html);
  } catch (err) {
    console.error('[email] Failed to save review-feedback fallback row:', err.message);
  }
}

// Fired once a client approves a review round. Two audiences, both
// optional and independent: TEAM_NOTIFY_EMAILS gets the same kind of
// internal ping as every other event, and ADMIN_NOTIFY_EMAIL — if set —
// gets the actual final Frame.io link directly, which is the whole point of
// this workflow ("automatically sent to an admin" on approval). `round` (the
// approved round) is optional, only used to name its dated folder in the
// copy.
export async function sendReviewApprovedNotification(brief, { dashboardUrl, frameioLink, round }) {
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'Onbekend bedrijf';
  const label = roundLabel(round);

  if (TEAM_NOTIFY_EMAILS.length) {
    const subject = 'Goedgekeurd: ' + companyName;
    const html = buildInternalReviewEventHtml(brief, {
      heading: 'Review goedgekeurd',
      bodyText: 'heeft ' + (label || 'de laatste review-ronde') + ' goedgekeurd.',
      dashboardUrl,
    });
    if (RESEND_API_KEY) {
      try {
        await sendViaResend(TEAM_NOTIFY_EMAILS, subject, html);
      } catch (err) {
        console.error('[email] Review-approved team notification via Resend failed, falling back to DB row:', err.message);
        try { await writeFallbackRow(brief.id, TEAM_NOTIFY_EMAILS.join(','), subject, html); } catch (e2) { console.error('[email] Failed to save review-approved fallback row:', e2.message); }
      }
    } else {
      try { await writeFallbackRow(brief.id, TEAM_NOTIFY_EMAILS.join(','), subject, html); } catch (e2) { console.error('[email] Failed to save review-approved fallback row:', e2.message); }
    }
  }

  if (ADMIN_NOTIFY_EMAIL) {
    const subject = 'Definitieve link goedgekeurd — ' + companyName;
    const html = (
      '<!doctype html><html lang="nl"><head><meta charset="utf-8"></head>' +
      '<body style="margin:0; padding:0; background:#DEDCD7; font-family:Arial, Helvetica, sans-serif;">' +
        '<div style="max-width:560px; margin:0 auto; padding:32px 20px;">' +
          '<div style="background:#FFFFFF; border-radius:16px; padding:36px 32px;">' +
            '<div style="font-size:11px; letter-spacing:.09em; text-transform:uppercase; color:#B08B00; font-weight:700;">TFA SpotFlow</div>' +
            '<h1 style="font-family:Georgia, serif; font-weight:600; font-size:22px; margin:14px 0 4px; color:#1D1D1D;">' + esc(companyName) + ' heeft goedgekeurd</h1>' +
            '<p style="font-size:14px; line-height:1.6; color:#5C5850; margin:0 0 20px;">De klant heeft ' + (label ? esc(label) : 'de laatste versie') + ' goedgekeurd. Definitieve Frame.io-link:</p>' +
            '<a href="' + esc(frameioLink || '') + '" style="display:inline-block; background:#E6C858; color:#1D1D1D; font-weight:700; font-size:14px; text-decoration:none; padding:13px 22px; border-radius:8px;">Open in Frame.io</a>' +
            '<p style="margin-top:18px; font-size:12px; color:#8C8880;">— TFA SpotFlow</p>' +
          '</div>' +
        '</div>' +
      '</body></html>'
    );
    if (RESEND_API_KEY) {
      try {
        await sendViaResend(ADMIN_NOTIFY_EMAIL, subject, html);
      } catch (err) {
        console.error('[email] Admin approval email via Resend failed, falling back to DB row:', err.message);
        try { await writeFallbackRow(brief.id, ADMIN_NOTIFY_EMAIL, subject, html); } catch (e2) { console.error('[email] Failed to save admin-approval fallback row:', e2.message); }
      }
    } else {
      try { await writeFallbackRow(brief.id, ADMIN_NOTIFY_EMAIL, subject, html); } catch (e2) { console.error('[email] Failed to save admin-approval fallback row:', e2.message); }
    }
  }
}
