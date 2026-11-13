'use client';

// The producer's "Briefing" tab: every answer the client gave in the brief
// flow, in the order the client was asked, so nothing (tone of voice, special
// remarks, variation details) is hidden behind the overview. The answers come
// from lib/briefAnswers.js, the same list the proof copies are made from.
import { briefAnswerSections } from '../lib/briefAnswers.js';
import { TONE_LABELS, parseTones } from './flowData';
import { ProofSnapshotsPanel } from './ProofPanels';

const card = { background: '#FFFFFF', border: '1px solid #E3E0D5', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 6px rgba(29,29,29,.05)' };

function Section({ title, children }) {
  return (
    <section style={card}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1D1D1D', margin: '0 0 10px' }}>{title}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px 16px' }}>{children}</div>
    </section>
  );
}

// One answer. A missing answer is shown as such, so the producer can tell
// "the client left it empty" from "the app forgot to show it".
function Answer({ label, value, wide, href }) {
  const filled = value !== undefined && value !== null && String(value).trim() !== '';
  return (
    <div style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <div style={{ fontSize: 12, fontWeight: 500, color: '#5C5850' }}>{label}</div>
      <div style={{ fontSize: 13.5, marginTop: 3, color: filled ? '#1D1D1D' : '#6B675D', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.55 }}>
        {filled ? value : 'Niet ingevuld'}
        {filled && href && <> <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#1F6F8C' }}>↗</a></>}
      </div>
    </div>
  );
}

// The tone the client chose, large and first: it is what the producer checks the scripts against.
export function ToneCard({ brief, compact }) {
  const tones = parseTones(brief);
  return (
    <section style={{ background: '#FBF9EC', border: '1.5px solid #EAE3C4', borderLeft: '4px solid #E6C858', borderRadius: '4px 12px 12px 4px', padding: compact ? '10px 14px' : '14px 16px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#5C5850' }}>Gewenste toon van de commercial (gekozen door de klant)</div>
      <div style={{ fontSize: compact ? 15 : 20, fontWeight: 700, marginTop: 4, color: tones.length ? '#1D1D1D' : '#6B675D' }}>
        {tones.length ? tones.map((t) => TONE_LABELS[t]).join(' · ') : 'De klant koos geen toon'}
      </div>
      {!compact && brief.extraNote && (
        <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.55 }}><b>Opmerking van de klant:</b> {brief.extraNote}</div>
      )}
    </section>
  );
}

// The tone has its own card above, so its section is left out of the list.
const withoutTone = (sections) => sections.filter((s) => !/klinken/.test(s.title));

export default function BriefingPanel({ brief, showProof }) {
  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!brief.submittedAt && (
        <div style={{ fontSize: 12.5, color: '#5C5850' }}>De klant heeft de brief nog niet verstuurd; hieronder staat wat er tot nu toe is ingevuld.</div>
      )}
      <ToneCard brief={brief} />
      {withoutTone(briefAnswerSections(brief)).map((section, i) => (
        <Section key={i} title={section.title}>
          {section.items.map((it, j) => <Answer key={j} label={it.label} value={it.value} wide={it.wide} href={it.href} />)}
        </Section>
      ))}
      {showProof && <ProofSnapshotsPanel briefId={brief.id} hasSubmitted={!!brief.submittedAt} />}
    </div>
  );
}
