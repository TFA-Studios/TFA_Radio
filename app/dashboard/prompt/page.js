import { requireStaffPage } from '../../../lib/access';
import { listPromptVersions } from '../../../lib/promptVersions';
import PromptVersionsClient from '../../../components/PromptVersionsClient';
import PageHeader from '../../../components/PageHeader';
import DashboardSidebar, { DASHBOARD_SHELL_STYLES } from '../../../components/DashboardSidebar';

// Real, editable data — never statically cache this page.
export const dynamic = 'force-dynamic';

export default async function PromptVersionsPage() {
  await requireStaffPage();
  const versions = await listPromptVersions();

  return (
    <div style={{ minHeight: '100vh', background: '#DEDCD7', display: 'flex' }} className="tfa-dash-shell">
      <DashboardSidebar active="prompt" />

      <main style={{ flex: 1, padding: '32px 36px', minWidth: 0 }} className="tfa-dash-main">
        <PageHeader title="AI-prompt">
          Dit stuurt hoe de AI elk scriptvoorstel schrijft: toon, aanpak en stijl. De klantgegevens en de technische eisen blijven altijd gelijk; alleen dit gedeelte pas je aan. Er is steeds maximaal één versie live.
        </PageHeader>
        <PromptVersionsClient initialVersions={versions} />
      </main>

      <style>{DASHBOARD_SHELL_STYLES}</style>
    </div>
  );
}
