-- Touchline phase 1
-- PostgreSQL / Supabase schema with agency-level tenant isolation.

create extension if not exists "pgcrypto";

create type public.agency_role as enum ('owner', 'admin', 'agent', 'analyst', 'finance', 'viewer');
create type public.player_status as enum ('active', 'scouting', 'injured', 'inactive');
create type public.deal_status as enum ('scouting', 'contact', 'negotiation', 'paperwork', 'completed', 'lost');
create type public.contract_status as enum ('draft', 'active', 'expired', 'terminated');
create type public.invoice_status as enum ('draft', 'sent', 'paid', 'overdue', 'void');

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  country_code char(2),
  default_currency char(3) not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  agency_id uuid references public.agencies(id) on delete set null,
  full_name text not null default '',
  avatar_url text,
  role public.agency_role not null default 'agent',
  phone text,
  job_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  country_code char(2),
  league text,
  crest_url text,
  primary_contact jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(agency_id, name)
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  current_club_id uuid references public.clubs(id) on delete set null,
  agent_id uuid references public.users(id) on delete set null,
  first_name text not null,
  last_name text not null,
  date_of_birth date,
  nationality char(2),
  position text,
  preferred_foot text check (preferred_foot in ('left', 'right', 'both')),
  status public.player_status not null default 'active',
  market_value numeric(14,2),
  currency char(3) not null default 'EUR',
  photo_url text,
  bio text,
  contact jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete set null,
  owner_id uuid references public.users(id) on delete set null,
  title text not null,
  deal_type text not null check (deal_type in ('transfer', 'loan', 'renewal', 'endorsement', 'other')),
  status public.deal_status not null default 'scouting',
  estimated_value numeric(14,2),
  agency_fee numeric(14,2),
  currency char(3) not null default 'EUR',
  probability smallint check (probability between 0 and 100),
  target_close_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  contract_type text not null check (contract_type in ('playing', 'representation', 'loan', 'endorsement', 'other')),
  status public.contract_status not null default 'draft',
  starts_on date,
  expires_on date,
  gross_value numeric(14,2),
  currency char(3) not null default 'EUR',
  document_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_on is null or starts_on is null or expires_on >= starts_on)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  player_id uuid references public.players(id) on delete set null,
  invoice_number text not null,
  status public.invoice_status not null default 'draft',
  client_name text not null,
  client_details jsonb not null default '{}'::jsonb,
  subtotal numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total numeric(14,2) generated always as (subtotal + tax_amount) stored,
  currency char(3) not null default 'EUR',
  issued_on date,
  due_on date,
  paid_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(agency_id, invoice_number)
);

-- Player Vault supporting records.
create table public.player_documents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  uploaded_by uuid references public.users(id) on delete set null,
  name text not null,
  category text,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table public.player_videos (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  title text not null,
  url text not null,
  thumbnail_url text,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

create table public.player_notes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  author_id uuid references public.users(id) on delete set null,
  body text not null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index players_agency_idx on public.players(agency_id);
create index players_status_idx on public.players(agency_id, status);
create index deals_pipeline_idx on public.deals(agency_id, status);
create index contracts_expiry_idx on public.contracts(agency_id, expires_on) where status = 'active';
create index invoices_status_idx on public.invoices(agency_id, status);
create index player_documents_player_idx on public.player_documents(player_id);
create index player_videos_player_idx on public.player_videos(player_id);
create index player_notes_player_idx on public.player_notes(player_id);

create or replace function public.current_agency_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select agency_id from public.users where id = auth.uid() $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end $$;

create trigger agencies_updated before update on public.agencies for each row execute function public.touch_updated_at();
create trigger users_updated before update on public.users for each row execute function public.touch_updated_at();
create trigger players_updated before update on public.players for each row execute function public.touch_updated_at();
create trigger deals_updated before update on public.deals for each row execute function public.touch_updated_at();
create trigger contracts_updated before update on public.contracts for each row execute function public.touch_updated_at();
create trigger invoices_updated before update on public.invoices for each row execute function public.touch_updated_at();
create trigger notes_updated before update on public.player_notes for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  insert into public.users (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.agencies enable row level security;
alter table public.users enable row level security;
alter table public.clubs enable row level security;
alter table public.players enable row level security;
alter table public.deals enable row level security;
alter table public.contracts enable row level security;
alter table public.invoices enable row level security;
alter table public.player_documents enable row level security;
alter table public.player_videos enable row level security;
alter table public.player_notes enable row level security;

create policy "agency members access agency" on public.agencies for all using (id = public.current_agency_id()) with check (id = public.current_agency_id());
create policy "users access agency users" on public.users for select using (agency_id = public.current_agency_id() or id = auth.uid());
create policy "users update own profile" on public.users for update using (id = auth.uid()) with check (id = auth.uid());

create policy "tenant clubs" on public.clubs for all using (agency_id = public.current_agency_id()) with check (agency_id = public.current_agency_id());
create policy "tenant players" on public.players for all using (agency_id = public.current_agency_id()) with check (agency_id = public.current_agency_id());
create policy "tenant deals" on public.deals for all using (agency_id = public.current_agency_id()) with check (agency_id = public.current_agency_id());
create policy "tenant contracts" on public.contracts for all using (agency_id = public.current_agency_id()) with check (agency_id = public.current_agency_id());
create policy "tenant invoices" on public.invoices for all using (agency_id = public.current_agency_id()) with check (agency_id = public.current_agency_id());
create policy "tenant documents" on public.player_documents for all using (agency_id = public.current_agency_id()) with check (agency_id = public.current_agency_id());
create policy "tenant videos" on public.player_videos for all using (agency_id = public.current_agency_id()) with check (agency_id = public.current_agency_id());
create policy "tenant notes" on public.player_notes for all using (agency_id = public.current_agency_id()) with check (agency_id = public.current_agency_id());

-- Create private bucket in Supabase Storage dashboard:
-- insert into storage.buckets (id, name, public) values ('player-vault', 'player-vault', false);
