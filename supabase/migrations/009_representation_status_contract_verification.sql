-- Touchline Representation Status & Contract Verification System.
-- External data such as Transfermarkt is reference data only. Touchline status is the legal operating truth.

alter table public.agent_player_associations
  add column if not exists contract_type text,
  add column if not exists renewal_reminder_on date,
  add column if not exists expiration_alert_sent_at timestamptz,
  add column if not exists admin_review_status text not null default 'not_requested',
  add column if not exists admin_review_notes text,
  add column if not exists inactive_reason text,
  add column if not exists source_priority smallint not null default 5,
  add column if not exists last_external_sync_at timestamptz,
  add column if not exists external_conflict_notice jsonb not null default '{}'::jsonb;

alter table public.agent_player_associations
  drop constraint if exists agent_player_associations_status_check;

alter table public.agent_player_associations
  add constraint agent_player_associations_status_check
  check (
    status in (
      'suggested',
      'active_representation',
      'pending_verification',
      'verified_representation',
      'expired_representation',
      'disputed_representation',
      'removed_by_agent',
      'rejected',
      'former_client',
      'prospect'
    )
  );

alter table public.agent_player_associations
  drop constraint if exists agent_player_associations_public_visible_check;

alter table public.agent_player_associations
  add constraint agent_player_associations_public_visible_check
  check (
    public_visible is false
    or status in ('active_representation', 'verified_representation')
  );

alter table public.agent_player_associations
  drop constraint if exists agent_player_associations_admin_review_status_check;

alter table public.agent_player_associations
  add constraint agent_player_associations_admin_review_status_check
  check (
    admin_review_status in (
      'not_requested',
      'requested',
      'documents_requested',
      'approved',
      'rejected',
      'disputed',
      'removed_from_public'
    )
  );

alter table public.representation_documents
  drop constraint if exists representation_documents_document_type_check;

alter table public.representation_documents
  add constraint representation_documents_document_type_check
  check (
    document_type in (
      'representation_agreement',
      'authorization_letter',
      'agency_contract',
      'mandate',
      'power_of_attorney',
      'supporting_document'
    )
  );

create table if not exists public.representation_admin_reviews (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  association_id uuid not null references public.agent_player_associations(id) on delete cascade,
  requested_by uuid references public.users(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  review_status text not null default 'requested'
    check (review_status in ('requested', 'documents_requested', 'approved', 'rejected', 'disputed', 'removed_from_public')),
  reason text,
  decision_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists agent_associations_ranking_status_idx
  on public.agent_player_associations(agency_id, agent_user_id, status, public_visible);

create index if not exists agent_associations_contract_expiry_idx
  on public.agent_player_associations(agency_id, representation_expires_on, status);

create index if not exists representation_admin_reviews_agency_idx
  on public.representation_admin_reviews(agency_id, review_status, created_at desc);

drop trigger if exists representation_admin_reviews_updated on public.representation_admin_reviews;
create trigger representation_admin_reviews_updated
  before update on public.representation_admin_reviews
  for each row execute function public.touch_updated_at();

alter table public.representation_admin_reviews enable row level security;

drop policy if exists "tenant representation admin reviews" on public.representation_admin_reviews;
create policy "tenant representation admin reviews" on public.representation_admin_reviews
  for all
  using (agency_id = public.current_agency_id())
  with check (agency_id = public.current_agency_id());

grant select, insert, update, delete on public.representation_admin_reviews to authenticated;
grant select, insert, update, delete on public.representation_admin_reviews to service_role;

comment on column public.agent_player_associations.status is
  'Touchline internal status. Transfermarkt/external data must never override former, removed, disputed, active, or verified statuses automatically.';

comment on column public.agent_player_associations.source_priority is
  '1 verified contract/document, 2 agent-confirmed active, 3 admin-approved, 4 external source, 5 manual/unverified.';
