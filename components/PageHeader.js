// Shared title block for every /dashboard/* page, so the pages look and
// read the same: a calm Geist title in sentence case plus one short line of
// explanation. (The titles used to be large Playfair serif headings and each
// page styled its own.)
export default function PageHeader({ title, children }) {
  return (
    <header style={{ margin: '0 0 22px' }}>
      <h1 style={{ fontWeight: 500, fontSize: 28, letterSpacing: '-.015em', lineHeight: 1.2, margin: 0, color: '#1D1D1D' }}>{title}</h1>
      {children && <p style={{ fontSize: 14, color: '#5C5850', margin: '6px 0 0', maxWidth: 680, lineHeight: 1.55 }}>{children}</p>}
    </header>
  );
}
