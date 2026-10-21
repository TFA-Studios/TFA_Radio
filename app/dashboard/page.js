import { listBriefs } from '../../lib/db';
import { getViewer, scopeBriefs } from '../../lib/access';
import DashboardClient from '../../components/DashboardClient';
import DashboardSidebar, { DASHBOARD_SHELL_STYLES } from '../../components/DashboardSidebar';

// Real, changing data (submitted briefs) — never statically cache this page.
export const dynamic = 'force-dynamic';

// Mirrors isUnseenBrief() in DashboardClient.js — a brief counts as
// "new/unchecked" once submitted but not yet opened by a producer since.
// Duplicated rather than imported since DashboardClient is a client
// component; kept in sync manually (same one-line rule either way).
function isUnseenBrief(b) {
  if (!b || !b.submittedAt) return false;
  if (!b.seenAt) return true;
  return new Date(b.seenAt).getTime() < new Date(b.submittedAt).getTime();
}

export default async function DashboardPage() {
  const viewer = await getViewer();
  // Staff-archived briefs stay out of an agency's view; staff see them in the archive.
  const briefs = scopeBriefs(viewer, await listBriefs()).filter((b) => viewer.role !== 'agency' || !b.archivedAt);
  const isAgency = viewer.role === 'agency';
  const unseenCount = briefs.filter((b) => !b.archivedAt && isUnseenBrief(b)).length;

  return (
    <div style={{ minHeight: '100vh', background: '#DEDCD7', display: 'flex' }} className="tfa-dash-shell">
      <DashboardSidebar active="dashboard" unseenCount={isAgency ? 0 : unseenCount} role={viewer.role} partnerLogo={isAgency ? viewer.agency.logoDark || '' : ''} />

      <main style={{ flex: 1, padding: '32px 36px', minWidth: 0 }} className="tfa-dash-main">
        <header style={{ margin: '0 0 22px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontWeight: 500, fontSize: 28, letterSpacing: '-.015em', lineHeight: 1.2, margin: 0, color: '#1D1D1D' }}>
            {isAgency ? viewer.agency.name : 'Dashboard'}
          </h1>
          {!isAgency && unseenCount > 0 && (
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1D', background: '#E6C858', borderRadius: 999, padding: '3px 11px' }}>
              {unseenCount} nieuwe brief{unseenCount === 1 ? '' : 's'}
            </span>
          )}
        </header>
        <DashboardClient briefs={briefs} readOnly={isAgency} />
      </main>

      <style>{DASHBOARD_SHELL_STYLES}</style>
    </div>
  );
}
