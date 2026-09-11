'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StepShell from '../../../../components/StepShell';
import Preloader from '../../../../components/Preloader';
import useMinDelay from '../../../../components/useMinDelay';
import { useBrief } from '../../../../components/useBrief';
import { TONE_LABELS } from '../../../../components/flowData';

const MAX_TONES = 2;
const TONE_ORDER = Object.keys(TONE_LABELS);

// Character caps on the brief's free-text fields — mirrored server-side in
// lib/db.js's FIELD_MAX_LENGTHS (the real enforcement; these maxLength
// attributes are just the UI's first line of defense). Sized from real
// client answers we collected across several actual briefs: product,
// USP and kernboodschap answers ranged from ~60 to ~780 characters when a
// client wrote a thorough, thoughtful answer, so these caps sit well above
// that (a safety net against an extreme paste, not a tight limit that would
// clip a genuinely detailed brief) — disclaimerText is left the most
// generous of all since it's legally-required text that must never be cut
// off mid-sentence.
const FIELD_LIMITS = {
  product: 1200,
  decisionMaker: 200,
  audienceAgeInterests: 1000,
  usp: 1200,
  priceDetail: 150,
  mainMessage: 1200,
  cta: 150,
  slogan: 150,
  disclaimerText: 2000,
  extraNote: 1000,
};

function CharCount({ field, value }) {
  const max = FIELD_LIMITS[field];
  if (!max) return null;
  const len = (value || '').length;
  const near = len >= max * 0.9;
  return (
    <div style={{ marginTop: 4, textAlign: 'right', fontSize: 11, color: near ? '#B06156' : '#9C9890' }}>
      {len} / {max}
    </div>
  );
}

// Step 3 — mirrors public/brief.html (renamed "Brief" / details step).
export default function DetailsPage({ params }) {
  const { id } = params;
  const router = useRouter();
  const { brief, loading, schedulePatch, flushPending, patch } = useBrief(id);
  const showLoader = useMinDelay(loading, 700);
  // Set the instant "Akkoord" is clicked, not after the save (and, on this
  // step, the AI script generation call too) resolves — this used to show
  // the button's disabled "Script wordt gegenereerd…" state on the current
  // page for the whole wait, then only switch to the preloader once
  // navigation actually happened. Now the preloader takes over immediately.
  const [navigating, setNavigating] = useState(false);
  const [form, setForm] = useState({
    disclaimerText: '', extraNote: '', product: '', audience: 'b2b', decisionMaker: '',
    audienceAgeInterests: '', usp: '', price: null, priceDetail: '', mainMessage: '',
    cta: '', slogan: '', toneOfVoice: [],
  });
  const [generating, setGenerating] = useState(false);

  // Hydrate from the brief once per id, not on every autosave echo — see the
  // long comment in contact/page.js's identical effect for why.
  useEffect(() => {
    if (brief) {
      let tones = [];
      try {
        const parsed = brief.toneOfVoice ? JSON.parse(brief.toneOfVoice) : [];
        tones = Array.isArray(parsed) ? parsed : [];
      } catch (e) {}
      setForm({
        disclaimerText: brief.disclaimerText || '',
        extraNote: brief.extraNote || '',
        product: brief.product || '',
        audience: brief.audience || 'b2b',
        decisionMaker: brief.decisionMaker || '',
        audienceAgeInterests: brief.audienceAgeInterests || '',
        usp: brief.usp || '',
        price: brief.price,
        priceDetail: brief.priceDetail || '',
        mainMessage: brief.mainMessage || '',
        cta: brief.cta || '',
        slogan: brief.slogan || '',
        toneOfVoice: tones,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief && brief.id]);

  function update(field, value) {
    const next = { ...form, [field]: value };
    setForm(next);
    schedulePatch({ [field]: field === 'toneOfVoice' ? JSON.stringify(value) : value });
  }

  function toggleTone(v) {
    const idx = form.toneOfVoice.indexOf(v);
    let next;
    if (idx !== -1) {
      next = form.toneOfVoice.slice();
      next.splice(idx, 1);
    } else {
      if (form.toneOfVoice.length >= MAX_TONES) return;
      next = form.toneOfVoice.concat(v);
    }
    update('toneOfVoice', next);
  }

  async function submit() {
    setNavigating(true);
    flushPending();
    // NOTE: this only advances past the brief/details step — it must NOT
    // pass {submitted:true}. That flag means "the whole 7-step flow is
    // done, send the confirmation email", which only happens on the
    // overview step's final submit.
    await patch({ ...form, toneOfVoice: JSON.stringify(form.toneOfVoice) });
    setGenerating(true);
    try {
      await fetch(`/api/briefs/${id}/generate-script`, { method: 'POST' });
    } catch (e) {
      // If this fails, the script step still offers a "Genereer" button —
      // submission itself already succeeded, so don't block navigation.
    }
    router.push(`/brief/${id}/script`);
  }

  if (showLoader || navigating) return <Preloader />;

  return (
    <StepShell briefId={id} current={3} brief={brief} bigNum="03" kicker="De inhoud" title="Jouw brief" hint="Nog een paar korte vragen over je commercial en je brief." backHref={`/brief/${id}/delivery`} backLabel="Terug naar levering">
      <div style={{ marginBottom: 22 }}>
        <label className="field-label">Welk product of welke dienst wil je promoten?</label>
        <textarea style={{ minHeight: 64 }} maxLength={FIELD_LIMITS.product} value={form.product} placeholder="Waar gaat de commercial over?" onChange={(e) => update('product', e.target.value)} />
        <CharCount field="product" value={form.product} />
      </div>

      <div style={{ marginBottom: 22, borderTop: '1px solid #EEECE3', paddingTop: 20 }}>
        <label className="field-label" style={{ marginBottom: 7 }}>Wie wil je bereiken?</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className={'seg-btn' + (form.audience === 'b2b' ? ' selected' : '')} onClick={() => update('audience', 'b2b')}>Vooral bedrijven (B2B)</button>
          <button type="button" className={'seg-btn' + (form.audience === 'b2c' ? ' selected' : '')} onClick={() => update('audience', 'b2c')}>Vooral consumenten (B2C)</button>
        </div>
        {form.audience === 'b2b' ? (
          <div style={{ marginTop: 12 }}>
            <label className="field-label">Wie neemt daar de beslissing?</label>
            <input type="text" maxLength={FIELD_LIMITS.decisionMaker} value={form.decisionMaker} placeholder="Bijv. IT-directeur, inkoopmanager" onChange={(e) => update('decisionMaker', e.target.value)} />
            <CharCount field="decisionMaker" value={form.decisionMaker} />
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <label className="field-label">Leeftijd en interesses van je doelgroep</label>
            <input type="text" maxLength={FIELD_LIMITS.audienceAgeInterests} value={form.audienceAgeInterests} placeholder="Bijv. 30–50 jaar, gezinnen" onChange={(e) => update('audienceAgeInterests', e.target.value)} />
            <CharCount field="audienceAgeInterests" value={form.audienceAgeInterests} />
          </div>
        )}
      </div>

      <div style={{ marginBottom: 22, borderTop: '1px solid #EEECE3', paddingTop: 20 }}>
        <label className="field-label">Waarom kiezen klanten voor jou, en niet voor een concurrent?</label>
        <textarea style={{ minHeight: 64 }} maxLength={FIELD_LIMITS.usp} value={form.usp} placeholder="Jouw belangrijkste voordeel" onChange={(e) => update('usp', e.target.value)} />
        <CharCount field="usp" value={form.usp} />
      </div>

      <div style={{ marginBottom: 22, borderTop: '1px solid #EEECE3', paddingTop: 20 }}>
        <label className="field-label" style={{ marginBottom: 7 }}>Wil je prijzen of een aanbieding noemen?</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className={'seg-btn' + (form.price === true ? ' selected' : '')} onClick={() => update('price', true)}>Ja</button>
          <button type="button" className={'seg-btn' + (form.price === false ? ' selected' : '')} onClick={() => update('price', false)}>Nee</button>
        </div>
        {form.price === true && (
          <div style={{ marginTop: 12 }}>
            <label className="field-label">Welke prijs of aanbieding?</label>
            <input type="text" maxLength={FIELD_LIMITS.priceDetail} value={form.priceDetail} placeholder="Bijv. vanaf €99 per maand" onChange={(e) => update('priceDetail', e.target.value)} />
            <CharCount field="priceDetail" value={form.priceDetail} />
          </div>
        )}
      </div>

      <div style={{ marginBottom: 22, borderTop: '1px solid #EEECE3', paddingTop: 20 }}>
        <label className="field-label">Wat wil je vooral vertellen?</label>
        <textarea style={{ minHeight: 80 }} maxLength={FIELD_LIMITS.mainMessage} value={form.mainMessage} placeholder="De kernboodschap die je wilt overbrengen" onChange={(e) => update('mainMessage', e.target.value)} />
        <CharCount field="mainMessage" value={form.mainMessage} />
      </div>

      <div style={{ marginBottom: 22, borderTop: '1px solid #EEECE3', paddingTop: 20 }}>
        <label className="field-label">
          Hoe moet de commercial klinken? <span style={{ color: '#8C8880', fontWeight: 400 }}>(kies max. 2)</span>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
          {TONE_ORDER.map((v) => {
            const active = form.toneOfVoice.includes(v);
            const atLimit = form.toneOfVoice.length >= MAX_TONES;
            return (
              <button
                key={v}
                type="button"
                className={'tone-chip' + (active ? ' active' : '') + (atLimit && !active ? ' disabled' : '')}
                onClick={() => toggleTone(v)}
              >
                {TONE_LABELS[v]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="field-grid" style={{ marginBottom: 22, borderTop: '1px solid #EEECE3', paddingTop: 20 }}>
        <div>
          <label className="field-label">Call-to-action of website</label>
          <input type="text" maxLength={FIELD_LIMITS.cta} value={form.cta} placeholder="Bijv. 'Bestel nu op merk.nl'" onChange={(e) => update('cta', e.target.value)} />
          <CharCount field="cta" value={form.cta} />
        </div>
        <div>
          <label className="field-label">Heeft je bedrijf al een slogan? <span style={{ color: '#8C8880', fontWeight: 400 }}>(optioneel)</span></label>
          <input type="text" maxLength={FIELD_LIMITS.slogan} value={form.slogan} placeholder="Bijv. 'Altijd in de buurt'" onChange={(e) => update('slogan', e.target.value)} />
          <CharCount field="slogan" value={form.slogan} />
        </div>
        <div className="full hint" style={{ marginTop: -10 }}>Als je er een hebt, gebruiken we deze aan het einde van het script.</div>
      </div>

      <div style={{ marginBottom: 22, borderTop: '1px solid #EEECE3', paddingTop: 20 }}>
        <label className="field-label">Verplichte tekst of disclaimers</label>
        <textarea style={{ minHeight: 56 }} maxLength={FIELD_LIMITS.disclaimerText} value={form.disclaimerText} placeholder="Bijv. 'Vraag naar de voorwaarden'" onChange={(e) => update('disclaimerText', e.target.value)} />
        <div className="hint" style={{ marginTop: 5 }}>Deze tekst nemen we altijd op in het script — ook als er later wordt aangepast.</div>
      </div>

      <div style={{ marginBottom: 22, borderTop: '1px solid #EEECE3', paddingTop: 20 }}>
        <label className="field-label">Extra opmerkingen <span style={{ color: '#8C8880', fontWeight: 400 }}>(optioneel)</span></label>
        <textarea style={{ minHeight: 56 }} maxLength={FIELD_LIMITS.extraNote} value={form.extraNote} placeholder="Nog iets anders dat we moeten weten?" onChange={(e) => update('extraNote', e.target.value)} />
        <CharCount field="extraNote" value={form.extraNote} />
      </div>


      <div style={{ marginTop: 22, paddingTop: 22, borderTop: '1px solid #EAE7DE', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn-primary" style={{ minWidth: 320, flex: 'none', whiteSpace: 'nowrap', padding: '14px 26px' }} onClick={submit} disabled={generating}>
          {generating ? 'Script wordt gegenereerd…' : 'Akkoord — verder naar het scriptvoorstel'}
        </button>
      </div>
    </StepShell>
  );
}
