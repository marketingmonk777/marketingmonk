-- MarketingMonk Part 2 schema (Supabase / Postgres)
-- Run in Supabase: SQL Editor > New query > paste > Run.

create table if not exists public.stages (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  stage_id uuid references public.stages(id) on delete set null,
  name text not null,
  phone text,
  email text,
  source text,                         -- Meta ads, Google ads, Website, WhatsApp, Referral, Walk-in
  score text check (score in ('hot','warm','cold')) default 'warm',
  interest text,
  budget text,
  timeline text,
  assigned_to text,
  tags text[] default '{}',
  value numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  kind text check (kind in ('note','call','whatsapp','email')) default 'note',
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists leads_owner_stage on public.leads(owner, stage_id);
create index if not exists notes_lead on public.notes(lead_id, created_at desc);
create index if not exists tasks_owner_due on public.tasks(owner, done, due_at);

-- Row level security: every user sees only their own rows.
alter table public.stages enable row level security;
alter table public.leads  enable row level security;
alter table public.notes  enable row level security;
alter table public.tasks  enable row level security;

do $$ declare t text; begin
  foreach t in array array['stages','leads','notes','tasks'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (owner = auth.uid()) with check (owner = auth.uid())', t);
  end loop;
end $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads for each row execute function public.touch_updated_at();

-- ===== Part 3: Monk AI + WhatsApp inbox =====
create table if not exists public.agent_config (
  owner uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  config jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  name text,
  phone text,
  channel text not null default 'whatsapp',          -- whatsapp | simulator
  status text not null default 'ai' check (status in ('ai','human','done')),
  score text,
  step int not null default -1,
  answers jsonb not null default '{}',
  messages jsonb not null default '[]',               -- [{from:'lead'|'ai'|'rep', body, at}]
  unread int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists conversations_owner_phone on public.conversations(owner, phone) where channel = 'whatsapp';

alter table public.agent_config enable row level security;
alter table public.conversations enable row level security;
drop policy if exists "own rows" on public.agent_config;
create policy "own rows" on public.agent_config for all using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "own rows" on public.conversations;
create policy "own rows" on public.conversations for all using (owner = auth.uid()) with check (owner = auth.uid());
drop trigger if exists conversations_touch on public.conversations;
create trigger conversations_touch before update on public.conversations for each row execute function public.touch_updated_at();
