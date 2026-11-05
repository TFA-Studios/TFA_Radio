// The PDF version of a proof copy (lib/snapshots.js): every answer the client
// gave at that moment, step by step, plus the fingerprint and the emails sent
// to the client. Built with pdfkit and its built-in Helvetica (no headless
// browser, works in a Vercel function; see next.config.js for the font files).
// Built-in fonts only know Western characters, so text goes through pdfText().
import PDFDocument from 'pdfkit';
import { snapshotIntact } from './snapshots.js';
import { SNAPSHOT_KINDS } from './snapshotKinds.js';
import { EMAIL_STATUS_LABELS } from './emailStatus.js';
import { pdfText } from './pdfText.js';

const INK = '#1D1D1D';
const MUTED = '#5C5850';
const FAINT = '#6B675D';
const GOLD = '#8C6D1F';

const dateNl = (iso) => (iso ? new Date(iso).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' }) : '');

function heading(doc, text) {
  if (doc.y > doc.page.height - 120) doc.addPage();
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(pdfText(text.toUpperCase()), { characterSpacing: 0.4 });
  const y = doc.y + 2;
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).strokeColor('#EAE3C4').lineWidth(1).stroke();
  doc.moveDown(0.6);
}

function answer(doc, label, value) {
  const filled = value !== undefined && value !== null && String(value).trim() !== '';
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED).text(pdfText(label));
  doc.font('Helvetica').fontSize(10.5).fillColor(filled ? INK : FAINT).text(filled ? pdfText(value) : 'Niet ingevuld', { lineGap: 2 });
  doc.moveDown(0.5);
}

// snapshot: from getSnapshot() (with sections). emails: from listEmailLog().
export function buildProofPdf(brief, snapshot, emails) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true, info: { Title: 'Bewijs ingevulde brief - ' + pdfText(brief.companyName || ''), Author: 'TFA SpotFlow' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(10).fillColor(GOLD).text('TFA SPOTFLOW · BEWIJS VAN INGEVULDE BRIEF', { characterSpacing: 0.5 });
    doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text(pdfText(brief.companyName || 'Nog geen bedrijfsnaam'), { paragraphGap: 2 });
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(pdfText((SNAPSHOT_KINDS[snapshot.kind] || snapshot.kind) + ' · vastgelegd op ' + dateNl(snapshot.createdAt)));
    doc.moveDown(0.8);

    const intact = snapshotIntact(snapshot);
    heading(doc, 'Vastlegging');
    answer(doc, 'Brief-ID', brief.id);
    answer(doc, 'Moment van vastleggen', dateNl(snapshot.createdAt) + ' (Nederlandse tijd)');
    answer(doc, 'Wie deed dit', snapshot.kind === 'manual' ? 'TFA, op basis van de stand van de brief op dat moment (niet op het moment van de klant zelf)' : 'De klant, via de link naar de brief');
    answer(doc, 'IP-adres van het verzoek', snapshot.ip);
    answer(doc, 'Browser', snapshot.userAgent);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED).text('Vingerafdruk (SHA-256 over brief-ID, moment en alle antwoorden)');
    doc.font('Courier').fontSize(8.5).fillColor(INK).text(snapshot.hash);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9).fillColor(intact ? '#1D7A46' : '#C2513F').text(intact ? 'Controle: de opgeslagen antwoorden komen nog overeen met de vingerafdruk.' : 'Controle: de opgeslagen antwoorden komen NIET meer overeen met de vingerafdruk.');

    let lastStep = 0;
    for (const section of snapshot.sections) {
      const hasContent = section.items.some((i) => i.value && String(i.value).trim());
      const stepNote = !hasContent && section.step >= 4 ? 'Op dit moment nog niet gedaan door de klant.' : '';
      heading(doc, section.title);
      if (stepNote) { doc.font('Helvetica').fontSize(10.5).fillColor(FAINT).text(stepNote); continue; }
      lastStep = section.step;
      for (const it of section.items) answer(doc, it.label, it.value);
    }

    heading(doc, 'E-mails die naar deze klant zijn gestuurd');
    if (!emails.length) doc.font('Helvetica').fontSize(10.5).fillColor(FAINT).text('Geen e-mails vastgelegd.');
    for (const e of emails) {
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(pdfText(dateNl(e.createdAt) + ' · ' + e.kind + ' · ' + e.subject));
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(pdfText('Aan: ' + e.to + ' · Status: ' + (EMAIL_STATUS_LABELS[e.status] || e.status) + (e.detail ? ' (' + e.detail + ')' : '')));
      doc.moveDown(0.4);
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(8).fillColor(FAINT).text('Pagina ' + (i + 1) + ' van ' + range.count + ' · ' + snapshot.hash.slice(0, 12), doc.page.margins.left, doc.page.height - 34, { width: doc.page.width - 100, align: 'center', lineBreak: false });
      doc.page.margins.bottom = bottom;
    }
    doc.end();
  });
}
