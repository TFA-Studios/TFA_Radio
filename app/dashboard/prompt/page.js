import { listPromptVersions } from '../../../lib/promptVersions';
import PromptVersionsClient from '../../../components/PromptVersionsClient';
import DashboardSidebar, { DASHBOARD_SHELL_STYLES } from '../../../components/DashboardSidebar';

// Real, editable data — never statically cache this page.
export const dynamic = 'force-dynamic';

export default async function PromptVersionsPage() {
  const versions = await listPromptVersions();

  return (
    <div style={{ minHeight: '100vh', background: '#DEDCD7', display: 'flex' }} className="tfa-dash-shell">
      <DashboardSidebar active="prompt" />

      <main style={{ flex: 1, padding: '32px 36px', minWidth: 0 }}>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: 30, margin: '0 0 6px', color: '#1D1D1D' }}>
          AI-prompt
        </h1>
        <p style={{ fontSize: 13.5, color: '#5C5850', margin: '0 0 24px', maxWidth: 640, lineHeight: 1.5 }}>
          Dit stuurt hoe Claude (of Gemini/Ollama) elk scriptvoorstel schrijft: de toon, aanpak en stijl-instructies.
          De klantgegevens zelf en de technische opmaak-eisen blijven altijd hetzelfde; alleen dit gedeelte is aanpasbaar.
          Er is steeds maximaal één versie <b>live</b> tegelijk.
        </p>
        <PromptVersionsClient initialVersions={versions} />
      </main>

      <style>{DASHBOARD_SHELL_STYLES}</style>
    </div>
  );
}
