// The real TFA brandmark (public/brand/brandmark.png) — a square dark tile
// with the gold waveform icon, supplied by the client. Rendered beside the
// "TFA" wordmark everywhere the wordmark appears (homepage header, producer
// sidebar, client-flow sidebar, sign-in/sign-up), replacing the earlier
// hand-drawn inline-SVG wave icon used as a placeholder before the real
// asset existed.
export default function BrandMark({ size = 22, radius = 6, style }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/brandmark.png"
      alt="TFA"
      width={size}
      height={size}
      style={{ flex: 'none', display: 'block', borderRadius: radius, ...style }}
    />
  );
}
