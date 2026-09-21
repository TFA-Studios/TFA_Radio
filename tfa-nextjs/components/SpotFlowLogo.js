import BrandMark from './BrandMark';

// The "TFA SpotFlow" lockup — one line, one sans-serif weight throughout,
// "TFA" in the brand gold and "SpotFlow" in white/dark depending on
// background, next to the existing brandmark icon. Approved version out of
// the concepts shown to the client. Used everywhere the app previously
// showed the bare "TFA" wordmark — homepage header/footer, sign-in/sign-up,
// the client-flow sidebar, and every dashboard sidebar. The install/PWA
// icon and browser favicon stay the plain TFA brandmark (app/icon.png,
// app/manifest.js) rather than trying to cram this whole lockup into a
// small square tile.
//
// `textClassName` lets a caller hide just the text half on a narrow layout
// (e.g. the client-flow mobile rail) while keeping the icon visible, the
// same way the old bare-"TFA" label did.
export default function SpotFlowLogo({ size = 32, variant = 'dark', gap, className, textClassName }) {
  const tfaColor = variant === 'dark' ? '#E6C858' : '#8C6D1F';
  const nameColor = variant === 'dark' ? '#FFFFFF' : '#1D1D1D';
  const fontSize = Math.round(size * 0.75);

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: gap != null ? gap : Math.round(size * 0.32) }}>
      <BrandMark size={size} />
      <span
        className={textClassName}
        style={{
          fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 600, fontSize,
          letterSpacing: '-0.01em', whiteSpace: 'nowrap', lineHeight: 1,
        }}
      >
        <span style={{ color: tfaColor }}>TFA</span> <span style={{ color: nameColor }}>SpotFlow</span>
      </span>
    </div>
  );
}
