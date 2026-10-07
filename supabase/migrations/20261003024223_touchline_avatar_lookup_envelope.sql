-- Forward protocol change only. Keep the original publication migration,
-- function identity, owner, privileges, actor admission and receipt storage.
-- CREATE OR REPLACE preserves the existing owner and ACL; no new capability.
-- A raw SQL null/empty HTTP body is not an authoritative absence acknowledgement.
create or replace function touchline_avatar_private.find_operation(p_actor uuid,p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_receipt touchline_avatar_private.receipts%rowtype;
begin
  perform touchline_avatar_private.assert_actor(p_actor);
  if p_operation is null or p_operation::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then raise exception 'AVATAR_INVALID_OPERATION'; end if;
  select * into v_receipt from touchline_avatar_private.receipts where actor_id=p_actor and operation_id=p_operation;
  if not found then
    return jsonb_build_object('version',1,'status','absent','actorId',p_actor::text,
      'operationId',p_operation::text,'receipt',null);
  end if;
  return jsonb_build_object('version',1,'status','found','actorId',p_actor::text,
    'operationId',p_operation::text,'receipt',touchline_avatar_private.receipt_json(v_receipt));
end $$;
