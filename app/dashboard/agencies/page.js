import { requireStaffPage } from '../../../lib/access';
import { listAgencies } from '../../../lib/db';
import AgenciesClient from '../../../components/AgenciesClient';
import PageHeader from '../../../components/PageHeader';
import DashboardSidebar, { DASHBOARD_SHELL_STYLES } from '../../../components/DashboardSidebar';

// Real, editable data — never statically cache this page (same as
// /dashboard/prompt).
export const dynamic = 'force-dynamic';

export default async function AgenciesPage() {
  await requireStaffPage();
  const agencies = await listAgencies();

  return (
    <div style={{ minHeight: '100vh', background: '#DEDCD7', display: 'flex' }} className="tfa-dash-shell">
      <DashboardSidebar active="agencies" />

      <main style={{ flex: 1, padding: '32px 36px', minWidth: 0 }} className="tfa-dash-main">
        <PageHeader title="Agentschappen">
          Elk agentschap heeft een toegangscode. Een klant die via <code>/start?code=…</code> binnenkomt, krijgt het logo en het formulier van dat agentschap, en de brief wordt aan hen gekoppeld. Zonder herkende code valt een brief onder Advision Media.
        </PageHeader>
        <AgenciesClient initialAgencies={agencies} />
      </main>

      <style>{DASHBOARD_SHELL_STYLES}</style>
    </div>
  );
}
