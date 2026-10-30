-- Beta may negotiate only with Beta. Paid plans remain mutually compatible.
-- Apply under existing bilateral locks; preserve cancellation and durable replay.
begin;
set local lock_timeout='5s';
do $patch$
declare r record; target oid; definition text; patched text; owner_before oid; acl_before aclitem[]; config_before text[]; security_before boolean;
begin
 for r in select * from (values
 ($sig$public.touchline_club_exchange_propose(uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint)$sig$,
 $old$ perform public.touchline_club_exchange_assert_owner(p_other,p_season,b.state);$old$,
 $new$ perform public.touchline_club_exchange_assert_owner(p_other,p_season,b.state);
 if (a.state->>'plan'='beta') is distinct from (b.state->>'plan'='beta') then raise exception 'CLUB_BETA_EXCHANGE_ONLY'; end if;$new$),
 ($sig$public.touchline_club_exchange_resolve(uuid,uuid,uuid,text)$sig$,
 $old$ perform public.touchline_club_exchange_assert_owner(a.user_id,p_season,a.state);perform public.touchline_club_exchange_assert_owner(b.user_id,p_season,b.state);$old$,
 $new$ perform public.touchline_club_exchange_assert_owner(a.user_id,p_season,a.state);perform public.touchline_club_exchange_assert_owner(b.user_id,p_season,b.state);
 if (a.state->>'plan'='beta') is distinct from (b.state->>'plan'='beta') then raise exception 'CLUB_BETA_EXCHANGE_ONLY'; end if;$new$)
,
 ($sig$public.touchline_club_exchange_discovery(uuid,uuid)$sig$,
 $old$'collectionRevision',other.revision,$old$,
 $new$'collectionRevision',other.revision,
   'negotiationAllowed',coalesce((c.state->>'plan'='beta')=(other.state->>'plan'='beta'),false),
   'restrictionReason',case when c.state->>'plan' in ('beta','standard','master','vip') and other.state->>'plan' in ('beta','standard','master','vip')
     and (c.state->>'plan'='beta')<>(other.state->>'plan'='beta') then 'beta-pair' else null end,$new$),
 ($sig$public.touchline_club_exchange_discovery(uuid,uuid)$sig$,
 $old$'proposer',p.terms->'proposer','accepter',p.terms->'accepter'$old$,
 $new$'negotiationAllowed',coalesce((select (pa.state->>'plan'='beta')=(pb.state->>'plan'='beta')
     from public.touchline_club_collections pa join public.touchline_club_collections pb on pb.season_id=pa.season_id
     where pa.user_id=p.proposer_id and pb.user_id=p.accepter_id and pa.season_id=p.season_id),false),
   'restrictionReason',(select case when pa.state->>'plan' in ('beta','standard','master','vip') and pb.state->>'plan' in ('beta','standard','master','vip')
     and (pa.state->>'plan'='beta')<>(pb.state->>'plan'='beta') then 'beta-pair' else null end
     from public.touchline_club_collections pa join public.touchline_club_collections pb on pb.season_id=pa.season_id
     where pa.user_id=p.proposer_id and pb.user_id=p.accepter_id and pa.season_id=p.season_id),
   'proposer',p.terms->'proposer','accepter',p.terms->'accepter'$new$)
 ) as changes(signature,old_text,new_text) loop
  target:=to_regprocedure(r.signature);if target is null then raise exception 'CLUB_BETA_PAIR_SOURCE_MISSING: %',r.signature;end if;
  select pg_get_functiondef(oid),proowner,proacl,proconfig,prosecdef into definition,owner_before,acl_before,config_before,security_before from pg_proc where oid=target;
  if (length(definition)-length(replace(definition,r.old_text,'')))/length(r.old_text)<>1 then raise exception 'CLUB_BETA_PAIR_SOURCE_MISMATCH: %',r.signature;end if;
  patched:=replace(definition,r.old_text,r.new_text);execute patched;
  if not exists(select 1 from pg_proc where oid=target and proowner=owner_before and proacl is not distinct from acl_before and proconfig is not distinct from config_before and prosecdef=security_before and pg_get_functiondef(oid)=patched) then raise exception 'CLUB_BETA_PAIR_FUNCTION_DRIFT';end if;
 end loop;
end $patch$;
commit;
