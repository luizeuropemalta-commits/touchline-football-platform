-- Complete the batch rollback boundary for approved Card Engine Market Values.
begin;
create or replace function public.touchline_card_engine_revert_batch(p_batch_id uuid, p_actor_id uuid)
returns table(batch_id uuid, status text, reverted_rows integer) language plpgsql security definer set search_path = '' as $$
declare v_batch public.touchline_card_editorial_batches%rowtype; v_count integer; v_history_id uuid;
begin
  select * into v_batch from public.touchline_card_editorial_batches where id=p_batch_id for update;
  if not found or v_batch.status <> 'published' then raise exception using errcode = 'P0001', message = 'TL_CARD_ENGINE_REVERT_BATCH_NOT_PUBLISHED'; end if;
  for v_history_id in select h.id from public.touchline_card_publication_history h
    where h.actor_id = v_batch.published_by
      and h.after_state #>> '{publication,internal_note}' = 'Card Engine batch ' || p_batch_id::text
    order by h.created_at desc
  loop
    perform * from public.touchline_revert_manual_card_publication(v_history_id, p_actor_id);
  end loop;
  update public.touchline_card_editorial_overrides o set status='reverted',approved_by=p_actor_id,approved_at=clock_timestamp(),version=o.version+1 where o.source_batch_id=p_batch_id and o.status='approved';
  get diagnostics v_count = row_count;
  insert into public.touchline_card_editorial_audit_events(batch_id,event_type,actor_id,effective_after) values(p_batch_id,'batch_reverted',p_actor_id,jsonb_build_object('revertedOverrides',v_count));
  update public.touchline_card_editorial_batches set status='reverted',reverted_at=clock_timestamp() where id=p_batch_id;
  return query select p_batch_id,'reverted'::text,v_count;
end;
$$;
revoke all on function public.touchline_card_engine_revert_batch(uuid,uuid) from public, anon, authenticated;
grant execute on function public.touchline_card_engine_revert_batch(uuid,uuid) to service_role;
commit;
