import Preloader from '../../components/Preloader';

// Next's route-level Suspense fallback — shown automatically during a page
// transition whenever the destination is a server component still awaiting
// data (e.g. navigating into /dashboard or /dashboard/library, both of which
// fetch real data server-side before they can render).
//
// Scoped to /dashboard (not app/loading.js at the root) on purpose: the
// client brief flow (/brief/[id]/...) already shows its own Preloader via
// each step page's `navigating`/`showLoader` state (see StepShell.js and
// Preloader.js's own comment on why that mounts twice per transition, by
// design). A root-level loading.js would ALSO kick in as the Suspense
// fallback while Next fetches the next route segment's JS — stacking a
// third Preloader mount on top of those two, which showed up as the
// preloader visibly restarting/flashing twice in a row. Keeping this file
// scoped to /dashboard (a tree of plain server components with no
// client-side loading state of their own) gives them a fallback without
// affecting the brief flow or the homepage/start page at all.
export default function Loading() {
  return <Preloader />;
}
