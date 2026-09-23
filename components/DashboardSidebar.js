import Link from 'next/link';
import SpotFlowLogo from './SpotFlowLogo';

// Shared producer-dashboard sidebar — single source of truth for the nav
// links + logout footer, used by every /dashboard/* page instead of each
// page carrying its own copy (which is how this drifted before: only
// app/dashboard/page.js had the "Uitloggen"/UserButton footer, the other
// three pages silently didn't). Adding a new dashboard tab (like "Help"
// below) now means touching one file instead of four.
const NAV_ITEMS = [
  { key: 'dashboard', href: '/dashboard', label: 'Dashboard' },
  { key: 'library', href: '/dashboard/library', label: 'Bibliotheek' },
  { key: 'agencies', href: '/dashboard/agencies', label: 'Agentschappen' },
  { key: 'prompt', href: '/dashboard/prompt', label: 'AI-prompt' },
  { key: 'reports', href: '/dashboard/reports', label: 'Rapporten' },
  { key: 'help', href: '/dashboard/help', label: 'Help & uitleg' },
];

const clerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

async function HeaderUser() {
  if (!clerkConfigured) {
    return <span style={{ fontSize: 12, color: '#8C8880' }}>Login niet geconfigureerd</span>;
  }
  const { UserButton } = await import('@clerk/nextjs');
  return <UserButton afterSignOutUrl="/" />;
}

export default function DashboardSidebar({ active, unseenCount = 0 }) {
  return (
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
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          const showBadge = item.key === 'dashboard' && unseenCount > 0;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={isActive ? 'tfa-dash-navlink tfa-dash-navlink--active' : 'tfa-dash-navlink'}
              style={{
                padding: '10px 12px', borderRadius: 8,
                background: isActive ? 'rgba(230,200,88,.12)' : 'transparent',
                color: isActive ? '#FFFFFF' : '#B9B6AC',
                fontWeight: isActive ? 600 : 400, fontSize: 14, textDecoration: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}
            >
              <span>{item.label}</span>
              {showBadge && (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1D1D1D', background: '#E6C858', borderRadius: 999, padding: '1px 7px', lineHeight: 1.5 }}>
                  {unseenCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="tfa-dash-footer" style={{ marginTop: 'auto', paddingTop: 20, borderTop: '1px solid #33301F', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: '#B9B6AC' }}>Uitloggen</span>
        <HeaderUser />
      </div>
    </aside>
  );
}

// Shared <style> block every /dashboard/* page injects verbatim (identical
// across all of them before this refactor) — kept as a plain string export
// rather than a styled-jsx-only component so each page can still drop it
// straight into its own <style>{DASHBOARD_SHELL_STYLES}</style>.
export const DASHBOARD_SHELL_STYLES = `
  /* Base min-height lives here (not inline) specifically so the mobile
     override below can actually win — an inline min-height on the <aside>
     used to silently defeat this same media query, which left the mobile
     nav bar forced to a full 100vh tall, pushing every page's real content
     below the fold. */
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
  .tfa-dash-navlink { transition: background .15s ease, color .15s ease, box-shadow .15s ease; }
  /* Soft gold glow on hover — per Karim's note that it wasn't obvious the
     sidebar links (and anything else clickable) actually are clickable.
     Brighter/wider than the plain background tint alone so it reads as an
     actual glow against the dark #1D1D1D sidebar, not just a shade change. */
  .tfa-dash-navlink:hover { background: rgba(255,255,255,.08); color: #FFFFFF; box-shadow: inset 0 0 0 1px rgba(230,200,88,.4), 0 0 14px rgba(230,200,88,.35); }
  .tfa-dash-navlink--active:hover { background: rgba(230,200,88,.2); color: #FFFFFF; }
`;
