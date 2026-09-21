// Turns a brief into a radio script. Three AI providers are tried in this
// order, each configured by its own env var:
//
//  1. Claude (paid API): sends the structured brief to Claude and asks for
//     a natural, well-paced Dutch radio script. Runs when ANTHROPIC_API_KEY
//     is set.
//  2. Gemini (free API): same prompt, sent to Google's Gemini API instead.
//     Runs when ANTHROPIC_API_KEY is NOT set but GEMINI_API_KEY is. Get a
//     key at https://aistudio.google.com/apikey (double-check current
//     free-tier terms there, since they do change over time).
//  3. Ollama (free, self-hosted): sends the same brief to a locally-running
//     open model via Ollama (https://ollama.com). Runs when neither of the
//     above is set but OLLAMA_MODEL is. Only actually reachable if
//     OLLAMA_HOST points at a real, always-on Ollama server you host and
//     expose yourself — "localhost" resolves to wherever this code is
//     running, which on Vercel is NOT your own machine.
//
// If a provider is configured but the call fails (bad key, no credit,
// network hiccup, ...), that is now a hard failure, not a silent
// downgrade: the client sees an explicit "service unavailable" message
// with a short debug id (also logged server-side) instead of quietly
// getting a lower-quality deterministic script with no indication
// anything went wrong. The deterministic template is used ONLY when no AI
// provider is configured at all — useful for local dev/testing without
// any key, never as a hidden fallback in production once a key IS set.
//
// Whichever path runs, the result is one of:
//   { main, variation, source: 'ai' | 'template' | 'none' }
//   { main: '', variation: '', source: 'error', error, debugId }
// Ported near-verbatim from the original Express app's scriptgen.js — only
// require/module.exports were switched to ESM import/export.

import { getLivePromptIntro, DEFAULT_PROMPT_INTRO } from './promptVersions';
import { TONE_LABELS } from '../components/flowData';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// "-latest" alias: Google hot-swaps this to whatever the newest Flash
// release is, so it never needs bumping by hand as models are retired.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || '';

// --- timing model -----------------------------------------------------
//
// Shared by the generator (to size a script to its target length) and every
// page that shows a live "estimated seconds" bar (the script step here, and
// Main.dc.html in the design canvas — keep all three in sync). Calibrated
// against an actual read-aloud timing test: the old formula (words + a
// flat 10-word "pause" pad, all over 2.7 wds/sec) was overestimating a
// ~16s real read as 18-19s. A flat word-pad skews short scripts far more
// than long ones, so it's replaced with a proportional pause allowance.
const WORDS_PER_SECOND = 2.7;
const PAUSE_FACTOR = 1.05; // ~5% for natural breath/comma pauses, proportional to length
export function estimateSeconds(words) {
  return (words / WORDS_PER_SECOND) * PAUSE_FACTOR;
}
export function targetWordCount(targetSeconds) {
  return Math.round((targetSeconds * WORDS_PER_SECOND) / PAUSE_FACTOR);
}

// --- template fallback ----------------------------------------------------

function wordCount(s) {
  const t = (s || '').toString().trim();
  return t ? t.split(/\s+/).length : 0;
}
function clean(s) {
  return (s || '').toString().trim().replace(/[.!?]+$/, '');
}
function sentence(s) {
  const c = clean(s);
  if (!c) return '';
  return c.charAt(0).toUpperCase() + c.slice(1) + '.';
}
function lower1(s) {
  const c = clean(s);
  if (!c) return '';
  return c.charAt(0).toLowerCase() + c.slice(1);
}
function upper1(s) {
  const c = clean(s);
  if (!c) return '';
  return c.charAt(0).toUpperCase() + c.slice(1);
}
// Slogans are intentional brand copy (custom capitalization/punctuation) —
// this only trims and ensures a trailing full stop, it never re-cases them.
function sloganSentence(s) {
  const c = (s || '').toString().trim();
  if (!c) return '';
  return /[.!?]$/.test(c) ? c : c + '.';
}
function audiencePhrase(brief) {
  if (brief.audience === 'b2b' && brief.decisionMaker) return clean(brief.decisionMaker);
  if (brief.audience === 'b2c' && brief.audienceAgeInterests) return clean(brief.audienceAgeInterests);
  return '';
}

// --- tone of voice anchor -----------------------------------------------
//
// The client picks up to 2 tone words on the brief step (brief.toneOfVoice,
// stored as a JSON array of ids, same pattern as selectedTracks). It anchors
// BOTH generation paths:
//  - the AI prompt (buildPrompt below) gets an explicit "Toon" instruction
//    line built from the chosen labels, so Claude/Ollama's word choice and
//    register actually follow the pick;
//  - the template fallback (buildMainSentences) approximates the same
//    effect with punctuation and connector-word shifts, so a client never
//    sees an unstyled script just because no AI provider is configured.
// TONE_LABELS itself now lives in components/flowData.js (imported above) —
// it used to be duplicated independently in this file, in lib/email.js and
// in lib/reports.js, which meant a new tone added on the client-facing brief
// form was invisible to the AI prompt unless someone remembered to copy it
// into three other places by hand. One source of truth now; see the comment
// there for the full list of consumers.
const EMPHATIC_TONES = ['energiek', 'urgent', 'speels', 'gedurfd', 'droogkomisch'];
const RESTRAINED_TONES = ['rustig', 'zakelijk', 'premium', 'betrouwbaar', 'oprecht'];

// A concrete, one-line stylistic directive per tone — the actual mechanism
// that makes the client's pick reshape the WHOLE script (word choice,
// rhythm, humor level), instead of the tone only ever showing up as a bare
// label the model is free to interpret however it likes (which in practice
// meant almost every script defaulted to the same safe "nieuwsradio"
// register regardless of what was picked). Each entry is written as a direct
// instruction to the model, in Dutch, so it can be dropped straight into the
// prompt. Keep every instruction compatible with "natuurlijke spreektaal,
// geen overdrijving" — even the most stylized tones (droogkomisch, gedurfd)
// must still read as a professional, broadcastable commercial, never as a
// parody or an actual joke at the brand's expense.
const TONE_GUIDE = {
  energiek: 'Kort, krachtige zinnen met veel voorwaartse energie: actieve werkwoorden, weinig bijzinnen, een tempo dat opbouwt naar de call-to-action.',
  rustig: 'Lange(re), rustig uitlopende zinnen zonder haast: geef de luisteraar de tijd, vermijd uitroeptekens en opzwepend taalgebruik.',
  warm: 'Persoonlijke, uitnodigende taal: spreek de luisteraar direct aan ("jij", "je"), gebruik zachte, menselijke woorden in plaats van zakelijke termen.',
  zakelijk: 'Feitelijk en to-the-point: concrete voordelen zonder overdrijving, geen emotionele opsmuk, geen uitroeptekens.',
  urgent: 'Nadruk op tijdsdruk en actie: korte, dwingende zinnen ("nu", "vandaag nog", "op is op"), bouw merkbaar op naar de call-to-action.',
  premium: 'Ingetogen en subtiel: nooit hard verkopen, laat kwaliteit spreken via woordkeuze (bijv. "vakmanschap", "verfijnd") in plaats van superlatieven, geen uitroeptekens.',
  speels: 'Licht en luchtig: losse, informele zinsbouw, mag best een kleine knipoog bevatten, maar blijft functioneel (verkoopt nog steeds iets).',
  grappig: 'Een duidelijke, vriendelijke grap of pointe ergens in het script. Humor die uitnodigt om mee te lachen, nooit ten koste van de klant of het merk.',
  betrouwbaar: 'Nuchtere, geruststellende taal: bewijs en garanties ("al jaren", "gecertificeerd") zwaarder laten wegen dan gevoel, rustige, volwassen toon.',
  gedurfd: 'Zelfverzekerde, directe taal die durft af te wijken van de standaard reclametoon: kort, stellig, een tikje brutaal, maar nooit onbeleefd naar de luisteraar.',
  inspirerend: 'Taal die een groter perspectief schetst dan alleen het product, namelijk wat het mogelijk maakt voor de luisteraar, bouwend naar een motiverende afsluiting.',
  nostalgisch: 'Warme, herinnering-oproepende woordkeuze ("al sinds", "die vertrouwde", "zoals vroeger"): een gevoel van tijd en traditie, zonder gedateerd te klinken.',
  droogkomisch: 'Drooghumoristisch en licht sarcastisch, maar altijd professioneel: een understatement of een ironische zijopmerking over een herkenbaar, alledaags ongemak (nooit over de klant, het merk of de luisteraar zelf), gevolgd door een serieuze, geloofwaardige boodschap. Dit is humor als stijlmiddel, geen grap om de grap; de commercial moet na het lachje nog steeds overkomen als een serieus, professioneel merk.',
  vriendelijk: 'Toegankelijke, laagdrempelige spreektaal: alsof een sympathieke medewerker het uitlegt, geen jargon, geen afstandelijke formuleringen.',
  oprecht: 'Eerlijke, ongepolijste taal zonder marketingclichés: benoem het probleem of de behoefte net zo direct als de oplossing, alsof het merk het rechtstreeks tegen één luisteraar zegt.',
};
function toneGuideLines(toneKeys) {
  return toneKeys.filter((t) => TONE_GUIDE[t]).map((t) => '  • ' + TONE_LABELS[t] + ': ' + TONE_GUIDE[t]);
}
function parseTones(brief) {
  try {
    const parsed = brief.toneOfVoice ? JSON.parse(brief.toneOfVoice) : [];
    return Array.isArray(parsed) ? parsed.filter((t) => TONE_LABELS[t]) : [];
  } catch (e) {
    return [];
  }
}
function toneSentence(s, punct) {
  const c = clean(s);
  if (!c) return '';
  return c.charAt(0).toUpperCase() + c.slice(1) + (punct || '.');
}

// Weaves the brief's fields into a small number of flowing sentences —
// hook, reason to believe, offer, message, call to action, sign-off,
// mandatory disclaimer — instead of stapling one sentence onto the next per
// field. This is the same logic used by the design canvas's mockup
// template, kept in sync so a broken AI key or an offline Ollama server
// degrades to the same voice.
//
// Three things are treated as non-negotiable and are never trimmed for
// length, because the client asked for them by name: the call-to-action /
// website (if given), the slogan or at minimum the company name as a
// sign-off, and the mandatory disclaimer text — all three always land, in
// that order, at the very end of the script.
//
// Everything else (hook, USP, price, main message) is "body" content: it's
// built in priority order and then trimmed to fit the word budget implied
// by the chosen spot length (see targetWordCount above), so a 20-second
// spot doesn't run long and a 25-second spot doesn't run short.
function buildMainSentences(brief, targetWords) {
  const company = clean(brief.companyName);
  const product = clean(brief.product);
  const audience = audiencePhrase(brief);
  const usp = clean(brief.usp);
  const hasPrice = brief.price === true && !!clean(brief.priceDetail);
  const hasSlogan = !!(brief.slogan && brief.slogan.trim());
  const hasDisclaimer = !!(brief.disclaimerText && brief.disclaimerText.trim());

  const tones = parseTones(brief);
  const emphatic = tones.some((t) => EMPHATIC_TONES.includes(t));
  const punct = emphatic ? '!' : '.';
  const isPremium = tones.indexOf('premium') !== -1;
  const isGrounded = tones.indexOf('zakelijk') !== -1 || tones.indexOf('betrouwbaar') !== -1;

  // --- body: trimmable, priority order ---
  const body = [];

  let hook = '';
  if (product && company && audience) {
    hook = upper1(product) + ' bij ' + company + ', speciaal voor ' + lower1(audience) + punct;
  } else if (product && company) {
    hook = upper1(product) + ', bij ' + company + punct;
  } else if (product && audience) {
    hook = upper1(product) + ', speciaal voor ' + lower1(audience) + punct;
  } else if (product) {
    hook = toneSentence(product, punct);
  } else if (company && audience) {
    hook = company + ', speciaal voor ' + lower1(audience) + punct;
  } else if (company) {
    hook = toneSentence(company, punct);
  }
  if (hook) body.push(hook);

  if (usp) {
    let lead = body.length ? 'Want ' : '';
    let uspBody = body.length ? lower1(usp) : usp;
    if (body.length && isPremium) {
      lead = 'Ontdek waarom ';
    } else if (body.length && isGrounded) {
      lead = 'Reden: ';
      uspBody = upper1(usp);
    }
    body.push(toneSentence(lead + uspBody, isGrounded ? '.' : punct));
  }

  if (hasPrice) {
    body.push(toneSentence('Nu ' + lower1(brief.priceDetail), punct));
  }

  if (brief.mainMessage) {
    body.push(toneSentence(brief.mainMessage, punct));
  }

  // --- tail: fixed, never trimmed, always in this order ---
  // Brand sign-off (company name + slogan) comes BEFORE the call-to-action,
  // not after — the call-to-action is the true final spoken line (before
  // only the legal disclaimer, if there is one). This used to be reversed
  // (CTA, then a trailing company-name sentence), which meant every script
  // ended by re-stating the company name right after "ga naar merk.nl" —
  // Karim flagged this as an unwanted, redundant repeat.
  const tail = [];
  if (hasSlogan) {
    const sloganMentionsCompany = company && clean(brief.slogan).toLowerCase().indexOf(company.toLowerCase()) !== -1;
    if (company && !sloganMentionsCompany) tail.push(sentence(company));
    tail.push(sloganSentence(brief.slogan));
  } else if (company && !hook) {
    tail.push(sentence(company));
  }
  if (brief.cta) tail.push(toneSentence(brief.cta, punct));
  if (hasDisclaimer) tail.push(sloganSentence(brief.disclaimerText));

  // --- fit the body to whatever's left of the word budget after the tail ---
  const tailWords = tail.reduce((n, s) => n + wordCount(s), 0);
  const budget = typeof targetWords === 'number' ? Math.max(targetWords - tailWords, 0) : Infinity;
  const chosen = [];
  let used = 0;
  body.forEach((s, i) => {
    const w = wordCount(s);
    if (i === 0 || used + w <= budget * 1.15) {
      chosen.push(s);
      used += w;
    }
  });

  return chosen.concat(tail);
}

function buildVarSentences(brief, mainSentences) {
  if (!brief.variationDetail) return mainSentences;
  const hook = sentence(brief.variationDetail);
  if (!hook) return mainSentences;
  return [hook].concat(mainSentences.slice(1));
}

function templateGenerate(brief) {
  const target = parseInt(brief.hoofdspotLength, 10) || 20;
  const targetWords = targetWordCount(target);
  const mainSentences = buildMainSentences(brief, targetWords);
  const main = mainSentences.join(' ');
  const varSentences = buildVarSentences(brief, mainSentences);
  const variation = varSentences.join(' ');
  return { main, variation, source: 'template' };
}

// --- AI generation ----------------------------------------------------

function briefHasEnoughContent(brief) {
  return !!(brief.product || brief.usp || brief.mainMessage);
}

function buildPrompt(brief, introText) {
  const target = parseInt(brief.hoofdspotLength, 10) || 20;
  const targetWords = targetWordCount(target);
  const hasDisclaimer = !!(brief.disclaimerText && brief.disclaimerText.trim());
  const lines = [];
  // The "command" — editable per lib/promptVersions.js's version control
  // (managed from /dashboard/prompt). Falls back to the built-in default
  // if no version is live or the prompt store hiccups.
  lines.push((introText && introText.trim()) || DEFAULT_PROMPT_INTRO);
  lines.push('');
  lines.push('KLANTBRIEF:');
  if (brief.companyName) lines.push('- Bedrijfsnaam: ' + brief.companyName);
  if (brief.product) lines.push('- Product/dienst: ' + brief.product);
  if (brief.audience === 'b2b') lines.push('- Doelgroep: bedrijven (B2B)' + (brief.decisionMaker ? ', beslisser: ' + brief.decisionMaker : ''));
  if (brief.audience === 'b2c') lines.push('- Doelgroep: consumenten (B2C)' + (brief.audienceAgeInterests ? ', profiel: ' + brief.audienceAgeInterests : ''));
  if (brief.usp) lines.push('- Belangrijkste voordeel (USP): ' + brief.usp);
  if (brief.price && brief.priceDetail) lines.push('- Prijs/aanbieding: ' + brief.priceDetail);
  if (brief.mainMessage) lines.push('- Kernboodschap: ' + brief.mainMessage);
  if (brief.cta) lines.push('- Call-to-action / website: ' + brief.cta);
  if (brief.slogan) lines.push('- Slogan van het bedrijf: "' + brief.slogan + '"');
  if (hasDisclaimer) lines.push('- Verplichte tekst/disclaimer (wettelijk, woordelijk over te nemen): "' + brief.disclaimerText + '"');
  if (brief.extraNote) lines.push('- Productie-opmerking van de klant (dit is instructie voor TFA, GEEN gesproken tekst, bijv. "geen kinderstem"): ' + brief.extraNote);
  const tones = parseTones(brief);
  if (tones.length) {
    lines.push('- Gewenste toon (door de klant zelf gekozen): ' + tones.map((t) => TONE_LABELS[t]).join(' & '));
    const guideLines = toneGuideLines(tones);
    if (guideLines.length) {
      lines.push('  Concrete stijlinstructie per gekozen toon:');
      lines.push.apply(lines, guideLines);
    }
  }
  lines.push('');
  lines.push('OPBOUW (in deze volgorde, vloeiend aan elkaar geschreven, geen losse, korte zinnetjes per punt, geen kopjes):');
  lines.push('1. Pakkende opening: wat het is en voor wie, met de bedrijfsnaam erin verweven. Dit is de zin die de aandacht moet grijpen: geen generieke intro.');
  lines.push('2. De reden om te geloven: het belangrijkste voordeel (USP), als argument en niet als los feitje.');
  lines.push('3. Het aanbod, als dat er is: prijs of actie, natuurlijk ingeleid (bijv. "nu...").');
  lines.push('4. De kernboodschap van de klant.');
  lines.push('5. Merkafsluiting: de bedrijfsnaam, gevolgd door de slogan exact zoals aangeleverd. Als de slogan de bedrijfsnaam al bevat, herhaal die naam er niet nog eens vlak voor. Dit is VERPLICHT als er een slogan is.');
  lines.push('6. De call-to-action of website, als allerlaatste gesproken regel vóór een eventuele disclaimer. Dit is VERPLICHT als de brief hem geeft, laat hem nooit weg. BELANGRIJK: dit is het echte einde van het script: noem na de call-to-action NIET nog een keer de bedrijfsnaam of iets uit stap 5, ook niet in een andere vorm. Eén keer de bedrijfsnaam/slogan noemen (stap 5) is genoeg; herhaal die niet als afsluitende zin ná de call-to-action. Let hierbij ook op de website zelf: bevat de website/CTA (stap 6) de bedrijfsnaam al, zoals bij "tfa.studio" (bedrijfsnaam "TFA" zit al in de domeinnaam), zeg de bedrijfsnaam dan in stap 5 niet nog eens los vlak ervoor. Dus niet "TFA. Kijk op TFA.studio." (dat klinkt als een stotterende herhaling), maar bijvoorbeeld gewoon "Kijk op TFA.studio" als afsluiting, of noem de merknaam in stap 5 op een andere, natuurlijke manier die niet direct tegen de website-naam aan botst.');
  if (hasDisclaimer) {
    lines.push('7. Helemaal aan het eind, als allerlaatste zin(nen), na de call-to-action: de verplichte tekst/disclaimer, WOORDELIJK en ONGEWIJZIGD overgenomen uit de brief. Dit is wettelijk verplichte tekst, herschrijf, parafraseer of verkort hem nooit.');
  }
  lines.push('Laat een stap uit de opbouw alleen weg als de bijbehorende informatie niet in de brief staat: verzin niets. Stappen 5, 6 en 7 zijn de uitzondering: die laat je NOOIT weg zolang de brief de informatie geeft, ook niet om binnen de doellengte te blijven: kort in dat geval liever de opening of de kernboodschap in (stap 1-4).');
  lines.push('');
  lines.push('EISEN:');
  lines.push('- Doellengte: ' + target + ' seconden. Bij een natuurlijk voorleestempo is dat ongeveer ' + targetWords + ' woorden: dit is een harde eis, geen richtlijn. Kom je boven de ' + Math.round(targetWords * 1.1) + ' woorden uit, kort dan in (nooit door de call-to-action, slogan of disclaimer te schrappen, alleen door de opening, USP of kernboodschap compacter te maken). Kom je onder de ' + Math.round(targetWords * 0.8) + ' woorden, verzin dan geen extra inhoud: een korter script dat klopt is beter dan opvulzinnen.');
  lines.push('- Natuurlijke, gesproken spreektaal: variatie in zinslengte en -opbouw, geen opsomming, geen bullet points, geen kopjes.');
  lines.push('- Gebruik NOOIT een gedachtestreepje (—) in het script. Schrijf natuurlijke, gesproken Nederlandse interpunctie: komma\'s, punten, "en", "of dus" en dergelijke in plaats van een streepje. Een script vol gedachtestreepjes klinkt voor een luisteraar direct als AI-gegenereerde tekst, en dat is precies wat dit script niet mag zijn.');
  lines.push('- Vermijd clichés en stockzinnen ("ontdek de wereld van...", "hét adres voor...", "kom snel langs").');
  if (tones.length) {
    lines.push('- De gekozen toon (' + tones.map((t) => TONE_LABELS[t]).join(' & ') + ') is LEIDEND voor woordkeuze, ritme en zinsbouw: belangrijker dan enige standaard "radiocommercial-stijl" hierboven. Als de gekozen toon en de standaardstijl uit elkaar lopen (bijv. een luchtige of drooghumoristische toon versus een neutrale "nieuwsradio"-inleiding), kies dan voor de gekozen toon: het script moet duidelijk anders klinken dan een script zonder tonekeuze, of met een andere toon. Laat dit door het HELE script doorklinken, niet alleen in de opening.');
    if (tones.length > 1) {
      lines.push('- Bij meerdere gekozen tonen: meng ze door het script heen (bijv. een sarcastische observatie gevolgd door een geruststellende, betrouwbare afsluiting) in plaats van steeds voor maar één van de tonen te kiezen.');
    }
  }
  lines.push('- Verzin geen feiten, cijfers of claims die niet in de brief staan.');
  if (!hasDisclaimer) {
    lines.push('- Er is geen verplichte tekst/disclaimer in deze brief opgegeven: verzin er zelf geen.');
  }
  lines.push('- Neem de productie-opmerking (indien aanwezig) NIET op als gesproken tekst: die is alleen voor TFA, niet voor de luisteraar.');

  if (brief.needsVariations && brief.variationDetail) {
    lines.push('');
    lines.push('Schrijf ook een VARIATIE: exact hetzelfde script, met alleen de openingszin aangepast aan dit verschil: "' + brief.variationDetail + '". De rest van de tekst (inclusief de call-to-action, slogan en verplichte tekst aan het eind) blijft identiek aan het hoofdscript.');
  }

  lines.push('');
  lines.push('Antwoord ALLEEN met geldige JSON, in dit formaat, zonder markdown-codeblok eromheen:');
  lines.push(brief.needsVariations && brief.variationDetail
    ? '{"main": "...", "variation": "..."}'
    : '{"main": "..."}');

  return lines.join('\n');
}

// Pulls { main, variation } out of a model's reply. Despite the prompt
// asking for strict JSON, a model occasionally answers in plain prose
// instead (no braces at all), or wraps valid content in JSON that has a
// small formatting slip (an unescaped newline inside a string value is the
// most common one) that trips up JSON.parse. Both used to be treated as a
// hard failure — falling all the way back to the plain template generator
// even though the model's actual script text was sitting right there in
// the response. Instead, in both cases, fall back to using the raw reply
// itself as the script: a slightly-less-clean AI script beats silently
// discarding a good response over a formatting technicality.
function extractJson(text) {
  const raw = (text || '').toString();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');

  if (start === -1) {
    // No opening brace anywhere — the model answered in plain prose despite
    // being asked for JSON. Use the reply itself as the script rather than
    // discarding a perfectly good response over a formatting technicality.
    const trimmed = raw.trim();
    if (!trimmed) throw new Error('AI response was empty');
    return { main: trimmed };
  }

  if (end === -1 || end <= start) {
    // There IS an opening '{' but no matching closing '}' — this is a
    // response that got cut off mid-JSON (almost always the max_tokens
    // budget running out before the model finished), not plain prose. The
    // old behavior here fell through to "use the raw reply as the script",
    // which for a response starting '{"main": "...' meant the literal JSON
    // scaffolding (the '{"main": "' prefix, an unterminated sentence with
    // no closing punctuation) leaked straight into the visible script.
    // Fail loudly instead so the caller's retry/error handling kicks in.
    throw new Error('AI response was truncated before valid JSON could be formed (likely hit the max_tokens limit)');
  }

  const jsonSlice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(jsonSlice);
  } catch (err) {
    // Most common slip: a literal newline/tab inside a string value (this
    // JSON payload never needs one, so collapsing them to a space is safe).
    try {
      return JSON.parse(jsonSlice.replace(/[\r\n\t]+/g, ' '));
    } catch (err2) {
      // Still broken — the reply had a script in it, so fall back to the
      // raw text rather than reverting all the way to the template.
      const trimmed = raw.trim();
      if (!trimmed) throw err2;
      return { main: trimmed };
    }
  }
}

async function aiGenerate(brief, introText) {
  const prompt = buildPrompt(brief, introText);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      // Generous headroom for a short radio script + JSON wrapper — a
      // truncated response (max_tokens cut off mid-string) is a common
      // cause of "no JSON object found"/JSON.parse failures. Bumped from
      // 2048: a longer spot (30-40s) plus a variation plus a verbatim legal
      // disclaimer easily pushes the JSON-escaped reply past 2048 tokens,
      // which was cutting responses off mid-sentence.
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('Anthropic API error ' + res.status + ': ' + body.slice(0, 300));
  }

  const data = await res.json();
  const text = (data.content || []).map((b) => b.text || '').join('');
  // Claude reports explicitly when it ran out of room instead of finishing
  // naturally — catch that BEFORE trying to parse, since a truncated reply
  // can occasionally still contain a balanced-looking (but content-cut-off)
  // '{...}' that would otherwise slip past extractJson's own truncation
  // check.
  if (data.stop_reason === 'max_tokens') {
    throw new Error('AI response was truncated by the max_tokens limit — raw reply: ' + text.slice(0, 300));
  }
  let parsed;
  try {
    parsed = extractJson(text);
  } catch (err) {
    // Include a snippet of what Claude actually said — the old error here
    // ("no JSON object found in AI response") gave no way to tell why from
    // the Vercel logs alone.
    throw new Error(err.message + ' — raw reply: ' + text.slice(0, 300));
  }
  if (!parsed.main || typeof parsed.main !== 'string') {
    throw new Error('AI response missing "main" script text — raw reply: ' + text.slice(0, 300));
  }
  return {
    main: parsed.main.trim(),
    variation: typeof parsed.variation === 'string' ? parsed.variation.trim() : '',
    source: 'ai',
  };
}

// --- free, hosted AI generation via Gemini ------------------------------

async function geminiGenerate(brief, introText) {
  const prompt = buildPrompt(brief, introText);
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + GEMINI_API_KEY;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('Gemini API error ' + res.status + ': ' + body.slice(0, 300));
  }

  const data = await res.json();
  const candidate = (data.candidates || [])[0];
  const text = ((candidate && candidate.content && candidate.content.parts) || [])
    .map((p) => p.text || '')
    .join('');
  if (!text) throw new Error('Gemini response had no text (possibly blocked by safety filters)');
  const parsed = extractJson(text);
  if (!parsed.main || typeof parsed.main !== 'string') {
    throw new Error('Gemini response missing "main" script text');
  }
  return {
    main: parsed.main.trim(),
    variation: typeof parsed.variation === 'string' ? parsed.variation.trim() : '',
    source: 'ai',
  };
}

// --- free, local AI generation via Ollama -------------------------------

async function ollamaGenerate(brief, introText) {
  const prompt = buildPrompt(brief, introText);
  const res = await fetch(OLLAMA_HOST + '/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      format: 'json',
      options: { temperature: 0.7 },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('Ollama error ' + res.status + ': ' + body.slice(0, 300));
  }

  const data = await res.json();
  const text = data.response || '';
  const parsed = extractJson(text);
  if (!parsed.main || typeof parsed.main !== 'string') {
    throw new Error('Ollama response missing "main" script text');
  }
  return {
    main: parsed.main.trim(),
    variation: typeof parsed.variation === 'string' ? parsed.variation.trim() : '',
    source: 'ai',
  };
}

// --- public entry point ----------------------------------------------------

// A short, log-greppable id attached to every failure so a producer report
// like "it broke just now" can be matched to the exact Vercel log line
// (search server logs for the same id) instead of guessing from a
// generic error message.
function makeDebugId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

// Always resolves — never throws. Once a real AI provider is configured,
// a failed call is surfaced as an explicit error result (source: 'error')
// rather than silently swapped for the lower-quality deterministic
// template — see the file header. The template is only ever used when NO
// AI provider is configured at all.
export async function generateScript(brief) {
  if (!briefHasEnoughContent(brief)) {
    return { main: '', variation: '', source: 'none' };
  }

  const introText = await getLivePromptIntro();

  if (ANTHROPIC_API_KEY) {
    try {
      return await aiGenerate(brief, introText);
    } catch (err) {
      const debugId = makeDebugId();
      console.error('[scriptgen] Claude generation failed [' + debugId + ']:', err.message);
      return { main: '', variation: '', source: 'error', error: 'De AI-scriptservice (Claude) is momenteel niet beschikbaar.', debugId };
    }
  }
  if (GEMINI_API_KEY) {
    try {
      return await geminiGenerate(brief, introText);
    } catch (err) {
      const debugId = makeDebugId();
      console.error('[scriptgen] Gemini generation failed [' + debugId + ']:', err.message);
      return { main: '', variation: '', source: 'error', error: 'De AI-scriptservice (Gemini) is momenteel niet beschikbaar.', debugId };
    }
  }
  if (OLLAMA_MODEL) {
    try {
      return await ollamaGenerate(brief, introText);
    } catch (err) {
      const debugId = makeDebugId();
      console.error('[scriptgen] Ollama generation failed [' + debugId + ']:', err.message);
      return { main: '', variation: '', source: 'error', error: 'De AI-scriptservice (Ollama) is momenteel niet beschikbaar.', debugId };
    }
  }
  return templateGenerate(brief);
}

export const aiEnabled = !!ANTHROPIC_API_KEY || !!GEMINI_API_KEY || !!OLLAMA_MODEL;
export const aiProvider = ANTHROPIC_API_KEY ? 'claude' : (GEMINI_API_KEY ? 'gemini' : (OLLAMA_MODEL ? 'ollama' : 'none'));

export { templateGenerate };
