// Everything the client answered or chose, as plain labelled text grouped by
// the steps of the client flow. One list feeds three things so they can never
// drift apart: the dashboard's Briefing tab, the locked proof copies
// (lib/snapshots.js) and the proof PDF (lib/proofPdf.js).
//
// Client flow: 1 contact, 2 delivery, 3 brief, 4 script, 5 voice, 6 music,
// 7 overview/confirmation.
import { parseJsonArray } from './jsonArray.js';
import { profileOfBrief, answersOfBrief } from './formProfile.js';
import {
  TONE_LABELS, parseTones, variationsCountOf, parseVariationInfo, variationInfoLabelFull, formatAirDate,
  formatImpressions, audienceLabel, describeGenderSplit, safeWebsiteUrl, agencyNameOf, parseVariationScripts, parseSelectedTracks,
} from '../components/flowData.js';

const item = (label, value, extra) => ({ label, value: value === undefined || value === null ? '' : String(value), ...(extra || {}) });

// The brief's answers for steps 1 to 3 (what the client typed).
export function briefAnswerSections(brief) {
  const tones = parseTones(brief);
  const contacts = parseJsonArray(brief.additionalContacts).filter((c) => c && (c.name || c.email));
  const varCount = brief.needsVariations ? variationsCountOf(brief) : 0;
  const varInfos = parseVariationInfo(brief);
  const profile = profileOfBrief(brief);
  const answers = answersOfBrief(brief);
  const hasPrice = brief.price === 1 || brief.price === true;
  const priceAnswered = brief.price !== null && brief.price !== undefined;
  const gender = brief.genderSplit ? brief.genderSplit + (describeGenderSplit(brief.genderSplit) ? ' → ' + describeGenderSplit(brief.genderSplit) : '') : '';
  const website = safeWebsiteUrl(brief.website);
  const sections = [];

  sections.push({ step: 1, title: 'Stap 1 · Bedrijf en contact', items: [
    item('Bedrijfsnaam', brief.companyName),
    item('Wat voor bedrijf', brief.companyDescription),
    item('Website', brief.website, website ? { href: website } : undefined),
    item('Contactpersoon', brief.contactPerson),
    item('E-mail', brief.contactEmail),
    ...contacts.map((c, i) => item(c.name || 'Extra contact ' + (i + 1), c.email)),
    item('Via agency', brief.agencyName ? agencyNameOf(brief) : ''),
  ] });

  sections.push({ step: 2, title: 'Stap 2 · Levering', items: [
    item('Lengte hoofdspot', (brief.hoofdspotLength || '20') + ' seconden'),
    item('Gewenste uitzenddatum', formatAirDate(brief)),
    item('Verwachte impressies', formatImpressions(brief)),
    item('Variaties', varCount ? varCount + (varCount === 1 ? ' variatie' : ' variaties') : 'Geen variaties'),
  ] });

  const tone = [item('Gekozen toon', tones.map((t) => TONE_LABELS[t]).join(', '), { wide: true })];
  if (brief.extraNote) tone.push(item('Productie-opmerking van de klant', brief.extraNote, { wide: true }));
  sections.push({ step: 3, title: 'Stap 3 · Hoe moet de commercial klinken?', items: tone });

  sections.push({ step: 3, title: 'Stap 3 · De inhoud van de commercial', items: [
    item('Product of dienst', brief.product),
    item('Voordeel ten opzichte van de concurrent (USP)', brief.usp),
    item('Wat wil de klant vooral vertellen', brief.mainMessage, { wide: true }),
    item('Prijs of aanbieding', !priceAnswered ? '' : hasPrice ? (brief.priceDetail || 'Ja, zonder toelichting') : 'Geen prijs of aanbieding'),
    item('Call-to-action of website', brief.cta),
    item('Slogan', brief.slogan),
    item('Verplichte wettelijke tekst', brief.disclaimerText, { wide: true }),
  ] });

  const audience = [item('Gekozen', audienceLabel(brief))];
  if (brief.audience === 'b2b' || brief.audience === 'both') audience.push(item('Zakelijke beslisser', brief.decisionMaker));
  if (brief.audience === 'b2c' || brief.audience === 'both') audience.push(item('Leeftijd en interesses', brief.audienceAgeInterests));
  if (gender) audience.push(item('Verdeling man / vrouw', gender));
  sections.push({ step: 3, title: 'Stap 3 · Doelgroep', items: audience });

  if (varCount > 0) {
    sections.push({ step: 3, title: 'Stap 3 · Waar gaan de variaties over?', items: varInfos.map((v, i) => item(varCount > 1 ? 'Variatie ' + (i + 1) : 'Variatie', variationInfoLabelFull(v), { wide: true })) });
  }
  if (profile.extraQuestions.length > 0) {
    sections.push({ step: 3, title: 'Stap 3 · Extra vragen van ' + agencyNameOf(brief), items: profile.extraQuestions.map((q) => item(q.label, answers[q.key], { wide: true })) });
  }
  return sections;
}

// Steps 4 to 7: what the client chose from TFA's proposals and confirmed.
export function briefChoiceSections(brief) {
  const history = parseJsonArray(brief.scriptHistory);
  const chosenIdx = history.findIndex((h) => h && h.createdAt === brief.scriptGeneratedAt);
  const original = brief.generatedScript || '';
  const edited = brief.editedScript !== null && brief.editedScript !== undefined ? brief.editedScript : null;
  const finalText = edited !== null ? edited : original;
  const varCount = brief.needsVariations ? variationsCountOf(brief) : 0;
  const varTexts = parseVariationScripts(brief);
  const script = [];
  if (original || edited !== null) {
    script.push(item('Gekozen voorstel', history.length ? 'Voorstel ' + (chosenIdx >= 0 ? chosenIdx + 1 : '?') + ' van ' + history.length : ''));
    script.push(item('Script zoals de klant het heeft', finalText, { wide: true }));
    if (edited !== null && edited.trim() !== original.trim()) script.push(item('Origineel voorstel van TFA (de klant paste het aan)', original, { wide: true }));
    for (let i = 0; i < varCount; i++) script.push(item(varCount > 1 ? 'Variatie ' + (i + 1) : 'Variatie', varTexts[i], { wide: true }));
  }
  const tags = (brief.voiceStyleTags || '').split(',').filter(Boolean).join(', ');
  const voice = [
    item('Gekozen stem', brief.selectedVoiceLabel),
    item('Geslacht', brief.voiceGender),
    item('Leeftijd', brief.voiceAgeRange),
    item('Stijl', tags),
    item('Opmerking over de stem', brief.voiceNote, { wide: true }),
  ];
  const tracks = parseSelectedTracks(brief).map((t, i) => item('Keuze ' + (i + 1), [t.title, t.artist && '(' + t.artist + ')', t.playlistName && '· ' + t.playlistName].filter(Boolean).join(' ')));
  const confirm = [item('Bevestigd door de klant', brief.finalizedAt ? 'Ja, op ' + brief.finalizedAt : 'Nog niet bevestigd')];
  return [
    { step: 4, title: 'Stap 4 · Script', items: script },
    { step: 5, title: 'Stap 5 · Stem', items: voice },
    { step: 6, title: 'Stap 6 · Muziek', items: tracks.length ? tracks : [item('Muziek', '')] },
    { step: 7, title: 'Stap 7 · Bevestiging', items: confirm },
  ];
}
