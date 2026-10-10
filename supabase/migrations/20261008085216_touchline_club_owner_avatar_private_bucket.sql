-- Forward-only bucket metadata for immutable, server-mediated owner avatars.
-- Do not create public URLs or client-role Storage policies. The application
-- verifies this exact metadata before every read/write and keeps upload OFF
-- until QA057, the avatar SQL chain, account admission, and recovery pass.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'touchline-club-owner-avatars',
  'touchline-club-owner-avatars',
  false,
  5242880,
  array['image/webp']::text[]
)
on conflict (id) do nothing;

-- Existing buckets are never silently reconfigured. A mismatch aborts this
-- migration instead of weakening privacy or admitting a different file type.
do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'touchline-club-owner-avatars'
      and name = 'touchline-club-owner-avatars'
      and public = false
      and file_size_limit = 5242880
      and allowed_mime_types = array['image/webp']::text[]
  ) then
    raise exception 'avatar bucket metadata mismatch';
  end if;
end;
$$;

create policy touchline_avatar_service_create on storage.objects
  for insert to service_role
  with check (bucket_id = 'touchline-club-owner-avatars');
create policy touchline_avatar_service_read on storage.objects
  for select to service_role
  using (bucket_id = 'touchline-club-owner-avatars');

commit;
