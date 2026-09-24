import { listBriefs } from '../../lib/db';
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
  const briefs = await listBriefs();
  const unseenCount = briefs.filter(isUnseenBrief).length;

  return (
    <div style={{ minHeight: '100vh', background: '#DEDCD7', display: 'flex' }} className="tfa-dash-shell">
      <DashboardSidebar active="dashboard" unseenCount={unseenCount} />

      <main style={{ flex: 1, padding: '32px 36px', minWidth: 0 }} className="tfa-dash-main">
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: 30, margin: '0 0 24px', color: '#1D1D1D', display: 'flex', alignItems: 'center', gap: 12 }}>
          Dashboard
          {unseenCount > 0 && (
            <span style={{ fontFamily: "'Geist', system-ui, sans-serif", fontSize: 13, fontWeight: 700, color: '#8C6D1F', background: 'rgba(230,200,88,.28)', borderRadius: 8, padding: '4px 10px' }}>
              {unseenCount} nieuwe brief{unseenCount === 1 ? '' : 's'}
            </span>
          )}
        </h1>
        <DashboardClient briefs={briefs} />
      </main>

      <style>{DASHBOARD_SHELL_STYLES}</style>
    </div>
  );
}
