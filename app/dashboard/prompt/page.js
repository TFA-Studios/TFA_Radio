import Link from 'next/link';
import { listPromptVersions } from '../../../lib/promptVersions';
import PromptVersionsClient from '../../../components/PromptVersionsClient';
import SpotFlowLogo from '../../../components/SpotFlowLogo';

// Real, editable data — never statically cache this page.
export const dynamic = 'force-dynamic';

export default async function PromptVersionsPage() {
  const versions = await listPromptVersions();

  return (
    <div style={{ minHeight: '100vh', background: '#DEDCD7', display: 'flex' }} className="tfa-dash-shell">
      <aside style={{ flex: '0 0 240px', background: '#1D1D1D', color: '#FFFFFF', padding: '32px 22px' }} className="tfa-dash-sidebar">
        <Link href="/" style={{ textDecoration: 'none' }}>
          <SpotFlowLogo size={24} variant="dark" className="tfa-dash-sidebar-brand" />
        </Link>
        <nav className="tfa-dash-nav" style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Link href="/dashboard" className="tfa-dash-navlink" style={{ padding: '10px 12px', borderRadius: 8, color: '#B9B6AC', fontSize: 14, textDecoration: 'none' }}>Dashboard</Link>
          <Link href="/dashboard/library" className="tfa-dash-navlink" style={{ padding: '10px 12px', borderRadius: 8, color: '#B9B6AC', fontSize: 14, textDecoration: 'none' }}>Bibliotheek</Link>
          <Link href="/dashboard/prompt" className="tfa-dash-navlink tfa-dash-navlink--active" style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(230,200,88,.12)', color: '#FFFFFF', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>AI-prompt</Link>
          <Link href="/dashboard/reports" className="tfa-dash-navlink" style={{ padding: '10px 12px', borderRadius: 8, color: '#B9B6AC', fontSize: 14, textDecoration: 'none' }}>Rapporten</Link>
        </nav>
      </aside>

      <main style={{ flex: 1, padding: '32px 36px', minWidth: 0 }}>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: 30, margin: '0 0 6px', color: '#1D1D1D' }}>
          AI-prompt
        </h1>
        <p style={{ fontSize: 13.5, color: '#5C5850', margin: '0 0 24px', maxWidth: 640, lineHeight: 1.5 }}>
          Dit stuurt hoe Claude (of Gemini/Ollama) elk scriptvoorstel schrijft — de toon, aanpak en stijl-instructies.
          De klantgegevens zelf en de technische opmaak-eisen blijven altijd hetzelfde; alleen dit gedeelte is aanpasbaar.
          Er is steeds maximaal één versie <b>live</b> tegelijk.
        </p>
        <PromptVersionsClient initialVersions={versions} />
      </main>

      <style>{`
        /* See the identical comment in app/dashboard/page.js — base
           min-height lives here, not inline, so the mobile override below
           actually takes effect instead of being silently defeated. */
        .tfa-dash-sidebar { min-height: 100vh; }
        @media (max-width: 900px) {
          .tfa-dash-shell { flex-direction: column; }
          .tfa-dash-sidebar {
            flex: none; width: 100%; min-height: auto; padding: 14px 16px !important;
          }
          .tfa-dash-sidebar-brand { display: none; }
          .tfa-dash-nav { flex-direction: row !important; flex-wrap: wrap; margin-top: 0 !important; gap: 6px !important; }
          .tfa-dash-footer { display: none; }
        }
        .tfa-dash-navlink { transition: background .15s ease, color .15s ease; }
        .tfa-dash-navlink:hover { background: rgba(255,255,255,.08); color: #FFFFFF; }
        .tfa-dash-navlink--active:hover { background: rgba(230,200,88,.2); color: #FFFFFF; }
      `}</style>
    </div>
  );
}
