'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { profileOfBrief } from '../../../../lib/formProfile';
import StepShell from '../../../../components/StepShell';
import Preloader from '../../../../components/Preloader';
import useMinDelay from '../../../../components/useMinDelay';
import { useBrief } from '../../../../components/useBrief';
import { upcomingMonthOptions, parseImpressions, formatNumberNl } from '../../../../components/flowData';

// Used to be a fixed row of segmented buttons capped at 6 — some
// productions genuinely need 12 or more variations, so this is now a plain
// numeric input instead of an enumerated list. 1 is the practical floor
// (this section only shows once "Ja" is picked above); there's no real
// upper bound, so the input just accepts anything sane a client types.
const MAX_VARIATIONS_COUNT = 50;

// Step 2 — mirrors public/delivery.html.
export default function DeliveryPage({ params }) {
  const { id } = params;
  const router = useRouter();
  // See the identical comment in contact/page.js.
  const returnToOverview = useSearchParams().get('from') === 'overview';
  const { brief, loading, schedulePatch, flushPending, patch } = useBrief(id);
  const showLoader = useMinDelay(loading, 700);
  // See the identical comment in contact/page.js: set the instant "Volgende"
  // is clicked so the preloader takes over immediately instead of a beat of
  // stale page while the save is still in flight.
  const [navigating, setNavigating] = useState(false);
  const [form, setForm] = useState({
    hoofdspotLength: '20',
    needsVariations: null,
    variationsCount: '1',
    impressions: '',
    impressionsRaw: '',
    airDate: '',
    dateUnknown: false,
    airMonth: '',
  });

  // Hydrate from the brief once per id, not on every autosave echo — see the
  // long comment in contact/page.js's identical effect for why.
  useEffect(() => {
    if (brief) {
      setForm({
        hoofdspotLength: brief.hoofdspotLength || '20',
        needsVariations: brief.needsVariations,
        variationsCount: brief.variationsCount && brief.variationsCount !== '0' ? brief.variationsCount : '1',
        impressions: brief.impressions || '',
        // Older briefs used fixed choices: show them as plain numbers.
        impressionsRaw: brief.impressionsCustom || (/^\d+$/.test(brief.impressions || '') ? formatNumberNl(parseInt(brief.impressions, 10)) : ''),
        airDate: brief.airDate || '',
        dateUnknown: !!brief.dateUnknown,
        airMonth: brief.airMonth || '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief && brief.id]);

  function update(patchObj) {
    const next = { ...form, ...patchObj };
    setForm(next);
    const toSave = { ...patchObj };
    if (Object.prototype.hasOwnProperty.call(toSave, 'impressionsRaw')) {
      const p = parseImpressions(toSave.impressionsRaw);
      toSave.impressionsCustom = toSave.impressionsRaw;
      toSave.impressions = p.ok ? String(p.value) : '';
      delete toSave.impressionsRaw;
      next.impressions = toSave.impressions;
      setForm(next);
    }
    schedulePatch(toSave);
  }

  // Impressions is an open field: clients type "500.000", "500k", "1,5 miljoen"
  // and so on; parseImpressions() understands those. The parsed whole number
  // is what gets stored in `impressions` (the raw text stays in
  // impressionsCustom), so the rest of the app only ever sees a number.
  const parsedImpressions = parseImpressions(form.impressionsRaw);
  const impressionsValid = !form.impressionsRaw.trim() || parsedImpressions.ok;
  // Since the variation count is now a free numeric input rather than a
  // fixed set of buttons, it can be left blank/invalid mid-typing — gate
  // continuing the same way impressionsCustomValid does above.
  const variationsCountValid = !form.needsVariations || /^\d+$/.test(String(form.variationsCount).trim());
  const canContinue = impressionsValid && variationsCountValid;

  async function next() {
    if (!canContinue) return;
    setNavigating(true);
    flushPending();
    const { impressionsRaw, ...rest } = form;
    await patch({ ...rest, impressionsCustom: impressionsRaw });
    router.push(returnToOverview ? `/brief/${id}/overview` : `/brief/${id}/details`);
  }

  if (showLoader || navigating) return <Preloader />;

  const hide = profileOfBrief(brief).hide;
  const todayISO = new Date().toISOString().slice(0, 10);
  // This month and the next 17, each with its year (a campaign planned for
  // March 2027 can be entered in November 2026).
  const monthOptions = upcomingMonthOptions(18);
  // Briefs saved with the old "month number only" format: map to a full option.
  const airMonthValue = /^\d{1,2}$/.test(form.airMonth || '')
    ? (monthOptions.find((o) => parseInt(o.value.slice(5), 10) === parseInt(form.airMonth, 10)) || {}).value || ''
    : form.airMonth;

  const summaryParts = ['1x hoofdspot (' + form.hoofdspotLength + '″)'];
  if (form.needsVariations) {
    const n = parseInt(form.variationsCount, 10) || 1;
    summaryParts.push((n === 1 ? '1x variatie' : n + 'x variaties') + ' (' + form.hoofdspotLength + '″)');
  }

  return (
    <StepShell briefId={id} current={2} brief={brief} bigNum="02" kicker="Wat we gaan opleveren" title="Jouw commercial" hint="Dit bepaalt hoeveel bestanden TFA straks aanlevert." backHref={`/brief/${id}/contact`} backLabel="Terug naar je gegevens">
      <div className="field-grid">
        {!hide.includes('impressions') && (
        <div>
          <label className="field-label">Aantal impressies</label>
          <input
            type="text"
            inputMode="text"
            maxLength={30}
            value={form.impressionsRaw}
            placeholder="Bijv. 250.000, 500k of 1,5 miljoen"
            onChange={(e) => update({ impressionsRaw: e.target.value })}
          />
          {form.impressionsRaw.trim() && parsedImpressions.ok && (
            <div style={{ fontSize: 12, color: '#1D7A46', marginTop: 5 }}>
              We lezen dit als <b>{formatNumberNl(parsedImpressions.value)}</b> impressies.
            </div>
          )}
          {form.impressionsRaw.trim() && !parsedImpressions.ok && (
            <div style={{ fontSize: 11.5, color: '#C2513F', marginTop: 5 }}>
              Dat kunnen we niet goed lezen. Typ bijvoorbeeld 250.000, 500k of 1,5 miljoen.
            </div>
          )}
          {!form.impressionsRaw.trim() && (
            <div className="hint" style={{ marginTop: 5 }}>
              Typ het gewoon zoals jij het schrijft: met punten (250.000), als 500k of als 1,5 miljoen. Weet je het nog niet precies? Geef dan een schatting.
            </div>
          )}
        </div>
        )}
        <div>
          <label className="field-label">Lengte van de hoofdspot</label>
          <select value={form.hoofdspotLength} onChange={(e) => update({ hoofdspotLength: e.target.value })}>
            <option value="20">20 seconden</option>
            <option value="25">25 seconden</option>
          </select>
        </div>
      </div>

      {!hide.includes('variations') && (
      <div style={{ marginTop: 20 }}>
        <label className="field-label" style={{ marginBottom: 3 }}>Zijn er ook variaties nodig van de hoofdspot?</label>
        <div className="hint" style={{ marginBottom: 7 }}>
          Dezelfde commercial, maar met bijvoorbeeld een ander product, filiaal of woord: geen aparte, kortere versie. Wat er
          precies moet verschillen vragen we je pas zodra je het script hebt goedgekeurd.
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className={'seg-btn' + (form.needsVariations === true ? ' selected' : '')}
            onClick={() => update({ needsVariations: true, variationsCount: form.variationsCount !== '0' ? form.variationsCount : '1' })}
          >
            Ja
          </button>
          <button
            type="button"
            className={'seg-btn' + (form.needsVariations === false ? ' selected' : '')}
            onClick={() => update({ needsVariations: false })}
          >
            Nee
          </button>
        </div>
        {form.needsVariations && (
          <div style={{ marginTop: 12 }}>
            <label className="field-label" style={{ marginBottom: 6 }}>Hoeveel variaties heb je nodig?</label>
            <input
              type="number"
              min={1}
              max={MAX_VARIATIONS_COUNT}
              step={1}
              value={form.variationsCount}
              style={{ maxWidth: 140 }}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') { update({ variationsCount: '' }); return; }
                const n = Math.max(1, Math.min(MAX_VARIATIONS_COUNT, parseInt(raw, 10) || 1));
                update({ variationsCount: String(n) });
              }}
            />
            <div className="hint" style={{ marginTop: 6 }}>Ook 10 of meer variaties kan, TFA schaalt gewoon mee.</div>
          </div>
        )}
      </div>

      )}

      <div className="box" style={{ marginTop: 16, background: '#E6C858', border: '2px solid #000', color: '#383209', fontSize: 12.5, lineHeight: 1.5 }}>
        TFA levert op:<br />
        <b>{summaryParts.join(' + ')}</b>
      </div>

      {!hide.includes('airDate') && (
      <div style={{ marginTop: 24 }}>
        <label className="field-label">Eerste uitzenddatum</label>
        <div className="hint" style={{ marginBottom: 7 }}>Staat de live-datum nog niet vast? Geen probleem. Geef een schatting of alleen een maand; TFA stemt de definitieve datum later met je af.</div>
        <input
          type="date"
          min={todayISO}
          value={form.dateUnknown ? '' : form.airDate}
          disabled={form.dateUnknown}
          style={{ background: form.dateUnknown ? '#ECE9E1' : '#FFFFFF' }}
          onChange={(e) => update({ airDate: e.target.value })}
        />
        <label className="check" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={form.dateUnknown}
            onChange={(e) => update({ dateUnknown: e.target.checked, airDate: e.target.checked ? '' : form.airDate })}
          />
          Dit weet ik nog niet
        </label>
        {form.dateUnknown && (
          <div className="box" style={{ marginTop: 10 }}>
            <div className="hint" style={{ marginBottom: 8 }}>Geen probleem, geef ons dan in elk geval een maand, zodat we het project goed kunnen inplannen. Ook een maand volgend jaar kan.</div>
            <label className="field-label">Welke maand ongeveer?</label>
            <select value={airMonthValue} onChange={(e) => update({ airMonth: e.target.value })}>
              <option value="">Kies een maand</option>
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      )}

      <div style={{ marginTop: 22, paddingTop: 22, borderTop: '1px solid #EAE7DE', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {!canContinue && (
          <div style={{ fontSize: 12, color: '#8C8880' }}>
            {!impressionsValid
              ? 'Vul hierboven een aantal impressies in dat we kunnen lezen (bijv. 250.000 of 500k), of laat het leeg.'
              : 'Vul hierboven een geldig aantal variaties in om verder te gaan.'}
          </div>
        )}
        <button type="button" className="btn-primary" style={{ minWidth: 320, flex: 'none', whiteSpace: 'nowrap', padding: '14px 26px' }} onClick={next} disabled={!canContinue}>
          {returnToOverview ? 'Terug naar overzicht' : 'Volgende: verder naar je brief'}
        </button>
      </div>
    </StepShell>
  );
}
