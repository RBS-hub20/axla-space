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

## Deploying to Vercel

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. Import the repo in [Vercel](https://vercel.com/new).
3. Add the environment variables from above (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`,
   `OPENAI_API_KEY`), plus `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST`
   if you want analytics (both optional).
4. Deploy, then point the `axla.space` domain at the Vercel project
   (**Settings → Domains**).

## Structure

```
src/app/                  Routes: / (landing), /chat (redirects to /),
                           /privacy, /terms, /robots.ts, /sitemap.ts,
                           /admin, /admin/login, /api/waitlist,
                           /api/waitlist-count, /api/admin/{waitlist,chat,auth,logout},
                           /api/chat
src/components/           Navbar, Hero, SocialProof, HowItWorks, WhyAxla,
                           PricingTeaser, WaitlistSection/WaitlistForm, Footer
                           (landing page), PostHogProvider (analytics)
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
