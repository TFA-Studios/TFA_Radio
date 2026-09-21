import Link from 'next/link';
import SpotFlowLogo from '../components/SpotFlowLogo';
import BrandWave from '../components/BrandWave';
import { InstagramIcon, LinkedInIcon, YouTubeIcon } from '../components/SocialIcons';

// Public marketing homepage — general layout/copy inspired by
// /tmp/canvas_work/Homepage.dc.html, wired to real routes (no data needed).
export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', background: '#DEDCD7' }}>
      <div style={{ position: 'relative', background: '#1D1D1D', overflow: 'hidden' }}>
        <BrandWave />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <header style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <SpotFlowLogo size={30} variant="dark" />
            <Link href="/sign-in" style={{ fontSize: 13, fontWeight: 600, color: '#E6C858', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              Admin login →
            </Link>
          </header>

          <main style={{ maxWidth: 880, margin: '60px auto 0', padding: '0 20px 90px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, letterSpacing: '.09em', textTransform: 'uppercase', color: '#E6C858', fontWeight: 600 }}>Radiocommercials, zonder gedoe</div>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: 52, lineHeight: 1.1, margin: '18px 0 20px', color: '#FBF9EC' }}>
              Van brief tot uitzending, in 7 simpele stappen.
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.6, color: '#DEDCD7', maxWidth: 620, margin: '0 auto 36px' }}>
              Vertel ons over je merk, je product en je doelgroep. TFA schrijft het script, kiest de stem en de muziek — jij keurt
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
            <div style={{ marginTop: 16, fontSize: 12.5, color: '#8C8880' }}>
              Geen account nodig — je krijgt direct je eigen brieflink.
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

      <footer style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 20px 40px', borderTop: '1px solid #E3E0D5' }}>
        {/* No repeated logo here — the header already carries it, and
            placed above just the Contact/Volg ons columns it read like it
            belonged to one of them rather than the page as a whole. */}

        {/* alignItems: 'end' — not 'start' — so "Volg ons" and "Contact"
            meet at the SAME bottom row instead of both starting level at
            the top and trailing off at different heights (Contact's block
            is taller — address + email/phone — than Volg ons's icon row +
            link). Both columns stay anchored bottom-right/bottom-left of
            the footer either way; this only changes which edge lines up. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'end' }} className="tfa-footer-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="tfa-footer-heading">Contact</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.7, color: '#5C5850' }}>
              Koivistokade 26A<br />
              1013 BB Amsterdam
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.9 }}>
              <a href="mailto:planning@tfa.studio" style={{ color: '#5C5850', textDecoration: 'none' }}>planning@tfa.studio</a><br />
              <a href="tel:+31850854777" style={{ color: '#5C5850', textDecoration: 'none' }}>+31 85 085 4777</a>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end', textAlign: 'right' }}>
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
            <a href="https://tfa.studio" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 600, color: '#8C6D1F', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              tfa.studio →
            </a>
          </div>
        </div>

        <div style={{ marginTop: 28, paddingTop: 18, borderTop: '1px solid #E3E0D5', fontSize: 11.5, color: '#9C9890', textAlign: 'center' }}>
          © {new Date().getFullYear()} Team TFA
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
        .tfa-footer-icon {
          display: flex; align-items: center; justify-content: center;
          width: 36px; height: 36px; border-radius: 999px; border: 1px solid #C9C5B9;
          color: #5C5850; transition: color .12s ease, border-color .12s ease, background .12s ease;
        }
        .tfa-footer-icon:hover { color: #8C6D1F; border-color: #8C6D1F; background: rgba(230,200,88,.12); }
        .tfa-footer-heading {
          font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #5C5850;
        }
        @media (max-width: 620px) {
          .tfa-footer-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
        }
      `}</style>
    </div>
  );
}
