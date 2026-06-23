-- Touchline Agent Verification & Player Representation System.
-- This layer is intentionally compliance-first:
-- public player ownership is never claimed automatically; suggested relationships require confirmation.

create table if not exists public.agent_identity_verifications (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  fifa_agent_id text,
  fifa_license_number text,
  legal_name text not null default '',
  country_code char(2),
  agency_name text,
  verification_status text not null default 'unverified_agent'
    check (verification_status in ('unverified_agent', 'verified_agent', 'fifa_licensed_agent', 'agency_verified')),
  license_expires_on date,
  official_document_path text,
  official_document_name text,
  official_document_uploaded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, user_id)
);

create table if not exists public.agent_player_associations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  agent_user_id uuid not null references public.users(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  suggested_name text not null default '',
  suggested_position text,
  suggested_nationality char(2),
  suggested_club text,
  suggested_photo_url text,
  source text not null default 'manual'
    check (source in ('manual', 'external_suggestion', 'touchline_ai', 'licensed_provider')),
  external_source text,
  external_reference_url text,
  confidence_score smallint check (confidence_score between 0 and 100),
  status text not null default 'suggested'
    check (status in ('suggested', 'pending_verification', 'verified_representation', 'expired_representation', 'rejected', 'former_client', 'prospect')),
  representation_starts_on date,
  representation_expires_on date,
  public_visible boolean not null default false,
  notes text,
  compliance_flags jsonb not null default '{}'::jsonb,
  ai_validation_status text not null default 'not_reviewed'
    check (ai_validation_status in ('not_reviewed', 'needs_review', 'consistent', 'inconsistent')),
  player_snapshot jsonb not null default '{}'::jsonb,
  confirmed_at timestamptz,
  verified_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (public_visible is false or status = 'verified_representation')
);

create table if not exists public.representation_documents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  association_id uuid not null references public.agent_player_associations(id) on delete cascade,
  uploaded_by uuid references public.users(id) on delete set null,
  document_type text not null
    check (document_type in ('representation_agreement', 'authorization_letter', 'agency_contract', 'supporting_document')),
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  ai_validation_status text not null default 'pending_review'
    check (ai_validation_status in ('pending_review', 'consistent', 'inconsistent', 'manual_review')),
  ai_validation_notes text,
  created_at timestamptz not null default now()
);

create index if not exists agent_identity_agency_idx
  on public.agent_identity_verifications(agency_id, user_id);

create index if not exists agent_associations_agency_status_idx
  on public.agent_player_associations(agency_id, agent_user_id, status, created_at desc);

create unique index if not exists agent_associations_unique_player_idx
  on public.agent_player_associations(agency_id, agent_user_id, player_id)
  where player_id is not null;

create unique index if not exists agent_associations_unique_external_url_idx
  on public.agent_player_associations(agency_id, agent_user_id, external_reference_url)
  where external_reference_url is not null;

create index if not exists representation_documents_association_idx
  on public.representation_documents(association_id, created_at desc);

drop trigger if exists agent_identity_verifications_updated on public.agent_identity_verifications;
create trigger agent_identity_verifications_updated
  before update on public.agent_identity_verifications
  for each row execute function public.touch_updated_at();

drop trigger if exists agent_player_associations_updated on public.agent_player_associations;
create trigger agent_player_associations_updated
  before update on public.agent_player_associations
  for each row execute function public.touch_updated_at();

alter table public.agent_identity_verifications enable row level security;
alter table public.agent_player_associations enable row level security;
alter table public.representation_documents enable row level security;

drop policy if exists "tenant agent identity verifications" on public.agent_identity_verifications;
create policy "tenant agent identity verifications" on public.agent_identity_verifications
  for all
  using (agency_id = public.current_agency_id())
  with check (agency_id = public.current_agency_id());

drop policy if exists "tenant agent player associations" on public.agent_player_associations;
create policy "tenant agent player associations" on public.agent_player_associations
  for all
  using (agency_id = public.current_agency_id())
  with check (agency_id = public.current_agency_id());

drop policy if exists "tenant representation documents" on public.representation_documents;
create policy "tenant representation documents" on public.representation_documents
  for all
  using (agency_id = public.current_agency_id())
  with check (agency_id = public.current_agency_id());

grant select, insert, update, delete on public.agent_identity_verifications to authenticated;
grant select, insert, update, delete on public.agent_player_associations to authenticated;
grant select, insert, update, delete on public.representation_documents to authenticated;
grant select, insert, update, delete on public.agent_identity_verifications to service_role;
grant select, insert, update, delete on public.agent_player_associations to service_role;
grant select, insert, update, delete on public.representation_documents to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agent-verification',
  'agent-verification',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = excluded.allowed_mime_types;
