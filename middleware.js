// Protects only the producer dashboard. The client-facing brief flow
// (/, /start, /brief/*, /sign-in, /sign-up, and every /api/briefs* +
// /api/config route) is always public — a client filling out a brief is
// never authenticated.
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/dashboard',
  '/dashboard/(.*)',
  // Producer-only API routes (e.g. changing a brief's workflow status) —
  // distinct from the public /api/briefs* routes the client-facing flow uses.
  '/api/dashboard/(.*)',
]);

// If Clerk keys aren't configured (local dev with zero env vars), skip auth
// entirely rather than throwing — the rest of the app should still work.
const clerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

export default clerkConfigured
  ? clerkMiddleware((auth, req) => {
      if (isProtectedRoute(req)) auth().protect();
    })
  : function noopMiddleware() {};

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
