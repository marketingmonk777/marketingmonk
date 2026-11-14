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

-- ===== Part 4: follow-up sequences + bookings =====
create table if not exists public.sequences (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  stop_on_reply boolean not null default true,
  steps jsonb not null default '[]',                  -- [{delay_days, body}]
  created_at timestamptz not null default now()
);
create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  step int not null default 0,
  next_at timestamptz,
  status text not null default 'active' check (status in ('active','done','stopped')),
  created_at timestamptz not null default now()
);
create index if not exists enrollments_due on public.enrollments(next_at) where status = 'active';

create table if not exists public.availability (
  owner uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  config jsonb not null default '{}'                  -- {title, days[], start, end, slot_minutes, window_days, note, tz}
);
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  name text not null, phone text, email text, note text,
  starts_at timestamptz not null, ends_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked','done','noshow','cancelled')),
  created_at timestamptz not null default now()
);
create unique index if not exists bookings_no_double on public.bookings(owner, starts_at) where status <> 'cancelled';

do $$ declare t text; begin
  foreach t in array array['sequences','enrollments','availability','bookings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (owner = auth.uid()) with check (owner = auth.uid())', t);
  end loop;
end $$;

-- Public booking page: read-only info, no table access for anonymous visitors.
create or replace function public.mm_booking_page(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'config', a.config,
    'business', coalesce(ac.config->>'business_name', 'MarketingMonk'),
    'busy', coalesce((select jsonb_agg(b.starts_at) from bookings b where b.owner = a.owner and b.status <> 'cancelled' and b.starts_at > now()), '[]'::jsonb))
  from availability a left join agent_config ac on ac.owner = a.owner
  where a.slug = p_slug;
$$;

create or replace function public.mm_book(p_slug text, p_name text, p_phone text, p_email text, p_starts_at timestamptz, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare a availability; v_lead uuid; v_stage uuid; v_id uuid; v_len int; v_digits text;
begin
  select * into a from availability where slug = p_slug;
  if a.owner is null then raise exception 'not found'; end if;
  if p_starts_at < now() or p_starts_at > now() + make_interval(days => coalesce((a.config->>'window_days')::int, 14) + 1) then raise exception 'invalid time'; end if;
  if length(coalesce(p_name,'')) not between 1 and 120 or length(coalesce(p_phone,'')) not between 6 and 30 then raise exception 'invalid details'; end if;
  v_len := coalesce((a.config->>'slot_minutes')::int, 30);
  v_digits := right(regexp_replace(p_phone, '\D', '', 'g'), 10);
  select id into v_stage from stages where owner = a.owner and name ~* '(demo|book|meet|visit)' order by position limit 1;
  select id into v_lead from leads where owner = a.owner and right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10) = v_digits limit 1;
  if v_lead is null then
    insert into leads(owner, name, phone, email, source, score, stage_id, interest, timeline, tags)
    values (a.owner, p_name, p_phone, p_email, 'Booking page', 'hot',
            coalesce(v_stage, (select id from stages where owner = a.owner order by position limit 1)), left(p_note, 500), 'Booked a call', array['booked'])
    returning id into v_lead;
  else
    update leads set score = 'hot', stage_id = coalesce(v_stage, stage_id) where id = v_lead;
  end if;
  begin
    insert into bookings(owner, lead_id, name, phone, email, note, starts_at, ends_at)
    values (a.owner, v_lead, p_name, p_phone, p_email, left(p_note, 500), p_starts_at, p_starts_at + make_interval(mins => v_len))
    returning id into v_id;
  exception when unique_violation then raise exception 'slot taken';
  end;
  insert into notes(owner, lead_id, kind, body) values (a.owner, v_lead, 'call', 'Booked "' || coalesce(a.config->>'title','a call') || '" for ' || to_char(p_starts_at at time zone coalesce(a.config->>'tz','UTC'), 'DD Mon HH12:MI AM'));
  update enrollments set status = 'stopped' where lead_id = v_lead and status = 'active';
  return v_id;
end $$;
grant execute on function public.mm_booking_page(text) to anon, authenticated;
grant execute on function public.mm_book(text, text, text, text, timestamptz, text) to anon, authenticated;

-- ===== Part 5: integrations =====
create table if not exists public.integrations (
  owner uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  config jsonb not null default '{}'                  -- {webhook_out, intake_key, wa_number}
);
alter table public.integrations enable row level security;
drop policy if exists "own rows" on public.integrations;
create policy "own rows" on public.integrations for all using (owner = auth.uid()) with check (owner = auth.uid());

-- Website form: public, uses your booking-page handle to find your workspace.
create or replace function public.mm_capture_lead(p_slug text, p_name text, p_phone text, p_email text, p_interest text, p_page text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_lead uuid; v_digits text;
begin
  select owner into v_owner from availability where slug = p_slug;
  if v_owner is null then raise exception 'not found'; end if;
  if length(coalesce(p_name,'')) not between 1 and 120 or length(coalesce(p_phone,'')) not between 6 and 30 then raise exception 'invalid details'; end if;
  -- simple flood guard: at most 30 web leads per workspace per hour
  if (select count(*) from leads where owner = v_owner and source = 'Website' and created_at > now() - interval '1 hour') >= 30 then raise exception 'rate limited'; end if;
  v_digits := right(regexp_replace(p_phone, '\D', '', 'g'), 10);
  select id into v_lead from leads where owner = v_owner and right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10) = v_digits limit 1;
  if v_lead is not null then
    insert into notes(owner, lead_id, kind, body) values (v_owner, v_lead, 'note', 'Filled the website form again: ' || coalesce(left(p_interest, 500), '(no message)'));
    return v_lead;
  end if;
  insert into leads(owner, name, phone, email, source, score, stage_id, interest, tags)
  values (v_owner, left(p_name, 120), p_phone, p_email, 'Website', 'warm', (select id from stages where owner = v_owner order by position limit 1), left(p_interest, 500), array['web-form'])
  returning id into v_lead;
  if p_page is not null then insert into notes(owner, lead_id, kind, body) values (v_owner, v_lead, 'note', 'Website form on ' || left(p_page, 300)); end if;
  return v_lead;
end $$;
grant execute on function public.mm_capture_lead(text, text, text, text, text, text) to anon, authenticated;

-- Outgoing webhook: POST every new lead to your Zapier / Make / Apps Script URL.
-- Needs the pg_net extension (Database → Extensions → pg_net). Fails quietly without it.
create or replace function public.mm_lead_webhook() returns trigger language plpgsql security definer set search_path = public as $$
declare v_url text;
begin
  select config->>'webhook_out' into v_url from integrations where owner = new.owner;
  if v_url like 'https://%' then
    begin
      perform net.http_post(url := v_url, headers := '{"Content-Type":"application/json"}'::jsonb,
        body := jsonb_build_object('event', 'lead.created', 'lead', jsonb_build_object('id', new.id, 'name', new.name, 'phone', new.phone, 'email', new.email,
          'source', new.source, 'score', new.score, 'interest', new.interest, 'budget', new.budget, 'timeline', new.timeline, 'created_at', new.created_at)));
    exception when others then null;
    end;
  end if;
  return new;
end $$;
drop trigger if exists leads_webhook on public.leads;
create trigger leads_webhook after insert on public.leads for each row execute function public.mm_lead_webhook();

-- ===== Part 7: sales desk (quotations) =====
-- Quick replies, sales team and quote letterhead live in integrations.config.
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  number text not null,
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected')),
  items jsonb not null default '[]',          -- [{desc, qty, unit, rate}]
  gst numeric not null default 18,
  valid_days int not null default 15,
  terms text default '',
  total numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.quotes enable row level security;
drop policy if exists "own rows" on public.quotes;
create policy "own rows" on public.quotes for all using (owner = auth.uid()) with check (owner = auth.uid());
