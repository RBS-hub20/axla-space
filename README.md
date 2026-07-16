# Axla — landing page + TaxLaya chat widget + admin dashboard

[axla.space](https://axla.space) — **Axla: your AI agent for adulting**.
The homepage (`/`) is the original waitlist marketing page. **TaxLaya**, a
free Taglish AI chat assistant for PH BIR tax questions (2551Q, 1701Q,
0619E, etc.), floats as a chat bubble in the bottom-right corner of every
public page — click it to open the chat panel.

Next.js 14 (App Router) + TypeScript + Tailwind CSS + Supabase (waitlist +
chat rate limiting) + a password-protected admin dashboard for the waitlist
data.

## Launch readiness

- **Legal pages**: [`/privacy`](./src/app/privacy/page.tsx) and
  [`/terms`](./src/app/terms/page.tsx) — real content (what we collect, that
  we use OpenAI/Supabase, that we never sell data, rate limits, "not a CPA"
  disclaimer). Linked from the landing page footer and the chat widget's
  footer disclaimer.
- **SEO**: `og-image.png` (1200×630) + a shared meta description
  ("Ask TaxLaya about 2551Q, 1701Q, BIR deadlines. Free 24/7.") wired into
  `openGraph`/`twitter` metadata in `src/app/layout.tsx`, plus
  [`app/robots.ts`](./src/app/robots.ts) and
  [`app/sitemap.ts`](./src/app/sitemap.ts).
- **Social proof**: `src/components/SocialProof.tsx` shows the *real* live
  waitlist count and average BIR hate rating (via `getWaitlistStats()` /
  `/api/waitlist-count`) — no fabricated testimonials or user counts.
- **Analytics**: [PostHog](https://posthog.com) via `src/lib/analytics.ts`
  (`trackEvent`) and `src/components/PostHogProvider.tsx`. Tracks
  `page_view`, `widget_opened`, `message_sent`, `form_mentioned`. Entirely
  optional — no-ops safely if `NEXT_PUBLIC_POSTHOG_KEY` is unset.
- **Friendly error handling**: if OpenAI errors mid-stream, the widget shows
  "TaxLaya is resting 😴 Try again in 1 min" instead of a raw error; hitting
  the daily limit shows "10/10 messages used today. Reset at 12mn or upgrade
  to Pro 🙏" (see `onError` in `src/app/api/chat/route.ts`).

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase project + admin password
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The waitlist form works without Supabase configured (it degrades to a clear
"not configured" error instead of crashing), but you'll want Supabase set up
to actually collect signups — see below.

## Supabase setup (waitlist)

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** and run [`supabase/schema.sql`](./supabase/schema.sql)
   — this creates the `waitlist` table with row-level security that only
   allows public **inserts** (no reading/listing with the public anon key).
   - Already ran an older version of this schema (with a text `hate` column)?
     Run [`supabase/migrations/001_bir_hate_level.sql`](./supabase/migrations/001_bir_hate_level.sql)
     instead — it migrates existing rows to the new `bir_hate_level` (1-10) column.
   - Already ran `schema.sql` before chat rate limiting was added? Run
     [`supabase/migrations/002_chat_rate_limits.sql`](./supabase/migrations/002_chat_rate_limits.sql)
     to add the `chat_rate_limits` table + function.
   - Already ran `schema.sql` before chat analytics were added? Run
     [`supabase/migrations/003_chat_messages.sql`](./supabase/migrations/003_chat_messages.sql)
     to add the `chat_messages` table.
3. Go to **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (server-only — used by
     the admin dashboard to read the waitlist; RLS blocks the anon key from
     reading it, by design)
4. Put all three in `.env.local` for local dev, and in your Vercel project's
   Environment Variables for production.

Signups land in `public.waitlist` (`email`, `bir_hate_level` 1-10, `created_at`).

## Admin dashboard

`/admin` — a full analytics dashboard over the waitlist and TaxLaya chat
activity. Auto-refreshes every 30s.

- Set `ADMIN_PASSWORD` in your environment — this is the only credential
  gating `/admin`. Choose a strong, unique value; never commit the real value.
- Visit `/admin` (redirects to `/admin/login` if you're not signed in), enter
  the password. A signed, httpOnly session cookie keeps you in for 7 days.
- The dashboard reads data via `/api/admin/waitlist` and `/api/admin/chat`,
  both checking the session cookie server-side and querying Supabase with
  the service-role key — the service-role key never reaches the browser.
- **Date range filter** (Last 7 days / Last 30 days / All time) applies to
  every stat, chart, table, and the CSV export.
- **8 stat cards**: Total Signups, Average BIR Hate Level (click it for a
  pie-chart breakdown by level), Signups Today, Signups This Week, Total
  Messages, Active Users Today, Avg Messages per User, Most Asked Form.
- **Signups / Chat Activity tabs**: a gradient bar chart of daily signups and
  a gradient area chart of daily message volume, both with hover tooltips.
- **Top 10 User Questions** and **Live Chat Feed** (last 5 conversations,
  IPs masked to `123.45.XX.XX`) are built from the `chat_messages` table —
  see the privacy note below.

### Chat logging (`chat_messages`)

To power "Total Messages," "Most Asked Form," "Top Questions," and "Live
Chat Feed," `/api/chat` logs each **user** message (not TaxLaya's replies)
to a `chat_messages` table (`ip`, `message`, `created_at`) — see
`src/lib/chat-log.ts`. Row-level security blocks all public access; only
the service-role key (used server-side in `/api/chat` and
`/api/admin/chat`) can read or write it. This is new behavior introduced
alongside the analytics dashboard — previously nothing about chat
conversations was persisted. If that's more than you want to retain,
the fix is either to stop calling `logUserMessage` in
`src/app/api/chat/route.ts`, or to add a periodic delete/anonymize job
against `chat_messages`.

## TaxLaya chat widget

A floating chat bubble (bottom-right, `src/components/chat/ChatWidget.tsx`)
mounted site-wide from the root layout — present on the landing page,
`/privacy`, and `/terms`, but hidden on `/admin`. Minimized by default as a
round avatar button with a pulsing green "online" dot; clicking it opens a
~400×600 dark chat panel. `/chat` redirects to `/` for old links.

- Streams Taglish BIR tax answers (2551Q, 1701Q, 0619E, 1601C, 2550Q, etc.)
  via OpenAI's `gpt-4o-mini`. Get an API key at
  [platform.openai.com](https://platform.openai.com/api-keys) and set
  `OPENAI_API_KEY`.
- The system prompt and persona live in `src/app/api/chat/route.ts`.
- **Rate limited to 10 messages per IP per day**, tracked in the
  `chat_rate_limits` Supabase table (atomic upsert via the
  `increment_chat_rate_limit` Postgres function — see
  `supabase/migrations/002_chat_rate_limits.sql`). Fails open (chat still
  works, just unlimited) if Supabase isn't configured, so a rate-limiter
  outage never takes the chat down.
- **Welcome toast**: a small "Hi! TaxLaya here 👋" bubble appears above the
  launcher ~1s after page load, auto-hides after 5s, and is dismissible or
  clickable (opens the chat). Shows once per full page load, not on every
  client-side navigation.
- **Quick replies**: after any TaxLaya reply, three chips ("Compute my tax",
  "Check deadline", "What form do I need?") let the user continue the
  conversation with one click.
- **Notification sound**: a short two-tone chime (synthesized with the Web
  Audio API — no audio file to ship) plays when a reply finishes streaming,
  even if the widget is minimized. Mute/unmute via the speaker icon in the
  header; the preference persists in `localStorage`.
- **Mobile**: the closed launcher stays a small bottom-right bubble on every
  screen size; opened, the panel goes edge-to-edge full-screen below the
  `sm` breakpoint instead of the fixed 400×600 desktop size.
- Avatar art: `public/taxlaya-avatar.png`.

## Authentication (Plunk OTP + Prisma + JWT)

A complete, working passwordless email-OTP sign-in for TaxLaya: request a
code, verify it, get a real signed-in session, land on `/dashboard`.

- `src/app/login/page.tsx` — self-contained two-step client page (email →
  6-digit code), `gray-900`/`gray-800`/`green-600` dashboard-matching theme,
  loading spinners, inline validation, redirects to `/dashboard` on success.
  (An earlier version delegated to a separate `components/auth/OTPForm.tsx`
  with a navy/neon-green brand palette; that's been folded directly into
  the page and removed, since nothing else used it.)
- `POST /api/auth/send-otp` — accepts `{ email }`, generates a 6-digit code,
  stores it in the `OtpToken` table (10-minute expiry), and emails it via
  Plunk using `otpEmailTemplate`. **Always responds `{ success: true }`**
  regardless of whether the email is valid, registered, or the send actually
  succeeded — the response can't be used to enumerate which emails exist.
  Real failures are logged server-side only.
- `POST /api/auth/verify-otp` — accepts `{ email, code }` (`/login` also
  sends the same value under the key `otp` for safety, and the route reads
  either). Looks up a matching, unused, unexpired `OtpToken`; if none
  matches, returns `401 { error: "Invalid or expired code" }` (one generic
  message regardless of *why* it failed — not found, expired, wrong code,
  or already used, so a client can't distinguish those cases). On success:
  marks the code used (single-use), upserts a `User` row (`name` derived
  from the email's local part, e.g. `jane@x.com` → `jane`), signs a 7-day
  JWT (`{ userId, email, exp }`), sets it as the httpOnly `taxlaya_session`
  cookie, sends a best-effort welcome email, and returns
  `{ success: true, user: { id, email, name } }`.
- `src/lib/jwt.ts` — `signSessionToken` / `verifySessionToken`, signed with
  `JWT_SECRET`. If `JWT_SECRET` is unset: falls back to a known dev-only
  secret in development (with a console warning), but **refuses to sign or
  verify at all in production** — a fallback secret that's public (it's
  written directly into this repo's history) would let anyone forge a
  session for any user if it were ever actually used in prod.
- `src/lib/session.ts`'s `getCurrentUser()` reads the cookie, verifies the
  JWT, and looks up the `User` by id — returns `null` (fail closed) on any
  missing cookie, bad/expired/tampered signature, or DB error, instead of
  throwing.
- `src/middleware.ts` still only checks whether `taxlaya_session` is
  *present* (edge runtime can't run Prisma/`jsonwebtoken`'s Node APIs) — the
  real verification happens in `getCurrentUser()`. A forged or tampered
  cookie gets past middleware but is rejected — and safely, not with a
  crash — as soon as a Server Component calls `getCurrentUser()`.
- `POST /api/auth/logout` clears the cookie.

### Prisma setup

1. Add `DATABASE_URL` (and, if you're on Supabase, `DIRECT_URL` too — see
   `.env.example` for the exact pooled-vs-direct pattern and why both are
   needed) to `.env.local`.
2. Run `npx prisma migrate dev` locally / `npx prisma migrate deploy` in
   production to apply `prisma/migrations/` (creates `OtpToken` and `User`).
   This also runs on every `npm install` / `npm run build` via the
   `postinstall`/`build` scripts calling `prisma generate`, so the client
   stays in sync with the schema — but note `prisma generate` alone never
   creates tables, only `migrate`/`db push` does.
3. `src/lib/prisma.ts` exports a singleton `PrismaClient`, cached on
   `globalThis` in dev so hot-reload doesn't leak new connections.

**On Supabase specifically:** `DATABASE_URL` must be the **pooled**
connection (Project Settings → Database → Connection Pooling →
**Transaction**, port `6543`, `?pgbouncer=true`) — that's what the deployed
app queries through at runtime. `DIRECT_URL` must be a *different* string:
same pooler host, port `5432` (**Session** mode) instead — `prisma migrate`
needs this because PgBouncer's Transaction mode doesn't support the
prepared statements Prisma Migrate relies on. Use the pooler hostname for
`DIRECT_URL`, not Supabase's bare `db.<ref>.supabase.co` direct-connection
host — the bare host can be IPv6-only, which breaks on platforms whose
serverless functions lack outbound IPv6 (Vercel has historically been one).
Missing `DIRECT_URL` (or pointing it at the wrong host) is a common source
of `PrismaClientInitializationError` on Vercel + Supabase specifically.

Set `PLUNK_API_KEY` (from your Plunk project), `JWT_SECRET` (a long random
string — see `src/lib/jwt.ts` above for what happens if you don't), and
optionally `PLUNK_FROM_EMAIL` / `PLUNK_FROM_NAME` (default to
`hello@axla.space` / `TaxLaya`).

> **This was verified against a real Postgres 16 instance by actually
> driving the `/login` UI in a real browser** (Plunk itself wasn't live in
> this sandbox, so the email send was skipped by reading the generated code
> straight from the `OtpToken` table instead of an inbox — everything
> downstream of that, including the real page, real JWT signing/verification,
> and the real Prisma `User` upsert, ran for real). Confirmed working:
> typing an email into `/login`, submitting, landing on the code step,
> entering the real code, and landing on `/dashboard` with an httpOnly
> `taxlaya_session` cookie set and the correct signed-in name rendered.
> Also confirmed: reusing a code 401s, a wrong code 401s, a tampered/forged
> session cookie is rejected instead of crashing, unauthenticated
> `/dashboard` still redirects to `/login`, and logout clears the cookie.
> Not exercised: an actual Plunk email delivery (no live `PLUNK_API_KEY`
> here) and a second concurrent server instance — the JWT approach doesn't
> have the single-instance limitation the old in-memory store had, so
> that's expected to be fine.

## Dashboard (`/dashboard`)

A gated area for signed-in TaxLaya users — dark navy (`#001A29`) chrome with
neon green (`#00FF85`) accents, matching the OTP email styling.

> Note: `/login` (above) was later restyled to plain Tailwind
> `gray-900`/`gray-800`/`green-600`, matching the *dashboard's own* card
> palette (`ui/card.tsx`) rather than this navy/`#00FF85` shell. The two now
> look slightly different back-to-back — `/login` is a touch more muted/gray,
> the dashboard shell a bit more navy/neon. Say the word if you want them
> unified on one palette.

- `src/app/dashboard/layout.tsx` — renders `Sidebar` + `Header` around every
  `/dashboard/*` page, and redirects to `/login` if there's no signed-in user.
- `src/app/dashboard/page.tsx` — welcome message + three cards: **Your Tax
  Status** (static "all clear" placeholder), **Quick Actions** (links to
  `/dashboard/calculator`, `/forms`, `/documents` — none of those pages exist
  yet, so they 404 today; same as the equivalent Sidebar nav links), and
  **Recent Activity** (empty state).
- `src/components/dashboard/Sidebar.tsx` / `Header.tsx` — nav with active-route
  highlighting, a mobile slide-out drawer, sticky header with avatar
  initial + logout button (`POST /api/auth/logout`, clears the session
  cookie).
- `src/middleware.ts` — redirects `/dashboard/*` to `/login` if the
  `taxlaya_session` cookie is missing (matcher-scoped, so it doesn't touch
  any other route).

## Deploying to Vercel

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. Import the repo in [Vercel](https://vercel.com/new).
3. Add the environment variables from above (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`,
   `OPENAI_API_KEY`), plus `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST`
   for analytics, and `PLUNK_API_KEY` + `DATABASE_URL` + `JWT_SECRET` for
   sign-in/`/dashboard` (the rest of the app works without any of these).
4. Deploy, then point the `axla.space` domain at the Vercel project
   (**Settings → Domains**).

## Structure

```
src/app/                  Routes: / (landing), /chat (redirects to /),
                           /privacy, /terms, /robots.ts, /sitemap.ts,
                           /login, /dashboard,
                           /admin, /admin/login, /api/waitlist,
                           /api/waitlist-count, /api/admin/{waitlist,chat,auth,logout},
                           /api/chat, /api/auth/{send-otp,verify-otp,logout}
src/components/           Navbar, Hero, SocialProof, HowItWorks, WhyAxla,
                           PricingTeaser, WaitlistSection/WaitlistForm, Footer
                           (landing page), PostHogProvider (analytics)
src/components/dashboard/ Sidebar, Header (for the gated /dashboard area)
src/components/admin/     AdminDashboard, StatsCards, GraphTabs,
                           TopQuestionsTable, RecentChatsFeed, WaitlistTable,
                           HateLevelDialog, DateRangeFilter
src/components/chat/      ChatWidget (floating bubble + panel), ChatHeader,
                           ChatMessage, ChatInput
src/components/ui/        shadcn-style primitives (Card, Table, Button, Input,
                           Badge, Dialog, ScrollArea, Textarea)
src/lib/supabase/client.ts  Public anon Supabase client (landing page waitlist insert)
src/lib/supabase/admin.ts   Service-role Supabase client (admin dashboard + rate limiting, server-only)
src/lib/admin-session.ts    Signed httpOnly session cookie for /admin
src/lib/rate-limit.ts        10 messages/IP/day limiter for /api/chat
src/lib/chat-log.ts          Logs user questions to chat_messages (server-only)
src/lib/chat-analytics.ts    Most-asked-form detection, question grouping,
                              recent-chats grouping, IP blurring
src/lib/notification-sound.ts  Synthesized reply chime (Web Audio API)
src/lib/analytics.ts         PostHog event tracking (no-ops if unconfigured)
src/lib/waitlist-stats.ts    Real waitlist count + avg hate level (server-only)
src/lib/plunk.ts             Plunk transactional email client (server-only)
src/lib/email-templates.ts   otpEmailTemplate + welcomeEmailTemplate (inline-CSS HTML)
src/lib/otp-store.ts         Prisma-backed OtpToken generate/store/verify, 10-min expiry
src/lib/prisma.ts            Singleton PrismaClient (server-only)
src/lib/jwt.ts               Sign/verify the taxlaya_session JWT (JWT_SECRET)
src/lib/session.ts           getCurrentUser() — verifies JWT, looks up User
src/lib/session-cookie.ts    SESSION_COOKIE name only (dependency-free, edge-safe)
src/middleware.ts            Redirects /dashboard/* to /login if no session cookie
prisma/schema.prisma         OtpToken + User models (Postgres, via DATABASE_URL)
prisma/migrations/           Applied migration history (real, generated against
                              a live Postgres — safe to `prisma migrate deploy`)
supabase/schema.sql          Waitlist + chat_rate_limits + chat_messages
                              tables, RLS policies, RPC
supabase/migrations/         Schema migrations for existing deployments
public/                      Axla logo, app icon, favicon, TaxLaya avatar assets
```

## Brand

- Primary: `#0F172A` (navy) · Accent: `#22C55E` (electric green) ·
  TaxLaya widget accent: `#00FF88`
- Font: Inter
- Copy: Taglish, no fluff
