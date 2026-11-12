-- VEIL AI — address book
-- Saved contacts for the Wallet page. Both the name and the account ID are
-- encrypted by the application (AES-256-GCM) when DATA_ENCRYPTION_KEY is
-- set, so the database never sees who a user pays. RLS: owner-only.

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  network text not null default 'mainnet' check (network in ('mainnet', 'testnet')),
  label text not null check (char_length(label) <= 400),       -- application-encrypted
  account_id text not null check (char_length(account_id) <= 400), -- application-encrypted
  created_at timestamptz not null default now()
);
create index if not exists contacts_user_idx on public.contacts (user_id, network, created_at);

alter table public.contacts enable row level security;
revoke all on public.contacts from anon;
grant select, insert, delete on public.contacts to authenticated;

drop policy if exists "contacts: owner select" on public.contacts;
create policy "contacts: owner select" on public.contacts for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "contacts: owner insert" on public.contacts;
create policy "contacts: owner insert" on public.contacts for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "contacts: owner delete" on public.contacts;
create policy "contacts: owner delete" on public.contacts for delete to authenticated using ((select auth.uid()) = user_id);
