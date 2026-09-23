import { listAgencies } from '../../../lib/db';
import AgenciesClient from '../../../components/AgenciesClient';
import DashboardSidebar, { DASHBOARD_SHELL_STYLES } from '../../../components/DashboardSidebar';

// Real, editable data — never statically cache this page (same as
// /dashboard/prompt).
export const dynamic = 'force-dynamic';

export default async function AgenciesPage() {
  const agencies = await listAgencies();

  return (
    <div style={{ minHeight: '100vh', background: '#DEDCD7', display: 'flex' }} className="tfa-dash-shell">
      <DashboardSidebar active="agencies" />

      <main style={{ flex: 1, padding: '32px 36px', minWidth: 0 }}>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: 30, margin: '0 0 6px', color: '#1D1D1D' }}>
          Agentschappen
        </h1>
        <p style={{ fontSize: 13.5, color: '#5C5850', margin: '0 0 24px', maxWidth: 640, lineHeight: 1.5 }}>
          Elke agency hieronder krijgt een eigen toegangscode — een link met{' '}
          <code>/start?code=...</code> die die code gebruikt, maakt een brief aan die automatisch aan
          deze agency wordt gekoppeld. Op die brief wordt dan overal (klantmail, statuspagina,
          uitlevering) deze agency genoemd in plaats van de naam &quot;Advision Media&quot;, en het
          contact-e-mailadres hieronder wordt in het dashboard als eerste suggestie getoond bij het
          versturen van de eindlevering. Briefs zonder herkende code blijven &quot;Advision Media&quot;
          tonen, zoals voorheen.
        </p>
        <AgenciesClient initialAgencies={agencies} />
      </main>

      <style>{DASHBOARD_SHELL_STYLES}</style>
    </div>
  );
}
