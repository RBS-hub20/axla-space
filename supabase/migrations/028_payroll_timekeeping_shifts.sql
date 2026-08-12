-- Timekeeping Pro: shift schedules + attendance status, additive only.
-- Same conventions as every migration since 005 (owner_id/staff_id text or
-- uuid FK, RLS enabled with service_role-only grants, access control
-- enforced in API routes).
--
-- Deliberately structured (day list + two time columns + an integer) rather
-- than parsing the free-text `schedule` column added in migration 027 —
-- that field stays as-is for display (Staff tab's Rate column subtitle,
-- e.g. "Mon-Sat 9AM-6PM"); these new columns are what the Timekeeping tab's
-- late/overtime/undertime math actually reads, so it isn't built on regex
-- guesses against free text.
alter table public.payroll_staff add column if not exists work_days text not null default 'Mon,Tue,Wed,Thu,Fri,Sat';
alter table public.payroll_staff add column if not exists shift_start time not null default '09:00';
alter table public.payroll_staff add column if not exists shift_end time not null default '18:00';
alter table public.payroll_staff add column if not exists grace_period_minutes integer not null default 15;

-- 'present' is the correct default for every existing row — they only ever
-- got a payroll_attendance row by actually clocking in (manual or AI
-- Selfie), so backfilling anything else would misrepresent real history.
-- 'absent'/'leave'/'sick' are written going forward by the new Mark
-- Absent/On Leave/Sick quick actions (a status row with no time_in).
alter table public.payroll_attendance add column if not exists status text not null default 'present' check (status in ('present', 'absent', 'leave', 'sick'));
