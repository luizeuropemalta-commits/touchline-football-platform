SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $pre$ BEGIN
 IF current_user <> 'postgres' OR NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='touchline_avatar_private' AND nspowner=current_user::regrole) THEN RAISE EXCEPTION 'UNEXPECTED_EXECUTOR'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('touchline_avatar_private.assert_actor(uuid)') AND proowner='touchline_avatar_writer'::regrole AND NOT prosecdef AND regexp_replace(prosrc,'\s','','g')=regexp_replace($original$begin
  if p_actor is null or p_actor::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then raise exception 'AVATAR_INVALID_ACTOR'; end if;
  if auth.uid() is not null and auth.uid() <> p_actor
  then raise exception using errcode='42501',message='AVATAR_AUTH_SUBJECT_MISMATCH'; end if;
  if not exists(select 1 from auth.users where id=p_actor and deleted_at is null)
  then raise exception 'AVATAR_AUTH_IDENTITY_UNAVAILABLE'; end if;
end $original$,'\s','','g')) THEN RAISE EXCEPTION 'GUARD_PREIMAGE_CHANGED'; END IF;
END $pre$;
DROP FUNCTION touchline_avatar_private.assert_actor(uuid) RESTRICT;
CREATE FUNCTION touchline_avatar_private.assert_actor(p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$begin
  if p_actor is null or p_actor::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then raise exception 'AVATAR_INVALID_ACTOR'; end if;
  if auth.uid() is not null and auth.uid() <> p_actor
  then raise exception using errcode='42501',message='AVATAR_AUTH_SUBJECT_MISMATCH'; end if;
  if not exists(select 1 from auth.users where id=p_actor and deleted_at is null)
  then raise exception 'AVATAR_AUTH_IDENTITY_UNAVAILABLE'; end if;
end $body$;
DO $acl$ DECLARE r record; BEGIN
 FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='touchline_avatar_private.assert_actor(uuid)'::regprocedure AND a.grantee <> 'postgres'::regrole::oid LOOP
 IF r.grantee=0 THEN REVOKE ALL ON FUNCTION touchline_avatar_private.assert_actor(uuid) FROM PUBLIC;
 ELSE EXECUTE format('REVOKE ALL ON FUNCTION touchline_avatar_private.assert_actor(uuid) FROM %I',pg_get_userbyid(r.grantee)); END IF;
 END LOOP;
END $acl$;
GRANT EXECUTE ON FUNCTION touchline_avatar_private.assert_actor(uuid) TO touchline_avatar_writer;
DO $tests$ DECLARE v_actor uuid; r text; BEGIN
 SELECT id INTO v_actor FROM auth.users WHERE deleted_at IS NULL AND id IN (SELECT id FROM public.users) ORDER BY id LIMIT 1;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'NO_VALID_FIXTURE'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM set_config('request.jwt.claims','{}',true);
 PERFORM public.touchline_read_club_owner_avatar(v_actor);
 PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
 PERFORM public.touchline_read_club_owner_avatar(v_actor);
 BEGIN PERFORM touchline_avatar_private.assert_actor(NULL); RAISE EXCEPTION 'NULL_ACCEPTED'; EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'AVATAR_INVALID_ACTOR' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
 BEGIN PERFORM public.touchline_read_club_owner_avatar(v_actor); RAISE EXCEPTION 'MISMATCH_ACCEPTED'; EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'AVATAR_AUTH_SUBJECT_MISMATCH' OR SQLSTATE <> '42501' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub','',true);
 IF EXISTS(SELECT 1 FROM auth.users WHERE id='00000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'ABSENT_FIXTURE_EXISTS'; END IF;
 BEGIN PERFORM touchline_avatar_private.assert_actor('00000000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'MISSING_ACCEPTED'; EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'AVATAR_AUTH_IDENTITY_UNAVAILABLE' THEN RAISE; END IF; END;
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
 IF has_function_privilege(r,'touchline_avatar_private.assert_actor(uuid)','EXECUTE') THEN RAISE EXCEPTION 'UNEXPECTED_GUARD_ACCESS %',r; END IF; END LOOP;
 IF NOT has_function_privilege('touchline_avatar_writer','touchline_avatar_private.assert_actor(uuid)','EXECUTE') THEN RAISE EXCEPTION 'WRITER_ACCESS_MISSING'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='touchline_avatar_private.assert_actor(uuid)'::regprocedure AND (a.grantee NOT IN ('postgres'::regrole::oid,'touchline_avatar_writer'::regrole::oid) OR (a.grantee='touchline_avatar_writer'::regrole::oid AND a.is_grantable))) THEN RAISE EXCEPTION 'UNEXPECTED_ACL'; END IF;
END $tests$;
