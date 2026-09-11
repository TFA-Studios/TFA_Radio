'use client';

import { useEffect, useState } from 'react';
import StepShell from '../../../../components/StepShell';
import Preloader from '../../../../components/Preloader';
import useMinDelay from '../../../../components/useMinDelay';
import { useBrief } from '../../../../components/useBrief';
import { MONTH_NAMES_LOWER, variationsCountOf, PRODUCTION_STATUS_LABELS } from '../../../../components/flowData';
import { diffWords, hasDiff, DiffPreview } from '../../../../components/textDiff';

function parseVariationScripts(brief) {
  try {
    const parsed = brief && brief.variationScripts ? JSON.parse(brief.variationScripts) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

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

// Step 7 — mirrors public/overview.html. CRITICAL: this is the ONLY place
// in the whole flow that sends {submitted:true} — no other step may ever
// send it, since that flag means "the whole 7-step flow is done, fire the
// confirmation email".
export default function OverviewPage({ params }) {
  const { id } = params;
  const { brief, loading, patch } = useBrief(id);
  const showLoader = useMinDelay(loading, 700);
  const [consentChecked, setConsentChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [voicesPool, setVoicesPool] = useState([]);
  const [tracksPool, setTracksPool] = useState([]);

  useEffect(() => {
    setConsentChecked(false);
  }, [id]);

  // The brief only stores the chosen voice/track ids + labels, not their
  // audioUrl — fetch the full library records once so the overview can play
  // a preview of what the client actually picked, same as the voice/music
  // steps do.
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch('/api/library/voices'), fetch('/api/library/tracks')])
      .then(async ([vRes, tRes]) => {
        const [v, t] = await Promise.all([vRes.json(), tRes.json()]);
        if (!cancelled) {
          setVoicesPool(Array.isArray(v) ? v : []);
          setTracksPool(Array.isArray(t) ? t : []);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (showLoader) return <Preloader />;

  if (!brief) {
    return (
      <StepShell briefId={id} current={7} brief={null} bigNum="07" kicker="Jouw mandje" title="Alles op een rij">
        <div style={{ background: '#FBF3F1', border: '1px solid #C2513F', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, color: '#C2513F' }}>
          Geen brief gevonden bij deze link.
        </div>
      </StepShell>
    );
  }

  const companyName = brief.companyName && brief.companyName.trim() ? brief.companyName : 'Nog geen bedrijfsnaam';
  let additionalContacts = [];
  try {
    const parsedContacts = brief.additionalContacts ? JSON.parse(brief.additionalContacts) : [];
    if (Array.isArray(parsedContacts)) additionalContacts = parsedContacts.filter((c) => c && (c.name || c.email));
  } catch (e) {
    additionalContacts = [];
  }
  const spotLength = brief.hoofdspotLength || '20';
  const mainText = brief.editedScript !== null && brief.editedScript !== undefined ? brief.editedScript : brief.generatedScript || '';
  const variationCount = variationsCountOf(brief);
  const variationScripts = parseVariationScripts(brief);
  const voiceLabel = brief.selectedVoiceLabel || '';
  const voiceTags = brief.selectedVoiceTags ? brief.selectedVoiceTags.split(',').filter(Boolean) : [];
  let selectedTracks = [];
  try {
    selectedTracks = brief.selectedTracks ? JSON.parse(brief.selectedTracks) : [];
    if (!Array.isArray(selectedTracks)) selectedTracks = [];
  } catch (e) {}

  const hasTracks = selectedTracks.length > 0;
  const matchedVoice = brief.selectedVoiceId ? voicesPool.find((v) => v.id === brief.selectedVoiceId) : null;
  const briefReady = !!(brief.editedScript || brief.generatedScript) && !!brief.selectedVoiceId && hasTracks;

  async function submit() {
    if (!briefReady || !consentChecked) return;
    setSubmitting(true);
    await patch({ submitted: true });
    setSubmitting(false);
  }

  if (brief.submittedAt) {
    const nextSteps = [
      { n: '1', label: 'Opname', detail: 'De stem neemt jouw script in de studio op.' },
      { n: '2', label: 'Montage & mix', detail: 'Stem, muziek en eventuele varianten worden samengevoegd.' },
      {
        n: '3', label: 'Review & goedkeuring',
        detail: 'Zodra er een eerste versie klaarstaat, ontvang je een e-mail met een link om ‘m te beluisteren, feedback te geven of goed te keuren.',
      },
      { n: '4', label: 'Levering', detail: 'Na jouw goedkeuring ontvang je de eindbestanden, klaar voor uitzending.' },
    ];
    // One always-visible "status" line + button to the review page — not
    // conditional on whether a round exists yet, deliberately: a client
    // shouldn't have to reason about why a box appears/disappears. The
    // review page itself (app/brief/[id]/review) already handles "nothing
    // shared yet" gracefully, so this can just always point there. Not
    // everyone notices/keeps the one review-ready email either, and this
    // overview page (keyed by the brief's own id) is the one link a client
    // is likely to hold onto, so it doubles as a reliable way back in.
    const statusLabel = PRODUCTION_STATUS_LABELS[brief.productionStatus || ''] || 'Nog niet gestart';
    const statusHint = brief.productionStatus === 'awaiting_review'
      ? 'Er staat een versie klaar om te beluisteren.'
      : brief.productionStatus === 'in_revision'
      ? 'TFA verwerkt je laatste feedback.'
      : brief.productionStatus === 'approved'
      ? 'Je hebt de laatste versie goedgekeurd — TFA rondt de levering af.'
      : 'Zodra er een eerste versie klaarstaat, kun je hem hier beluisteren en beoordelen.';
    return (
      <StepShell briefId={id} current={7} brief={brief} bigNum="07" kicker="Verzonden naar TFA" title={'Bedankt, ' + companyName + '!'}>
        <div
          style={{
            background: '#FBF9EC', border: '1.5px solid #E6C858', borderRadius: 16, padding: '32px 34px',
            boxShadow: '0 10px 32px rgba(230,200,88,.22)', marginBottom: 22,
          }}
        >
          <div
            style={{
              width: 56, height: 56, borderRadius: '50%', background: '#E6C858', color: '#1D1D1D',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
              fontSize: 24, fontWeight: 700, boxShadow: '0 6px 18px rgba(230,200,88,.4)',
            }}
          >
            ✓
          </div>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: '#383209', margin: '0 0 6px', fontWeight: 500, maxWidth: 640 }}>
            Je radiocommercial is succesvol verzonden naar TFA.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#5C5850', margin: 0, maxWidth: 640 }}>
            Je ontvangt zo een bevestiging per e-mail met een overzicht van al je keuzes — daarin kun je ook altijd
            reageren als er nog iets aangepast moet worden.
          </p>
        </div>

        <div style={{ marginBottom: 8, fontSize: 12.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8C8880' }}>
          Wat gebeurt er nu?
        </div>
        <div style={{ display: 'flex', gap: 14, marginBottom: 8 }} className="tfa-nextsteps-row">
          {nextSteps.map((s) => (
            <div key={s.n} style={{ flex: 1, background: '#FFFFFF', border: '1px solid #EEECE3', borderRadius: 12, padding: '18px 18px' }}>
              <div
                style={{
                  width: 26, height: 26, borderRadius: '50%', border: '1.5px solid #E6C858', color: '#8C6D1F',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, marginBottom: 10,
                }}
              >
                {s.n}
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1D1D1D', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: '#8C8880' }}>{s.detail}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 18, background: '#FBF9EC', border: '1.5px solid #E6C858', borderRadius: 14, padding: '20px 22px',
            boxShadow: '0 6px 20px rgba(230,200,88,.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 16, flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8C6D1F', marginBottom: 4 }}>
              Status: {statusLabel}
            </div>
            <div style={{ fontSize: 14, color: '#5C5850' }}>{statusHint}</div>
          </div>
          <a
            href={`/brief/${id}/review`}
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', whiteSpace: 'nowrap', padding: '13px 22px', flex: 'none' }}
          >
            Bekijk status en review
          </a>
        </div>

        <div style={{ marginTop: 22, paddingTop: 22, borderTop: '1px solid #EAE7DE', display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <a
            href="/"
            style={{
              display: 'inline-flex', alignItems: 'center', border: '1px solid #C9C5B9', borderRadius: 10, background: 'transparent',
              color: '#5C5850', fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 600, fontSize: 13.5,
              padding: '12px 22px', textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            Terug naar de homepage
          </a>
          <a
            href="/start"
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', whiteSpace: 'nowrap', padding: '13px 22px' }}
          >
            Nog een commercial aanvragen
          </a>
        </div>

        <style jsx>{`
          @media (max-width: 640px) {
            .tfa-nextsteps-row { flex-direction: column !important; }
          }
        `}</style>
      </StepShell>
    );
  }

  // Three sizes of the same "box on its own" card, so the review reads as a
  // hierarchy instead of a flat stack of identical blocks: the admin-y
  // details (contact/delivery) are compact and side by side, the actual
  // creative deliverable (script) is the visual centerpiece with a bigger
  // heading and a soft gold glow, and stem/muziek sit in between — full
  // width like the script (so a single card never dead-ends halfway across
  // the row the way "Stem" used to when it had no partner card beside it).
  const cardBase = { background: '#FBF9EC', border: '1.5px solid #EAE3C4', borderLeft: '4px solid #E6C858', borderRadius: '4px 14px 14px 4px' };
  const compactCardStyle = { ...cardBase, padding: '16px 18px', marginBottom: 14 };
  const standardCardStyle = { ...cardBase, padding: '22px 24px', marginBottom: 14 };
  const featureCardStyle = {
    ...cardBase, padding: '30px 32px', marginBottom: 18,
    border: '1.5px solid #E6C858', borderLeft: '5px solid #E6C858',
    boxShadow: '0 6px 24px rgba(230,200,88,.22)',
  };
  const compactHeaderStyle = { fontSize: 13.5, fontWeight: 600, color: '#5C5850' };
  const standardHeaderStyle = { fontSize: 16, fontWeight: 600 };
  const featureHeaderStyle = { fontSize: 19, fontWeight: 700 };

  return (
    <StepShell briefId={id} current={7} brief={brief} bigNum="07" kicker="Jouw mandje" title="Alles op een rij" hint="Het script, de stem en de muziek die je hebt gekozen — dit is wat TFA gaat opnemen en produceren." backHref={`/brief/${id}/music`} backLabel="Terug naar de muziek">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }} className="tfa-overview-grid">
        <div style={compactCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={compactHeaderStyle}>Jouw gegevens</div>
            <a href={`/brief/${id}/contact`} style={{ fontSize: 11, fontWeight: 600, textDecoration: 'underline' }}>Wijzig</a>
          </div>
          <div style={{ fontSize: 13, marginTop: 9 }}>{companyName}</div>
          <div style={{ fontSize: 13, marginTop: 2, color: brief.contactPerson ? '#1D1D1D' : '#9C9890' }}>{brief.contactPerson || 'Nog geen contactpersoon opgegeven'}</div>
          <div style={{ fontSize: 13, marginTop: 2, color: brief.contactEmail ? '#1D1D1D' : '#9C9890' }}>{brief.contactEmail || 'Nog geen e-mailadres opgegeven'}</div>
          {additionalContacts.map((c, i) => (
            <div key={i} style={{ fontSize: 12.5, marginTop: 6, paddingTop: 6, borderTop: '1px solid #EEECE3', color: '#5C5850' }}>
              {(c.name || 'Extra contactpersoon')}{c.email ? ' — ' + c.email : ''}
            </div>
          ))}
        </div>

        <div style={compactCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={compactHeaderStyle}>Levering</div>
            <a href={`/brief/${id}/delivery`} style={{ fontSize: 11, fontWeight: 600, textDecoration: 'underline' }}>Wijzig</a>
          </div>
          <div style={{ fontSize: 13, marginTop: 9 }}>Hoofdspot · {spotLength}″{variationCount > 0 ? (variationCount === 1 ? ' + 1 variatie' : ` + ${variationCount} variaties`) : ''}</div>
          <div style={{ fontSize: 13, marginTop: 2 }}>{formatImpressions(brief)}</div>
          <div style={{ fontSize: 13, marginTop: 2 }}>Eerste uitzending: {formatAirDate(brief)}</div>
        </div>

        <div style={{ ...featureCardStyle, gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={featureHeaderStyle}>Script · hoofdspot {spotLength}″</div>
            <a href={`/brief/${id}/script`} style={{ fontSize: 11, fontWeight: 600, textDecoration: 'underline' }}>Wijzig</a>
          </div>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: mainText ? 'italic' : 'normal', fontSize: 17.5, lineHeight: 1.7, marginTop: 16, color: mainText ? '#1D1D1D' : '#9C9890' }}>
            {mainText || 'Nog geen script goedgekeurd.'}
          </div>
          {variationCount > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #EAE3C4' }}>
              {Array.from({ length: variationCount }).map((_, idx) => {
                const varText = variationScripts[idx] !== undefined ? variationScripts[idx] : mainText;
                const tokens = diffWords(mainText, varText);
                const changed = hasDiff(tokens);
                return (
                  <div key={idx} style={{ marginTop: idx === 0 ? 0 : 14 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#5C5850', textTransform: 'uppercase' }}>
                      {variationCount > 1 ? `Variatie ${idx + 1}` : 'Variatie'}{changed ? ' — wat verschilt' : ''}
                    </div>
                    {changed ? (
                      <div style={{ fontSize: 15, lineHeight: 1.7, marginTop: 6 }}>
                        <DiffPreview tokens={tokens} />
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: '#8C8880', marginTop: 6, fontStyle: 'italic' }}>
                        Nog identiek aan het hoofdscript.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ ...standardCardStyle, gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={standardHeaderStyle}>Stem</div>
            <a href={`/brief/${id}/voice`} style={{ fontSize: 11, fontWeight: 600, textDecoration: 'underline' }}>Wijzig</a>
          </div>
          {voiceLabel ? (
            <>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 10, color: '#1D1D1D' }}>{voiceLabel}</div>
              {voiceTags.length > 0 && <div style={{ fontSize: 12.5, color: '#5C5850', marginTop: 3 }}>{voiceTags.join(', ')}</div>}
            </>
          ) : (
            <div style={{ fontSize: 13, marginTop: 9, color: '#9C9890' }}>Nog geen stem gekozen.</div>
          )}
          {voiceLabel && (
            matchedVoice && matchedVoice.audioUrl ? (
              <audio controls src={matchedVoice.audioUrl} style={{ width: '100%', height: 34, marginTop: 10 }} />
            ) : (
              <div style={{ fontSize: 11.5, color: '#9C9890', marginTop: 8, fontStyle: 'italic' }}>Geen audio beschikbaar voor deze stem.</div>
            )
          )}
        </div>

        <div style={{ ...standardCardStyle, gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={standardHeaderStyle}>Muziek</div>
            <a href={`/brief/${id}/music`} style={{ fontSize: 11, fontWeight: 600, textDecoration: 'underline' }}>Wijzig</a>
          </div>
          {hasTracks ? (
            <>
              {selectedTracks.map((t, i) => {
                const matchedTrack = tracksPool.find((pt) => pt.id === t.id);
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, padding: '8px 10px', background: '#FBF0C8', borderRadius: 8 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#E6C858', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: '#1D1D1D' }}>{t.title}</div>
                      <div style={{ fontSize: 12.5, color: '#5C5850', marginTop: 2 }}>{t.artist}{t.artist && t.playlistName ? ' · ' : ''}{t.playlistName}</div>
                      {matchedTrack && matchedTrack.audioUrl ? (
                        <audio controls src={matchedTrack.audioUrl} style={{ width: '100%', height: 32, marginTop: 6 }} />
                      ) : (
                        <div style={{ fontSize: 11, color: '#8C8880', marginTop: 4, fontStyle: 'italic' }}>Geen audio beschikbaar voor deze track.</div>
                      )}
                    </div>
                  </div>
                );
              })}
              {selectedTracks.length > 1 && <div style={{ fontSize: 11, color: '#8C8880', marginTop: 8 }}>TFA combineert er één van deze met de gekozen stem tot de definitieve mix.</div>}
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#9C9890' }}>Nog geen track gekozen.</div>
          )}
        </div>
      </div>

      <div className="box" style={{ background: '#F7F6F1', border: '1.5px solid #E3E0D5', borderRadius: 14, padding: '18px 20px', marginTop: 22 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>Voorwaarden</div>
        <ul style={{ margin: '9px 0 0', paddingLeft: 18, fontSize: 12, lineHeight: 1.6, color: '#5C5850' }}>
          <li style={{ marginBottom: 6 }}>Het gebruiksrecht op de gekozen voice-over en muziek geldt uitsluitend voor deze specifieke productie, zonder recht op verlenging of hergebruik in toekomstige producties.</li>
          <li style={{ marginBottom: 6 }}>Brengt de klant na goedkeuring en opname van het script alsnog wijzigingen aan, dan worden de kosten van de daaruit voortvloeiende heropname(s) apart in rekening gebracht.</li>
          <li>TFA aanvaardt geen aansprakelijkheid voor vertraging in de levering wanneer deze het gevolg is van het uitblijven van tijdige goedkeuring of feedback van de klant.</li>
        </ul>
      </div>

      <div
        style={{
          marginTop: 22, display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', padding: '14px 16px',
          borderRadius: 10, border: '1.5px solid ' + (consentChecked ? '#E6C858' : '#EAE3C4'), background: consentChecked ? '#FBF9EC' : '#FCFBF7',
        }}
        onClick={() => setConsentChecked((c) => !c)}
      >
        <div style={{ flex: 'none', width: 18, height: 18, marginTop: 1, borderRadius: 5, border: '1.5px solid ' + (consentChecked ? '#E6C858' : '#C9C5B9'), background: consentChecked ? '#E6C858' : '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {consentChecked ? '✓' : ''}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>Nodig om te versturen</span>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: '#8C6D1F', background: 'rgba(230,200,88,.28)', borderRadius: 4, padding: '2px 6px' }}>Verplicht</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.55, color: '#5C5850' }}>
            Ik geef TFA het groene licht om dit script, deze stem en deze muziek in productie te nemen — en om deze gegevens
            (inclusief het gebruikelijke cookie- en trackingwerk) te gebruiken om dit traject soepel te laten verlopen.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, paddingTop: 22, borderTop: '1px solid #EAE7DE', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {briefReady && !consentChecked && <div style={{ fontSize: 12, color: '#B08900', fontWeight: 500 }}>↑ Vink het vakje hierboven aan om te versturen</div>}
        <button type="button" className="btn-primary" style={{ minWidth: 320, flex: 'none', whiteSpace: 'nowrap', padding: '14px 26px' }} disabled={!briefReady || !consentChecked || submitting} onClick={submit}>
          Bevestigen en versturen naar TFA
        </button>
      </div>

      <style jsx>{`
        @media (max-width: 700px) {
          .tfa-overview-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </StepShell>
  );
}
