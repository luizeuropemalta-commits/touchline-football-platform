-- QA ONLY: version the shared flat-board depth calibration after visual QA.
-- This migration updates only the 2D registry consumed by Line-up, Market and
-- the flat Training Center board. Arena field/camera geometry is independent
-- and must never consume these coordinates.
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

do $$
declare
  v_admin_actor_id uuid;
  v_current record;
  v_geometry jsonb;
begin
  select auth_user.id
    into v_admin_actor_id
    from auth.users auth_user
   where lower(btrim(auth_user.email)) = 'admin@touchline.com.br'
   order by auth_user.created_at asc
   limit 1;

  if v_admin_actor_id is null then
    raise exception 'TL_FORMATION_GEOMETRY_ADMIN_ACTOR_NOT_FOUND';
  end if;

  for v_current in
    select version.formation_code, version.geometry, version.validation_report
      from public.touchline_formation_geometry_versions version
     where version.status = 'published'
     order by version.formation_code
  loop
    if exists (
      select 1
       from jsonb_array_elements(v_current.geometry -> 'slots') slot(value)
       where (slot.value ->> 'role' = 'goalkeeper' and (slot.value ->> 'x')::numeric <> 10)
          or (slot.value ->> 'role' = 'forward' and (slot.value ->> 'x')::numeric <> 88)
    ) then
      select jsonb_set(
        v_current.geometry,
        '{slots}',
        jsonb_agg(
          jsonb_set(
            slot.value,
            '{x}',
            to_jsonb(case
              when slot.value ->> 'role' = 'goalkeeper' then 10::numeric
              when slot.value ->> 'role' = 'forward' then 88::numeric
              else (slot.value ->> 'x')::numeric
            end),
            false
          )
          order by slot.ordinality
        ),
        false
      )
        into v_geometry
        from jsonb_array_elements(v_current.geometry -> 'slots')
          with ordinality as slot(value, ordinality);

      perform *
        from public.touchline_publish_formation_geometry(
          v_current.formation_code,
          v_geometry,
          v_current.validation_report,
          v_admin_actor_id,
          'QA 2D field-depth calibration; Arena untouched',
          null
        );
    end if;
  end loop;
end;
$$;
