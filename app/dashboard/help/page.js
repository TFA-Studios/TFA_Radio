import DashboardSidebar, { DASHBOARD_SHELL_STYLES } from '../../../components/DashboardSidebar';
import { HELP_SECTIONS, HELP_LAST_UPDATED } from '../../../lib/helpContent';

// Internal "how does this thing actually work" reference for anyone on the
// team who isn't the one building it — see lib/helpContent.js for the
// actual text (kept as data, not JSX, specifically so updating it later is
// a content edit, not a layout change). This page is just the renderer.

// Tiny **bold** parser — the only markdown-lite syntax the content uses,
// so a real markdown library isn't worth adding for one feature.
function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: '#1D1D1D', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function Block({ block }) {
  if (block.type === 'p') {
    return <p style={{ fontSize: 14, lineHeight: 1.7, color: '#3A3730', margin: '0 0 14px' }}>{renderInline(block.text)}</p>;
  }
  if (block.type === 'h3') {
    return <h3 style={{ fontSize: 15.5, fontWeight: 600, color: '#1D1D1D', margin: '20px 0 8px' }}>{block.text}</h3>;
  }
  if (block.type === 'note') {
    return (
      <div style={{ fontSize: 13, lineHeight: 1.6, color: '#5C5850', background: '#F2EFE4', border: '1px solid #E3E0D5', borderRadius: 10, padding: '10px 14px', margin: '4px 0 14px' }}>
        💡 {renderInline(block.text)}
      </div>
    );
  }
  if (block.type === 'ul') {
    return (
      <ul style={{ margin: '0 0 14px', padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {block.items.map((item, i) => (
          <li key={i} style={{ fontSize: 14, lineHeight: 1.6, color: '#3A3730' }}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }
  if (block.type === 'ol') {
    return (
      <ol style={{ margin: '0 0 14px', padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {block.items.map((item, i) => (
          <li key={i} style={{ fontSize: 14, lineHeight: 1.6, color: '#3A3730' }}>{renderInline(item)}</li>
        ))}
      </ol>
    );
  }
  return null;
}

export default function HelpPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#DEDCD7', display: 'flex' }} className="tfa-dash-shell">
      <DashboardSidebar active="help" />

      <main style={{ flex: 1, padding: '32px 36px', minWidth: 0, display: 'flex', gap: 32 }} className="tfa-help-main">
        {/* In-page section nav — sticky, jumps via plain anchors (no client
            JS needed: this whole page can stay a server component). */}
        <nav className="tfa-help-toc" style={{ flex: '0 0 200px', position: 'sticky', top: 32, alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {HELP_SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              style={{ fontSize: 12.5, color: '#5C5850', textDecoration: 'none', padding: '6px 10px', borderRadius: 8, lineHeight: 1.4 }}
              className="tfa-help-toclink"
            >
              {s.title}
            </a>
          ))}
        </nav>

        <div style={{ flex: 1, minWidth: 0, maxWidth: 760 }}>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: 30, margin: '0 0 6px', color: '#1D1D1D' }}>
            Help & uitleg
          </h1>
          <p style={{ fontSize: 13, color: '#8C8880', margin: '0 0 32px' }}>
            Uitleg over hoe SpotFlow in elkaar zit — voor iedereen op het team, ook zonder technische achtergrond. Laatst bijgewerkt: {HELP_LAST_UPDATED}.
          </p>

          {HELP_SECTIONS.map((section) => (
            <section key={section.id} id={section.id} style={{ marginBottom: 40, scrollMarginTop: 24 }}>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: 21, margin: '0 0 14px', color: '#1D1D1D', paddingBottom: 10, borderBottom: '1px solid #C9C5B9' }}>
                {section.title}
              </h2>
              {section.blocks.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </section>
          ))}
        </div>
      </main>

      <style>{DASHBOARD_SHELL_STYLES}</style>
      <style>{`
        .tfa-help-toclink { transition: background .15s ease, color .15s ease; }
        .tfa-help-toclink:hover { background: rgba(29,29,29,.05); color: #1D1D1D; }
        @media (max-width: 900px) {
          .tfa-help-main { flex-direction: column; }
          .tfa-help-toc { position: static; flex-direction: row !important; flex-wrap: wrap; }
        }
      `}</style>
    </div>
  );
}
