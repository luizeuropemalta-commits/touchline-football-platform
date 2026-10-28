-- Local candidate only. Runtime application is QA-only and requires QA 010/011.
-- Prerequisites: foundation 013 and 20260821162000 exact-position columns.
-- Runtime capture also requires QA target assertion; application requires QA
-- 010/011, which remain explicit prerequisites outside migration history.
-- No schedule is installed and both durable policy gates default OFF.
begin;
set local lock_timeout = '5s';
create table public.touchline_roster_policy (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 apply_enabled boolean not null default false
);
insert into public.touchline_roster_policy values(true,false,false);
create table public.touchline_roster_jobs (
 id uuid primary key, actor text not null, command_hash text not null, season_id text not null,
 status text not null check(status in ('collecting','review','failed')), created_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz, error_code text
);
create index touchline_roster_jobs_recent on public.touchline_roster_jobs(created_at desc);
create unique index touchline_roster_one_capture on public.touchline_roster_jobs((true)) where status='collecting';
create table public.touchline_roster_snapshots (
 id uuid primary key references public.touchline_roster_jobs(id), source jsonb not null,
 source_checksum text not null, baseline jsonb not null, operations jsonb not null,
 status text not null default 'review' check(status in ('review','applied')), revision integer not null default 0,
 captured_at timestamptz not null default clock_timestamp()
);
create table public.touchline_roster_decisions (
 snapshot_id uuid not null references public.touchline_roster_snapshots(id), revision integer not null,
 provider_id text not null, decision text not null check(decision in ('approve','reject')),
 reason text not null check(length(reason) between 3 and 500), actor text not null, decided_at timestamptz not null default clock_timestamp(),
 primary key(snapshot_id,revision)
);
create index touchline_roster_decisions_player on public.touchline_roster_decisions(snapshot_id,provider_id,revision desc);
create table public.touchline_roster_receipts (
 id uuid primary key, actor text not null, command_hash text not null, result jsonb not null,
 recorded_at timestamptz not null default clock_timestamp()
);
create index touchline_roster_applied_receipt_snapshot on public.touchline_roster_receipts((result->>'snapshotId')) where result->>'status'='applied';
-- Before/after membership identity and source facts persist in snapshot/receipt;
-- no market values, card prices, secrets or raw provider envelopes are stored.
create function public.touchline_roster_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='touchline_roster_snapshots' and tg_op='UPDATE'
   and new.source=old.source and new.baseline=old.baseline and new.operations=old.operations
   and new.source_checksum=old.source_checksum and new.id=old.id and new.captured_at=old.captured_at then return new; end if;
 raise exception 'ROSTER_AUDIT_IMMUTABLE';
end $$;
create trigger touchline_roster_snapshot_immutable before update or delete on public.touchline_roster_snapshots for each row execute function public.touchline_roster_immutable();
create trigger touchline_roster_decision_immutable before update or delete on public.touchline_roster_decisions for each row execute function public.touchline_roster_immutable();
create trigger touchline_roster_receipt_immutable before update or delete on public.touchline_roster_receipts for each row execute function public.touchline_roster_immutable();

-- Scope includes all histories of observed/current-scope players, including a
-- transfer from outside England. A financial-only Admin edit is not a conflict.
create function public.touchline_roster_baseline(p_ids text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with clubs as (select id,provider_team_id,competition_id from public.football_clubs where provider='sportmonks'
   and provider_team_id=any(array['3','6','8','9','11','13','14','15','18','19','20','22','51','52','63','71','78','116','117','236'])),
 players as (select p.id,p.provider_player_id,p.current_club_id,p.name,p.display_name,p.nationality,p.country_id,
 p.provider_position,p.provider_position_id,p.detailed_position,p.detailed_position_id,p.position,p.position_id,p.source_updated_at
 from public.football_players p where p.provider='sportmonks' and (p.provider_player_id=any(p_ids)
 or p.current_club_id in(select id from clubs) or p.id in(select m.player_id from public.football_squad_members m where m.provider='sportmonks' and m.status='active' and m.club_id in(select id from clubs)))),
 members as(select m.id,m.player_id,m.club_id,m.competition_id,m.status,m.jersey_number,m.provider_position,m.provider_position_id,
 m.detailed_position,m.detailed_position_id,m.position,m.position_id,m.source_updated_at
 from public.football_squad_members m where m.provider='sportmonks' and m.player_id in(select id from players))
 select jsonb_build_object('clubs',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from clubs c),'[]'::jsonb),
 'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from players p),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from members m),'[]'::jsonb));
$$;
create function public.touchline_roster_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',p.enabled,'applyEnabled',p.apply_enabled,
 'snapshots',coalesce((select jsonb_agg(x.obj order by x.at desc) from (select s.captured_at at,jsonb_build_object(
 'id',s.id,'status',s.status,'revision',s.revision,'fetchedAt',s.source->>'fetchedAt','seasonId',s.source->>'seasonId','checksum',s.source_checksum,
 'operations',(select coalesce(jsonb_agg(o.value || jsonb_build_object('canonicalPlayerId',coalesce(i.identity->>'canonicalPlayerId',o.value->>'canonicalPlayerId'),'decision',d.decision,'reason',d.reason)),'[]'::jsonb)
 from jsonb_array_elements(s.operations)o left join lateral (select decision,reason from public.touchline_roster_decisions
 where snapshot_id=s.id and provider_id=o.value->>'providerId' order by revision desc limit 1)d on true
 left join lateral (select identity from public.touchline_roster_receipts r cross join lateral jsonb_array_elements(r.result->'identities')identity
 where r.result->>'snapshotId'=s.id::text and r.result->>'status'='applied' and identity->>'providerId'=o.value->>'providerId' limit 1)i on true))obj
 from public.touchline_roster_snapshots s order by s.captured_at desc limit 3)x),'[]'::jsonb),
 'jobs',coalesce((select jsonb_agg(x.obj order by x.at desc) from (select j.created_at at,jsonb_build_object('id',j.id,'status',j.status,'createdAt',j.created_at,'error',j.error_code)obj
 from public.touchline_roster_jobs j order by j.created_at desc limit 10)x),'[]'::jsonb)) from public.touchline_roster_policy p where singleton;
$$;

create function public.touchline_roster_action(p_actor text,p_command jsonb,p_phase text default 'command',p_source jsonb default null)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
 v_id uuid; v_action text; v_hash text; v_result jsonb; v_job public.touchline_roster_jobs; v_snapshot public.touchline_roster_snapshots;
 v_policy public.touchline_roster_policy; v_season text; v_comp uuid; v_ids text[]; v_team_ids text[];
 v_baseline jsonb; v_operations jsonb:='[]'; v_club jsonb; v_member jsonb; v_player jsonb; v_prior jsonb;
 v_kind text; v_from text; v_target uuid; v_effective jsonb; v_approved text[]; v_receipt jsonb;
 v_at timestamptz; v_checksum text;
begin
 if p_actor is null or p_actor !~ '^(owner:[0-9a-f-]{36}|cron:roster-v1)$' or p_command is null then raise exception 'ROSTER_COMMAND_INVALID'; end if;
 v_id:=(p_command->>'requestId')::uuid; v_action:=p_command->>'action';
 if v_id is null or v_action not in ('capture','decide','apply') or p_phase not in ('command','begin','finish','fail','lookup') then raise exception 'ROSTER_COMMAND_INVALID'; end if;
 v_hash:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 -- Receipt recovery precedes gates, freshness, season, CAS and all provider I/O.
 perform pg_catalog.pg_advisory_xact_lock(900101,20);
 select result into v_result from public.touchline_roster_receipts where id=v_id;
 if found then
   if not exists(select 1 from public.touchline_roster_receipts where id=v_id and actor=p_actor and command_hash=v_hash) then raise exception 'ROSTER_REQUEST_CONFLICT'; end if;
   return v_result;
 end if;
 select * into v_job from public.touchline_roster_jobs where id=v_id;
 if found and (v_job.actor<>p_actor or v_job.command_hash<>v_hash) then raise exception 'ROSTER_REQUEST_CONFLICT'; end if;
 if v_job.id is not null and v_job.status='collecting' and v_job.created_at<clock_timestamp()-interval '15 minutes' then
   update public.touchline_roster_jobs set status='failed',completed_at=clock_timestamp(),error_code='CAPTURE_LEASE_EXPIRED' where id=v_id;
   v_result:=jsonb_build_object('status','failed','requestId',v_id,'error','CAPTURE_LEASE_EXPIRED');
   insert into public.touchline_roster_receipts values(v_id,p_actor,v_hash,v_result,clock_timestamp());
   return v_result;
 end if;
 if p_phase='lookup' then
   if v_job.id is not null then return jsonb_build_object('status',v_job.status,'requestId',v_id,'error',v_job.error_code); end if;
   return null;
 end if;
 if v_job.id is not null and p_phase='begin' then return jsonb_build_object('status',v_job.status,'requestId',v_id,'error',v_job.error_code); end if;
 if p_phase='fail' and v_action='capture' and v_job.status='collecting' then
   update public.touchline_roster_jobs set status='failed',completed_at=clock_timestamp(),error_code='CAPTURE_NOT_CONFIRMED' where id=v_id;
   v_result:=jsonb_build_object('status','failed','requestId',v_id,'error','CAPTURE_NOT_CONFIRMED');
   insert into public.touchline_roster_receipts values(v_id,p_actor,v_hash,v_result,clock_timestamp());return v_result;
 end if;
 select * into strict v_policy from public.touchline_roster_policy where singleton;
 if not v_policy.enabled then raise exception 'ROSTER_PAUSED'; end if;
 if p_actor='cron:roster-v1' and v_action<>'capture' then raise exception 'ROSTER_OWNER_REQUIRED'; end if;
 -- A service token alone never permits application outside the QA boundary.
 perform public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');
 select id into strict v_comp from public.football_competitions where provider='sportmonks' and provider_competition_id='8';
 select provider_season_id into strict v_season from public.football_seasons where provider='sportmonks' and competition_id=v_comp and is_current;
 if v_season !~ '^[1-9][0-9]{0,19}$' then raise exception 'ROSTER_SEASON_UNAVAILABLE'; end if;
 if v_action='capture' and p_phase='begin' then
   update public.touchline_roster_jobs set status='failed',completed_at=clock_timestamp(),error_code='CAPTURE_LEASE_EXPIRED' where status='collecting' and created_at<clock_timestamp()-interval '15 minutes';
   if exists(select 1 from public.touchline_roster_jobs where status='collecting') then raise exception 'ROSTER_CAPTURE_BUSY'; end if;
   insert into public.touchline_roster_jobs(id,actor,command_hash,season_id,status) values(v_id,p_actor,v_hash,v_season,'collecting');
   return jsonb_build_object('status','collecting','capture',true,'requestId',v_id,'seasonId',v_season);
 end if;
 if v_action='capture' and p_phase='finish' then
   if v_job.id is null or v_job.status<>'collecting' or v_job.created_at<clock_timestamp()-interval '15 minutes' or v_job.season_id<>v_season then raise exception 'ROSTER_CAPTURE_LEASE_LOST'; end if;
   if octet_length(p_source::text)>2097152 or p_source->>'provider' is distinct from 'sportmonks'
     or p_source->>'sourceRevision' is distinct from 'sportmonks-current-squads-v1' or p_source->>'schemaVersion' is distinct from 'roster-observation-v1' or p_source->>'competitionId' is distinct from '8' or p_source->>'seasonId' is distinct from v_season
     or p_source->>'protocol' is distinct from 'documented-unpaginated-v1' or jsonb_typeof(p_source->'squads') is distinct from 'array'
     or jsonb_array_length(p_source->'squads')<>20 then raise exception 'ROSTER_SOURCE_INVALID'; end if;
   v_at:=(p_source->>'fetchedAt')::timestamptz;
   if v_at is null or v_at>clock_timestamp()+interval '1 minute' or v_at<clock_timestamp()-interval '6 hours' then raise exception 'ROSTER_SOURCE_EXPIRED'; end if;
   v_ids:='{}';v_team_ids:='{}';
   for v_club in select value from jsonb_array_elements(p_source->'squads') loop
     if v_club->>'teamId'=any(v_team_ids) or jsonb_typeof(v_club->'members') is distinct from 'array'
       or jsonb_array_length(v_club->'members') not between 11 and 100 then raise exception 'ROSTER_SOURCE_INCOMPLETE'; end if;
     if v_club->>'fetchedAt' is null or (v_club->>'fetchedAt')::timestamptz < v_at
       or (v_club->>'fetchedAt')::timestamptz>clock_timestamp()+interval '1 minute' then raise exception 'ROSTER_SOURCE_TIME_INVALID'; end if;
     v_team_ids:=array_append(v_team_ids,v_club->>'teamId');
     for v_member in select value from jsonb_array_elements(v_club->'members') loop
       if v_member->>'providerId' is null or v_member->>'providerId' !~ '^[1-9][0-9]{0,19}$' or v_member->>'providerId'=any(v_ids)
         or nullif(btrim(v_member->>'name'),'') is null or length(v_member->>'name')>200
         or v_member ?| array['marketValue','market_value','currency','marketValueCurrency','price','tier'] then raise exception 'ROSTER_SOURCE_IDENTITY_INVALID'; end if;
       v_ids:=array_append(v_ids,v_member->>'providerId');
     end loop;
   end loop;
   if (select array_agg(x order by x) from unnest(v_team_ids)x) is distinct from array['11','116','117','13','14','15','18','19','20','22','236','3','51','52','6','63','71','78','8','9'] then raise exception 'ROSTER_SOURCE_SCOPE_INVALID'; end if;
   if v_at is distinct from (select min((c->>'fetchedAt')::timestamptz) from jsonb_array_elements(p_source->'squads')c) then raise exception 'ROSTER_SOURCE_TIME_INVALID'; end if;
   v_baseline:=public.touchline_roster_baseline(v_ids);
   if jsonb_array_length(v_baseline->'clubs')<>20 or exists(select 1 from jsonb_array_elements(v_baseline->'clubs')c where c->>'competition_id'<>v_comp::text)
     or exists(select 1 from jsonb_array_elements(v_baseline->'members')m where m->>'status'='active' group by m->>'player_id' having count(*)>1) then raise exception 'ROSTER_BASELINE_AMBIGUOUS'; end if;
   for v_club in select value from jsonb_array_elements(p_source->'squads') loop
     select (c->>'id')::uuid into strict v_target from jsonb_array_elements(v_baseline->'clubs')c where c->>'provider_team_id'=v_club->>'teamId';
     for v_member in select value from jsonb_array_elements(v_club->'members') loop
       select p into v_player from jsonb_array_elements(v_baseline->'players')p where p->>'provider_player_id'=v_member->>'providerId';
       v_from:=null;
       select c->>'provider_team_id' into v_from from jsonb_array_elements(v_baseline->'clubs')c where c->>'id'=v_player->>'current_club_id';
       if v_player is null then v_kind:='ADD_REVIEW_REQUIRED';
       elsif v_player->>'current_club_id' is distinct from v_target::text then v_kind:='TRANSFER_REVIEW_REQUIRED';
       elsif coalesce(nullif(v_player->>'display_name',''),v_player->>'name') is distinct from v_member->>'name'
         or (v_member->>'nationality' is not null and v_member->>'nationality' is distinct from v_player->>'nationality')
         or (v_member->>'countryId' is not null and v_member->>'countryId' is distinct from v_player->>'country_id')
         or v_member->>'broadPosition' is distinct from v_player->>'provider_position'
         or v_member->>'broadPositionId' is distinct from v_player->>'provider_position_id'
         or v_member->>'detailedPosition' is distinct from v_player->>'detailed_position'
         or v_member->>'detailedPositionId' is distinct from v_player->>'detailed_position_id'
         or v_member->>'position' is distinct from v_player->>'position'
         or v_member->>'positionId' is distinct from v_player->>'position_id'
         or not exists(select 1 from jsonb_array_elements(v_baseline->'members')m where m->>'player_id'=v_player->>'id'
           and m->>'club_id'=v_target::text and m->>'status'='active'
           and (v_member->>'shirtNumber' is null or m->>'jersey_number'=v_member->>'shirtNumber')
           and m->>'provider_position' is not distinct from v_member->>'broadPosition'
           and m->>'provider_position_id' is not distinct from v_member->>'broadPositionId'
           and m->>'detailed_position' is not distinct from v_member->>'detailedPosition'
           and m->>'detailed_position_id' is not distinct from v_member->>'detailedPositionId')
         then v_kind:='UPDATE_REVIEW_REQUIRED';
       else continue; end if;
       -- Keep metadata updates reviewable; absence of enrichment never erases a
       -- previously known nationality/country/shirt value in the QA executor.
       v_operations:=v_operations||jsonb_build_array(jsonb_build_object('providerId',v_member->>'providerId','canonicalPlayerId',v_player->>'id','name',v_member->>'name','fromTeamId',v_from,'teamId',v_club->>'teamId','kind',v_kind));
     end loop;
   end loop;
   for v_player in select p from jsonb_array_elements(v_baseline->'players')p where not(p->>'provider_player_id'=any(v_ids))
     and exists(select 1 from jsonb_array_elements(v_baseline->'members')m join jsonb_array_elements(v_baseline->'clubs')c on c->>'id'=m->>'club_id' where m->>'player_id'=p->>'id' and m->>'status'='active') loop
     select c->>'provider_team_id' into v_from from jsonb_array_elements(v_baseline->'clubs')c where c->>'id'=v_player->>'current_club_id';
     v_operations:=v_operations||jsonb_build_array(jsonb_build_object('providerId',v_player->>'provider_player_id','canonicalPlayerId',v_player->>'id','name',v_player->>'display_name','fromTeamId',v_from,'teamId',null,'kind','PRESERVE_UNSEEN_REVIEW_REQUIRED'));
   end loop;
   v_checksum:=encode(sha256(convert_to(p_source::text,'UTF8')),'hex');
   insert into public.touchline_roster_snapshots(id,source,source_checksum,baseline,operations)values(v_id,p_source,v_checksum,v_baseline,v_operations);
   update public.touchline_roster_jobs set status='review',completed_at=clock_timestamp() where id=v_id;
   v_result:=jsonb_build_object('status','review','requestId',v_id,'snapshotId',v_id,'revision',0,'checksum',v_checksum);
 elsif v_action in ('decide','apply') and p_phase='command' then
   if p_command->>'revision' is null or p_command->>'revision' !~ '^[0-9]{1,9}$' then raise exception 'ROSTER_COMMAND_INVALID'; end if;
   select * into strict v_snapshot from public.touchline_roster_snapshots where id=(p_command->>'snapshotId')::uuid for update;
   if v_snapshot.status<>'review' or v_snapshot.revision<>(p_command->>'revision')::integer then raise exception 'ROSTER_REVISION_CONFLICT'; end if;
   if v_snapshot.source->>'seasonId'<>v_season or (v_snapshot.source->>'fetchedAt')::timestamptz<clock_timestamp()-interval '6 hours' then raise exception 'ROSTER_SOURCE_EXPIRED'; end if;
   if v_action='decide' then
     if p_command->>'decision' not in ('approve','reject') or length(btrim(p_command->>'reason')) not between 3 and 500 then raise exception 'ROSTER_DECISION_INVALID'; end if;
     if not exists(select 1 from jsonb_array_elements(v_snapshot.operations)o where o->>'providerId'=p_command->>'providerId'
       and o->>'kind'<>'PRESERVE_UNSEEN_REVIEW_REQUIRED') then raise exception 'ROSTER_OPERATION_NOT_ACTIONABLE'; end if;
     insert into public.touchline_roster_decisions values(v_snapshot.id,v_snapshot.revision+1,p_command->>'providerId',p_command->>'decision',btrim(p_command->>'reason'),p_actor,clock_timestamp());
     update public.touchline_roster_snapshots set revision=revision+1 where id=v_snapshot.id;
     v_result:=jsonb_build_object('status','decided','requestId',v_id,'snapshotId',v_snapshot.id,'revision',v_snapshot.revision+1);
   else
     if not v_policy.apply_enabled then raise exception 'ROSTER_APPLICATION_PAUSED'; end if;
     if to_regprocedure('public.touchline_apply_qa_twenty_club_roster_atomic(text,uuid,jsonb)') is null then raise exception 'ROSTER_QA_EXECUTOR_UNAVAILABLE'; end if;
     -- Same order as the existing executor: advisory lock, then both tables.
     perform pg_catalog.pg_advisory_xact_lock(900100,20);
     lock table public.football_players,public.football_squad_members in share row exclusive mode;
     select array_agg(m->>'providerId') into v_ids from jsonb_array_elements(v_snapshot.source->'squads')c cross join lateral jsonb_array_elements(c->'members')m;
     if public.touchline_roster_baseline(v_ids)<>v_snapshot.baseline then raise exception 'ROSTER_BASELINE_CHANGED'; end if;
     select coalesce(array_agg(provider_id),'{}') into v_approved from (
       select distinct on(provider_id)provider_id,decision from public.touchline_roster_decisions where snapshot_id=v_snapshot.id order by provider_id,revision desc
     )d where decision='approve';
     if cardinality(v_approved)=0 then raise exception 'ROSTER_NO_APPROVED_CHANGES'; end if;
     v_effective:='[]';
     for v_club in select value from jsonb_array_elements(v_snapshot.baseline->'clubs') loop
       select coalesce(jsonb_agg(jsonb_build_object('providerId',p->>'provider_player_id','name',coalesce(nullif(p->>'display_name',''),p->>'name'),
         'nationality',p->>'nationality','countryId',p->>'country_id','broadPosition',p->>'provider_position','broadPositionId',p->>'provider_position_id',
         'detailedPosition',p->>'detailed_position','detailedPositionId',p->>'detailed_position_id','position',p->>'position','positionId',p->>'position_id','shirtNumber',m->'jersey_number')),'[]')
         into v_prior from jsonb_array_elements(v_snapshot.baseline->'members')m join jsonb_array_elements(v_snapshot.baseline->'players')p on p->>'id'=m->>'player_id'
         where m->>'status'='active' and m->>'club_id'=v_club->>'id' and not(p->>'provider_player_id'=any(v_approved));
       select v_prior||coalesce(jsonb_agg(m),'[]') into v_prior from jsonb_array_elements(v_snapshot.source->'squads')c cross join lateral jsonb_array_elements(c->'members')m
         where c->>'teamId'=v_club->>'provider_team_id' and m->>'providerId'=any(v_approved);
       v_effective:=v_effective||jsonb_build_array(jsonb_build_object('teamId',v_club->>'provider_team_id','members',v_prior));
     end loop;
     v_receipt:=public.touchline_apply_qa_twenty_club_roster_atomic('xgxbwqxjssxxuihuwmgy',v_id,v_effective);
     -- The legacy complete-squad writer stamps every submitted row. Within the
     -- SAME transaction, after exact baseline CAS and while both write locks
     -- remain held, restore football columns of NON-APPROVED existing rows.
     -- This is not the legacy blanket rollback: it cannot run independently,
     -- cannot touch financial columns and cannot overwrite a concurrent edit.
     -- It preserves distinct member/player positions and source timestamps,
     -- including unseen players, rather than falsely refreshing their facts.
     update public.football_players p set
       current_club_id=b.current_club_id,name=b.name,display_name=b.display_name,
       nationality=b.nationality,country_id=b.country_id,provider_position=b.provider_position,
       provider_position_id=b.provider_position_id,detailed_position=b.detailed_position,
       detailed_position_id=b.detailed_position_id,position=b.position,position_id=b.position_id,
       source_updated_at=b.source_updated_at
     from jsonb_to_recordset(v_snapshot.baseline->'players') as b(id uuid,provider_player_id text,current_club_id uuid,
       name text,display_name text,nationality text,country_id text,provider_position text,provider_position_id text,
       detailed_position text,detailed_position_id text,position text,position_id text,source_updated_at timestamptz)
     where p.id=b.id and not(b.provider_player_id=any(v_approved)) and p.source_updated_at is distinct from b.source_updated_at;
     update public.football_squad_members m set
       competition_id=b.competition_id,status=b.status,jersey_number=b.jersey_number,
       provider_position=b.provider_position,provider_position_id=b.provider_position_id,
       detailed_position=b.detailed_position,detailed_position_id=b.detailed_position_id,
       position=b.position,position_id=b.position_id,source_updated_at=b.source_updated_at
     from jsonb_to_recordset(v_snapshot.baseline->'members') as b(id uuid,player_id uuid,competition_id uuid,
       status text,jersey_number integer,provider_position text,provider_position_id text,detailed_position text,
       detailed_position_id text,position text,position_id text,source_updated_at timestamptz)
     join public.football_players p on p.id=b.player_id
     where m.id=b.id and not(p.provider_player_id=any(v_approved)) and m.source_updated_at is distinct from b.source_updated_at;

     update public.touchline_roster_snapshots set revision=revision+1,status='applied' where id=v_snapshot.id;
     v_result:=jsonb_build_object('status','applied','requestId',v_id,'snapshotId',v_snapshot.id,'revision',v_snapshot.revision+1,'executor',v_receipt,
       'identities',(select jsonb_agg(jsonb_build_object('providerId',p.provider_player_id,'canonicalPlayerId',p.id)) from public.football_players p where p.provider='sportmonks' and p.provider_player_id=any(v_approved)));
   end if;
 else raise exception 'ROSTER_COMMAND_INVALID'; end if;
 insert into public.touchline_roster_receipts values(v_id,p_actor,v_hash,v_result,clock_timestamp());
 return v_result;
end $$;

alter table public.touchline_roster_policy enable row level security;
alter table public.touchline_roster_jobs enable row level security;
alter table public.touchline_roster_snapshots enable row level security;
alter table public.touchline_roster_decisions enable row level security;
alter table public.touchline_roster_receipts enable row level security;
revoke all on public.touchline_roster_policy,public.touchline_roster_jobs,public.touchline_roster_snapshots,public.touchline_roster_decisions,public.touchline_roster_receipts from public,anon,authenticated,service_role;
grant select on public.touchline_roster_policy,public.touchline_roster_jobs,public.touchline_roster_snapshots,public.touchline_roster_decisions,public.touchline_roster_receipts to service_role;
revoke all on function public.touchline_roster_immutable(),public.touchline_roster_baseline(text[]),public.touchline_roster_status(),public.touchline_roster_action(text,jsonb,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.touchline_roster_status(),public.touchline_roster_action(text,jsonb,text,jsonb) to service_role;
commit;
