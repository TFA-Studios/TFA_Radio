// Web app manifest — what makes the app installable from Chrome/Edge
// (desktop + Android) as a standalone app, with our brand icon and colors.
// Next.js auto-serves this at /manifest.webmanifest and links it in <head>.
// Safari (desktop and iOS) does not read this file at all — there the user
// has to use Share → "Add to Home Screen" manually, and iOS instead reads
// the <link rel="apple-touch-icon"> / apple-mobile-web-app-* meta tags that
// Next.js already generates from app/apple-icon.png + the metadata below.
export default function manifest() {
  return {
    name: 'TFA SpotFlow',
    short_name: 'SpotFlow',
    description: 'Radiocommercials: van brief tot uitzending.',
    start_url: '/',
    display: 'standalone',
    background_color: '#DEDCD7',
    theme_color: '#1D1D1D',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
