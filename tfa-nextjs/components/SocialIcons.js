// Simple, monoline brand glyphs for the footer's "Volg ons" links — replaces
// plain text labels with recognizable icons (matching how tfa.studio itself
// presents its socials), using currentColor so hover/theme color comes from
// the parent link.
export function InstagramIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LinkedInIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" {...props}>
      <rect x="3" y="9" width="4" height="12" />
      <circle cx="5" cy="4.5" r="2.3" />
      <path d="M10.5 9H14v1.9c.7-1.2 2-2.2 4-2.2 3 0 5 2 5 5.6V21h-4v-6.1c0-1.6-.6-2.7-2-2.7-1.1 0-1.8.8-2.1 1.5-.1.3-.1.7-.1 1.1V21h-4V9z" />
    </svg>
  );
}

export function YouTubeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" {...props}>
      <path d="M21.6 7.2c-.25-1-.98-1.8-1.96-2.05C17.9 4.7 12 4.7 12 4.7s-5.9 0-7.64.45c-.98.25-1.71 1.05-1.96 2.05C2 8.95 2 12 2 12s0 3.05.4 4.8c.25 1 .98 1.8 1.96 2.05 1.74.45 7.64.45 7.64.45s5.9 0 7.64-.45c.98-.25 1.71-1.05 1.96-2.05.4-1.75.4-4.8.4-4.8s0-3.05-.4-4.8z" fillOpacity="0" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 9.6l5 2.4-5 2.4V9.6z" />
    </svg>
  );
}
