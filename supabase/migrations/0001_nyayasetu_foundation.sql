-- NyayaSetu Prompt 15 — foundation tables + Row-Level Security.
--
-- Every private table carries user_id (the auth.users owner). RLS is enabled
-- on ALL tables: with no policy allowing a row, Postgres denies it. Each
-- policy below filters on auth.uid() = user_id (or case ownership derived
-- from it). No policy grants access unconditionally.
-- Apply with: supabase db push  (see SUPABASE_SETUP.md)

-- ─── updated_at helper ──────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── profiles ───────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  language_preference text not null default 'en' check (language_preference in ('en', 'hi')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles
  for delete using (auth.uid() = user_id);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ─── cases ──────────────────────────────────────────────────────────────────

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'intake',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cases enable row level security;

drop policy if exists cases_owner_all on public.cases;
create policy cases_owner_all on public.cases
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists trg_cases_updated_at on public.cases;
create trigger trg_cases_updated_at
  before update on public.cases
  for each row execute function public.set_updated_at();

-- ─── case_members (ownership / sharing records) ─────────────────────────────

create table if not exists public.case_members (
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'viewer')),
  added_at timestamptz not null default now(),
  primary key (case_id, user_id)
);

alter table public.case_members enable row level security;

-- A member sees their own memberships; a case owner sees all memberships of
-- cases they own (needed to manage sharing). Nobody else sees anything.
drop policy if exists case_members_select on public.case_members;
create policy case_members_select on public.case_members
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.cases c
      where c.id = case_members.case_id and c.user_id = auth.uid()
    )
  );

-- Only the case owner can add, change, or remove memberships.
drop policy if exists case_members_insert_owner on public.case_members;
create policy case_members_insert_owner on public.case_members
  for insert with check (
    exists (
      select 1 from public.cases c
      where c.id = case_members.case_id and c.user_id = auth.uid()
    )
  );

drop policy if exists case_members_update_owner on public.case_members;
create policy case_members_update_owner on public.case_members
  for update using (
    exists (
      select 1 from public.cases c
      where c.id = case_members.case_id and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.cases c
      where c.id = case_members.case_id and c.user_id = auth.uid()
    )
  );

drop policy if exists case_members_delete_owner on public.case_members;
create policy case_members_delete_owner on public.case_members
  for delete using (
    exists (
      select 1 from public.cases c
      where c.id = case_members.case_id and c.user_id = auth.uid()
    )
  );

-- ─── documents (evidence / document metadata; bytes live in Storage) ────────

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  object_key text not null unique,
  processing_status text not null default 'selected',
  uploaded_at timestamptz not null default now()
);

alter table public.documents enable row level security;

drop policy if exists documents_owner_all on public.documents;
create policy documents_owner_all on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── extracted_facts ────────────────────────────────────────────────────────

create table if not exists public.extracted_facts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  field text not null,
  value text not null default '',
  raw_text text not null default '',
  source text not null default 'document_text',
  confidence text not null default 'medium' check (confidence in ('high', 'medium', 'low')),
  created_at timestamptz not null default now()
);

alter table public.extracted_facts enable row level security;

drop policy if exists extracted_facts_owner_all on public.extracted_facts;
create policy extracted_facts_owner_all on public.extracted_facts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── confirmed_facts ────────────────────────────────────────────────────────
-- Confirmed facts survive document deletion (provenance promise): the link to
-- the document is nulled instead of cascading.

create table if not exists public.confirmed_facts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  field text not null,
  value text not null default '',
  confirmed_at timestamptz not null default now()
);

alter table public.confirmed_facts enable row level security;

drop policy if exists confirmed_facts_owner_all on public.confirmed_facts;
create policy confirmed_facts_owner_all on public.confirmed_facts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── action_plans ───────────────────────────────────────────────────────────

create table if not exists public.action_plans (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_version integer not null default 1,
  summary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.action_plans enable row level security;

drop policy if exists action_plans_owner_all on public.action_plans;
create policy action_plans_owner_all on public.action_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists trg_action_plans_updated_at on public.action_plans;
create trigger trg_action_plans_updated_at
  before update on public.action_plans
  for each row execute function public.set_updated_at();

-- ─── action_items ───────────────────────────────────────────────────────────

create table if not exists public.action_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.action_plans (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'done', 'skipped')),
  updated_at timestamptz not null default now()
);

alter table public.action_items enable row level security;

drop policy if exists action_items_owner_all on public.action_items;
create policy action_items_owner_all on public.action_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists trg_action_items_updated_at on public.action_items;
create trigger trg_action_items_updated_at
  before update on public.action_items
  for each row execute function public.set_updated_at();

-- ─── timeline_events (audit trail; content-free categories only) ────────────

create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null,
  created_at timestamptz not null default now()
);

alter table public.timeline_events enable row level security;

drop policy if exists timeline_events_owner_all on public.timeline_events;
create policy timeline_events_owner_all on public.timeline_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── ai_proposals (advisory only; never auto-applied) ───────────────────────

create table if not exists public.ai_proposals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  summary text not null default '',
  status text not null default 'proposed'
    check (status in ('proposed', 'confirmed', 'rejected', 'modified')),
  created_at timestamptz not null default now()
);

alter table public.ai_proposals enable row level security;

drop policy if exists ai_proposals_owner_all on public.ai_proposals;
create policy ai_proposals_owner_all on public.ai_proposals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
