-- Recompile the already-applied review command with its integer provider
-- shirt serialized as JSON text, and bind it directly to the protected
-- publication-only command.  This is forward-only and preserves its
-- transactional, service-role-only signature.
begin;
do $$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.touchline_apply_card_editorial_review(uuid,jsonb,text,boolean,uuid)'::regprocedure
  ) into definition;
  definition := replace(
    definition,
    'when ''shirtNumber'' then v_provider_shirt_number',
    'when ''shirtNumber'' then v_provider_shirt_number::text'
  );
  definition := replace(
    definition,
    'public.touchline_apply_manual_card_publication(',
    'public.touchline_apply_derived_card_publication('
  );
  execute definition;
end;
$$;
revoke all on function public.touchline_apply_card_editorial_review(uuid, jsonb, text, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.touchline_apply_card_editorial_review(uuid, jsonb, text, boolean, uuid)
  to service_role;
commit;
