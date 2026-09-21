import Link from 'next/link';
import { listBriefs } from '../../../lib/db';
import { buildReportData } from '../../../lib/reports';
import SpotFlowLogo from '../../../components/SpotFlowLogo';

// Real, changing data — never statically cache this page.
export const dynamic = 'force-dynamic';

const cardStyle = { background: '#FFFFFF', borderRadius: 14, padding: '20px 22px', boxShadow: '0 1px 10px rgba(29,29,29,.05)' };

function StatTile({ label, value, color }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: '#8C8880', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 32, fontWeight: 600, marginTop: 6, color: color || '#1D1D1D' }}>
        {value}
      </div>
    </div>
  );
}

// A labeled horizontal bar per breakdown row — count + percent-of-total,
// bar width driven by pct. No charting library: this is the whole "chart".
function BreakdownCard({ title, rows, emptyLabel }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: '#8C8880' }}>{emptyLabel || 'Nog geen data.'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((r) => (
            <div key={r.key || r.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                <span style={{ color: '#383209' }}>{r.label}</span>
                <span style={{ color: '#8C8880' }}>{r.count} · {r.pct}%</span>
              </div>
              <div style={{ background: '#EEECE3', borderRadius: 999, height: 8, overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(r.pct, r.count > 0 ? 2 : 0)}%`, background: r.color, height: '100%', borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Tone -> music/voice: one row per tone that's actually been chosen, with
// how often, and what music/voice tended to go with it. A plain table
// reads better here than bars — three different kinds of value (a count
// and two "most common" labels) don't compress into one bar length.
function ToneLinksTable({ rows }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Tone of voice → muziek & stem</div>
      <div style={{ fontSize: 12, color: '#8C8880', marginBottom: 14, lineHeight: 1.5 }}>
        Van de briefs die deze tone kozen (brief-stap "Hoe moet de commercial klinken?"): welke playlist en stem kwamen het vaakst terug.
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: '#8C8880' }}>Nog geen data.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#8C8880', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                <th style={{ padding: '0 10px 8px 0', fontWeight: 600 }}>Tone</th>
                <th style={{ padding: '0 10px 8px 0', fontWeight: 600 }}>Briefs</th>
                <th style={{ padding: '0 10px 8px 0', fontWeight: 600 }}>Populairste playlist</th>
                <th style={{ padding: '0 0 8px 0', fontWeight: 600 }}>Populairste stem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} style={{ borderTop: '1px solid #EEECE3' }}>
                  <td style={{ padding: '8px 10px 8px 0', fontWeight: 600, color: '#383209', whiteSpace: 'nowrap' }}>{r.label}</td>
                  <td style={{ padding: '8px 10px', color: '#5C5850' }}>{r.count}</td>
                  <td style={{ padding: '8px 10px', color: '#1D1D1D' }}>{r.topPlaylist}</td>
                  <td style={{ padding: '8px 0', color: '#1D1D1D' }}>{r.topVoice}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TrendCard({ months }) {
  const max = Math.max(1, ...months.map((m) => m.count));
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Nieuwe briefs per maand (laatste 6 maanden)</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 110 }}>
        {months.map((m) => (
          <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 11.5, color: '#8C8880' }}>{m.count}</span>
            <div
              style={{
                width: '100%', maxWidth: 34, borderRadius: '6px 6px 0 0', background: '#E6C858',
                height: `${Math.max((m.count / max) * 84, m.count > 0 ? 6 : 2)}px`,
              }}
            />
            <span style={{ fontSize: 11, color: '#5C5850', textTransform: 'uppercase' }}>{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function ReportsPage() {
  const briefs = await listBriefs();
  const report = buildReportData(briefs);

  return (
    <div style={{ minHeight: '100vh', background: '#DEDCD7', display: 'flex' }} className="tfa-dash-shell">
      <aside style={{ flex: '0 0 240px', background: '#1D1D1D', color: '#FFFFFF', padding: '32px 22px' }} className="tfa-dash-sidebar">
        <Link href="/" style={{ textDecoration: 'none' }}>
          <SpotFlowLogo size={24} variant="dark" className="tfa-dash-sidebar-brand" />
        </Link>
        <nav className="tfa-dash-nav" style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Link href="/dashboard" className="tfa-dash-navlink" style={{ padding: '10px 12px', borderRadius: 8, color: '#B9B6AC', fontSize: 14, textDecoration: 'none' }}>Dashboard</Link>
          <Link href="/dashboard/library" className="tfa-dash-navlink" style={{ padding: '10px 12px', borderRadius: 8, color: '#B9B6AC', fontSize: 14, textDecoration: 'none' }}>Bibliotheek</Link>
          <Link href="/dashboard/prompt" className="tfa-dash-navlink" style={{ padding: '10px 12px', borderRadius: 8, color: '#B9B6AC', fontSize: 14, textDecoration: 'none' }}>AI-prompt</Link>
          <Link href="/dashboard/reports" className="tfa-dash-navlink tfa-dash-navlink--active" style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(230,200,88,.12)', color: '#FFFFFF', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>Rapporten</Link>
        </nav>
      </aside>

      <main style={{ flex: 1, padding: '32px 36px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 6, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: 30, margin: 0, color: '#1D1D1D' }}>
            Rapporten
          </h1>
          <a
            href="/api/dashboard/reports/export"
            style={{
              fontSize: 13, fontWeight: 600, color: '#1D1D1D', background: '#E6C858', textDecoration: 'none',
              borderRadius: 10, padding: '10px 16px', whiteSpace: 'nowrap',
            }}
          >
            ⬇ Exporteer alle briefs (CSV)
          </a>
        </div>
        <p style={{ fontSize: 13.5, color: '#5C5850', margin: '0 0 24px', maxWidth: 720, lineHeight: 1.5 }}>
          Een overzicht over al je briefs — hoeveel er binnenkomen, waar ze in het proces staan, en hoe de AI-scriptgeneratie
          wordt gebruikt. De CSV-export bevat elke brief als aparte rij, klaar om te openen in Excel of Google Sheets.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }} className="tfa-stats-grid">
          <StatTile label="Totaal briefs" value={report.total} />
          <StatTile label="Nieuw deze maand" value={report.newThisMonth} color="#1F6F8C" />
          <StatTile
            label="Scripts goedgekeurd"
            value={report.approvalRate === null ? '—' : `${report.approvalRate}%`}
            color="#1D7A46"
          />
          <StatTile label="Gem. hergeneraties per brief" value={report.avgRegenerations} color="#8C6D1F" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 20 }} className="tfa-stats-grid-2">
          <StatTile
            label="Gem. doorlooptijd tot klaar"
            value={report.avgTurnaroundDays === null ? '—' : `${report.avgTurnaroundDays}d`}
            color="#1D7A46"
          />
          <StatTile label="Over deadline (nog niet klaar)" value={report.overdueCount} color={report.overdueCount > 0 ? '#C2513F' : '#1D1D1D'} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <TrendCard months={report.monthlyTrend} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }} className="tfa-reports-grid">
          <BreakdownCard title="Status van briefs" rows={report.statusBreakdown} />
          <BreakdownCard title="Doelgroep (B2B / B2C)" rows={report.audienceBreakdown} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }} className="tfa-reports-grid">
          <BreakdownCard title="Scriptgeneratie — bron" rows={report.scriptSourceBreakdown} />
          <BreakdownCard title="Variaties gevraagd" rows={report.variationsBreakdown} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }} className="tfa-reports-grid">
          <BreakdownCard title="Gekozen aantal impressies" rows={report.impressionsBreakdown} />
          <BreakdownCard title="Verdeling per teamlid" rows={report.assignedBreakdown} emptyLabel="Nog geen briefs toegewezen." />
        </div>

        <div style={{ margin: '24px 0 6px' }}>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: 20, margin: '0 0 4px', color: '#1D1D1D' }}>
            Muziek & stem
          </h2>
          <p style={{ fontSize: 12.5, color: '#5C5850', margin: 0, maxWidth: 720, lineHeight: 1.5 }}>
            Wat klanten daadwerkelijk kiezen — handig voor het bijstellen van de playlists en het ontwerpen van nieuwe stemmen.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }} className="tfa-reports-grid">
          <BreakdownCard title="Meest gekozen tracks" rows={report.topTracks} emptyLabel="Nog geen muziek gekozen." />
          <BreakdownCard title="Meest gekozen playlists" rows={report.topPlaylists} emptyLabel="Nog geen muziek gekozen." />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }} className="tfa-reports-grid">
          <BreakdownCard title="Meest gekozen stemmen" rows={report.topVoices} emptyLabel="Nog geen stem gekozen." />
          <ToneLinksTable rows={report.toneLinks} />
        </div>
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
        @media (max-width: 1100px) {
          .tfa-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 560px) {
          .tfa-stats-grid-2 { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 800px) {
          .tfa-reports-grid { grid-template-columns: 1fr !important; }
        }
        .tfa-dash-navlink { transition: background .15s ease, color .15s ease; }
        .tfa-dash-navlink:hover { background: rgba(255,255,255,.08); color: #FFFFFF; }
        .tfa-dash-navlink--active:hover { background: rgba(230,200,88,.2); color: #FFFFFF; }
      `}</style>
    </div>
  );
}
