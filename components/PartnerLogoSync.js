'use client';

import { useEffect } from 'react';

// Dashboard side of the loader's co-branding: only a signed-in agency user
// gets their own logo; TFA staff get the plain TFA loader. The client flow
// uses a separate key (see useBrief), so a logo remembered from a client
// session in this tab never shows up in the dashboard.
export default function PartnerLogoSync({ logo = '' }) {
  useEffect(() => {
    try {
      if (logo) window.sessionStorage.setItem('tfa_partner_logo_dash', logo);
      else window.sessionStorage.removeItem('tfa_partner_logo_dash');
    } catch (e) {}
  }, [logo]);
  return null;
}
