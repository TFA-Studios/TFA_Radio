'use client';

import { useEffect, useState } from 'react';
import { profileOfBrief } from '../lib/formProfile';

// Hidden test helper: a small "Testdata invullen" button that fills the whole
// brief form (contact, delivery, details, plus any agency extra questions)
// with a realistic example, so a new feature can be tried without retyping.
//
// Real clients never see it: it only shows after a link with ?test=1 has been
// opened (that choice is remembered for the browser tab via sessionStorage).
// Use ?test=0 to switch it off again. The example contact email is
// karim@tfa.studio, so confirmation mails come to you.
const TEST_EMAIL = 'karim@tfa.studio';

export function enableTestModeFromUrl() {
  try {
    const q = new URLSearchParams(window.location.search).get('test');
    if (q === '1') window.sessionStorage.setItem('tfa_test_mode', '1');
    if (q === '0') window.sessionStorage.removeItem('tfa_test_mode');
    return window.sessionStorage.getItem('tfa_test_mode') === '1';
  } catch (e) {
    return false;
  }
}

function isoDateInDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function sampleData(brief) {
  const data = {
    companyName: 'Bakkerij Van Dijk',
    contactPerson: 'Karim (test)',
    contactEmail: TEST_EMAIL,
    additionalContacts: '[]',
    hoofdspotLength: '30',
    impressions: '100000',
    impressionsCustom: '',
    airDate: isoDateInDays(21),
    dateUnknown: false,
    airMonth: '',
    needsVariations: true,
    variationsCount: '1',
    disclaimerText: '',
    product: 'Ambachtelijk zuurdesembrood en verse gebakjes, elke ochtend vers uit de oven in ons eigen atelier in Utrecht.',
    audience: 'b2c',
    decisionMaker: '',
    audienceAgeInterests: 'Gezinnen en 30-55 jarigen die houden van vers, lokaal en goed eten',
    usp: 'Alles wordt dagelijks vers bereid met streekproducten, zonder bakmixen of kunstmatige toevoegingen. Onze deegrijstijd is 24 uur.',
    price: true,
    priceDetail: 'Dit voorjaar: 2e brood voor de halve prijs',
    mainMessage: 'Echt brood smaakt je meteen, en je proeft het verschil bij Bakkerij Van Dijk.',
    cta: 'Kom langs in Utrecht of bestel online via bakkerijvandijk.nl',
    slogan: 'Vers van de oven, elke dag.',
    toneOfVoice: JSON.stringify(['warm', 'vriendelijk', 'oprecht']),
  };
  // Agency-specific extra questions: fill each with a sensible sample answer.
  try {
    const profile = profileOfBrief(brief);
    const answers = {};
    for (const q of profile.extraQuestions || []) {
      answers[q.key] = q.type === 'choice' && q.options && q.options.length ? q.options[0] : 'Testantwoord voor "' + q.label + '"';
    }
    data.extraAnswers = JSON.stringify(answers);
  } catch (e) { /* no extra questions */ }
  return data;
}

export default function TestAutofill({ brief }) {
  const [on, setOn] = useState(false);
  const [state, setState] = useState('');

  useEffect(() => { setOn(enableTestModeFromUrl()); }, []);
  if (!on || !brief || !brief.id) return null;

  async function fill() {
    setState('Bezig…');
    try {
      const res = await fetch('/api/briefs/' + brief.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleData(brief)),
      });
      if (!res.ok) throw new Error('failed');
      // Reload so the page picks up the saved values.
      window.location.reload();
    } catch (e) {
      setState('Mislukt');
    }
  }

  return (
    <button
      type="button"
      onClick={fill}
      title="Alleen zichtbaar in testmodus (?test=1)"
      style={{
        position: 'fixed', right: 14, bottom: 14, zIndex: 400, padding: '8px 12px', borderRadius: 999,
        border: '1px dashed #C2513F', background: '#FFF7F5', color: '#C2513F', fontSize: 12, fontWeight: 600,
        cursor: 'pointer', fontFamily: "'Geist', system-ui, sans-serif", boxShadow: '0 2px 10px rgba(0,0,0,.12)',
      }}
    >
      {state || '🧪 Testdata invullen'}
    </button>
  );
}
