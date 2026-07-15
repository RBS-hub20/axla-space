# Axla — landing page

Landing page for [axla.space](https://axla.space) — **Axla: your AI agent for
adulting**. First agent: **RDO Runner**, which files PH BIR quarterly taxes
(2551Q + 1701Q) from your GCash history.

Next.js 14 (App Router) + TypeScript + Tailwind CSS + Supabase (waitlist).

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase project values
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
   allows public **inserts** (no reading/listing with the public key).
3. Go to **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Put both in `.env.local` for local dev, and in your Vercel project's
   Environment Variables for production.

Signups land in `public.waitlist` (`email`, `hate`, `created_at`). View them
from the Supabase Table Editor, or the SQL Editor.

## Deploying to Vercel

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. Import the repo in [Vercel](https://vercel.com/new).
3. Add the two `NEXT_PUBLIC_SUPABASE_*` environment variables from above.
4. Deploy, then point the `axla.space` domain at the Vercel project
   (**Settings → Domains**).

## Structure

```
src/app/            Routes: / (landing), /privacy, /terms, /api/waitlist
src/components/     Navbar, Hero, HowItWorks, WhyAxla, PricingTeaser,
                     WaitlistSection/WaitlistForm, Footer
src/lib/supabase.ts Supabase client
supabase/schema.sql Waitlist table + RLS policy
public/              Axla logo, app icon, favicon assets
```

## Brand

- Primary: `#0F172A` (navy) · Accent: `#22C55E` (electric green)
- Font: Inter
- Copy: Taglish, no fluff
