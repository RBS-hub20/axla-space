-- Run this in the Supabase SQL editor. Widens business_registrations'
-- `type` check to also cover the Open/Close/SPA toolkit kits, not just
-- DTI/SEC/MAYORS.
--
-- Note: this is a deliberate change from those 3 tabs' original "no extra
-- data logging - stateless" design. Brain AI's new "summary" command needs
-- to list all 6 kit types generated with timestamps, which isn't possible
-- without recording that an Open/Close/SPA kit was generated. What's stored
-- is the same non-sensitive form data the user already typed (names,
-- addresses, business type) - no BIR credentials, nothing new the user
-- didn't already enter into the form itself.

alter table public.business_registrations drop constraint business_registrations_type_check;
alter table public.business_registrations
  add constraint business_registrations_type_check
  check (type in ('OPEN', 'CLOSE', 'SPA', 'DTI', 'SEC', 'MAYORS'));
