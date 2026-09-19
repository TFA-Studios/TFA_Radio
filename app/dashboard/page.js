import Link from 'next/link';
import { listBriefs } from '../../lib/db';
import DashboardClient from '../../components/DashboardClient';
import SpotFlowLogo from '../../components/SpotFlowLogo';

// Real, changing data (submitted briefs) — never statically cache this page.
export const dynamic = 'force-dynamic';

const clerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

async function HeaderUser() {
  if (!clerkConfigured) {
    return <span style={{ fontSize: 12, color: '#8C8880' }}>Login niet geconfigureerd</span>;
  }
  const { UserButton } = await import('@clerk/nextjs');
  return <UserButton afterSignOutUrl="/" />;
}

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
      <aside
        style={{
          flex: '0 0 240px', background: '#1D1D1D', color: '#FFFFFF', padding: '32px 22px',
          display: 'flex', flexDirection: 'column',
        }}
        className="tfa-dash-sidebar"
      >
        <Link href="/" style={{ textDecoration: 'none' }}>
          <SpotFlowLogo size={24} variant="dark" className="tfa-dash-sidebar-brand" />
        </Link>
        <nav className="tfa-dash-nav" style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Link href="/dashboard" className="tfa-dash-navlink tfa-dash-navlink--active" style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(230,200,88,.12)', color: '#FFFFFF', fontWeight: 600, fontSize: 14, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>Dashboard</span>
            {unseenCount > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#1D1D1D', background: '#E6C858', borderRadius: 999, padding: '1px 7px', lineHeight: 1.5 }}>
                {unseenCount}
              </span>
            )}
          </Link>
          <Link href="/dashboard/library" className="tfa-dash-navlink" style={{ padding: '10px 12px', borderRadius: 8, color: '#B9B6AC', fontSize: 14, textDecoration: 'none' }}>
            Bibliotheek
          </Link>
          <Link href="/dashboard/prompt" className="tfa-dash-navlink" style={{ padding: '10px 12px', borderRadius: 8, color: '#B9B6AC', fontSize: 14, textDecoration: 'none' }}>
            AI-prompt
          </Link>
          <Link href="/dashboard/reports" className="tfa-dash-navlink" style={{ padding: '10px 12px', borderRadius: 8, color: '#B9B6AC', fontSize: 14, textDecoration: 'none' }}>
            Rapporten
          </Link>
        </nav>
        <div className="tfa-dash-footer" style={{ marginTop: 'auto', paddingTop: 20, borderTop: '1px solid #33301F', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#B9B6AC' }}>Uitloggen</span>
          <HeaderUser />
        </div>
      </aside>

      <main style={{ flex: 1, padding: '32px 36px', minWidth: 0 }}>
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

      <style>{`
        /* Base min-height lives here (not inline) specifically so the
           mobile override below can actually win — an inline min-height on
           the <aside> used to silently defeat this same media query, which
           left the mobile nav bar forced to a full 100vh tall, pushing
           every page's real content below the fold. */
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
