# Axla — landing page + TaxLaya chat widget + admin dashboard

[axla.space](https://axla.space) — **Axla: your AI agent for adulting**.
The homepage (`/`) is the original waitlist marketing page. **TaxLaya**, a
free Taglish AI chat assistant for PH BIR tax questions (2551Q, 1701Q,
0619E, etc.), floats as a chat bubble in the bottom-right corner of every
public page — click it to open the chat panel.

Next.js 14 (App Router) + TypeScript + Tailwind CSS + Supabase (waitlist +
chat rate limiting) + a password-protected admin dashboard for the waitlist
data.

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

`/admin` — stats (total signups, average BIR hate level, signups today/this
week), a 30-day signups chart, and a searchable/paginated waitlist table with
CSV export. Auto-refreshes every 30s.

- Set `ADMIN_PASSWORD` in your environment — this is the only credential
  gating `/admin`. Choose a strong, unique value; never commit the real value.
- Visit `/admin` (redirects to `/admin/login` if you're not signed in), enter
  the password. A signed, httpOnly session cookie keeps you in for 7 days.
- The dashboard reads data via `/api/admin/waitlist`, which checks the session
  cookie server-side and queries Supabase with the service-role key — the
  service-role key never reaches the browser.

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
- Avatar art: `public/taxlaya-avatar.png`.

## Deploying to Vercel

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. Import the repo in [Vercel](https://vercel.com/new).
3. Add all five environment variables from above (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`,
   `OPENAI_API_KEY`).
4. Deploy, then point the `axla.space` domain at the Vercel project
   (**Settings → Domains**).

## Structure

```
src/app/                  Routes: / (landing), /chat (redirects to /),
                           /privacy, /terms,
                           /admin, /admin/login, /api/waitlist, /api/admin/*, /api/chat
src/components/           Navbar, Hero, HowItWorks, WhyAxla, PricingTeaser,
                           WaitlistSection/WaitlistForm, Footer (landing page)
src/components/admin/     AdminDashboard, StatsCards, SignupChart, WaitlistTable
src/components/chat/      ChatWidget (floating bubble + panel), ChatHeader,
                           ChatMessage, ChatInput
src/components/ui/        shadcn-style primitives (Card, Table, Button, Input,
                           Badge, Dialog, ScrollArea, Textarea)
src/lib/supabase/client.ts  Public anon Supabase client (landing page waitlist insert)
src/lib/supabase/admin.ts   Service-role Supabase client (admin dashboard + rate limiting, server-only)
src/lib/admin-session.ts    Signed httpOnly session cookie for /admin
src/lib/rate-limit.ts        10 messages/IP/day limiter for /api/chat
supabase/schema.sql          Waitlist + chat_rate_limits tables, RLS policy, RPC
supabase/migrations/         Schema migrations for existing deployments
public/                      Axla logo, app icon, favicon, TaxLaya avatar assets
```

## Brand

- Primary: `#0F172A` (navy) · Accent: `#22C55E` (electric green) ·
  TaxLaya widget accent: `#00FF88`
- Font: Inter
- Copy: Taglish, no fluff
