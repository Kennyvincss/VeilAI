-- VEIL AI — usernames
-- A username lets people (1) sign in with username + password and
-- (2) receive NEAR at @username. The receiving account must be one of the
-- user's ownership-verified wallets (NEP-413 proof), enforced below.
-- Linking a wallet makes "@username → account" public, by the user's choice.

create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  payout_account text check (payout_account is null or char_length(payout_account) between 2 and 64),
  payout_network text check (payout_network is null or payout_network in ('mainnet', 'testnet')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
grant select, insert, update, delete on public.profiles to authenticated;

create policy "profiles: owner select" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "profiles: owner insert" on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profiles: owner update" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "profiles: owner delete" on public.profiles for delete to authenticated using ((select auth.uid()) = user_id);

-- Names nobody may claim (impersonation of the app, NEAR or support staff).
create or replace function public.is_reserved_username(u text) returns boolean
language sql immutable as $$
  select lower(u) = any (array[
    'admin','administrator','root','support','help','helpdesk','security','official','team','staff','moderator','mod',
    'veil','veilai','veil_ai','near','nearai','near_ai','nearprotocol','near_protocol','wallet','system','api','null','undefined',
    'billing','payments','payment','refund','refunds','verify','verification','login','signin','signup','account','accounts'
  ]);
$$;

-- Validation + payout must be an ownership-verified wallet of the same user.
create or replace function public.profiles_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.username := lower(new.username);
  if public.is_reserved_username(new.username) then
    raise exception 'username is reserved' using errcode = '23514';
  end if;
  if new.payout_account is not null then
    if new.payout_network is null or not exists (
      select 1 from public.tracked_wallets w
      where w.user_id = new.user_id and w.account_id = new.payout_account
        and w.network = new.payout_network and w.ownership_verified
    ) then
      raise exception 'payout account must be an ownership-verified wallet' using errcode = '23514';
    end if;
  else
    new.payout_network := null;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_before_write on public.profiles;
create trigger profiles_before_write before insert or update on public.profiles
  for each row execute function public.profiles_before_write();

-- Unlink the payout account if its wallet stops being tracked.
create or replace function public.profiles_unlink_wallet() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set payout_account = null
  where user_id = old.user_id and payout_account = old.account_id and payout_network = old.network;
  return old;
end $$;

drop trigger if exists tracked_wallets_unlink_payout on public.tracked_wallets;
create trigger tracked_wallets_unlink_payout after delete on public.tracked_wallets
  for each row execute function public.profiles_unlink_wallet();

-- Claim the username chosen at sign-up (silently skipped if invalid or taken;
-- the user can pick another one later in the app).
create or replace function public.handle_new_user_username() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  u text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
begin
  if u ~ '^[a-z0-9_]{3,20}$' and not public.is_reserved_username(u) then
    insert into public.profiles (user_id, username) values (new.id, u) on conflict do nothing;
  end if;
  return new;
exception when others then
  return new; -- never block account creation because of a username
end $$;

drop trigger if exists on_auth_user_created_username on auth.users;
create trigger on_auth_user_created_username after insert on auth.users
  for each row execute function public.handle_new_user_username();

-- Public: is a username free? (usernames are public identifiers)
create or replace function public.username_available(u text) returns boolean
language sql stable security definer set search_path = public as $$
  select lower(u) ~ '^[a-z0-9_]{3,20}$'
     and not public.is_reserved_username(u)
     and not exists (select 1 from public.profiles p where p.username = lower(u));
$$;

-- Public: @username → linked account, only when the user linked one.
create or replace function public.resolve_username(u text, net text) returns table (username text, account_id text)
language sql stable security definer set search_path = public as $$
  select p.username, p.payout_account from public.profiles p
  where p.username = lower(u) and p.payout_account is not null and p.payout_network = net;
$$;

-- Server-only (service role): username → email for username sign-in.
create or replace function public.email_for_username(u text) returns text
language sql stable security definer set search_path = public, auth as $$
  select au.email from public.profiles p join auth.users au on au.id = p.user_id where p.username = lower(u);
$$;

revoke all on function public.username_available(text) from public;
revoke all on function public.resolve_username(text, text) from public;
revoke all on function public.email_for_username(text) from public, anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.resolve_username(text, text) to anon, authenticated;
grant execute on function public.email_for_username(text) to service_role;
