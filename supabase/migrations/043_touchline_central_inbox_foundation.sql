-- Local-only V2.10.10 foundation for TouchLine Central and ClubOwner Inbox.
-- It is a canonical in-app message source, not an email, push, marketing,
-- payment, wallet, tax, invoice or production notification-delivery system.
-- Apply nowhere until remote migration history and the legal consent/delivery
-- review are reconciled.

begin;
set local lock_timeout = '5s';

create table if not exists public.touchline_central_messages (
  id uuid primary key default gen_random_uuid(),
  origin text not null check (origin = 'ADMIN'),
  publication_status text not null default 'DRAFT'
    check (publication_status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  lifecycle_state text not null check (lifecycle_state in (
    'COMING_SOON', 'PRE_REGISTRATION', 'OPEN', 'ACTIVE'
  )),
  category text not null check (category in (
    'MAINTENANCE', 'PAYMENT', 'CONTRACT', 'FUTURE_LEAGUE', 'ADMINISTRATIVE'
  )),
  priority text not null default 'NORMAL'
    check (priority in ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')),
  audience_scope text not null check (audience_scope in ('GLOBAL', 'COMPETITION', 'USER')),
  competition_key text check (competition_key in ('england', 'europe', 'brazil')),
  target_user_id uuid references public.users(id) on delete restrict,
  published_at timestamptz,
  archived_at timestamptz,
  actor_id uuid not null references public.users(id) on delete restrict,
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 8 and 160),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (audience_scope = 'GLOBAL' and competition_key is null and target_user_id is null)
    or (audience_scope = 'COMPETITION' and competition_key is not null and target_user_id is null)
    or (audience_scope = 'USER' and target_user_id is not null)
  ),
  check ((publication_status = 'PUBLISHED') = (published_at is not null)),
  check (archived_at is null or publication_status = 'ARCHIVED')
);

create table if not exists public.touchline_central_message_localizations (
  message_id uuid not null references public.touchline_central_messages(id) on delete restrict,
  locale text not null check (locale in ('pt-BR', 'en')),
  title text not null check (length(btrim(title)) between 1 and 160),
  body text not null check (length(btrim(body)) between 1 and 4000),
  deep_link text check (
    deep_link is null or (
      deep_link like '/%' and deep_link not like '//%' and position('\\' in deep_link) = 0
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (message_id, locale)
);

-- Receipts are consumer state only. They do not duplicate a message, act as a
-- delivery queue, or permit ClubOwners to write Central content.
create table if not exists public.touchline_central_inbox_receipts (
  message_id uuid not null references public.touchline_central_messages(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists touchline_central_messages_publication_idx
  on public.touchline_central_messages(publication_status, priority, published_at desc);
create index if not exists touchline_central_messages_competition_idx
  on public.touchline_central_messages(competition_key, publication_status, published_at desc)
  where competition_key is not null;
create index if not exists touchline_central_inbox_receipts_user_idx
  on public.touchline_central_inbox_receipts(user_id, read_at, updated_at desc);

create trigger touchline_central_messages_updated
  before update on public.touchline_central_messages
  for each row execute function public.touch_updated_at();
create trigger touchline_central_message_localizations_updated
  before update on public.touchline_central_message_localizations
  for each row execute function public.touch_updated_at();
create trigger touchline_central_inbox_receipts_updated
  before update on public.touchline_central_inbox_receipts
  for each row execute function public.touch_updated_at();

alter table public.touchline_central_messages enable row level security;
alter table public.touchline_central_message_localizations enable row level security;
alter table public.touchline_central_inbox_receipts enable row level security;

revoke all on table public.touchline_central_messages from public, anon, authenticated;
revoke all on table public.touchline_central_message_localizations from public, anon, authenticated;
revoke all on table public.touchline_central_inbox_receipts from public, anon, authenticated;

grant select, insert, update, delete on table public.touchline_central_messages to service_role;
grant select, insert, update, delete on table public.touchline_central_message_localizations to service_role;
grant select, insert, update, delete on table public.touchline_central_inbox_receipts to service_role;

create policy "ClubOwner reads own Central receipts"
  on public.touchline_central_inbox_receipts
  for select to authenticated using (user_id = auth.uid());
create policy "ClubOwner creates own Central receipt"
  on public.touchline_central_inbox_receipts
  for insert to authenticated with check (user_id = auth.uid());
create policy "ClubOwner updates own Central receipt"
  on public.touchline_central_inbox_receipts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on table public.touchline_central_messages is
  'Canonical admin-origin TouchLine Central source. It supports global, competition and user audiences but is not a delivery channel or financial fulfillment record.';
comment on table public.touchline_central_message_localizations is
  'Localized canonical Central content. Deep links must be internal TouchLine paths and are validated again by the server consumer.';
comment on table public.touchline_central_inbox_receipts is
  'ClubOwner Inbox read/unread state only. It is not notification_history and cannot create or modify canonical Central messages.';

commit;
