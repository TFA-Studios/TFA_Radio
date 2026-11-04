// A brief counts as "new/unchecked" once it is submitted but not yet opened by a
// producer since (never opened, or opened before this submission). Comparing
// timestamps rather than just checking seenAt keeps this right for a resubmit.
// Shared by the dashboard page (the sidebar count) and the dashboard table.
export function isUnseenBrief(b) {
  if (!b || !b.submittedAt) return false;
  if (!b.seenAt) return true;
  return new Date(b.seenAt).getTime() < new Date(b.submittedAt).getTime();
}

// Test briefs (marked by a producer, or started from a ?test=1 link) must never
// count in reports, the CSV export or the dashboard numbers.
export function isRealBrief(b) {
  return !!b && !b.isTest;
}
