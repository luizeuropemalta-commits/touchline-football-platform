-- Prevent self-service profile updates from changing tenant membership or
-- authorization, and restrict compliance/representation mutations to agency
-- owners and admins. Reads remain tenant-scoped for authenticated members.

revoke update on table public.users from authenticated;
grant update (full_name, avatar_url, phone, job_title) on table public.users
  to authenticated;

create or replace function public.current_agency_role()
returns public.agency_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.users
  where id = auth.uid()
$$;

revoke all on function public.current_agency_role()
  from public, anon, authenticated;
grant execute on function public.current_agency_role()
  to authenticated, service_role;

comment on function public.current_agency_role() is
  'Returns the authenticated user agency role for RLS authorization. Not anonymous.';

drop policy if exists "tenant agent identity verifications" on public.agent_identity_verifications;
drop policy if exists "agency members read agent identity verifications" on public.agent_identity_verifications;
drop policy if exists "agency administrators insert agent identity verifications" on public.agent_identity_verifications;
drop policy if exists "agency administrators update agent identity verifications" on public.agent_identity_verifications;
drop policy if exists "agency administrators delete agent identity verifications" on public.agent_identity_verifications;

create policy "agency members read agent identity verifications"
  on public.agent_identity_verifications
  for select
  to authenticated
  using (agency_id = public.current_agency_id());

create policy "agency administrators insert agent identity verifications"
  on public.agent_identity_verifications
  for insert
  to authenticated
  with check (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
  );

create policy "agency administrators update agent identity verifications"
  on public.agent_identity_verifications
  for update
  to authenticated
  using (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
  )
  with check (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
  );

create policy "agency administrators delete agent identity verifications"
  on public.agent_identity_verifications
  for delete
  to authenticated
  using (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
  );

drop policy if exists "tenant agent player associations" on public.agent_player_associations;
drop policy if exists "agency members read agent player associations" on public.agent_player_associations;
drop policy if exists "agency administrators insert agent player associations" on public.agent_player_associations;
drop policy if exists "agency administrators update agent player associations" on public.agent_player_associations;
drop policy if exists "agency administrators delete agent player associations" on public.agent_player_associations;

create policy "agency members read agent player associations"
  on public.agent_player_associations
  for select
  to authenticated
  using (agency_id = public.current_agency_id());

create policy "agency administrators insert agent player associations"
  on public.agent_player_associations
  for insert
  to authenticated
  with check (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
  );

create policy "agency administrators update agent player associations"
  on public.agent_player_associations
  for update
  to authenticated
  using (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
  )
  with check (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
  );

create policy "agency administrators delete agent player associations"
  on public.agent_player_associations
  for delete
  to authenticated
  using (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
  );

drop policy if exists "tenant representation documents" on public.representation_documents;
drop policy if exists "agency members read representation documents" on public.representation_documents;
drop policy if exists "agency administrators insert representation documents" on public.representation_documents;
drop policy if exists "agency administrators update representation documents" on public.representation_documents;
drop policy if exists "agency administrators delete representation documents" on public.representation_documents;

create policy "agency members read representation documents"
  on public.representation_documents
  for select
  to authenticated
  using (agency_id = public.current_agency_id());

create policy "agency administrators insert representation documents"
  on public.representation_documents
  for insert
  to authenticated
  with check (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
  );

create policy "agency administrators update representation documents"
  on public.representation_documents
  for update
  to authenticated
  using (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
  )
  with check (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
  );

create policy "agency administrators delete representation documents"
  on public.representation_documents
  for delete
  to authenticated
  using (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
  );

drop policy if exists "tenant representation admin reviews" on public.representation_admin_reviews;
drop policy if exists "agency members read representation admin reviews" on public.representation_admin_reviews;
drop policy if exists "agency administrators insert representation admin reviews" on public.representation_admin_reviews;
drop policy if exists "agency administrators update representation admin reviews" on public.representation_admin_reviews;
drop policy if exists "agency administrators delete representation admin reviews" on public.representation_admin_reviews;

create policy "agency members read representation admin reviews"
  on public.representation_admin_reviews
  for select
  to authenticated
  using (agency_id = public.current_agency_id());

create policy "agency administrators insert representation admin reviews"
  on public.representation_admin_reviews
  for insert
  to authenticated
  with check (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
  );

create policy "agency administrators update representation admin reviews"
  on public.representation_admin_reviews
  for update
  to authenticated
  using (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
  )
  with check (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
  );

create policy "agency administrators delete representation admin reviews"
  on public.representation_admin_reviews
  for delete
  to authenticated
  using (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
  );
