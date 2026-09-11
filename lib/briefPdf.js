// Builds a one-page-ish PDF summary of a single brief for producers —
// this is what /dashboard's "Download PDF" button (replacing the old
// "Open volledige brief" link) actually downloads. Deliberately plain,
// print-friendly layout via pdfkit (no headless browser needed, so it
// works fine in a Vercel serverless function) rather than trying to
// screenshot the client-facing overview page.
//
// Mirrors the same fields/formatting the client's own overview step
// shows (app/brief/[id]/overview/page.js) so a producer's PDF matches
// what the client actually saw and approved.

import PDFDocument from 'pdfkit';
import { MONTH_NAMES_LOWER, variationsCountOf, variationsSummaryLabel } from '../components/flowData';
import { diffWords, hasDiff } from '../components/textDiff';

const INK = '#1D1D1D';
const MUTED = '#5C5850';
const FAINT = '#9C9890';
const GOLD_DARK = '#8C6D1F';
const REMOVED = '#B06156';

function formatImpressions(brief) {
  const v = brief.impressions;
  if (!v) return 'Niet opgegeven';
  if (v === 'meer') return brief.impressionsCustom ? brief.impressionsCustom + ' impressies' : 'Meer dan 500.000 impressies';
  const n = parseInt(v, 10);
  return (isNaN(n) ? v : n.toLocaleString('nl-NL')) + ' impressies';
}

function formatAirDate(brief) {
  if (brief.dateUnknown) {
    if (brief.airMonth) {
      const idx = parseInt(brief.airMonth, 10) - 1;
      const name = MONTH_NAMES_LOWER[idx];
      return name ? 'Nog niet exact bekend — gepland voor ' + name : 'Nog niet bekend';
    }
    return 'Nog niet bekend';
  }
  if (brief.airDate) {
    const d = new Date(brief.airDate + 'T00:00:00');
    if (!isNaN(d.getTime())) return d.getDate() + ' ' + MONTH_NAMES_LOWER[d.getMonth()] + ' ' + d.getFullYear();
    return brief.airDate;
  }
  return 'Nog niet opgegeven';
}

function parseSelectedTracks(brief) {
  try {
    const parsed = brief.selectedTracks ? JSON.parse(brief.selectedTracks) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function parseVariationScripts(brief) {
  try {
    const parsed = brief.variationScripts ? JSON.parse(brief.variationScripts) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function sectionTitle(doc, text) {
  doc.moveDown(0.9);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(text.toUpperCase(), { characterSpacing: 0.5 });
  doc.moveDown(0.25);
  const y = doc.y;
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).strokeColor('#EAE3C4').lineWidth(1).stroke();
  doc.moveDown(0.5);
}

function field(doc, label, value) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text(label + ':', { continued: true });
  doc.font('Helvetica').fontSize(9).fillColor(value ? INK : FAINT).text(' ' + (value || '—'));
}

function diffParagraph(doc, mainText, varText) {
  const tokens = diffWords(mainText, varText);
  if (!hasDiff(tokens)) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(FAINT).text('Nog identiek aan het hoofdscript.');
    return;
  }
  tokens.forEach((t, i) => {
    const isLast = i === tokens.length - 1;
    if (t.type === 'removed') {
      doc.font('Helvetica-Oblique').fontSize(10.5).fillColor(REMOVED);
    } else if (t.type === 'added') {
      doc.font('Helvetica-BoldOblique').fontSize(10.5).fillColor(GOLD_DARK);
    } else {
      doc.font('Helvetica-Oblique').fontSize(10.5).fillColor(INK);
    }
    doc.text(t.text, { continued: !isLast });
  });
}

// Returns a Buffer (Promise) — API route wraps this in a Response.
export function buildBriefPdf(brief) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const companyName = brief.companyName && brief.companyName.trim() ? brief.companyName : 'Nog geen bedrijfsnaam';
    const spotLength = brief.hoofdspotLength || '20';
    const mainText = brief.editedScript !== null && brief.editedScript !== undefined ? brief.editedScript : brief.generatedScript || '';
    const variationCount = variationsCountOf(brief);
    const variationScripts = parseVariationScripts(brief);
    const voiceLabel = brief.selectedVoiceLabel || '';
    const voiceTags = brief.selectedVoiceTags ? brief.selectedVoiceTags.split(',').filter(Boolean) : [];
    const tracks = parseSelectedTracks(brief);

    // Header
    doc.font('Helvetica-Bold').fontSize(10).fillColor(GOLD_DARK).text('TFA SPOTFLOW', { characterSpacing: 0.5 });
    doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text(companyName, { paragraphGap: 2 });
    doc.font('Helvetica').fontSize(9.5).fillColor(FAINT).text('Overzicht gegenereerd op ' + new Date().toLocaleString('nl-NL'));

    sectionTitle(doc, 'Contact & levering');
    field(doc, 'Contactpersoon', brief.contactPerson);
    field(doc, 'E-mail', brief.contactEmail);
    let additionalContacts = [];
    try {
      const parsed = brief.additionalContacts ? JSON.parse(brief.additionalContacts) : [];
      if (Array.isArray(parsed)) additionalContacts = parsed.filter((c) => c && (c.name || c.email));
    } catch (e) {
      additionalContacts = [];
    }
    additionalContacts.forEach((c, i) => {
      field(doc, 'Extra contact' + (additionalContacts.length > 1 ? ' ' + (i + 1) : ''), [c.name, c.email].filter(Boolean).join(' — '));
    });
    field(doc, 'Hoofdspot', spotLength + '″' + variationsSummaryLabel(brief));
    field(doc, 'Impressies', formatImpressions(brief));
    field(doc, 'Eerste uitzending', formatAirDate(brief));

    sectionTitle(doc, 'Script · hoofdspot ' + spotLength + '″');
    doc.font('Helvetica-Oblique').fontSize(11).fillColor(mainText ? INK : FAINT)
      .text(mainText || 'Nog geen script goedgekeurd.', { lineGap: 3 });

    for (let i = 0; i < variationCount; i++) {
      const varText = variationScripts[i] !== undefined ? variationScripts[i] : mainText;
      if (!varText) continue;
      doc.moveDown(0.6);
      const label = variationCount > 1 ? 'VARIATIE ' + (i + 1) + ' — WAT VERSCHILT' : 'VARIATIE — WAT VERSCHILT';
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED).text(label, { characterSpacing: 0.4 });
      doc.moveDown(0.2);
      diffParagraph(doc, mainText, varText);
    }

    sectionTitle(doc, 'Stem');
    doc.font('Helvetica').fontSize(10.5).fillColor(voiceLabel ? INK : FAINT)
      .text(voiceLabel ? voiceLabel + (voiceTags.length ? ' · ' + voiceTags.join(', ') : '') : 'Nog geen stem gekozen.');

    sectionTitle(doc, 'Muziek');
    if (tracks.length) {
      tracks.forEach((t, i) => {
        doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text((i + 1) + '. ' + (t.title || 'Onbekende track'), { continued: !!t.artist });
        if (t.artist) doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('  — ' + t.artist);
        if (t.playlistName) doc.font('Helvetica').fontSize(9).fillColor(GOLD_DARK).text(t.playlistName);
        doc.moveDown(0.2);
      });
    } else {
      doc.font('Helvetica').fontSize(10.5).fillColor(FAINT).text('Nog geen track gekozen.');
    }

    sectionTitle(doc, 'Status');
    field(doc, 'Aangemaakt', new Date(brief.createdAt).toLocaleString('nl-NL'));
    if (brief.submittedAt) field(doc, 'Verzonden', new Date(brief.submittedAt).toLocaleString('nl-NL'));

    doc.end();
  });
}
