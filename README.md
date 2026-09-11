# TFA SpotFlow — Next.js port

A Next.js 14 (App Router, JavaScript) port of the original Express/SQLite
radio-commercial client-intake app, deployable to Vercel with Clerk auth on
the producer dashboard.

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. The app works out of the box with **zero
environment variables set** — `lib/db.js` and `lib/library.js` fall back to
an in-memory store (per-process, reset on restart) so both `npm run dev` and
`npm run build` succeed with no external services configured. AI script
generation falls back to a deterministic template, and confirmation emails
fall back to a `sent_emails` DB row instead of actually sending.

- `/` — public marketing homepage, links to `/start` (creates a brief and
  redirects into the flow) and `/sign-in` (producer login).
- `/brief/:id/{contact,delivery,details,script,voice,music,overview}` — the
  7-step client brief flow (mirrors the original `public/*.html` pages).
- `/dashboard` and `/dashboard/library` — producer-facing pages, protected by
  Clerk when configured.

## Environment variables

Copy `.env.example` to `.env.local` and fill in what you need — see that
file for the full list and what each one does. Summary:

| Var | Effect if unset |
|---|---|
| `POSTGRES_URL` | In-memory data store instead of real Postgres (not persistent, not shared across serverless instances). |
| `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `OLLAMA_HOST` + `OLLAMA_MODEL` | Tried in that order (Claude, then Gemini, then Ollama); falls back to the deterministic template script generator if none are set or the call fails. Gemini is free — see `lib/scriptgen.js` for setup notes. |
| `RESEND_API_KEY` / `SENDER_EMAIL` | Confirmation emails are stored as `sent_emails` rows instead of sent. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` | `/dashboard*` is left unprotected (middleware no-ops) and sign-in/up pages show a "not configured" message. |

## Deploying to Vercel

1. Push this repo and import it into Vercel (New Project → your repo).
2. Add a Postgres database: Vercel dashboard → Storage → Create Database →
   Postgres (or bring your own and set `POSTGRES_URL` directly). Connecting
   it auto-populates `POSTGRES_URL` for the project.
3. Add the rest of the env vars from `.env.example` you want enabled
   (Clerk keys, Anthropic/Ollama, Resend) in Project Settings → Environment
   Variables.
4. For Clerk: create an application at https://dashboard.clerk.com, copy the
   publishable + secret keys into the env vars above. No extra Clerk-side
   route config is required — `middleware.js` only protects `/dashboard` and
   `/dashboard/:path*`; the client brief flow and all `/api/briefs*` /
   `/api/config` routes stay public (a client filling out a brief is never
   authenticated).
5. Deploy. On first request against a real `POSTGRES_URL`, `lib/db.js` and
   `lib/library.js` lazily run `CREATE TABLE IF NOT EXISTS` migrations —
   no separate migration step needed.

## Architecture notes

- `lib/db.js` — the brief data layer. Same column list, `ALLOWED_FIELDS`,
  `BOOL_FIELDS`/`TRISTATE_FIELDS` (price is tri-state: null/false/true), and
  `EDIT_FIELDS` as the original `db.js`, now async and backed by
  `@vercel/postgres` or an in-memory Map.
- `lib/scriptgen.js` — the tiered Claude → Ollama → template script
  generator, ported near-verbatim from the original (ESM instead of
  CommonJS). `estimateSeconds`/`targetWordCount` are shared with the
  script step's live "estimated seconds" bar.
- `lib/email.js` — the tiered Resend → DB-fallback confirmation email
  sender. The original's filesystem fallback (`data/sent-emails/*.html`)
  is replaced with a `sent_emails` table/row, since Vercel serverless
  functions have no persistent filesystem.
- `lib/library.js` — new: a small CRUD layer for the producer-facing music
  track / voice library (no equivalent in the original app, which hard-coded
  its voice/track pools inline in `voice.html`/`music.html`).
- `components/StepShell.js` + `components/useBrief.js` — the shared sidebar
  layout and brief fetch/patch hook used by all 7 client-flow step pages,
  replacing 7 independent HTML/JS transliterations.
- `app/api/briefs/**` — mirrors `server.js`'s Express routes 1:1. The
  confirmation-email fire on submit is **awaited** (wrapped in try/catch)
  rather than fire-and-forget, since a Vercel serverless function can be
  frozen/terminated the instant its response is sent.

## Known simplifications / TODOs vs. the original Express app

- **Audio previews are still simulated.** Like the original app, "Voorbeeld
  beluisteren" / track play buttons just toggle a fake "playing" state for
  ~2.2s — no real audio assets are wired up in either version.
- **Voice/track pools on the client flow are still hard-coded** (ported
  verbatim into `components/flowData.js`) rather than reading from the new
  `lib/library.js` tables — the task asked for the library as a *producer*
  dashboard feature; wiring the client-facing voice/music steps to read live
  from it would be a reasonable follow-up but changes the original's
  behavior (a curated, versioned pool vs. a live-editable one).
- **In-memory fallback is per-process.** On Vercel serverless without
  `POSTGRES_URL` set, each function invocation may start a fresh process, so
  briefs/tracks/voices created against the in-memory store will not reliably
  persist between requests in production — only in a single long-lived
  `next dev`/`next start` process. Set `POSTGRES_URL` for real persistence.
- **Dashboard stats/library are minimal** — real but simple (time-range
  filter, sortable/paginated table, a detail modal; a tabbed music/voice
  library with add/delete). Not a pixel-perfect rebuild of the design canvas
  mockups, per the task's own instruction to prioritize correct data flow
  over exact fidelity.
- **No rate limiting / spam protection** on the public `POST /api/briefs`
  or brief-flow PATCH routes (the original didn't have any either).
- **Clerk sign-up page is included** but the task only required it "if
  simple to include" — it's wired but untested against a real Clerk
  application (no Clerk keys were available in this environment).
