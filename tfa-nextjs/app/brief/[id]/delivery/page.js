'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StepShell from '../../../../components/StepShell';
import Preloader from '../../../../components/Preloader';
import useMinDelay from '../../../../components/useMinDelay';
import { useBrief } from '../../../../components/useBrief';
import { MONTH_NAMES } from '../../../../components/flowData';

const VARIATION_COUNT_OPTIONS = ['1', '2', '3', '4', '5', '6'];

// Step 2 — mirrors public/delivery.html.
export default function DeliveryPage({ params }) {
  const { id } = params;
  const router = useRouter();
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
    impressionsCustom: '',
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
        impressionsCustom: brief.impressionsCustom || '',
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
    schedulePatch(patchObj);
  }

  async function next() {
    setNavigating(true);
    flushPending();
    await patch(form);
    router.push(`/brief/${id}/details`);
  }

  if (showLoader || navigating) return <Preloader />;

  const todayISO = new Date().toISOString().slice(0, 10);
  const currentMonth = new Date().getMonth() + 1;
  const monthOptions = [];
  for (let m = currentMonth; m <= 12; m++) monthOptions.push({ value: String(m), label: MONTH_NAMES[m - 1] });

  const summaryParts = ['1x hoofdspot (' + form.hoofdspotLength + '″)'];
  if (form.needsVariations) {
    const n = parseInt(form.variationsCount, 10) || 1;
    summaryParts.push((n === 1 ? '1x variatie' : n + 'x variaties') + ' (' + form.hoofdspotLength + '″)');
  }

  return (
    <StepShell briefId={id} current={2} brief={brief} bigNum="02" kicker="Wat we gaan opleveren" title="Jouw commercial" hint="Dit bepaalt hoeveel bestanden TFA straks aanlevert." backHref={`/brief/${id}/contact`} backLabel="Terug naar je gegevens">
      <div className="field-grid">
        <div>
          <label className="field-label">Aantal impressies</label>
          <select value={form.impressions} onChange={(e) => update({ impressions: e.target.value })}>
            <option value="">Kies een aantal</option>
            <option value="25000">25.000</option>
            <option value="50000">50.000</option>
            <option value="100000">100.000</option>
            <option value="150000">150.000</option>
            <option value="250000">250.000</option>
            <option value="500000">500.000</option>
            <option value="meer">Meer dan 500.000</option>
          </select>
          {form.impressions === 'meer' && (
            <div style={{ marginTop: 10 }}>
              <label className="field-label">Hoeveel ongeveer?</label>
              <input type="text" value={form.impressionsCustom} placeholder="Bijv. 750.000" onChange={(e) => update({ impressionsCustom: e.target.value })} />
            </div>
          )}
        </div>
        <div>
          <label className="field-label">Lengte van de hoofdspot</label>
          <select value={form.hoofdspotLength} onChange={(e) => update({ hoofdspotLength: e.target.value })}>
            <option value="20">20 seconden</option>
            <option value="25">25 seconden</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <label className="field-label" style={{ marginBottom: 3 }}>Zijn er ook variaties nodig van de hoofdspot?</label>
        <div className="hint" style={{ marginBottom: 7 }}>
          Dezelfde commercial, maar met bijvoorbeeld een ander product, filiaal of woord — geen aparte, kortere versie. Wat er
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
            <div style={{ display: 'flex', gap: 6 }}>
              {VARIATION_COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={'seg-btn' + (form.variationsCount === n ? ' selected' : '')}
                  onClick={() => update({ variationsCount: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="box" style={{ marginTop: 16, background: '#E6C858', border: '2px solid #000', color: '#383209', fontSize: 12.5, lineHeight: 1.5 }}>
        TFA levert op:<br />
        <b>{summaryParts.join(' + ')}</b>
      </div>

      <div style={{ marginTop: 24 }}>
        <label className="field-label">Eerste uitzenddatum</label>
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
            <div className="hint" style={{ marginBottom: 8 }}>Geen probleem — geef ons dan in elk geval een maand, zodat we het project goed kunnen inplannen.</div>
            <label className="field-label">Welke maand ongeveer?</label>
            <select value={form.airMonth} onChange={(e) => update({ airMonth: e.target.value })}>
              <option value="">Kies een maand</option>
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>


      <div style={{ marginTop: 22, paddingTop: 22, borderTop: '1px solid #EAE7DE', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn-primary" style={{ minWidth: 320, flex: 'none', whiteSpace: 'nowrap', padding: '14px 26px' }} onClick={next}>
          Volgende — verder naar je brief
        </button>
      </div>
    </StepShell>
  );
}
