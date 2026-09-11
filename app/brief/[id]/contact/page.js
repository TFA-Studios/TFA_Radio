'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StepShell from '../../../../components/StepShell';
import Preloader from '../../../../components/Preloader';
import useMinDelay from '../../../../components/useMinDelay';
import { useBrief } from '../../../../components/useBrief';

// Step 1 — mirrors public/contact.html.
export default function ContactPage({ params }) {
  const { id } = params;
  const router = useRouter();
  const { brief, loading, schedulePatch, flushPending, patch } = useBrief(id);
  const showLoader = useMinDelay(loading, 700);
  const [form, setForm] = useState({ companyName: '', contactPerson: '', contactEmail: '', additionalContacts: [] });
  // Set the instant the client clicks "Volgende" — before the save even
  // starts — so the preloader takes over immediately instead of the client
  // sitting on the current page while the autosave/patch call is in flight.
  // Without this there was a visible beat of "something's happening but
  // it's not the preloader" before the real one-and-only preloader kicked
  // in on the next page.
  const [navigating, setNavigating] = useState(false);

  // Hydrate local form state from the fetched brief ONLY once, on first
  // load — not on every subsequent `brief` update. patch() also calls
  // setBrief() with the server's echoed row after every autosave, and this
  // effect used to depend on the whole `brief` object, so it re-ran on every
  // save and stomped the form with whatever had been sent moments earlier —
  // dropping/glitching characters typed in the interim, and (worse, on other
  // steps) resetting local UI state derived from the brief. Depending on the
  // id instead of the object means it only fires once per brief.
  useEffect(() => {
    if (brief) {
      let additionalContacts = [];
      try {
        const parsed = brief.additionalContacts ? JSON.parse(brief.additionalContacts) : [];
        if (Array.isArray(parsed)) additionalContacts = parsed.map((c) => ({ name: (c && c.name) || '', email: (c && c.email) || '' }));
      } catch (e) {
        additionalContacts = [];
      }
      setForm({
        companyName: brief.companyName || '',
        contactPerson: brief.contactPerson || '',
        contactEmail: brief.contactEmail || '',
        additionalContacts,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief && brief.id]);

  function update(field, value) {
    const next = { ...form, [field]: value };
    setForm(next);
    schedulePatch({ [field]: value });
  }

  // Extra contact people beyond the primary contactPerson/contactEmail above
  // — stored as a JSON string on the brief (additionalContacts) so the
  // submission confirmation email can go to everyone once the brief is
  // sent, not just the first person (see lib/email.js's recipientsFor()).
  function addContact() {
    const next = [...form.additionalContacts, { name: '', email: '' }];
    setForm((f) => ({ ...f, additionalContacts: next }));
    schedulePatch({ additionalContacts: JSON.stringify(next) });
  }

  function updateContact(index, field, value) {
    const next = form.additionalContacts.map((c, i) => (i === index ? { ...c, [field]: value } : c));
    setForm((f) => ({ ...f, additionalContacts: next }));
    schedulePatch({ additionalContacts: JSON.stringify(next) });
  }

  function removeContact(index) {
    const next = form.additionalContacts.filter((_, i) => i !== index);
    setForm((f) => ({ ...f, additionalContacts: next }));
    schedulePatch({ additionalContacts: JSON.stringify(next) });
  }

  // Required before advancing — without this, a blank company name/contact
  // sails through every later step and shows up on the thank-you page as
  // "Bedankt, Nog geen bedrijfsnaam!", and a blank/invalid contactEmail
  // means the submission confirmation silently has nowhere to send (see
  // lib/email.js's recipientsFor()) with no error surfaced anywhere.
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim());
  const canContinue = !!form.companyName.trim() && !!form.contactPerson.trim() && emailLooksValid;

  async function next() {
    if (!canContinue) return;
    setNavigating(true);
    flushPending();
    await patch({ ...form, additionalContacts: JSON.stringify(form.additionalContacts) });
    router.push(`/brief/${id}/delivery`);
  }

  if (showLoader || navigating) return <Preloader />;

  return (
    <StepShell briefId={id} current={1} brief={brief} bigNum="01" kicker="Wie ben je" title="Jouw gegevens" backHref="/" backLabel="Terug naar de homepage" showWipe>
      <div className="field-grid">
        <div className="full">
          <label className="field-label">Bedrijfsnaam</label>
          <input type="text" value={form.companyName} placeholder="Bijv. Jouw Bedrijfsnaam" onChange={(e) => update('companyName', e.target.value)} />
        </div>
        <div>
          <label className="field-label">Contactpersoon</label>
          <input type="text" value={form.contactPerson} placeholder="Voor- en achternaam" onChange={(e) => update('contactPerson', e.target.value)} />
        </div>
        <div>
          <label className="field-label">E-mailadres</label>
          <input type="text" value={form.contactEmail} placeholder="naam@bedrijf.nl" onChange={(e) => update('contactEmail', e.target.value)} />
        </div>
      </div>

      {/* Extra contact people — the confirmation email once the brief is
          submitted goes to all of them, not just the primary contact above. */}
      <div style={{ marginTop: 24 }}>
        {form.additionalContacts.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">{i === 0 ? 'Extra contactpersoon' : `Extra contactpersoon ${i + 1}`}</label>
              <input type="text" value={c.name} placeholder="Voor- en achternaam" onChange={(e) => updateContact(i, 'name', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="field-label">E-mailadres</label>
              <input type="text" value={c.email} placeholder="naam@bedrijf.nl" onChange={(e) => updateContact(i, 'email', e.target.value)} />
            </div>
            <button
              type="button"
              onClick={() => removeContact(i)}
              aria-label="Verwijder contactpersoon"
              style={{
                flex: 'none', width: 38, height: 38, borderRadius: 8, border: '1px solid #C9C5B9', background: '#FFFFFF',
                color: '#8C8880', fontSize: 16, cursor: 'pointer', lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addContact}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px dashed #C9C5B9', borderRadius: 8,
            background: 'transparent', color: '#5C5850', fontSize: 12.5, fontWeight: 600, padding: '9px 14px', cursor: 'pointer',
          }}
        >
          + Nog een contactpersoon toevoegen
        </button>
      </div>

      <div style={{ marginTop: 36, paddingTop: 22, borderTop: '1px solid #EAE7DE', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {!canContinue && (
          <div style={{ fontSize: 12, color: '#8C8880' }}>
            Vul je bedrijfsnaam, contactpersoon en een geldig e-mailadres in om verder te gaan.
          </div>
        )}
        <button
          type="button"
          className="btn-primary"
          style={{ minWidth: 320, flex: 'none', whiteSpace: 'nowrap', padding: '14px 26px' }}
          onClick={next}
          disabled={!canContinue}
        >
          Volgende — verder naar je commercial
        </button>
      </div>
    </StepShell>
  );
}
