-- Private immutable contract attachments. Local migration only; no email ingestion.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('touchline-company-documents','touchline-company-documents',false,3145728,array['application/pdf']::text[])
on conflict(id) do nothing;
do $$ begin
 if not exists(select 1 from storage.buckets where id='touchline-company-documents' and name=id and public=false and file_size_limit=3145728 and allowed_mime_types=array['application/pdf']::text[]) then raise exception 'company document bucket metadata mismatch'; end if;
end $$;
create table public.touchline_company_documents (
 id uuid primary key,
 contract_id uuid not null references public.touchline_company_contracts(id),
 filename text not null check(length(filename) between 5 and 160 and lower(right(filename,4))='.pdf'),
 object_key text not null unique,
 mime_type text not null check(mime_type='application/pdf'),
 byte_size integer not null check(byte_size between 1 and 3145728),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 check(object_key='contracts/' || contract_id::text || '/' || id::text || '/' || sha256 || '.pdf')
);
alter table public.touchline_company_documents enable row level security;
revoke all on public.touchline_company_documents from public,anon,authenticated,service_role;
grant select,insert on public.touchline_company_documents to service_role;
create index company_documents_contract_idx on public.touchline_company_documents(contract_id,id);
create trigger company_document_audit after insert on public.touchline_company_documents for each row execute function public.touchline_company_append_audit();
create policy company_document_service_create on storage.objects for insert to service_role with check(bucket_id='touchline-company-documents');
create policy company_document_service_read on storage.objects for select to service_role using(bucket_id='touchline-company-documents');
-- Storage and Postgres cannot commit atomically. Orphan reconciliation/retention requires a separate audited job.
commit;
