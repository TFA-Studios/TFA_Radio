'use client';

import { useEffect } from 'react';

// Co-branding for briefs that came in through a partner agency (Advision
// Media today): "in samenwerking met" + the agency's logo. Renders nothing for
// briefs without a partner logo, so every other page looks exactly as before.
//
//  variant 'dark'  — for dark backgrounds (sidebar, loader): the logo with white text
//  variant 'light' — for light backgrounds (status pages): the logo with dark text
export function partnerLogoOf(brief, variant) {
  if (!brief) return '';
  return (variant === 'light' ? brief.agencyLogoLight : brief.agencyLogoDark) || '';
}

// Sizing rule: the partner logo's WORDMARK ("ADVISION MEDIA") gets the same
// cap-height as the "TFA SpotFlow" wordmark, and the two wordmarks share one
// baseline, so a line drawn under "TFA SpotFlow" runs right under the partner
// name as well. (Measured: SpotFlow cap height = 0.56 x size, its baseline sits
// 0.76 x size below the top of the lockup; the partner PNG (1329x256) has its wordmark
// 38% of the image height with its baseline 50.4% down; the tagline sits below.) The partner icon ends up
// a little taller than the SpotFlow icon, which is how the real logo is drawn.
export function partnerHeightFor(size) {
  return Math.round(size * 1.47);
}
// How far to push the SpotFlow lockup down so its baseline meets the partner's.
export function spotflowOffsetFor(size) {
  return Math.round(0.504 * partnerHeightFor(size) - 0.76 * size);
}

// Header placement (status pages): put this on the RIGHT of the SpotFlow
// lockup in a row with align-items:flex-start, and wrap the SpotFlow lockup in
// a div with marginTop = spotflowOffsetFor(size). `size` is the SpotFlow
// lockup size.
export default function PartnerBadge({ brief, variant = 'dark', size = 26, label = true, style }) {
  const src = partnerLogoOf(brief, variant);
  if (!src) return null;
  const name = (brief && brief.agencyName) || 'partner';
  const color = variant === 'light' ? '#8C8880' : '#8C897E';
  const h = partnerHeightFor(size);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, ...style }}>
      {label && (
        // 10px text with line-height 10px has its baseline ~8px from the top.
        <span style={{ fontSize: 10, lineHeight: '10px', letterSpacing: '.08em', textTransform: 'uppercase', color, whiteSpace: 'nowrap', marginTop: Math.round(0.504 * h - 8) }}>in samenwerking met</span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={name} style={{ height: h, width: 'auto', display: 'block' }} />
    </div>
  );
}

// Sidebar placement: a hairline with the label centred on it, then the logo,
// under the SpotFlow lockup, with the same wordmark size.
export function PartnerSidebarBlock({ brief, size = 26, className }) {
  const src = partnerLogoOf(brief, 'dark');
  if (!src) return null;
  const name = (brief && brief.agencyName) || 'partner';
  const line = { flex: 1, height: 1, background: 'rgba(255,255,255,.14)' };
  return (
    <div className={className} style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={line} />
        <span style={{ fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8C897E', whiteSpace: 'nowrap' }}>in samenwerking met</span>
        <span style={line} />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={name} style={{ height: partnerHeightFor(size), width: 'auto', display: 'block', marginTop: 6, marginLeft: Math.round(size * 0.11) }} />
    </div>
  );
}

// Browser tab title: "TFA SpotFlow × Advision Media" for co-branded briefs.
export function usePartnerTitle(brief) {
  const name = brief && brief.agencyLogoDark && brief.agencyName ? brief.agencyName : '';
  useEffect(() => {
    if (!name) return undefined;
    const prev = document.title;
    document.title = 'TFA SpotFlow × ' + name;
    return () => { document.title = prev; };
  }, [name]);
}

// Faint stand-alone partner icon in the background of the client pages
// (~4% opacity), anchored bottom-right and partly cropped. Only renders when
// the brief's agency has an icon, so other agencies are unaffected.
export function PartnerWatermark({ brief, opacity = 0.04 }) {
  const src = brief && brief.agencyLogoIcon;
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden="true"
      style={{ position: 'fixed', right: -70, bottom: -90, width: 'min(520px, 70vw)', height: 'auto', opacity, pointerEvents: 'none', userSelect: 'none', zIndex: 0 }}
    />
  );
}
