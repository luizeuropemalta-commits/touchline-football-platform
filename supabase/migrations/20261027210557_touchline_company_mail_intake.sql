begin;
set local lock_timeout = '5s';
-- Credentials remain in server secrets. These rows only identify authorized scopes.
create table public.touchline_company_mailboxes (
 id uuid primary key default gen_random_uuid(), email text not null unique,
 credential_key text not null unique check (credential_key ~ '^[A-Z][A-Z0-9_]{0,39}$'),
 enabled boolean not null default false,
 business_query text check (length(btrim(business_query)) between 1 and 1800),
 last_scan_before bigint not null default 0 check(last_scan_before>=0),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.touchline_company_mail_scans (
 id uuid primary key default gen_random_uuid(), mailbox_id uuid not null references public.touchline_company_mailboxes(id),
 query text not null check (length(btrim(query)) between 1 and 2048),
 cursor text check (length(cursor) between 1 and 4096), revision integer not null default 0 check (revision >= 0),
 completed boolean not null default false, created_by uuid not null references auth.users(id),
 window_before bigint, lease_until timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.touchline_company_mail_evidence (
 id uuid primary key default gen_random_uuid(), mailbox_id uuid not null references public.touchline_company_mailboxes(id),
 message_id text not null check (message_id ~ '^[a-zA-Z0-9_-]{1,200}$'),
 thread_id text not null check (thread_id ~ '^[a-zA-Z0-9_-]{1,200}$'), received_at timestamptz not null check (isfinite(received_at)),
 subject text not null check (length(subject)<=1000), sender text not null check (length(sender)<=1000),
 plain_text text not null check (octet_length(plain_text)<=262144),
 original bytea not null check (octet_length(original) between 1 and 2097152),
 checksum text not null check (checksum=encode(sha256(original),'hex')),
 category text not null check (category in ('INVOICE_REVIEW','PAYMENT_REVIEW','CONTRACT_REVIEW','OTHER_REVIEW')),
 created_at timestamptz not null default now(), unique(mailbox_id,message_id)
);
create table public.touchline_company_mail_retries (
 scan_id uuid not null references public.touchline_company_mail_scans(id),
 message_id text not null check (message_id ~ '^[a-zA-Z0-9_-]{1,200}$'),
 code text not null check (code ~ '^MAIL_[A-Z_0-9]{1,80}$'), attempts integer not null default 1,
 resolved_at timestamptz, lease_until timestamptz, updated_at timestamptz not null default now(), primary key(scan_id,message_id)
);
create table public.touchline_company_mail_page_receipts (
 scan_id uuid not null references public.touchline_company_mail_scans(id), revision integer not null,
 imported integer not null, pending integer not null, created_at timestamptz not null default now(),
 primary key(scan_id,revision)
);
alter table public.touchline_company_mailboxes enable row level security;
alter table public.touchline_company_mail_scans enable row level security;
alter table public.touchline_company_mail_evidence enable row level security;
alter table public.touchline_company_mail_retries enable row level security;
alter table public.touchline_company_mail_page_receipts enable row level security;
revoke all on public.touchline_company_mailboxes,public.touchline_company_mail_scans,public.touchline_company_mail_evidence,
 public.touchline_company_mail_retries,public.touchline_company_mail_page_receipts from public,anon,authenticated,service_role;
grant select on public.touchline_company_mailboxes,public.touchline_company_mail_scans,public.touchline_company_mail_evidence,
 public.touchline_company_mail_retries,public.touchline_company_mail_page_receipts to service_role;
-- Configuration is restricted to the service role; no browser or worker can rewrite originals.
grant insert on public.touchline_company_mailboxes to service_role;
grant update(enabled,business_query,credential_key) on public.touchline_company_mailboxes to service_role;
grant insert on public.touchline_company_mail_scans to service_role;

create function public.touchline_company_mailbox_identity_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.email is distinct from old.email or new.id is distinct from old.id or new.created_by is distinct from old.created_by then
  raise exception 'MAIL_MAILBOX_IDENTITY_IMMUTABLE';
 end if;
 return new;
end $$;
create trigger touchline_company_mailbox_identity_immutable before update on public.touchline_company_mailboxes
for each row execute function public.touchline_company_mailbox_identity_immutable();
revoke all on function public.touchline_company_mailbox_identity_immutable() from public,anon,authenticated,service_role;

create function public.touchline_company_commit_mail_page(p_page jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare s public.touchline_company_mail_scans%rowtype; m jsonb; f jsonb; prior text; raw bytea;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'MAIL_SERVICE_ONLY' using errcode='42501'; end if;
 if jsonb_typeof(p_page->'messages') is distinct from 'array' or jsonb_typeof(p_page->'failures') is distinct from 'array'
 then raise exception 'MAIL_INVALID_PAGE'; end if;
 if jsonb_array_length(p_page->'messages')+jsonb_array_length(p_page->'failures')>10 then raise exception 'MAIL_PAGE_LIMIT'; end if;
 select * into strict s from public.touchline_company_mail_scans where id=(p_page->>'scanId')::uuid for update;
 if not exists(select 1 from public.touchline_company_mailboxes where id=s.mailbox_id and enabled) then raise exception 'MAIL_DISABLED'; end if;
 if s.completed or s.revision is distinct from (p_page->>'expectedRevision')::integer or s.cursor is distinct from p_page->>'expectedCursor' then return 'STALE'; end if;
 if p_page->>'nextCursor' is not null and (length(p_page->>'nextCursor') not between 1 and 4096 or p_page->>'nextCursor'=s.cursor) then raise exception 'MAIL_INVALID_CURSOR'; end if;
 if (select count(*)<>count(distinct x.id) from (
  select value->>'messageId' id from jsonb_array_elements(p_page->'messages')
  union all select value->>'messageId' from jsonb_array_elements(p_page->'failures')) x) then raise exception 'MAIL_DUPLICATE_PAGE_ID'; end if;
 for m in select value from jsonb_array_elements(p_page->'messages') loop
  raw:=decode(m->>'originalBase64','base64');
  if m->>'sha256' is distinct from encode(sha256(raw),'hex') then raise exception 'MAIL_CHECKSUM_MISMATCH'; end if;
  select checksum into prior from public.touchline_company_mail_evidence where mailbox_id=s.mailbox_id and message_id=m->>'messageId';
  if found and prior is distinct from m->>'sha256' then raise exception 'MAIL_IMMUTABLE_CONFLICT'; end if;
  insert into public.touchline_company_mail_evidence(mailbox_id,message_id,thread_id,received_at,subject,sender,plain_text,original,checksum,category)
   values(s.mailbox_id,m->>'messageId',m->>'threadId',(m->>'receivedAt')::timestamptz,m->>'subject',m->>'sender',m->>'text',raw,m->>'sha256',m->>'category')
   on conflict(mailbox_id,message_id) do nothing;
  select checksum into strict prior from public.touchline_company_mail_evidence where mailbox_id=s.mailbox_id and message_id=m->>'messageId';
  if prior is distinct from m->>'sha256' then raise exception 'MAIL_IMMUTABLE_CONFLICT'; end if;
  update public.touchline_company_mail_retries set resolved_at=clock_timestamp(),updated_at=clock_timestamp()
   where scan_id in(select id from public.touchline_company_mail_scans where mailbox_id=s.mailbox_id) and message_id=m->>'messageId' and resolved_at is null;
 end loop;
 for f in select value from jsonb_array_elements(p_page->'failures') loop
  insert into public.touchline_company_mail_retries(scan_id,message_id,code) values(s.id,f->>'messageId',f->>'code')
   on conflict(scan_id,message_id) do update set code=excluded.code,attempts=public.touchline_company_mail_retries.attempts+1,updated_at=clock_timestamp();
 end loop;
 insert into public.touchline_company_mail_page_receipts(scan_id,revision,imported,pending)
 values(s.id,s.revision,jsonb_array_length(p_page->'messages'),jsonb_array_length(p_page->'failures'));
 update public.touchline_company_mail_scans set cursor=p_page->>'nextCursor',completed=(p_page->>'nextCursor' is null),revision=revision+1,updated_at=clock_timestamp() where id=s.id;
 update public.touchline_company_mail_scans set lease_until=null where id=s.id;
 if p_page->>'nextCursor' is null and s.window_before is not null then
  update public.touchline_company_mailboxes set last_scan_before=greatest(last_scan_before,s.window_before) where id=s.mailbox_id;
 end if;
 return 'APPLIED';
end $$;
revoke all on function public.touchline_company_commit_mail_page(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.touchline_company_commit_mail_page(jsonb) to service_role;

create function public.touchline_company_retry_mail(p_scan_id uuid,p_message_id text,p_evidence jsonb,p_failure text)
returns text language plpgsql security definer set search_path='' as $$
declare s public.touchline_company_mail_scans%rowtype; r public.touchline_company_mail_retries%rowtype; raw bytea; prior text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'MAIL_SERVICE_ONLY' using errcode='42501'; end if;
 select * into strict s from public.touchline_company_mail_scans where id=p_scan_id;
 select * into strict r from public.touchline_company_mail_retries where scan_id=p_scan_id and message_id=p_message_id for update;
 if r.resolved_at is not null then return 'ALREADY_RESOLVED'; end if;
 if exists(select 1 from public.touchline_company_mail_evidence where mailbox_id=s.mailbox_id and message_id=p_message_id) then
  update public.touchline_company_mail_retries set resolved_at=clock_timestamp(),updated_at=clock_timestamp()
   where scan_id in(select id from public.touchline_company_mail_scans where mailbox_id=s.mailbox_id) and message_id=p_message_id and resolved_at is null;
  return 'ALREADY_IMPORTED';
 end if;
 if not exists(select 1 from public.touchline_company_mailboxes where id=s.mailbox_id and enabled) then raise exception 'MAIL_DISABLED'; end if;
 if r.updated_at>clock_timestamp()-interval '15 minutes' then return 'COOLDOWN'; end if;
 if (p_evidence is null)=(p_failure is null) then raise exception 'MAIL_INVALID_RETRY'; end if;
 if p_failure is not null then
  update public.touchline_company_mail_retries set code=p_failure,attempts=attempts+1,lease_until=null,updated_at=clock_timestamp() where scan_id=p_scan_id and message_id=p_message_id;
  return 'PENDING';
 end if;
 if p_evidence->>'messageId' is distinct from p_message_id then raise exception 'MAIL_ID_MISMATCH'; end if;
 raw:=decode(p_evidence->>'originalBase64','base64');
 if p_evidence->>'sha256' is distinct from encode(sha256(raw),'hex') then raise exception 'MAIL_CHECKSUM_MISMATCH'; end if;
 select checksum into prior from public.touchline_company_mail_evidence where mailbox_id=s.mailbox_id and message_id=p_message_id;
 if found and prior is distinct from p_evidence->>'sha256' then raise exception 'MAIL_IMMUTABLE_CONFLICT'; end if;
 insert into public.touchline_company_mail_evidence(mailbox_id,message_id,thread_id,received_at,subject,sender,plain_text,original,checksum,category)
 values(s.mailbox_id,p_message_id,p_evidence->>'threadId',(p_evidence->>'receivedAt')::timestamptz,p_evidence->>'subject',p_evidence->>'sender',p_evidence->>'text',raw,p_evidence->>'sha256',p_evidence->>'category')
 on conflict(mailbox_id,message_id) do nothing;
 select checksum into strict prior from public.touchline_company_mail_evidence where mailbox_id=s.mailbox_id and message_id=p_message_id;
 if prior is distinct from p_evidence->>'sha256' then raise exception 'MAIL_IMMUTABLE_CONFLICT'; end if;
 update public.touchline_company_mail_retries set resolved_at=clock_timestamp(),attempts=attempts+1,updated_at=clock_timestamp()
  where scan_id in(select id from public.touchline_company_mail_scans where mailbox_id=s.mailbox_id) and message_id=p_message_id and resolved_at is null;
 return 'RESOLVED';
end $$;
revoke all on function public.touchline_company_retry_mail(uuid,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.touchline_company_retry_mail(uuid,text,jsonb,text) to service_role;

create function public.touchline_company_claim_mail_retry(p_scan_id uuid,p_message_id text)
returns text language plpgsql security definer set search_path='' as $$
declare r public.touchline_company_mail_retries%rowtype; mailbox uuid;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'MAIL_SERVICE_ONLY' using errcode='42501'; end if;
 select * into strict r from public.touchline_company_mail_retries where scan_id=p_scan_id and message_id=p_message_id for update;
 if r.resolved_at is not null then return 'ALREADY_RESOLVED'; end if;
 select mailbox_id into strict mailbox from public.touchline_company_mail_scans where id=p_scan_id;
 if not exists(select 1 from public.touchline_company_mailboxes where id=mailbox and enabled) then return 'DISABLED'; end if;
 if exists(select 1 from public.touchline_company_mail_evidence where mailbox_id=mailbox and message_id=p_message_id) then
  update public.touchline_company_mail_retries set resolved_at=clock_timestamp(),lease_until=null,updated_at=clock_timestamp() where scan_id=p_scan_id and message_id=p_message_id;
  return 'ALREADY_IMPORTED';
 end if;
 if r.updated_at>clock_timestamp()-interval '15 minutes' or r.lease_until>clock_timestamp() then return 'BUSY'; end if;
 update public.touchline_company_mail_retries set lease_until=clock_timestamp()+interval '5 minutes' where scan_id=p_scan_id and message_id=p_message_id;
 return 'CLAIMED';
end $$;
revoke all on function public.touchline_company_claim_mail_retry(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.touchline_company_claim_mail_retry(uuid,text) to service_role;

create function public.touchline_company_claim_mail_scan(p_scan_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.touchline_company_mail_scans%rowtype; active boolean;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'MAIL_SERVICE_ONLY' using errcode='42501'; end if;
 select * into strict s from public.touchline_company_mail_scans where id=p_scan_id for update;
 select enabled into active from public.touchline_company_mailboxes where id=s.mailbox_id;
 if not active then return jsonb_build_object('enabled',false); end if;
 if s.completed then return jsonb_build_object('enabled',true,'completed',true); end if;
 if s.lease_until>clock_timestamp() then return jsonb_build_object('enabled',true,'busy',true); end if;
 update public.touchline_company_mail_scans set lease_until=clock_timestamp()+interval '5 minutes' where id=s.id;
 return jsonb_build_object('id',s.id,'mailboxId',s.mailbox_id,'query',s.query,'cursor',s.cursor,'revision',s.revision,'enabled',true,'completed',false);
end $$;
revoke all on function public.touchline_company_claim_mail_scan(uuid) from public,anon,authenticated,service_role;
grant execute on function public.touchline_company_claim_mail_scan(uuid) to service_role;

-- Initial scan covers the configured business query's history; later scans overlap one day.
-- Fixed upper timestamps avoid adding new arrivals to a pagination already in progress.
create function public.touchline_company_enqueue_mail_scans()
returns integer language plpgsql security definer set search_path='' as $$
declare m public.touchline_company_mailboxes%rowtype; upper_bound bigint:=floor(extract(epoch from clock_timestamp())); n integer:=0;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'MAIL_SERVICE_ONLY' using errcode='42501'; end if;
 for m in select * from public.touchline_company_mailboxes where enabled and business_query is not null order by id for update skip locked loop
  if m.last_scan_before>upper_bound-900 or exists(select 1 from public.touchline_company_mail_scans where mailbox_id=m.id and not completed) then continue; end if;
  insert into public.touchline_company_mail_scans(mailbox_id,query,created_by,window_before)
   values(m.id,'('||m.business_query||') after:'||greatest(0,m.last_scan_before-86400)||' before:'||upper_bound,m.created_by,upper_bound);
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.touchline_company_enqueue_mail_scans() from public,anon,authenticated,service_role;
grant execute on function public.touchline_company_enqueue_mail_scans() to service_role;

create table public.touchline_company_mail_reviews (
 id uuid primary key, evidence_id uuid not null references public.touchline_company_mail_evidence(id),
 action text not null check(action in('LINK','IGNORE')), note text not null check(length(btrim(note)) between 1 and 2000),
 contract_id uuid references public.touchline_company_contracts(id), obligation_id uuid references public.touchline_company_obligations(id),
 settlement_id uuid references public.touchline_company_settlements(id),
 actor_id uuid not null references auth.users(id), created_at timestamptz not null default clock_timestamp(),
 check((action='IGNORE' and num_nonnulls(contract_id,obligation_id,settlement_id)=0) or (action='LINK' and num_nonnulls(contract_id,obligation_id,settlement_id)=1))
);
alter table public.touchline_company_mail_reviews enable row level security;
create index touchline_company_mail_latest_review on public.touchline_company_mail_reviews(evidence_id,created_at desc,id desc);
revoke all on public.touchline_company_mail_reviews from public,anon,authenticated,service_role;
grant select on public.touchline_company_mail_reviews to service_role;
create function public.touchline_company_review_mail(p_command jsonb,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare proposed public.touchline_company_mail_reviews%rowtype; prior public.touchline_company_mail_reviews%rowtype;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or p_actor_id is null then raise exception 'MAIL_SERVICE_ONLY' using errcode='42501'; end if;
 proposed.id:=(p_command->>'requestId')::uuid;proposed.evidence_id:=(p_command->>'evidenceId')::uuid;
 proposed.action:=p_command->>'action';proposed.note:=btrim(p_command->>'note');proposed.actor_id:=p_actor_id;
 if p_command->>'kind'='contracts' then proposed.contract_id:=(p_command->>'targetId')::uuid;
 elsif p_command->>'kind'='obligations' then proposed.obligation_id:=(p_command->>'targetId')::uuid;
 elsif p_command->>'kind'='settlements' then proposed.settlement_id:=(p_command->>'targetId')::uuid;
 elsif p_command->>'kind' is not null then raise exception 'MAIL_INVALID_REVIEW'; end if;
 perform pg_advisory_xact_lock(hashtextextended(proposed.id::text,0));
 select * into prior from public.touchline_company_mail_reviews where id=proposed.id;
 if found then
  if (to_jsonb(prior)-'created_at') is distinct from (to_jsonb(proposed)-'created_at') then raise exception 'MAIL_REVIEW_CONFLICT'; end if;
  return to_jsonb(prior);
 end if;
 insert into public.touchline_company_mail_reviews(id,evidence_id,action,note,contract_id,obligation_id,settlement_id,actor_id)
 values(proposed.id,proposed.evidence_id,proposed.action,proposed.note,proposed.contract_id,proposed.obligation_id,proposed.settlement_id,p_actor_id) returning * into prior;
 return to_jsonb(prior);
end $$;
revoke all on function public.touchline_company_review_mail(jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.touchline_company_review_mail(jsonb,uuid) to service_role;
commit;
