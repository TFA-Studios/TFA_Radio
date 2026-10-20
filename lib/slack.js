import { fetchWithTimeout } from './http';
// Posts short pings to a single Slack channel via an Incoming Webhook —
// deliberately separate from lib/email.js: Slack is a different channel
// with its own optional config, and a failure here should never affect
// email delivery or vice versa. Same never-throws philosophy as every
// other notification in this app — a missing/invalid webhook URL or a
// network hiccup must never block the actual action (brief submission,
// review approval) that triggered it.
//
// Setup (Karim/TFA admin, one-time):
//   1. In Slack: create or pick a channel (e.g. #spotflow), then add an
//      "Incoming Webhook" app to it (Slack → Apps → search "Incoming
//      Webhooks" → Add to Slack → choose the channel). Slack gives you a
//      URL like https://hooks.slack.com/services/T000/B000/xxxxxxxx.
//   2. In Vercel: add that URL as SLACK_WEBHOOK_URL (Plain Text is fine —
//      it's not a secret in the same sense as an API key, but Sensitive
//      works too if preferred).
//   3. Redeploy. If SLACK_WEBHOOK_URL isn't set, every call below is a
//      silent no-op — nothing breaks, Slack just doesn't get pinged.

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';

export const slackEnabled = !!SLACK_WEBHOOK_URL;

// text supports Slack's basic mrkdwn: *bold*, <url|label> for links.
export async function postToSlack(text) {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    const res = await fetchWithTimeout(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    }, 6000);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[slack] Webhook post failed ' + res.status + ': ' + body.slice(0, 300));
    }
  } catch (err) {
    console.error('[slack] Webhook post failed:', err && err.message);
  }
}

// Every message below follows the same shape, one piece per line, rather
// than one crammed sentence — per Karim's request for clearer notifications
// (2026-09-24): line 1 is the emoji + state label (unambiguous at a glance,
// even collapsed in Slack's notification preview), line 2 is the company
// name + the one detail that matters for that state, and any links go on
// their own trailing line(s) rather than parenthesized inline. `\n` is
// plain Slack mrkdwn — no special formatting needed for a line break.
function dashboardLine(dashboardUrl) {
  return dashboardUrl ? '<' + dashboardUrl + '|Bekijk in dashboard>' : '';
}

// "🆕 Nieuwe brief binnen" — fired the moment a client sends their brief
// (end of step 3; see app/api/briefs/[id]/route.js). Since the copywriter
// workflow this is also the "your turn" ping: the server has just drafted
// the script versions, and they wait for a producer to check/edit/release
// them in the dashboard before the client sees anything. `draftCount` is
// how many versions were actually written (0 = generation failed, the
// dashboard offers a retry).
export async function notifyNewBrief(brief, dashboardUrl, draftCount) {
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'Onbekend bedrijf';
  const spotLength = brief.hoofdspotLength || '20';
  const draftLine = draftCount === null
    ? ':page_facing_up: Dit agentschap levert zelf het script: voeg het toe in de Creatief-tab en geef het vrij'
    : draftCount > 0
    ? ':pencil2: ' + draftCount + ' scriptversies staan klaar om na te kijken en vrij te geven'
    : ':warning: Scriptversies genereren is niet gelukt, open het dashboard om het opnieuw te proberen';
  const lines = [
    ':inbox_tray: *Nieuwe brief binnen*',
    '*' + companyName + '* — ' + spotLength + '″ commercial',
    draftLine,
    dashboardLine(dashboardUrl),
  ].filter(Boolean);
  await postToSlack(lines.join('\n'));
}

// "🤝 Klant heeft alles bevestigd" — fired when the client finishes the
// last step (script, voice and music chosen and confirmed), i.e. the brief
// is now ready to be produced. Distinct from notifyDelivered below, which is
// the much later "client approved the finished spot" moment.
export async function notifyClientConfirmed(brief, dashboardUrl) {
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'Onbekend bedrijf';
  const voice = brief.selectedVoiceLabel ? 'Stem: ' + brief.selectedVoiceLabel : '';
  const lines = [
    ':handshake: *Klant heeft alles bevestigd*',
    '*' + companyName + '* — script, stem en muziek zijn gekozen, klaar voor productie',
    voice,
    dashboardLine(dashboardUrl),
  ].filter(Boolean);
  await postToSlack(lines.join('\n'));
}

// "✅ Klant heeft goedgekeurd" — fired the moment a client approves the
// final review round (see app/api/briefs/[id]/review-approve/route.js).
// Carries the Frame.io link directly in the message — this used to be a
// separate ADMIN_NOTIFY_EMAIL email (lib/email.js's
// sendReviewApprovedNotification, still defined there if ever wanted back),
// but Karim asked to fold that into Slack too rather than keep one last
// email in the loop.
//
// Deliberately says "goedgekeurd", not "geleverd" (it used to say
// "Goedgekeurd/geleverd", which read as one event when they're actually
// two): this fires on client approval, which can happen well before the
// WAV masters actually go out via the dashboard's Uitlevering tab. If a
// separate "uitgeleverd aan <agency>" ping for that later, real hand-off
// moment is ever wanted, it belongs here as its own function, not folded
// back into this one.
export async function notifyDelivered(brief, dashboardUrl, frameioLink) {
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'Onbekend bedrijf';
  const lines = [
    ':white_check_mark: *Klant heeft goedgekeurd*',
    '*' + companyName + '*',
    frameioLink ? '<' + frameioLink + '|Open in Frame.io>' : '',
    dashboardLine(dashboardUrl),
  ].filter(Boolean);
  await postToSlack(lines.join('\n'));
}

// "👤 Toegewezen" — fired when a producer assigns a brief to themselves or
// the other engineer from the dashboard's Team tab (see
// app/api/dashboard/briefs/[id]/meta/route.js). Replaces what used to be a
// separate assignment EMAIL to the assigned engineer — Karim's call: the
// team is always in Slack anyway, so a ping there is enough and one less
// inbox notification.
export async function notifyAssigned(brief, assigneeName, dashboardUrl) {
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'Onbekend bedrijf';
  const lines = [
    ':bust_in_silhouette: *Toegewezen*',
    '*' + companyName + '* → ' + assigneeName,
    dashboardLine(dashboardUrl),
  ].filter(Boolean);
  await postToSlack(lines.join('\n'));
}

// "💬 Feedback ontvangen" — fired when a client leaves feedback on a review
// round instead of approving it (see
// app/api/briefs/[id]/review-feedback/route.js).
export async function notifyFeedback(brief, dashboardUrl) {
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'Onbekend bedrijf';
  const lines = [
    ':speech_balloon: *Feedback ontvangen*',
    '*' + companyName + '*',
    dashboardLine(dashboardUrl),
  ].filter(Boolean);
  await postToSlack(lines.join('\n'));
}

// "📝 Interne notitie" — fired when a producer adds a new internal note
// on a brief from the dashboard's Team tab (see
// app/api/dashboard/briefs/[id]/notes/route.js). Deliberately only on a
// NEW note, not on an edit to an existing one — editing a typo shouldn't
// re-ping the channel with the same content.
export async function notifyInternalNote(brief, text, author, dashboardUrl) {
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'Onbekend bedrijf';
  const snippet = (text || '').length > 300 ? text.slice(0, 300) + '…' : (text || '');
  const lines = [
    ':memo: *Interne notitie*',
    '*' + companyName + '*' + (author ? ' — ' + author : ''),
    '"' + snippet + '"',
    dashboardLine(dashboardUrl),
  ].filter(Boolean);
  await postToSlack(lines.join('\n'));
}

// "🔎 Script check nodig" — the client confirmed everything but changed the
// script (or a variation) after TFA's proposals. Nothing counts as approved
// until a producer has checked the changes in the dashboard.
export async function notifyScriptCheck(brief, dashboardUrl) {
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'Onbekend bedrijf';
  const lines = [
    ':mag: *Script check nodig*',
    '*' + companyName + '* — de klant heeft het script aangepast, nog niet als goedgekeurd beschouwen',
    dashboardLine(dashboardUrl),
  ].filter(Boolean);
  await postToSlack(lines.join('\n'));
}

// "🙈 Voorstellen passen niet" — the client used the quiet link under the
// script proposals to say none of them fit.
export async function notifyNoFit(brief, message, dashboardUrl) {
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'Onbekend bedrijf';
  const snippet = (message || '').length > 300 ? message.slice(0, 300) + '…' : (message || '');
  const lines = [
    ':see_no_evil: *Geen van de scriptvoorstellen past*',
    '*' + companyName + '*',
    snippet ? '"' + snippet + '"' : '',
    dashboardLine(dashboardUrl),
  ].filter(Boolean);
  await postToSlack(lines.join('\n'));
}

// "↩️ Klant reageert op tegenvoorstel" — the client answered TFA's counter
// proposal on the script check.
export async function notifyAuditReply(brief, accepted, message, dashboardUrl) {
  const companyName = (brief.companyName && brief.companyName.trim()) ? brief.companyName : 'Onbekend bedrijf';
  const snippet = (message || '').length > 300 ? message.slice(0, 300) + '…' : (message || '');
  const lines = [
    accepted ? ':white_check_mark: *Klant neemt ons scriptvoorstel over*' : ':leftwards_arrow_with_hook: *Klant reageert op ons scriptvoorstel*',
    '*' + companyName + '*',
    snippet ? '"' + snippet + '"' : '',
    dashboardLine(dashboardUrl),
  ].filter(Boolean);
  await postToSlack(lines.join('\n'));
}
