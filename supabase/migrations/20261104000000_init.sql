-- VEIL AI — initial schema
-- Every table is protected by Row Level Security: a signed-in user can only
-- ever read or modify their own rows. The anon role has no access at all.
-- Sensitive free text (chat messages, goals, saved reports) is additionally
-- encrypted by the application (AES-256-GCM) when DATA_ENCRYPTION_KEY is set.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tracked wallets (public account IDs only — never keys or seed phrases)
-- ---------------------------------------------------------------------------
create table if not exists public.tracked_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id text not null check (char_length(account_id) between 2 and 64),
  label text check (label is null or char_length(label) <= 40),
  network text not null default 'mainnet' check (network in ('mainnet', 'testnet')),
  ownership_verified boolean not null default false,
  verified_public_key text check (verified_public_key is null or verified_public_key like 'ed25519:%'),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, account_id, network)
);
create index if not exists tracked_wallets_user_idx on public.tracked_wallets (user_id);

-- ---------------------------------------------------------------------------
-- AI conversations and messages
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_user_idx on public.conversations (user_id, updated_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null, -- application-encrypted ("enc:v1:…") when configured
  meta jsonb not null default '{}'::jsonb, -- mode, model, verification summary; never prompt text
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Financial preferences ("AI memory") — explicit, user-controlled
-- ---------------------------------------------------------------------------
create table if not exists public.preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  timeframe text check (timeframe in ('short', 'medium', 'long')),
  risk_tolerance text check (risk_tolerance in ('conservative', 'balanced', 'aggressive')),
  ecosystems text[] not null default '{}',
  watchlist text[] not null default '{}',
  goals text, -- application-encrypted when configured
  use_in_ai boolean not null default false,
  save_chat_history boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Confidential processing log — verification metadata only, no content
-- ---------------------------------------------------------------------------
create table if not exists public.processing_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('chat', 'attestation', 'report')),
  model text,
  state text not null,
  e2ee boolean not null default false,
  nonce text,
  chat_id text,
  summary text check (summary is null or char_length(summary) <= 600),
  result jsonb, -- check list (pass/fail + hashes); never prompts or answers
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists processing_log_user_idx on public.processing_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Saved reports
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('portfolio', 'risk', 'wallet', 'ai-summary')),
  title text not null check (char_length(title) <= 160),
  mode text not null check (mode in ('live', 'demo')),
  content text not null, -- JSON report, application-encrypted when configured
  created_at timestamptz not null default now()
);
create index if not exists reports_user_idx on public.reports (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.tracked_wallets enable row level security;
alter table public.conversations   enable row level security;
alter table public.messages        enable row level security;
alter table public.preferences     enable row level security;
alter table public.processing_log  enable row level security;
alter table public.reports         enable row level security;

-- Remove default privileges from anon; authenticated users go through RLS.
revoke all on public.tracked_wallets, public.conversations, public.messages,
  public.preferences, public.processing_log, public.reports from anon;
grant select, insert, update, delete on public.tracked_wallets, public.conversations,
  public.messages, public.preferences, public.processing_log, public.reports to authenticated;

-- tracked_wallets
create policy "wallets: owner select" on public.tracked_wallets for select to authenticated using ((select auth.uid()) = user_id);
create policy "wallets: owner insert" on public.tracked_wallets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "wallets: owner update" on public.tracked_wallets for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "wallets: owner delete" on public.tracked_wallets for delete to authenticated using ((select auth.uid()) = user_id);

-- conversations
create policy "conversations: owner select" on public.conversations for select to authenticated using ((select auth.uid()) = user_id);
create policy "conversations: owner insert" on public.conversations for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "conversations: owner update" on public.conversations for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "conversations: owner delete" on public.conversations for delete to authenticated using ((select auth.uid()) = user_id);

-- messages: must belong to the user AND to one of the user's conversations
create policy "messages: owner select" on public.messages for select to authenticated using ((select auth.uid()) = user_id);
create policy "messages: owner insert" on public.messages for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
);
create policy "messages: owner delete" on public.messages for delete to authenticated using ((select auth.uid()) = user_id);

-- preferences
create policy "preferences: owner select" on public.preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy "preferences: owner insert" on public.preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "preferences: owner update" on public.preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "preferences: owner delete" on public.preferences for delete to authenticated using ((select auth.uid()) = user_id);

-- processing_log (append + read + clear; no updates)
create policy "processing_log: owner select" on public.processing_log for select to authenticated using ((select auth.uid()) = user_id);
create policy "processing_log: owner insert" on public.processing_log for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "processing_log: owner delete" on public.processing_log for delete to authenticated using ((select auth.uid()) = user_id);

-- reports
create policy "reports: owner select" on public.reports for select to authenticated using ((select auth.uid()) = user_id);
create policy "reports: owner insert" on public.reports for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "reports: owner delete" on public.reports for delete to authenticated using ((select auth.uid()) = user_id);

-- Keep conversations.updated_at fresh when messages are added.
create or replace function public.touch_conversation() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;
drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation after insert on public.messages
  for each row execute function public.touch_conversation();

-- Limit the size of the processing log per user (keep last 500 rows).
create or replace function public.trim_processing_log() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.processing_log
  where user_id = new.user_id
    and id in (
      select id from public.processing_log where user_id = new.user_id
      order by created_at desc offset 500
    );
  return new;
end;
$$;
drop trigger if exists processing_log_trim on public.processing_log;
create trigger processing_log_trim after insert on public.processing_log
  for each row execute function public.trim_processing_log();
