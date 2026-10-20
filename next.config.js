/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // pdfkit (used by lib/briefPdf.js for the dashboard's "Download PDF"
  // button) ships its built-in font metrics as .afm files that it reads
  // straight off disk at runtime — they're not JS, so webpack never sees
  // them as an import. That makes the PDF route work fine locally
  // (`next dev` skips this bundling step entirely) but throw
  // "ENOENT ... Helvetica.afm" once deployed to Vercel, where the
  // serverless function is built from webpack's traced output. Marking
  // pdfkit as an external server package keeps it as a normal
  // node_modules require instead of a webpack bundle, and
  // outputFileTracingIncludes is a second guarantee that the actual
  // .afm files always ship alongside that one function.
  experimental: {
    serverComponentsExternalPackages: ['pdfkit'],
    outputFileTracingIncludes: {
      '/api/dashboard/briefs/[id]/pdf': ['./node_modules/pdfkit/js/data/**/*.afm', './public/agency-logos/**'],
    },
  },
};

// Conservative security headers for every response. Deliberately no
// Content-Security-Policy: Clerk, Google Fonts and Vercel Blob load from several
// origins, and a wrong CSP breaks sign-in; add one only with a staging test.
nextConfig.headers = async () => [
  {
    source: '/:path*',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ],
  },
];

module.exports = nextConfig;
