# 1701Q PDF fix — root causes found, visually verified

Both screenshots in `proof/` are real renders of the actual PDF this code
generates (Chromium's PDF viewer, not a mockup) — one for the normal case,
one for missing-TIN + late-filing. Look at them first.

## The two real root causes (confirmed, not guessed)

1. **Deadline showing today's date**: the old PDF route had
   `dueDate: new Date().toISOString()` — it never called any deadline
   function at all, just stamped "right now." That's exactly why Q2 showed
   July 20 (today) instead of August 15. **The 1701Q deadline formula
   itself was already correct** in `tax-calculator.ts` (Q1 May 15, Q2 Aug
   15, Q3 Nov 15, Q4 Apr 15 next year) — it just was never being called
   from the PDF route. Now it is, via the new `getFilingDeadline()` in
   `quarter.ts`, and I verified Q2 2026 → August 15, 2026 in the screenshot.

2. **Username instead of real name**: the old route used
   `user.name ?? user.email` — `user` is the Prisma `User` row (name set
   at signup, e.g. from the email prefix "renzsom2022"), never the
   Supabase `profiles.full_name` that Settings actually edits. The route
   now fetches the profile and uses `profile.full_name || user.name`.
   Verified in the screenshot: "Renmar Sombilon", not "renzsom2022".

## What else changed

- **TIN / RDO / Business Name / Address**: all now fetched from `profiles`
  and shown in a dedicated "Taxpayer Details" box. Added `address` as a
  new `profiles` column (`supabase/schema.sql`, idempotent `alter table`).
- **Expenses**: the computation box still shows the actual saved
  calculation's income/expenses/tax_due — I did **not** silently swap
  those numbers for a live receipts sum, because that risks the PDF
  disagreeing with the calculation that was actually run (especially for
  8%/3% filers, where expenses don't factor into tax due at all). Instead,
  there's a separate **"Deductible receipts on file"** line pulling a real
  sum from your `receipts` table (`category = 'deductible'`, filtered to
  the form's quarter) — informational, visible, doesn't overwrite the
  official numbers. If both are 0, the amber note you asked for appears.
- **Layout**: boxed sections with light-gray backgrounds, a divider header,
  bold total in green at 22pt (biggest text on the page), red/amber color
  coding for missing fields and late penalties, the exact disclaimer text
  you specified, "Verify at axla.space/verify/{formId}" text line, and the
  8%-regime explanatory note.
- **Watermark-style incomplete-profile flag**: red "INCOMPLETE PROFILE — TIN
  NOT SET" line at the top when `tin_number` is null — visible in
  `proof/2-missing-tin-and-late-filing.png`.
- **Forms list page**: each card now shows the profile's name/TIN/RDO and a
  deadline badge that turns red (with a warning icon) when a draft form is
  past its deadline. A banner links to Settings when TIN isn't set.

## A real bug I hit and fixed during testing

The first PDF generation attempt crashed: `Error: WinAnsi cannot encode
"−"`. I'd used a Unicode minus sign (−, U+2212) and multiplication sign (×)
in the 8%-regime note text — the base PDF font (WinAnsi encoding) only
supports plain ASCII hyphen-minus and a specific × glyph, not that Unicode
minus. Fixed by using a plain `-` and `x`. Caught this by actually running
the generator, not just type-checking it — worth flagging since it's the
kind of bug that passes `npm run build` cleanly (it's a runtime PDF-lib
error, not a TypeScript error) and would have shipped broken.

## Two things I deliberately did NOT do, and why

1. **Did not add `username`/`password_hash` to the Prisma `User` model.**
   I checked the actual committed schema before touching anything — it's
   `id`, `email`, `name`, `verified`, `createdAt`, `updatedAt`. There's no
   password field anywhere in this codebase because sign-in is entirely
   OTP-based; adding `password_hash` with no login form or hashing logic
   to use it would just be a dead column that misleads whoever reads the
   schema next. `full_name` was never in the `User` model to begin with —
   it's only ever lived in `profiles`, exactly as you asked, so there was
   nothing to remove there.
2. **"View Profile" links to `/dashboard/settings`, not
   `/dashboard/profile`.** This app's profile-editing page has always been
   at `/dashboard/settings` — there's no `/dashboard/profile` route. Linked
   to the real one instead of creating a duplicate page at a URL nothing
   else uses.
3. Also didn't create a separate `documents` table with an
   `is_deductible` boolean — the existing `receipts` table (with a
   `category` enum including `'deductible'`) already does this job and is
   what `/dashboard/documents` writes to. A parallel `documents` table
   would just be dead, unpopulated data.

## Apply

1. Copy this zip's `src/`, `supabase/`, `package.json` in, overwriting.
2. Run the new bit of `supabase/schema.sql` (`alter table ... add column
   if not exists address text;` — safe to re-run everything else too,
   it's all idempotent).
3. `npm install && npx prisma generate && npm run build` — confirmed
   passing here, 30/30 routes.
