import { ClerkProvider } from '@clerk/nextjs';

export const metadata = {
  title: 'TFA SpotFlow',
  description: 'Radiocommercials: van brief tot uitzending.',
  manifest: '/manifest.webmanifest',
  // iOS Safari ignores the manifest above — this is what it reads instead
  // when the user does Share → "Add to Home Screen".
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SpotFlow',
  },
};

// Separate from `metadata` per Next.js 14's viewport/themeColor split —
// this is what Chrome/Edge use to color the install prompt + browser chrome.
export const viewport = {
  themeColor: '#1D1D1D',
};

const clerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

const fontLink = (
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,600;1,500;1,600&display=swap"
  />
);

const baseStyle = (
  <style>{`
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #DEDCD7; }
    body { font-family: 'Geist', system-ui, sans-serif; color: #1D1D1D; }
    a { color: #383209; }
    a:hover { color: #1D1D1D; }
    input:focus, textarea:focus, select:focus { outline: 2px solid #E6C858; outline-offset: 1px; }
    button:focus-visible, a:focus-visible { outline: 2px solid #E6C858; outline-offset: 2px; }
    ::placeholder { color: #9C9890; }
    input[type=text], input[type=date], input[type=email], textarea, select {
      width: 100%; border: 1px solid #C9C5B9; border-radius: 10px; padding: 12px 14px;
      font-family: 'Geist', sans-serif; font-size: 13.5px; background: #FFFFFF; color: #1D1D1D;
    }
    textarea { resize: vertical; }
    label.field-label { display: block; font-size: 12.5px; font-weight: 600; margin-bottom: 5px; }
    .hint { font-size: 11.5px; color: #8C8880; line-height: 1.5; }
    .btn-primary {
      border: none; border-radius: 10px; background: #E6C858; color: #1D1D1D;
      font-family: 'Geist', sans-serif; font-weight: 600; font-size: 16.5px; padding: 14px 12px; cursor: pointer;
    }
    .btn-primary:disabled { background: #EAE7DE; color: #8C8880; cursor: not-allowed; }
    .ghost-btn {
      width: 100%; border: 1px solid #C9C5B9; border-radius: 10px; background: transparent; color: #5C5850;
      font-family: 'Geist', sans-serif; font-weight: 500; font-size: 13.5px; padding: 11px; cursor: pointer;
    }
    .seg-btn {
      flex: 1; font-family: 'Geist', sans-serif; font-size: 12.5px; font-weight: 500; padding: 11px 8px;
      border-radius: 9px; cursor: pointer; border: 1px solid #C9C5B9; background: #FFFFFF; color: #5C5850;
    }
    .seg-btn.selected { border: 1px solid #E6C858; background: #E6C858; color: #1D1D1D; font-weight: 600; }
    .tone-chip {
      font-family: 'Geist', sans-serif; font-size: 12px; font-weight: 500; padding: 9px 14px; border-radius: 999px;
      border: 1px solid #C9C5B9; background: #FFFFFF; color: #5C5850; cursor: pointer;
    }
    .tone-chip.active { background: #E6C858; border-color: #E6C858; color: #1D1D1D; font-weight: 600; }
    .tone-chip.disabled { opacity: .4; cursor: not-allowed; }
    .box { background: #FBF9EC; border: 1px solid #EAE3C4; border-radius: 12px; padding: 14px 16px; }
    .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 20px; }
    .field-grid .full { grid-column: 1 / -1; }
    label.check { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #1D1D1D; cursor: pointer; }
    label.check input { width: 16px; height: 16px; accent-color: #E6C858; cursor: pointer; }
    @media (max-width: 700px) {
      .field-grid { grid-template-columns: 1fr; }
    }
  `}</style>
);

function Shell({ children }) {
  return (
    <html lang="nl">
      <head>
        {fontLink}
        {baseStyle}
      </head>
      <body>{children}</body>
    </html>
  );
}

export default function RootLayout({ children }) {
  if (!clerkConfigured) {
    return <Shell>{children}</Shell>;
  }
  return (
    <ClerkProvider>
      <Shell>{children}</Shell>
    </ClerkProvider>
  );
}
