-- Run this ONLY if you already created the `waitlist` table from an earlier
-- version of schema.sql (the one with a text `hate` column). It migrates the
-- table to the numeric `bir_hate_level` scale used by schema.sql / the admin
-- dashboard. Safe to run once; skip it entirely on a brand-new project (just
-- run schema.sql instead).

alter table public.waitlist
  add column if not exists bir_hate_level int8;

-- Best-effort backfill for any existing rows from the old text reasons.
-- Adjust the mapping if you added different dropdown options.
update public.waitlist set bir_hate_level = 8
where bir_hate_level is null and hate = 'Ang haba ng pila';

update public.waitlist set bir_hate_level = 7
where bir_hate_level is null and hate = 'Di ko alam ilalagay sa forms';

update public.waitlist set bir_hate_level = 6
where bir_hate_level is null and hate = 'Nagbabayad ako ng CPA kahit maliit lang kita ko';

update public.waitlist set bir_hate_level = 9
where bir_hate_level is null and hate = 'Natatakot ako sa penalties';

update public.waitlist set bir_hate_level = 10
where bir_hate_level is null and hate = 'Ayoko lang talaga, period';

-- Anything left unmapped (shouldn't happen) defaults to the middle of the scale.
update public.waitlist set bir_hate_level = 5 where bir_hate_level is null;

alter table public.waitlist
  alter column bir_hate_level set not null,
  add constraint waitlist_bir_hate_level_check check (bir_hate_level between 1 and 10);

alter table public.waitlist drop column if exists hate;
