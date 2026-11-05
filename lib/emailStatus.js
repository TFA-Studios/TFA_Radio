// How the delivery status of one outgoing email follows the events Resend
// reports (webhook, see app/api/webhooks/resend/route.js).
// sent -> delayed -> delivered is the happy path; bounced, failed and
// complained (marked as spam) are problems that must never be hidden by a
// later, friendlier event.
export const EMAIL_STATUS_LABELS = {
  not_sent: 'Niet verstuurd',
  sent: 'Verstuurd, nog geen bevestiging',
  delayed: 'Vertraagd',
  delivered: 'Afgeleverd bij de mailserver van de klant',
  bounced: 'Niet afgeleverd (bounce)',
  failed: 'Verzenden mislukt',
  complained: 'Klant markeerde als spam',
};
export const EMAIL_PROBLEM_STATUSES = ['not_sent', 'bounced', 'failed', 'complained'];

const EVENT_TO_STATUS = {
  'email.sent': 'sent',
  'email.delivery_delayed': 'delayed',
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.failed': 'failed',
  'email.complained': 'complained',
};
const RANK = { not_sent: 0, sent: 1, delayed: 2, delivered: 3 };

// Returns the new status, or the current one when the event changes nothing
// (unknown event, or an event older than what we already know).
export function nextEmailStatus(current, eventType) {
  const incoming = EVENT_TO_STATUS[eventType];
  if (!incoming) return current;
  const bad = (s) => EMAIL_PROBLEM_STATUSES.includes(s) && s !== 'not_sent';
  if (bad(incoming)) return current === 'complained' ? current : incoming;
  if (bad(current)) return current;
  return (RANK[incoming] || 0) >= (RANK[current] || 0) ? incoming : current;
}
