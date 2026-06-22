-- Touchline global ecosystem expansion
-- Adds multi-sided organizations, club recruitment, academy distribution,
-- qualified investment rooms, professional networking, social activity,
-- competition/progression, and auditable AI sessions.

create type public.organization_type as enum (
  'agency', 'club', 'academy', 'investor', 'scouting_firm',
  'legal_firm', 'family_office', 'performance_partner'
);
create type public.organization_role as enum ('owner', 'admin', 'member', 'analyst', 'viewer');
create type public.connection_status as enum ('pending', 'accepted', 'declined', 'blocked');
create type public.request_status as enum ('draft', 'open', 'reviewing', 'meeting', 'negotiating', 'closed', 'cancelled');
create type public.opportunity_status as enum ('draft', 'review', 'open', 'funded', 'closed', 'cancelled');
create type public.post_visibility as enum ('network', 'connections', 'organization');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  type public.organization_type not null,
  name text not null,
  slug text not null unique,
  description text,
  country_code char(2),
  logo_url text,
  cover_url text,
  website text,
  verified_at timestamptz,
  profile jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.organization_role not null default 'member',
  title text,
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- Optional bridge for phase-one agencies adopting the global organization model.
create table public.agency_organizations (
  agency_id uuid primary key references public.agencies(id) on delete cascade,
  organization_id uuid not null unique references public.organizations(id) on delete cascade
);

create table public.professional_connections (
  id uuid primary key default gen_random_uuid(),
  requester_organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references public.users(id) on delete cascade,
  status public.connection_status not null default 'pending',
  context text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_organization_id <> recipient_organization_id)
);

create unique index professional_connections_pair_idx on public.professional_connections (
  least(requester_organization_id, recipient_organization_id),
  greatest(requester_organization_id, recipient_organization_id)
) where status in ('pending', 'accepted');

create table public.club_recruitment_requests (
  id uuid primary key default gen_random_uuid(),
  club_organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete cascade,
  title text not null,
  positions text[] not null default '{}',
  age_min smallint,
  age_max smallint,
  budget_min numeric(14,2),
  budget_max numeric(14,2),
  currency char(3) not null default 'EUR',
  requirements jsonb not null default '{}'::jsonb,
  visibility text not null default 'network' check (visibility in ('network', 'connections', 'invited')),
  status public.request_status not null default 'draft',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.club_shortlists (
  id uuid primary key default gen_random_uuid(),
  club_organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_by uuid not null references public.users(id) on delete cascade,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.club_shortlist_players (
  shortlist_id uuid not null references public.club_shortlists(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  added_by uuid not null references public.users(id) on delete cascade,
  notes text,
  priority smallint check (priority between 1 and 5),
  added_at timestamptz not null default now(),
  primary key (shortlist_id, player_id)
);

create table public.club_player_requests (
  id uuid primary key default gen_random_uuid(),
  club_organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  requested_by uuid not null references public.users(id) on delete cascade,
  request_type text not null check (request_type in ('information', 'video', 'analytics', 'meeting', 'offer')),
  message text,
  status public.request_status not null default 'open',
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.academy_talents (
  id uuid primary key default gen_random_uuid(),
  academy_organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  date_of_birth date not null,
  nationality char(2),
  position text,
  preferred_foot text check (preferred_foot in ('left', 'right', 'both')),
  current_rating smallint check (current_rating between 1 and 99),
  potential_rating smallint check (potential_rating between 1 and 99),
  photo_url text,
  profile jsonb not null default '{}'::jsonb,
  visibility text not null default 'verified_network' check (visibility in ('private', 'invited', 'verified_network')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.academy_talent_videos (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.academy_talents(id) on delete cascade,
  uploaded_by uuid not null references public.users(id) on delete cascade,
  title text not null,
  storage_path text not null,
  thumbnail_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.academy_talent_interest (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.academy_talents(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete cascade,
  interest_type text not null check (interest_type in ('watch', 'scout', 'meeting', 'trial', 'representation')),
  status public.request_status not null default 'open',
  private_note text,
  created_at timestamptz not null default now(),
  unique (talent_id, organization_id, interest_type)
);

create table public.investment_opportunities (
  id uuid primary key default gen_random_uuid(),
  sponsor_organization_id uuid not null references public.organizations(id) on delete cascade,
  academy_organization_id uuid references public.organizations(id) on delete set null,
  created_by uuid not null references public.users(id) on delete cascade,
  title text not null,
  opportunity_type text not null check (opportunity_type in ('academy', 'infrastructure', 'performance', 'technology', 'development_program')),
  summary text,
  target_amount numeric(16,2) not null check (target_amount > 0),
  committed_amount numeric(16,2) not null default 0 check (committed_amount >= 0),
  currency char(3) not null default 'EUR',
  risk_band text check (risk_band in ('low', 'medium', 'high')),
  expected_return jsonb not null default '{}'::jsonb,
  data_room_path text,
  status public.opportunity_status not null default 'draft',
  opens_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.investment_commitments (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.investment_opportunities(id) on delete cascade,
  investor_organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete cascade,
  amount numeric(16,2) not null check (amount > 0),
  currency char(3) not null default 'EUR',
  status text not null default 'indication' check (status in ('indication', 'diligence', 'approved', 'funded', 'withdrawn', 'rejected')),
  compliance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, investor_organization_id)
);

create table public.network_posts (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references public.users(id) on delete cascade,
  author_organization_id uuid references public.organizations(id) on delete set null,
  post_type text not null check (post_type in ('update', 'opportunity', 'rumor', 'market_alert', 'player_moment', 'club_search')),
  body text not null,
  media jsonb not null default '[]'::jsonb,
  visibility public.post_visibility not null default 'network',
  published_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table public.network_post_reactions (
  post_id uuid not null references public.network_posts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  reaction text not null default 'like' check (reaction in ('like', 'insightful', 'support', 'celebrate')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.network_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.network_posts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table public.agent_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  reputation_score integer not null default 0 check (reputation_score >= 0),
  experience_points integer not null default 0 check (experience_points >= 0),
  career_level integer not null default 1 check (career_level >= 1),
  global_rank integer,
  division text not null default 'prospect',
  markets text[] not null default '{}',
  public_stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.objective_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  objective_key text not null,
  period_start date not null,
  period_end date not null,
  target_value numeric not null,
  current_value numeric not null default 0,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (user_id, objective_key, period_start)
);

create table public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  achievement_key text not null,
  progress smallint not null default 0 check (progress between 0 and 100),
  unlocked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (user_id, achievement_key)
);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  title text not null default 'New intelligence session',
  purpose text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  model_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.ai_analysis_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  analysis_type text not null,
  subject_type text,
  subject_id uuid,
  input_hash text not null,
  output_summary text,
  risk_flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index organization_members_user_idx on public.organization_members(user_id);
create index organizations_type_verified_idx on public.organizations(type, verified_at);
create index recruitment_open_idx on public.club_recruitment_requests(status, expires_at);
create index club_player_requests_player_idx on public.club_player_requests(player_id, status);
create index academy_talents_discovery_idx on public.academy_talents(visibility, potential_rating desc);
create index investment_opportunities_open_idx on public.investment_opportunities(status, closes_at);
create index network_posts_feed_idx on public.network_posts(published_at desc) where deleted_at is null;
create index agent_profiles_rank_idx on public.agent_profiles(global_rank) where global_rank is not null;
create index ai_messages_conversation_idx on public.ai_messages(conversation_id, created_at);

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id and user_id = auth.uid()
  )
$$;

create or replace function public.is_organization_admin(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  )
$$;

create or replace function public.create_ecosystem_organization(
  organization_name text,
  organization_slug text,
  organization_kind public.organization_type,
  organization_country char(2) default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.organizations (name, slug, type, country_code, created_by)
  values (organization_name, organization_slug, organization_kind, organization_country, auth.uid())
  returning id into new_organization_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_organization_id, auth.uid(), 'owner');

  return new_organization_id;
end;
$$;

grant execute on function public.create_ecosystem_organization(text, text, public.organization_type, char) to authenticated;

create trigger organizations_updated before update on public.organizations for each row execute function public.touch_updated_at();
create trigger recruitment_updated before update on public.club_recruitment_requests for each row execute function public.touch_updated_at();
create trigger shortlists_updated before update on public.club_shortlists for each row execute function public.touch_updated_at();
create trigger club_requests_updated before update on public.club_player_requests for each row execute function public.touch_updated_at();
create trigger academy_talents_updated before update on public.academy_talents for each row execute function public.touch_updated_at();
create trigger opportunities_updated before update on public.investment_opportunities for each row execute function public.touch_updated_at();
create trigger commitments_updated before update on public.investment_commitments for each row execute function public.touch_updated_at();
create trigger agent_profiles_updated before update on public.agent_profiles for each row execute function public.touch_updated_at();
create trigger ai_conversations_updated before update on public.ai_conversations for each row execute function public.touch_updated_at();

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.agency_organizations enable row level security;
alter table public.professional_connections enable row level security;
alter table public.club_recruitment_requests enable row level security;
alter table public.club_shortlists enable row level security;
alter table public.club_shortlist_players enable row level security;
alter table public.club_player_requests enable row level security;
alter table public.academy_talents enable row level security;
alter table public.academy_talent_videos enable row level security;
alter table public.academy_talent_interest enable row level security;
alter table public.investment_opportunities enable row level security;
alter table public.investment_commitments enable row level security;
alter table public.network_posts enable row level security;
alter table public.network_post_reactions enable row level security;
alter table public.network_post_comments enable row level security;
alter table public.agent_profiles enable row level security;
alter table public.objective_progress enable row level security;
alter table public.user_achievements enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_analysis_audit enable row level security;

create policy "authenticated discover verified organizations" on public.organizations
for select to authenticated using (verified_at is not null or public.is_organization_member(id));
create policy "organization admins manage organization" on public.organizations
for update to authenticated using (public.is_organization_admin(id)) with check (public.is_organization_admin(id));

create policy "members read own memberships" on public.organization_members
for select to authenticated using (user_id = auth.uid() or public.is_organization_member(organization_id));
create policy "admins manage memberships" on public.organization_members
for all to authenticated using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));

create policy "agency members read bridge" on public.agency_organizations
for select to authenticated using (
  agency_id = public.current_agency_id() or public.is_organization_member(organization_id)
);

create policy "connection participants access connections" on public.professional_connections
for select to authenticated using (
  public.is_organization_member(requester_organization_id)
  or public.is_organization_member(recipient_organization_id)
);
create policy "members create connection requests" on public.professional_connections
for insert to authenticated with check (
  requested_by = auth.uid() and public.is_organization_member(requester_organization_id)
);
create policy "recipients respond to connections" on public.professional_connections
for update to authenticated using (public.is_organization_member(recipient_organization_id));

create policy "network discovers open recruitment" on public.club_recruitment_requests
for select to authenticated using (
  public.is_organization_member(club_organization_id)
  or (status = 'open' and visibility = 'network')
);
create policy "club members create recruitment" on public.club_recruitment_requests
for insert to authenticated with check (
  public.is_organization_member(club_organization_id) and created_by = auth.uid()
);
create policy "club members update recruitment" on public.club_recruitment_requests
for update to authenticated using (public.is_organization_member(club_organization_id))
with check (public.is_organization_member(club_organization_id));
create policy "club admins delete recruitment" on public.club_recruitment_requests
for delete to authenticated using (public.is_organization_admin(club_organization_id));

create policy "club members access shortlists" on public.club_shortlists
for all to authenticated using (public.is_organization_member(club_organization_id))
with check (public.is_organization_member(club_organization_id));
create policy "club members access shortlist players" on public.club_shortlist_players
for all to authenticated using (
  exists (
    select 1 from public.club_shortlists s
    where s.id = shortlist_id and public.is_organization_member(s.club_organization_id)
  )
) with check (
  exists (
    select 1 from public.club_shortlists s
    where s.id = shortlist_id and public.is_organization_member(s.club_organization_id)
  )
);

create policy "request participants read player requests" on public.club_player_requests
for select to authenticated using (
  public.is_organization_member(club_organization_id)
  or exists (
    select 1 from public.players p
    where p.id = player_id and p.agency_id = public.current_agency_id()
  )
);
create policy "club members create player requests" on public.club_player_requests
for insert to authenticated with check (
  requested_by = auth.uid() and public.is_organization_member(club_organization_id)
);
create policy "request participants update player requests" on public.club_player_requests
for update to authenticated using (
  public.is_organization_member(club_organization_id)
  or exists (
    select 1 from public.players p
    where p.id = player_id and p.agency_id = public.current_agency_id()
  )
);

create policy "network discovers academy talent" on public.academy_talents
for select to authenticated using (
  public.is_organization_member(academy_organization_id)
  or (visibility = 'verified_network' and verified_at is not null)
);
create policy "academy members create talent" on public.academy_talents
for insert to authenticated with check (
  public.is_organization_member(academy_organization_id) and created_by = auth.uid()
);
create policy "academy members update talent" on public.academy_talents
for update to authenticated using (public.is_organization_member(academy_organization_id))
with check (public.is_organization_member(academy_organization_id));
create policy "academy admins delete talent" on public.academy_talents
for delete to authenticated using (public.is_organization_admin(academy_organization_id));

create policy "network reads visible talent videos" on public.academy_talent_videos
for select to authenticated using (
  exists (
    select 1 from public.academy_talents t
    where t.id = talent_id
      and (public.is_organization_member(t.academy_organization_id) or t.visibility = 'verified_network')
  )
);
create policy "academy members manage talent videos" on public.academy_talent_videos
for all to authenticated using (
  exists (
    select 1 from public.academy_talents t
    where t.id = talent_id and public.is_organization_member(t.academy_organization_id)
  )
) with check (
  exists (
    select 1 from public.academy_talents t
    where t.id = talent_id and public.is_organization_member(t.academy_organization_id)
  )
);

create policy "interest participants access talent interest" on public.academy_talent_interest
for select to authenticated using (
  public.is_organization_member(organization_id)
  or exists (
    select 1 from public.academy_talents t
    where t.id = talent_id and public.is_organization_member(t.academy_organization_id)
  )
);
create policy "organization members create talent interest" on public.academy_talent_interest
for insert to authenticated with check (
  created_by = auth.uid() and public.is_organization_member(organization_id)
);

create policy "network discovers open opportunities" on public.investment_opportunities
for select to authenticated using (
  public.is_organization_member(sponsor_organization_id)
  or status in ('open', 'funded')
);
create policy "sponsors create opportunities" on public.investment_opportunities
for insert to authenticated with check (
  public.is_organization_member(sponsor_organization_id) and created_by = auth.uid()
);
create policy "sponsors update opportunities" on public.investment_opportunities
for update to authenticated using (public.is_organization_member(sponsor_organization_id))
with check (public.is_organization_member(sponsor_organization_id));
create policy "sponsor admins delete opportunities" on public.investment_opportunities
for delete to authenticated using (public.is_organization_admin(sponsor_organization_id));

create policy "commitment participants access commitments" on public.investment_commitments
for select to authenticated using (
  public.is_organization_member(investor_organization_id)
  or exists (
    select 1 from public.investment_opportunities o
    where o.id = opportunity_id and public.is_organization_member(o.sponsor_organization_id)
  )
);
create policy "investors create commitments" on public.investment_commitments
for insert to authenticated with check (
  created_by = auth.uid()
  and public.is_organization_member(investor_organization_id)
  and exists (
    select 1 from public.organizations o
    where o.id = investor_organization_id and o.type in ('investor', 'family_office')
  )
);
create policy "commitment participants update commitments" on public.investment_commitments
for update to authenticated using (
  public.is_organization_member(investor_organization_id)
  or exists (
    select 1 from public.investment_opportunities o
    where o.id = opportunity_id and public.is_organization_member(o.sponsor_organization_id)
  )
);

create policy "authenticated network reads posts" on public.network_posts
for select to authenticated using (
  deleted_at is null and (
    visibility = 'network'
    or author_user_id = auth.uid()
    or (author_organization_id is not null and public.is_organization_member(author_organization_id))
  )
);
create policy "users create own posts" on public.network_posts
for insert to authenticated with check (
  author_user_id = auth.uid()
  and (author_organization_id is null or public.is_organization_member(author_organization_id))
);
create policy "authors update own posts" on public.network_posts
for update to authenticated using (author_user_id = auth.uid()) with check (author_user_id = auth.uid());

create policy "authenticated read reactions" on public.network_post_reactions
for select to authenticated using (true);
create policy "users manage own reactions" on public.network_post_reactions
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "authenticated read comments" on public.network_post_comments
for select to authenticated using (deleted_at is null);
create policy "users create own comments" on public.network_post_comments
for insert to authenticated with check (user_id = auth.uid());
create policy "users update own comments" on public.network_post_comments
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "authenticated view agent leaderboard" on public.agent_profiles
for select to authenticated using (true);
create policy "users read own objectives" on public.objective_progress
for select to authenticated using (user_id = auth.uid());
create policy "users read own achievements" on public.user_achievements
for select to authenticated using (user_id = auth.uid());

create policy "users manage own ai conversations" on public.ai_conversations
for all to authenticated using (user_id = auth.uid()) with check (
  user_id = auth.uid() and (organization_id is null or public.is_organization_member(organization_id))
);
create policy "users access own ai messages" on public.ai_messages
for all to authenticated using (
  exists (
    select 1 from public.ai_conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.ai_conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  )
);
create policy "users read own ai audit" on public.ai_analysis_audit
for select to authenticated using (user_id = auth.uid());
create policy "users create own ai audit" on public.ai_analysis_audit
for insert to authenticated with check (user_id = auth.uid());

-- Storage buckets recommended for the ecosystem:
-- academy-talent-vault (private), investment-data-rooms (private),
-- network-media (public or signed URLs), organization-assets (public).
