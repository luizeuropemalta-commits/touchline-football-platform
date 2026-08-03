create table if not exists public.touchline_promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'ended')),
  audience jsonb not null default '{}'::jsonb,
  rules jsonb not null default '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.touchline_promotion_coupons (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid references public.touchline_promotions(id) on delete cascade,
  code text not null unique,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  redeemed_count integer not null default 0 check (redeemed_count >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.clubowner_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount_cents bigint not null check (amount_cents <> 0),
  currency char(3) not null default 'EUR',
  entry_type text not null check (entry_type in ('admin_grant', 'promotion', 'reward', 'purchase_use', 'reversal')),
  reason text not null,
  idempotency_key text not null unique,
  promotion_id uuid references public.touchline_promotions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists touchline_promotions_status_idx on public.touchline_promotions(status, starts_at, ends_at);
create index if not exists touchline_promotion_coupons_promotion_idx on public.touchline_promotion_coupons(promotion_id);
create index if not exists clubowner_credit_ledger_user_idx on public.clubowner_credit_ledger(user_id, created_at desc);
create index if not exists clubowner_credit_ledger_promotion_idx on public.clubowner_credit_ledger(promotion_id);

create trigger touchline_promotions_updated
  before update on public.touchline_promotions
  for each row execute function public.touch_updated_at();

alter table public.touchline_promotions enable row level security;
alter table public.touchline_promotion_coupons enable row level security;
alter table public.clubowner_credit_ledger enable row level security;

grant select, insert, update, delete on public.touchline_promotions to service_role;
grant select, insert, update, delete on public.touchline_promotion_coupons to service_role;
grant select, insert on public.clubowner_credit_ledger to service_role;
