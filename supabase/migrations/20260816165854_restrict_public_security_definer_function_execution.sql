-- SECURITY DEFINER helpers are invoked by RLS and triggers, not by the public API.
-- Make their execution grants explicit so new default grants cannot expose them to anon.
revoke all on function public.create_ecosystem_organization(text, text, public.organization_type, char)
  from public, anon, authenticated, service_role;
grant execute on function public.create_ecosystem_organization(text, text, public.organization_type, char)
  to authenticated, service_role;

revoke all on function public.current_agency_id()
  from public, anon, authenticated, service_role;
grant execute on function public.current_agency_id()
  to authenticated, service_role;

revoke all on function public.is_organization_admin(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_organization_admin(uuid)
  to authenticated, service_role;

revoke all on function public.is_organization_member(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_organization_member(uuid)
  to authenticated, service_role;

-- Trigger execution is internal to auth.users writes; it must not be callable over PostgREST.
revoke all on function public.handle_new_user()
  from public, anon, authenticated, service_role;
