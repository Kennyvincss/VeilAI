-- VEIL AI — NEAR accounts created for users ("alice.near")
-- The user's browser generates the key and recovery phrase; VEIL only ever
-- receives the PUBLIC key. VEIL's sponsor account pays the small deposit to
-- create the account. This table records which account was created for which
-- VEIL user (public information) so each user gets at most one, and so a
-- daily spending cap can be enforced. NO private keys are stored anywhere.
--
-- Users can read their own row. All writes happen on the server with the
-- service role, so users can't reset their own limit.

create table if not exists public.sponsored_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  account_id text not null unique check (char_length(account_id) between 2 and 64),
  network text not null check (network in ('mainnet', 'testnet')),
  public_key text not null check (public_key like 'ed25519:%'),
  status text not null default 'pending' check (status in ('pending', 'created', 'failed')),
  tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sponsored_accounts_created_idx on public.sponsored_accounts (created_at);

alter table public.sponsored_accounts enable row level security;
revoke all on public.sponsored_accounts from anon, authenticated;
grant select on public.sponsored_accounts to authenticated;
grant all on public.sponsored_accounts to service_role;

create policy "sponsored_accounts: owner select" on public.sponsored_accounts
  for select to authenticated using ((select auth.uid()) = user_id);
