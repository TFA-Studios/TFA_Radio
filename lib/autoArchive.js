// Delivered briefs move to the archive by themselves after a grace period, so
// the dashboard only shows work that is still open. The week gives the team
// time to resend the delivery or answer a question while the brief is still in
// the Geleverd tile. Nothing is deleted: the archive keeps everything, and a
// brief that is put back by hand is never auto-archived a second time.
export const AUTO_ARCHIVE_DAYS = 7;

// The moment before which a delivery counts as old enough to archive.
export function autoArchiveCutoff(now) {
  const base = now instanceof Date ? now.getTime() : Date.parse(now);
  return new Date(base - AUTO_ARCHIVE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
