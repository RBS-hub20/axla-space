-- Run this ONLY if you already ran schema.sql before the admin dashboard's
-- chat analytics (message volume, top questions, most-asked forms, recent
-- activity feed) were added. Adds the chat_messages table used to log user
-- questions sent to TaxLaya. Skip this on a brand-new project (schema.sql
-- already includes it).

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.chat_messages enable row level security;

-- RLS with zero policies still blocks service_role unless it also holds the
-- underlying table-level GRANT — idempotent, safe to re-run.
grant select, insert, update, delete on public.chat_messages to service_role;

create index if not exists chat_messages_created_at_idx
  on public.chat_messages (created_at desc);
