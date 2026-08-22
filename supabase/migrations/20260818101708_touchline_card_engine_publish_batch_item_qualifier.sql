-- Disambiguate the output-column name from the batch item column.
begin;
create or replace function public.touchline_card_engine_publish_batch(p_batch_id uuid, p_actor_id uuid)
returns table(batch_id uuid, status text, published_rows integer) language plpgsql security definer set search_path = '' as $$
declare v_batch public.touchline_card_editorial_batches%rowtype; v_item public.touchline_card_editorial_batch_items%rowtype; v_player public.football_players%rowtype; v_membership public.football_squad_members%rowtype; v_competition uuid; v_key text; v_value jsonb; v_before public.touchline_card_editorial_overrides%rowtype; v_tier text; v_price integer;
begin
  select * into v_batch from public.touchline_card_editorial_batches where id=p_batch_id for update;
  if not found or v_batch.status <> 'approved' then raise exception using errcode = 'P0001', message = 'TL_CARD_ENGINE_PUBLISH_BATCH_NOT_APPROVED'; end if;
  for v_item in select i.* from public.touchline_card_editorial_batch_items i where i.batch_id=p_batch_id order by i.row_number for update loop
    select * into v_player from public.football_players where id=v_item.player_id for update;
    if not found or v_player.provider_player_id <> v_item.provider_player_id then raise exception using errcode = 'P0001', message = 'TL_CARD_ENGINE_PUBLISH_CANONICAL_FENCE_FAILED'; end if;
    for v_key, v_value in select key, value from jsonb_each(v_item.proposed_override) loop
      select * into v_before from public.touchline_card_editorial_overrides where player_id=v_player.id and field_key=v_key for update;
      insert into public.touchline_card_editorial_audit_events(batch_id,batch_item_id,player_id,event_type,actor_id,provider_before,override_before,effective_before)
      values(p_batch_id,v_item.id,v_player.id,'override_published',p_actor_id,case v_key when 'displayName' then to_jsonb(v_player.display_name) else null end,case when v_before.id is null then null else v_before.touchline_override end,case when v_before.id is null then null else v_before.effective_value end);
      insert into public.touchline_card_editorial_overrides(player_id,field_key,provider_value,touchline_override,effective_value,status,provider_updated_at,source_batch_id,approved_by,approved_at,version)
      values(v_player.id,v_key,case when v_key='displayName' then to_jsonb(v_player.display_name) when v_key='shirtNumber' then v_item.provider_snapshot->'jerseyNumber' else null end,v_value,v_value,'approved',v_player.source_updated_at,p_batch_id,p_actor_id,clock_timestamp(),1)
      on conflict(player_id,field_key) do update set provider_value=excluded.provider_value,touchline_override=excluded.touchline_override,effective_value=excluded.effective_value,status='approved',provider_updated_at=excluded.provider_updated_at,source_batch_id=excluded.source_batch_id,approved_by=excluded.approved_by,approved_at=excluded.approved_at,version=public.touchline_card_editorial_overrides.version+1;
      if v_key='marketValueEur' then
        select m.* into v_membership from public.football_squad_members m join public.football_competitions c on c.id=m.competition_id where m.player_id=v_player.id and m.club_id=v_player.current_club_id and m.provider='sportmonks' and m.status='active' and c.provider='sportmonks' and c.provider_competition_id='8' limit 1;
        if v_membership.id is null then raise exception using errcode = 'P0001', message = 'TL_CARD_ENGINE_MARKET_VALUE_MEMBERSHIP_INVALID'; end if;
        v_competition := v_membership.competition_id; v_tier := case when (v_value #>> '{}')::bigint < 6000000 then 'ruby-red' when (v_value #>> '{}')::bigint < 10000000 then 'sapphire-blue' when (v_value #>> '{}')::bigint < 20000000 then 'amethyst-purple' when (v_value #>> '{}')::bigint < 35000000 then 'radiant-gold' when (v_value #>> '{}')::bigint < 50000000 then 'emerald-green' when (v_value #>> '{}')::bigint < 70000000 then 'clear-diamond' else 'diamond-gold' end; v_price := case v_tier when 'ruby-red' then 0 when 'sapphire-blue' then 1 when 'amethyst-purple' then 2 when 'radiant-gold' then 4 when 'emerald-green' then 7 when 'clear-diamond' then 10 else 15 end;
        perform * from public.touchline_apply_manual_card_publication(v_player.id,v_membership.id,v_competition,v_batch.effective_season,(v_value #>> '{}')::bigint,v_tier,v_price,'2026-07-premier-v1','ready_to_publish',clock_timestamp(),'Card Engine batch ' || p_batch_id,'TouchLine Editorial',p_actor_id);
        insert into public.touchline_card_editorial_audit_events(batch_id,batch_item_id,player_id,event_type,actor_id,effective_after) values(p_batch_id,v_item.id,v_player.id,'market_value_published',p_actor_id,jsonb_build_object('marketValueEur',v_value));
      end if;
    end loop;
  end loop;
  update public.touchline_card_editorial_batches set status='published',published_by=p_actor_id,published_at=clock_timestamp() where id=p_batch_id;
  return query select p_batch_id,'published'::text,v_batch.matched_rows;
end;
$$;
revoke all on function public.touchline_card_engine_publish_batch(uuid,uuid) from public, anon, authenticated;
grant execute on function public.touchline_card_engine_publish_batch(uuid,uuid) to service_role;
commit;
