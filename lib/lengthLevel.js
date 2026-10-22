// How a script's estimated reading time compares to the booked spot length.
//   ok     up to 5% over  (20" spot: up to 21")  - fits
//   check  5% to 20% over (20": up to 24")       - probably too long, TFA will check
//   long   more than 20% over (20": 25" and up)  - too long: no more words, cannot continue
export const CHECK_FACTOR = 1.05;
export const LONG_FACTOR = 1.2;

export function lengthLevel(seconds, target) {
  if (seconds > target * LONG_FACTOR) return 'long';
  if (seconds > target * CHECK_FACTOR) return 'check';
  return 'ok';
}

// True when an edit should be refused: the new text is in the "long" zone
// AND it has more words than before. Removing or swapping words always works,
// so a client can always get back under the limit.
export function blocksEdit(oldWords, newWords, newSeconds, target) {
  return lengthLevel(newSeconds, target) === 'long' && newWords > oldWords;
}
