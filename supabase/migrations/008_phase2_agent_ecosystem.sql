-- Touchline Phase 2: Agent Ecosystem Architecture.
-- Removes reliance on static placeholder workflows by adding real operating tables for
-- players, club interest, opportunities, negotiation rooms, live center,
-- community, and non-gambling predictions.

alter table public.players
  add column if not exists contract_end_date date,
  add column if not exists height_cm numeric(5,2),
  add column if not exists weight_kg numeric(5,2),
  add column if not exists ai_profile jsonb not null default '{}'::jsonb;

create table if not exists public.club_agent_follows (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  followed_by uuid references public.users(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'muted', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, club_id)
);

create table if not exists public.player_opportunities (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete set null,
  title text not null,
  position_needed text,
  age_min smallint,
  age_max smallint,
  requirements jsonb not null default '{}'::jsonb,
  match_score smallint check (match_score between 0 and 100),
  status text not null default 'open' check (status in ('open', 'sent_profile', 'contact_requested', 'negotiation', 'closed', 'dismissed')),
  source text not null default 'manual' check (source in ('manual', 'club_requirement', 'ai_match', 'market_alert')),
  created_by uuid references public.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_interests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete set null,
  club_name text not null,
  sporting_director text,
  position_needed text,
  message text,
  status text not null default 'new_interest' check (status in ('new_interest', 'contact_started', 'negotiation', 'deal_closed', 'declined')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.negotiation_rooms (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  interest_id uuid references public.player_interests(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  player_id uuid references public.players(id) on delete set null,
  club_id uuid references public.clubs(id) on delete set null,
  title text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'closed', 'archived')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.negotiation_messages (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  room_id uuid not null references public.negotiation_rooms(id) on delete cascade,
  sender_id uuid references public.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.negotiation_files (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  room_id uuid not null references public.negotiation_rooms(id) on delete cascade,
  uploaded_by uuid references public.users(id) on delete set null,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_generated_documents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  target_type text not null default 'workspace' check (target_type in ('workspace', 'player', 'club', 'deal', 'contract')),
  target_id uuid,
  document_type text not null check (document_type in ('contract', 'proposal', 'email', 'scouting_report', 'player_presentation', 'bio', 'market_recommendation')),
  title text not null,
  content text not null default '',
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.football_live_items (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  item_type text not null check (item_type in ('fixture', 'live_score', 'statistic', 'player_rating', 'transfer_news', 'injury_report')),
  title text not null,
  source_url text,
  payload jsonb not null default '{}'::jsonb,
  starts_at timestamptz,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.community_posts_phase2 (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  author_id uuid references public.users(id) on delete set null,
  post_type text not null default 'insight' check (post_type in ('insight', 'player_share', 'opportunity', 'scout_note', 'club_update')),
  body text not null,
  related_player_id uuid references public.players(id) on delete set null,
  visibility text not null default 'private_network' check (visibility in ('public', 'private_network', 'club_only', 'agent_only')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_predictions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  fixture_key text not null,
  prediction_type text not null check (prediction_type in ('match_result', 'transfer', 'tournament_winner')),
  prediction jsonb not null default '{}'::jsonb,
  points_awarded integer not null default 0 check (points_awarded >= 0),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, fixture_key, prediction_type)
);

create index if not exists players_contract_end_idx on public.players(agency_id, contract_end_date);
create index if not exists club_agent_follows_agency_idx on public.club_agent_follows(agency_id, status);
create index if not exists player_opportunities_agency_status_idx on public.player_opportunities(agency_id, status, created_at desc);
create index if not exists player_interests_agency_status_idx on public.player_interests(agency_id, status, created_at desc);
create index if not exists negotiation_rooms_agency_status_idx on public.negotiation_rooms(agency_id, status, updated_at desc);
create index if not exists football_live_items_published_idx on public.football_live_items(agency_id, item_type, published_at desc);
create index if not exists community_posts_phase2_idx on public.community_posts_phase2(agency_id, created_at desc);
create index if not exists match_predictions_user_idx on public.match_predictions(user_id, created_at desc);

drop trigger if exists club_agent_follows_updated on public.club_agent_follows;
create trigger club_agent_follows_updated before update on public.club_agent_follows
  for each row execute function public.touch_updated_at();

drop trigger if exists player_opportunities_updated on public.player_opportunities;
create trigger player_opportunities_updated before update on public.player_opportunities
  for each row execute function public.touch_updated_at();

drop trigger if exists player_interests_updated on public.player_interests;
create trigger player_interests_updated before update on public.player_interests
  for each row execute function public.touch_updated_at();

drop trigger if exists negotiation_rooms_updated on public.negotiation_rooms;
create trigger negotiation_rooms_updated before update on public.negotiation_rooms
  for each row execute function public.touch_updated_at();

drop trigger if exists ai_generated_documents_updated on public.ai_generated_documents;
create trigger ai_generated_documents_updated before update on public.ai_generated_documents
  for each row execute function public.touch_updated_at();

drop trigger if exists community_posts_phase2_updated on public.community_posts_phase2;
create trigger community_posts_phase2_updated before update on public.community_posts_phase2
  for each row execute function public.touch_updated_at();

alter table public.club_agent_follows enable row level security;
alter table public.player_opportunities enable row level security;
alter table public.player_interests enable row level security;
alter table public.negotiation_rooms enable row level security;
alter table public.negotiation_messages enable row level security;
alter table public.negotiation_files enable row level security;
alter table public.ai_generated_documents enable row level security;
alter table public.football_live_items enable row level security;
alter table public.community_posts_phase2 enable row level security;
alter table public.match_predictions enable row level security;

drop policy if exists "tenant club agent follows" on public.club_agent_follows;
create policy "tenant club agent follows" on public.club_agent_follows
  for all using (agency_id = public.current_agency_id()) with check (agency_id = public.current_agency_id());

drop policy if exists "tenant player opportunities" on public.player_opportunities;
create policy "tenant player opportunities" on public.player_opportunities
  for all using (agency_id = public.current_agency_id()) with check (agency_id = public.current_agency_id());

drop policy if exists "tenant player interests" on public.player_interests;
create policy "tenant player interests" on public.player_interests
  for all using (agency_id = public.current_agency_id()) with check (agency_id = public.current_agency_id());

drop policy if exists "tenant negotiation rooms" on public.negotiation_rooms;
create policy "tenant negotiation rooms" on public.negotiation_rooms
  for all using (agency_id = public.current_agency_id()) with check (agency_id = public.current_agency_id());

drop policy if exists "tenant negotiation messages" on public.negotiation_messages;
create policy "tenant negotiation messages" on public.negotiation_messages
  for all using (agency_id = public.current_agency_id()) with check (agency_id = public.current_agency_id());

drop policy if exists "tenant negotiation files" on public.negotiation_files;
create policy "tenant negotiation files" on public.negotiation_files
  for all using (agency_id = public.current_agency_id()) with check (agency_id = public.current_agency_id());

drop policy if exists "tenant ai generated documents" on public.ai_generated_documents;
create policy "tenant ai generated documents" on public.ai_generated_documents
  for all using (agency_id = public.current_agency_id()) with check (agency_id = public.current_agency_id());

drop policy if exists "tenant football live items" on public.football_live_items;
create policy "tenant football live items" on public.football_live_items
  for all using (agency_id is null or agency_id = public.current_agency_id()) with check (agency_id = public.current_agency_id());

drop policy if exists "tenant community posts phase2" on public.community_posts_phase2;
create policy "tenant community posts phase2" on public.community_posts_phase2
  for all using (agency_id is null or agency_id = public.current_agency_id()) with check (agency_id = public.current_agency_id());

drop policy if exists "tenant match predictions" on public.match_predictions;
create policy "tenant match predictions" on public.match_predictions
  for all using (agency_id is null or agency_id = public.current_agency_id()) with check (agency_id = public.current_agency_id());

grant select, insert, update, delete on public.club_agent_follows to authenticated, service_role;
grant select, insert, update, delete on public.player_opportunities to authenticated, service_role;
grant select, insert, update, delete on public.player_interests to authenticated, service_role;
grant select, insert, update, delete on public.negotiation_rooms to authenticated, service_role;
grant select, insert, update, delete on public.negotiation_messages to authenticated, service_role;
grant select, insert, update, delete on public.negotiation_files to authenticated, service_role;
grant select, insert, update, delete on public.ai_generated_documents to authenticated, service_role;
grant select, insert, update, delete on public.football_live_items to authenticated, service_role;
grant select, insert, update, delete on public.community_posts_phase2 to authenticated, service_role;
grant select, insert, update, delete on public.match_predictions to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-vault',
  'player-vault',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 20971520,
    allowed_mime_types = excluded.allowed_mime_types;
