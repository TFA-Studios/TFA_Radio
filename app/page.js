import Link from 'next/link';
import SpotFlowLogo from '../components/SpotFlowLogo';
import BrandWave from '../components/BrandWave';
import StudioCarousel from '../components/StudioCarousel';
import { InstagramIcon, LinkedInIcon, YouTubeIcon } from '../components/SocialIcons';

// Public marketing homepage — general layout/copy inspired by
// /tmp/canvas_work/Homepage.dc.html, wired to real routes (no data needed).
export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', background: '#DEDCD7' }}>
      {/* The diagonal-cut hero bottom (tried previously) is gone — the full-
          bleed video section below is now the "breaker" between the hero
          and the footer instead, so the hero goes back to a plain flat
          bottom edge. */}
      <div style={{ position: 'relative', background: '#1D1D1D', overflow: 'hidden' }}>
        <BrandWave />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <header style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <SpotFlowLogo size={30} variant="dark" />
            <Link href="/sign-in" style={{ fontSize: 13, fontWeight: 600, color: '#E6C858', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              Admin login →
            </Link>
          </header>

          {/* Sizes bumped up a step across the board (kicker/h1/paragraph) —
              next to the new full-bleed banner video below, the previous
              sizes read as thin/small by comparison; the original tfa.studio
              site runs its hero type noticeably bigger and bolder than this
              did, which is the proportion this now matches. */}
          <main style={{ maxWidth: 940, margin: '60px auto 0', padding: '0 20px 90px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, letterSpacing: '.09em', textTransform: 'uppercase', color: '#E6C858', fontWeight: 600 }}>Commercials, zonder gedoe</div>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: 64, lineHeight: 1.08, margin: '20px 0 22px', color: '#FBF9EC' }}>
              Van brief tot uitzending, in 7 simpele stappen.
            </h1>
            <p style={{ fontSize: 18.5, lineHeight: 1.6, color: '#DEDCD7', maxWidth: 660, margin: '0 auto 38px' }}>
              Vertel ons over je merk, je product en je doelgroep. TFA schrijft het script, kiest de stem en de muziek, en jij keurt
              alles goed voordat het de studio in gaat.
            </p>
            <Link
              href="/start"
              className="btn-primary tfa-cta-hero"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', width: 320, textAlign: 'center' }}
            >
              Start je commercial
              <span className="tfa-cta-arrow" aria-hidden="true">→</span>
            </Link>
            <div style={{ marginTop: 16, fontSize: 13, color: '#8C8880' }}>
              Geen account nodig: je krijgt direct je eigen brieflink.
            </div>
          </main>
        </div>
      </div>

      {/* The three-card "how it works" section used to spell out, in longer
          form, exactly what the hero paragraph above already says in one
          sentence — same three beats twice in a row before the client even
          reaches the button. Dropped entirely so the page reads as one
          clear pitch + one obvious action, instead of a pitch, a repeat of
          the pitch, then the action. */}

      {/* Studio photos section removed from the landing page for now (client
          didn't like how it looked through several iterations — cinematic
          crossfade, slide/peek, static side-by-side pair). StudioPhotoLoop
          component and the photo files are left in place, untouched, and
          the small version on the client status page (app/brief/[id]/
          review/page.js) is unaffected — just not rendered here anymore. */}

      {/* Photo carousel "breaker" between the hero and the footer — replaces
          the looping banner video that used to sit here (video file/section
          removed entirely; the carousel takes its exact spot, same
          full-bleed treatment and same capped height, so nothing about the
          surrounding layout had to change). Full-bleed: the
          `left: 50%; margin-left: -50vw` trick breaks it out of every
          ancestor's centered max-width so it spans the full browser width
          edge-to-edge, even though the rest of the page stays inside the
          usual 1180px-max container. Height capped via `.tfa-carousel-row`
          below (560px desktop / 260px mobile) — the same cap the video used,
          for the same reason: at this component's native photo aspect ratio,
          "100vw wide" alone would let it keep growing taller with the
          browser's width.

          PHOTOS — six distinct studio shots now exist in public/studio
          (studio-1..6). The first four (studio-1..4) were the original set;
          studio-5 (reception, the "TFA STUDIOS" glass-wall lobby with the
          curved wood-slat desk) and studio-6 (a dedicated red Dolby Atmos
          listening room — sofa, keyboard, ceiling-mounted surround speakers)
          were added 2026-09-24, confirmed genuinely new/distinct from the
          existing four (studio-1 looked similar in name only — it's Karim's
          own workstation desk, not this room).
          NOTE for Karim: studio-1's tag below still says "Dolby Atmos
          studio" from before studio-6 existed — now that there's a second,
          more literally-Atmos room (visible ceiling speaker array), you may
          want studio-1 relabeled to something like "Mixkamer" to avoid two
          "Dolby Atmos" tags in the same carousel. Left as-is for now rather
          than guessing which one should keep the name.
          TAGS deliberately describe the room, not the person at the desk
          (Karim asked for no names on the site) — "Dolby Atmos studio" /
          "Mixstudio" cover studio-1 / studio-2 without naming Karim/Marco.
          ORDER is arranged for visual variety rather than strictly
          "engineers first" — Karim left the exact arrangement up to us;
          reception opens the set (first impression of the building), the
          new Atmos room sits right after the existing one for contrast. */}
      <div style={{ position: 'relative', left: '50%', width: '100vw', marginLeft: '-50vw', overflow: 'hidden', background: '#1D1D1D' }}>
        <StudioCarousel
          intervalMs={3200}
          maxWidth="100%"
          borderRadius={20}
          images={[
            { src: '/studio/studio-5.jpg', alt: 'TFA Studio — receptie', tag: 'Receptie' },
            { src: '/studio/studio-3.jpg', alt: 'TFA Studio — controlekamer', tag: 'Controlekamer' },
            { src: '/studio/studio-1.jpg', alt: 'TFA Studio — Dolby Atmos studio', tag: 'Dolby Atmos studio' },
            { src: '/studio/studio-6.jpg', alt: 'TFA Studio — Dolby Atmos luisterkamer', tag: 'Dolby Atmos luisterkamer' },
            { src: '/studio/studio-4.jpg', alt: 'TFA Studio — opnamehokje', tag: 'Opnamehokje' },
            { src: '/studio/studio-2.jpg', alt: 'TFA Studio — mixstudio', tag: 'Mixstudio' },
          ]}
        />
      </div>

      {/* "Kom langs" / visit-the-studio section — sits between the carousel
          and the footer, same #1D1D1D background as both so the whole
          bottom of the page reads as one continuous dark close rather than
          a new card bolted on. Unchanged content-wise (address, map, "Route
          plannen") — the studio photo carousel that used to live at the
          bottom of this section has moved up to replace the banner video
          above instead (see the carousel block right before this one), so
          this section is back to just the "Kom langs" copy + map, with its
          own bottom padding restored now that it's no longer relying on the
          carousel's padding underneath it for spacing.
          — "Liever face to face?" sits on its own line above the bold
            headline (separate question + statement).
          — Map is the full right column, stretched (via grid
            `alignItems: stretch`) to match the exact height of the left
            column, top to bottom — its top edge lines up with "Kom langs",
            its bottom edge lines up with the "Route plannen" button. Real
            Google Maps embed (no API key needed for a basic place/search
            iframe). */}
      <section style={{ background: '#1D1D1D', padding: '72px 20px 80px', position: 'relative' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 48, alignItems: 'stretch' }} className="tfa-visit-columns">
            <div>
              <div style={{ fontSize: 13, letterSpacing: '.09em', textTransform: 'uppercase', color: '#E6C858', fontWeight: 600, marginBottom: 16 }}>
                Kom langs
              </div>
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 500, fontSize: 22, lineHeight: 1.3, color: '#B9B6AC', margin: '0 0 8px' }}>
                Liever face to face?
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: 38, lineHeight: 1.15, color: '#FBF9EC', margin: '0 0 24px' }}>
                Onze studio&apos;s staan voor je open.
              </h2>
              <p style={{ fontSize: 16, lineHeight: 1.65, color: '#B9B6AC', maxWidth: 420, margin: '0 0 26px' }}>
                Kom een kopje koffie drinken, neem een kijkje in onze studio&apos;s, of ga met ons team in gesprek over je volgende
                project — je bent altijd welkom in Amsterdam.
              </p>
              <div style={{ fontSize: 14, lineHeight: 1.7, color: '#B9B6AC', marginBottom: 26 }}>
                <strong style={{ color: '#FBF9EC', fontWeight: 600, display: 'block', marginBottom: 4 }}>TFA Studio</strong>
                Koivistokade 26A, 1013 BB Amsterdam
              </div>
              <a
                href="https://www.google.com/maps/dir/?api=1&destination=Koivistokade+26A,+1013+BB+Amsterdam"
                target="_blank"
                rel="noopener noreferrer"
                className="tfa-cta-hero"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#E6C858', color: '#1D1D1D', fontWeight: 600, fontSize: 14.5, padding: '13px 24px', borderRadius: 999, textDecoration: 'none' }}
              >
                Route plannen
                <span className="tfa-cta-arrow" aria-hidden="true">→</span>
              </a>
            </div>

            <div className="tfa-visit-map">
              <iframe
                title="TFA Studio op de kaart"
                src="https://www.google.com/maps?q=Koivistokade+26A,+1013+BB+Amsterdam&output=embed"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Footer rebuilt to match the original tfa.studio site's structure —
          dark background (the same #1D1D1D as the hero, not a separate
          white/beige card sitting on the page background) with several
          EVEN, same-aligned columns instead of the old two-column layout
          (one left-aligned block, one right-aligned/mirrored block), which
          is what read as "not quite symmetrical." All three columns below
          share the same left-aligned, top-anchored treatment. */}
      <footer style={{ background: '#1D1D1D' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 20px 40px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }} className="tfa-footer-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="tfa-footer-heading">Contact</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.7, color: '#B9B6AC' }}>
                Koivistokade 26A<br />
                1013 BB Amsterdam
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.9 }}>
                <a href="mailto:planning@tfa.studio" style={{ color: '#B9B6AC', textDecoration: 'none' }}>planning@tfa.studio</a><br />
                <a href="tel:+31850854777" style={{ color: '#B9B6AC', textDecoration: 'none' }}>+31 85 085 4777</a>
              </div>
            </div>

            {/* Truly centered — not just "left-aligned inside the middle
                grid track" (which reads as off-center relative to the whole
                footer, since the track's own left edge isn't the visual
                center). alignItems: 'center' + textAlign: 'center' centers
                both the heading and the links themselves within this
                column, so the column's content sits on the exact horizontal
                center of the footer, not just somewhere inside its cell. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', textAlign: 'center' }} className="tfa-footer-col-center">
              <div className="tfa-footer-heading">Snel naar</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, alignItems: 'center' }}>
                <Link href="/start" style={{ color: '#B9B6AC', textDecoration: 'none' }}>Start je commercial</Link>
                <Link href="/sign-in" style={{ color: '#B9B6AC', textDecoration: 'none' }}>Admin login</Link>
              </div>
            </div>

            {/* Pushed flush to the RIGHT edge of this column's own grid
                cell (alignItems: 'flex-end') rather than sitting at the
                cell's left edge the way every other column's content does
                by default — that's what made it read as "still on the left
                of the right column" before. The right edge this lines up
                with is the same 1180px container the footer's own
                border-top line spans, so "Volg ons" now aligns with that
                line's right end, not the raw edge of the browser window. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end', textAlign: 'right' }} className="tfa-footer-col-right">
              <div className="tfa-footer-heading">Volg ons</div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <a href="https://www.instagram.com/tfa.studio" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="tfa-footer-icon">
                  <InstagramIcon />
                </a>
                <a href="https://www.linkedin.com/company/top-format/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="tfa-footer-icon">
                  <LinkedInIcon />
                </a>
                <a href="https://www.youtube.com/@tfa.studio.amsterdam" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="tfa-footer-icon">
                  <YouTubeIcon />
                </a>
              </div>
              <a href="https://tfa.studio" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 600, color: '#E6C858', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                tfa.studio →
              </a>
            </div>
          </div>

          <div style={{ marginTop: 32, paddingTop: 18, borderTop: '1px solid #33301F', fontSize: 11.5, color: '#8C8880', textAlign: 'center' }}>
            © {new Date().getFullYear()} Team TFA · Karim Abdelmessih
          </div>
        </div>
      </footer>

      <style>{`
        .tfa-cta-hero {
          transition: transform .18s ease, box-shadow .18s ease, background .18s ease;
          box-shadow: 0 0 0 0 rgba(230,200,88,0);
        }
        .tfa-cta-hero:hover {
          transform: translateY(-2px) scale(1.015);
          box-shadow: 0 10px 28px rgba(230,200,88,.35);
          background: #EFD777;
        }
        .tfa-cta-hero:active { transform: translateY(0) scale(0.99); }
        .tfa-cta-arrow { display: inline-block; transition: transform .18s ease; }
        .tfa-cta-hero:hover .tfa-cta-arrow { transform: translateX(4px); }
        .tfa-carousel-row { aspect-ratio: 1280 / 674; max-height: 560px; }
        @media (max-width: 640px) {
          .tfa-carousel-row { max-height: 260px; }
        }
        .tfa-footer-icon {
          display: flex; align-items: center; justify-content: center;
          width: 36px; height: 36px; border-radius: 999px; border: 1px solid #45412A;
          color: #B9B6AC; transition: color .12s ease, border-color .12s ease, background .12s ease;
        }
        .tfa-footer-icon:hover { color: #E6C858; border-color: #E6C858; background: rgba(230,200,88,.12); }
        .tfa-footer-heading {
          font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #8C8880;
        }
        @media (max-width: 700px) {
          .tfa-footer-grid { grid-template-columns: 1fr 1fr !important; gap: 24px !important; }
          /* At this 2-column width the "Snel naar" and "Volg ons" columns'
             desktop alignment (centered / right-aligned WITHIN their own
             grid cell) reads as broken rather than intentional: with only
             two columns, "Volg ons" lands alone in row 2's first cell and
             right-aligning it there just floats it in the middle of the
             page, with a block of empty space to its actual right — exactly
             the "not centered, nonsense space on the right" symptom. Once
             the grid isn't a clean single row of 3 anymore (700px down to
             the 460px single-column collapse below), every column reads
             the same plain left-aligned way Contact already does instead. */
          .tfa-footer-col-center,
          .tfa-footer-col-right {
            align-items: flex-start !important;
            text-align: left !important;
          }
          .tfa-footer-col-center > div,
          .tfa-footer-col-right > div {
            align-items: flex-start !important;
            justify-content: flex-start !important;
          }
        }
        @media (max-width: 460px) {
          .tfa-footer-grid { grid-template-columns: 1fr !important; }
        }

        /* Right column's map fills the grid row's full height (the grid's
           alignItems: stretch above makes that row as tall as the left
           column's content), so its top/bottom line up with "Kom langs"
           and the "Route plannen" button respectively. On mobile the grid
           collapses to a single column, so the stretch height no longer
           applies — the map gets a fixed aspect ratio there instead so it
           doesn't collapse to nothing. */
        .tfa-visit-map {
          border-radius: 14px; overflow: hidden; border: 1px solid #33301F;
          background: #141414; width: 100%; height: 100%; min-height: 320px;
        }
        @media (max-width: 860px) {
          .tfa-visit-columns { grid-template-columns: 1fr !important; gap: 32px !important; }
          .tfa-visit-map { height: auto; aspect-ratio: 16 / 10; min-height: 0; }
        }
      `}</style>
    </div>
  );
}
