-- Forward-only, relation-scoped correction of inherited default privileges.
-- No global defaults, RPC body, receipt data, contract or wallet is changed.
begin;
set local lock_timeout='5s';
do $$ begin
  if to_regclass('public.touchline_club_release_receipts') is null
    or to_regprocedure('public.touchline_club_release_player(uuid,uuid,jsonb)') is null then
    raise exception 'CLUB_RELEASE_ACL_PREREQUISITE_REQUIRED';
  end if;
  if not exists(select 1 from pg_class where oid='public.touchline_club_release_receipts'::regclass
      and relkind='r' and relrowsecurity and relowner='postgres'::regrole)
    or not exists(select 1 from pg_proc where oid='public.touchline_club_release_player(uuid,uuid,jsonb)'::regprocedure
      and md5(pg_get_functiondef(oid))='c45f054dfb5b83bc509fdebb53107a7d'
      and not prosecdef and proowner='postgres'::regrole)
    or has_table_privilege('anon','public.touchline_club_release_receipts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_table_privilege('authenticated','public.touchline_club_release_receipts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'CLUB_RELEASE_ACL_PREIMAGE_DRIFT';
  end if;
  if current_setting('server_version_num')::int >= 170000 then
    if has_table_privilege('anon','public.touchline_club_release_receipts','MAINTAIN')
      or has_table_privilege('authenticated','public.touchline_club_release_receipts','MAINTAIN') then
      raise exception 'CLUB_RELEASE_ACL_PREIMAGE_DRIFT';
    end if;
  end if;
end $$;
revoke all privileges on table public.touchline_club_release_receipts from service_role;
grant select,insert on table public.touchline_club_release_receipts to service_role;
do $$ begin
  if not has_table_privilege('service_role','public.touchline_club_release_receipts','SELECT')
    or not has_table_privilege('service_role','public.touchline_club_release_receipts','INSERT')
    or has_table_privilege('service_role','public.touchline_club_release_receipts','UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'CLUB_RELEASE_ACL_POSTIMAGE_INVALID';
  end if;
  if current_setting('server_version_num')::int >= 170000 then
    if has_table_privilege('service_role','public.touchline_club_release_receipts','MAINTAIN') then
      raise exception 'CLUB_RELEASE_ACL_POSTIMAGE_INVALID';
    end if;
  end if;
end $$;
commit;
