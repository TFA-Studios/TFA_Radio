import Link from 'next/link';
import SpotFlowLogo from '../components/SpotFlowLogo';
import BrandWave from '../components/BrandWave';
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
            <div style={{ fontSize: 14, letterSpacing: '.09em', textTransform: 'uppercase', color: '#E6C858', fontWeight: 600 }}>Radiocommercials, zonder gedoe</div>
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

      {/* Looping video "breaker" between the hero and the footer — replaces
          the diagonal-cut hero bottom tried previously. Full-bleed: the
          `left: 50%; margin-left: -50vw` trick breaks the video out of
          every ancestor's centered max-width so it spans the full browser
          width edge-to-edge, even though the rest of the page stays inside
          the usual 1180px-max container. Shown as the plain video itself
          (no dark overlay/tint, not used as a background layer behind any
          text) — autoplay+loop+muted+playsInline is what makes autoplay
          allowed at all in every browser; object-fit: cover fills that full
          width at the video's own 1280:674 aspect ratio without letterboxing
          bars on the sides.
          maxHeight caps how tall this gets on wide screens — at its native
          1280:674 ratio, "100vw wide" alone means the video's height keeps
          growing with the browser's width (over 1000px tall on a big
          desktop monitor), which is what made it feel oversized next to the
          hero text/footer around it. Capping the height and letting
          object-fit: cover crop the sides keeps it full-bleed width-wise
          while staying proportionate to the rest of the page. */}
      <div style={{ position: 'relative', left: '50%', width: '100vw', marginLeft: '-50vw', overflow: 'hidden', background: '#1D1D1D' }}>
        <video
          autoPlay
          loop
          muted
          playsInline
          className="tfa-banner-video"
          style={{ display: 'block', width: '100%', aspectRatio: '1280 / 674', objectFit: 'cover' }}
        >
          <source src="/video/tfa-banner.mp4" type="video/mp4" />
        </video>
      </div>

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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="tfa-footer-heading">Snel naar</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <Link href="/start" style={{ color: '#B9B6AC', textDecoration: 'none' }}>Start je commercial</Link>
                <Link href="/sign-in" style={{ color: '#B9B6AC', textDecoration: 'none' }}>Admin login</Link>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="tfa-footer-heading">Volg ons</div>
              <div style={{ display: 'flex', gap: 10 }}>
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
        .tfa-banner-video { max-height: 560px; }
        @media (max-width: 640px) {
          .tfa-banner-video { max-height: 260px; }
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
        }
        @media (max-width: 460px) {
          .tfa-footer-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
