-- Run this in the Supabase SQL editor. Splits bir_rdo_transfers' free-text
-- from_rdo/to_rdo into structured code+name pairs, backing the new
-- searchable RDO dropdown (src/components/dashboard/RdoPicker.tsx) instead
-- of a plain text input. Table has zero rows in production as of this
-- migration (feature shipped last session, unused), so this drops the old
-- columns outright rather than migrating data that doesn't exist.

alter table public.bir_rdo_transfers drop column if exists from_rdo;
alter table public.bir_rdo_transfers drop column if exists to_rdo;

alter table public.bir_rdo_transfers add column if not exists from_rdo_code text not null default '';
alter table public.bir_rdo_transfers add column if not exists from_rdo_name text not null default '';
alter table public.bir_rdo_transfers add column if not exists to_rdo_code text not null default '';
alter table public.bir_rdo_transfers add column if not exists to_rdo_name text not null default '';
