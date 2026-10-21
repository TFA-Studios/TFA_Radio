'use client';

// Compact status indicator: a small icon plus short text, no coloured
// background. Meaning never relies on colour alone (the icon and the word
// carry it too); only "attention" gets a stronger colour.
const TONES = {
  neutral: { color: '#6B675D', weight: 500 },
  ok: { color: '#1D7A46', weight: 500 },
  attention: { color: '#8A2E1E', weight: 600 },
};

function Icon({ name }) {
  const common = { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, style: { flex: 'none' } };
  if (name === 'check') return <svg {...common}><path d="M3 8.5l3.2 3.2L13 4.8" /></svg>;
  if (name === 'alert') return <svg {...common}><path d="M8 2.2l6.3 11H1.7L8 2.2z" /><path d="M8 6.6v3.2M8 11.6v.1" /></svg>;
  if (name === 'clock') return <svg {...common}><circle cx="8" cy="8" r="5.8" /><path d="M8 4.8V8l2.2 1.4" /></svg>;
  return <svg {...common}><path d="M4 8h8" /></svg>;
}

export default function Indicator({ tone = 'neutral', icon = 'dash', label, title }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: t.weight, color: t.color, whiteSpace: 'nowrap' }}>
      <Icon name={icon} />
      {label}
    </span>
  );
}
