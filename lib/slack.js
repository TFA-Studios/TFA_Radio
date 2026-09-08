// Pings the team's Slack channel the instant a client submits a brief, using
// a Slack "Incoming Webhook" — the simplest possible integration: no OAuth,
// no bot install, no API client. Set one up at https://api.slack.com/apps ->
// create an app -> "Incoming Webhooks" -> activate -> "Add New Webhook to
// Workspace" -> pick the channel -> Slack hands you a URL that looks like
// https://hooks.slack.com/services/T000/B000/xxxxxxxx. Put that URL in this
// project's SLACK_WEBHOOK_URL env var (Vercel: Project Settings ->
// Environment Variables) and every new submitted brief posts there
// automatically — nothing else to configure, and no Slack app-level
// permissions beyond "post to this one channel" are ever granted.
//
// Never throws — same philosophy as lib/email.js: a missing/invalid webhook
// should never block a client's submission from succeeding.
import { variationsSummaryLabel } from '../components/flowData';

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';

function formatBriefLine(brief) {
  const company = (brief.companyName && brief.companyName.trim()) || 'Onbekend bedrijf';
  const spot = (brief.hoofdspotLength || '20') + '″' + variationsSummaryLabel(brief);
  return company + ' — ' + spot;
}

export async function sendSlackNewBriefPing(brief, dashboardUrl) {
  if (!SLACK_WEBHOOK_URL) {
    console.log('[slack] SLACK_WEBHOOK_URL not set — skipping Slack ping for brief ' + brief.id + '.');
    return;
  }
  const text =
    ':loudspeaker: Nieuwe brief binnengekomen — ' + formatBriefLine(brief) +
    (dashboardUrl ? '\n' + dashboardUrl : '');
  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error('Slack webhook error ' + res.status + ': ' + body.slice(0, 300));
    }
    console.log('[slack] New-brief ping sent for brief ' + brief.id + '.');
  } catch (err) {
    console.error('[slack] Failed to send new-brief ping:', err.message);
  }
}

async function postSlack(text) {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error('Slack webhook error ' + res.status + ': ' + body.slice(0, 300));
    }
  } catch (err) {
    console.error('[slack] Failed to send ping:', err.message);
  }
}

// Fired when a client leaves feedback on a review round — see
// lib/db.js's addReviewFeedback and app/api/briefs/[id]/review-feedback.
export async function sendSlackReviewFeedbackPing(brief, dashboardUrl) {
  if (!SLACK_WEBHOOK_URL) {
    console.log('[slack] SLACK_WEBHOOK_URL not set — skipping review-feedback ping for brief ' + brief.id + '.');
    return;
  }
  const text = ':speech_balloon: Feedback ontvangen — ' + formatBriefLine(brief) + (dashboardUrl ? '\n' + dashboardUrl : '');
  await postSlack(text);
}

// Fired when a client approves a review round — see lib/db.js's
// approveReview and app/api/briefs/[id]/review-approve.
export async function sendSlackReviewApprovedPing(brief, dashboardUrl) {
  if (!SLACK_WEBHOOK_URL) {
    console.log('[slack] SLACK_WEBHOOK_URL not set — skipping review-approved ping for brief ' + brief.id + '.');
    return;
  }
  const text = ':white_check_mark: Review goedgekeurd — ' + formatBriefLine(brief) + (dashboardUrl ? '\n' + dashboardUrl : '');
  await postSlack(text);
}
