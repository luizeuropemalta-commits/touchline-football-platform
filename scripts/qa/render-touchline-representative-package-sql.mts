#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  TOUCHLINE_QA_EXISTING_LIVERPOOL_CARDS,
  TOUCHLINE_QA_FIXTURE_VERSION,
  TOUCHLINE_QA_PROJECT_REF,
  assertTouchlineQaProjectRef,
} from "./build-touchline-representative-package.mts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;

type RepresentativePlan = {
  schemaVersion: "touchline-representative-qa-package-v1";
  target: { projectRef: string; environment: "qa" };
  fixture: { version: string; runId: string; sourceFingerprintSha256: string };
  source: { ownerApprovedPublicationFingerprintSha256: string };
  counts: {
    clubs: number;
    players: number;
    memberships: number;
    ownerApprovedCards: number;
    preservedLiverpoolCards: number;
    expectedPublishedCards: number;
  };
  competition: { id: string; provider: string; providerCompetitionId: string; sourceUpdatedAt: string };
  clubs: unknown[];
  players: unknown[];
  memberships: unknown[];
  publicationRows: unknown[];
  inventory: unknown[];
  packageFingerprintSha256: string;
  policy: { productionAllowed: false; existingLiverpoolBatchPreserved: true };
};

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function sqlText(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlJson(value: unknown) {
  return `${sqlText(JSON.stringify(value))}::jsonb`;
}

function assertPlan(plan: RepresentativePlan, actorId: string) {
  invariant(plan.schemaVersion === "touchline-representative-qa-package-v1", "TL_QA_SQL_PLAN_SCHEMA_INVALID");
  assertTouchlineQaProjectRef(plan.target.projectRef);
  invariant(plan.target.environment === "qa" && plan.policy.productionAllowed === false, "TL_QA_SQL_TARGET_INVALID");
  invariant(plan.fixture.version === TOUCHLINE_QA_FIXTURE_VERSION && UUID.test(plan.fixture.runId), "TL_QA_SQL_FIXTURE_INVALID");
  invariant(SHA256.test(plan.fixture.sourceFingerprintSha256), "TL_QA_SQL_SOURCE_FINGERPRINT_INVALID");
  invariant(SHA256.test(plan.packageFingerprintSha256), "TL_QA_SQL_PACKAGE_FINGERPRINT_INVALID");
  invariant(SHA256.test(plan.source.ownerApprovedPublicationFingerprintSha256), "TL_QA_SQL_PUBLICATION_FINGERPRINT_INVALID");
  invariant(UUID.test(actorId), "TL_QA_SQL_ACTOR_INVALID");
  invariant(plan.competition.provider === "sportmonks" && plan.competition.providerCompetitionId === "8", "TL_QA_SQL_COMPETITION_INVALID");
  invariant(plan.counts.clubs === 20 && plan.counts.players === 588 && plan.counts.memberships === 588, "TL_QA_SQL_IDENTITY_COUNTS_INVALID");
  invariant(plan.counts.ownerApprovedCards === 533, "TL_QA_SQL_PUBLICATION_COUNT_INVALID");
  invariant(plan.counts.preservedLiverpoolCards === TOUCHLINE_QA_EXISTING_LIVERPOOL_CARDS, "TL_QA_SQL_LIVERPOOL_COUNT_INVALID");
  invariant(plan.counts.expectedPublishedCards === 562, "TL_QA_SQL_CARD_COUNT_INVALID");
  invariant(plan.clubs.length === 20 && plan.players.length === 588 && plan.memberships.length === 588, "TL_QA_SQL_IDENTITY_PAYLOAD_INVALID");
  invariant(plan.publicationRows.length === 533 && plan.inventory.length === 533, "TL_QA_SQL_CARD_PAYLOAD_INVALID");
}

export function renderTouchlineRepresentativeQaApplySql(plan: RepresentativePlan, actorId: string) {
  assertPlan(plan, actorId);
  const projectRef = sqlText(TOUCHLINE_QA_PROJECT_REF);
  const runId = sqlText(plan.fixture.runId);
  const actor = sqlText(actorId);
  const fixtureVersion = sqlText(plan.fixture.version);
  const sourceFingerprint = sqlText(plan.fixture.sourceFingerprintSha256);
  const packageFingerprint = sqlText(plan.packageFingerprintSha256);
  const publicationFingerprint = sqlText(plan.source.ownerApprovedPublicationFingerprintSha256);

  return `-- Generated QA-only application. Never add generated output to supabase/migrations.
begin;
set local lock_timeout = '5s';
select public.touchline_assert_qa_fixture_target(${projectRef});
select pg_advisory_xact_lock(hashtext('touchline-representative-qa:' || ${runId}));

do $qa_preflight$
begin
  if not exists (select 1 from public.users where id = ${actor}::uuid) then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_ACTOR_MISSING';
  end if;
  if not exists (
    select 1 from public.football_competitions
    where id = ${sqlText(plan.competition.id)}::uuid
      and provider = 'sportmonks'
      and provider_competition_id = '8'
      and source_updated_at = ${sqlText(plan.competition.sourceUpdatedAt)}::timestamptz
  ) then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_COMPETITION_FENCE_FAILED';
  end if;
  if (select count(*) from public.touchline_card_inventory inventory
      join public.football_clubs club on club.id = inventory.club_id
      where club.provider = 'sportmonks' and club.provider_team_id = '8'
        and inventory.card_status = 'published' and inventory.sale_status = 'available') <> ${TOUCHLINE_QA_EXISTING_LIVERPOOL_CARDS} then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_LIVERPOOL_BASELINE_INVALID';
  end if;
end
$qa_preflight$;

create temp table tl_qa_clubs on commit drop as
select source.*, exists(select 1 from public.football_clubs current where current.id = source.id) as existed_before
from jsonb_to_recordset(${sqlJson(plan.clubs)}) as source(
  id uuid, provider text, "providerTeamId" text, "competitionId" uuid, name text, "sourceUpdatedAt" timestamptz
);
create temp table tl_qa_players on commit drop as
select source.*, exists(select 1 from public.football_players current where current.id = source.id) as existed_before
from jsonb_to_recordset(${sqlJson(plan.players)}) as source(
  id uuid, provider text, "providerPlayerId" text, "currentClubId" uuid, name text, "displayName" text,
  position text, "sourceUpdatedAt" timestamptz
);
create temp table tl_qa_memberships on commit drop as
select source.*, exists(select 1 from public.football_squad_members current where current.id = source.id) as existed_before
from jsonb_to_recordset(${sqlJson(plan.memberships)}) as source(
  id uuid, provider text, "clubId" uuid, "playerId" uuid, "competitionId" uuid,
  "jerseyNumber" integer, position text, status text, "sourceUpdatedAt" timestamptz
);
create temp table tl_qa_inventory on commit drop as
select source.*, exists(select 1 from public.touchline_card_inventory current where current.player_id = source."playerId") as existed_before
from jsonb_to_recordset(${sqlJson(plan.inventory)}) as source(
  id uuid, "playerId" uuid, "clubId" uuid, "playerName" text, "clubName" text, tier text,
  "frameUrl" text, "cardTemplateUrl" text, "marketValueEur" bigint,
  "priceTableVersion" text, "publishedAt" timestamptz
);

do $qa_identity_fence$
begin
  if (select count(*) from tl_qa_clubs) <> 20
     or (select count(*) from tl_qa_players) <> 588
     or (select count(*) from tl_qa_memberships) <> 588
     or (select count(*) from tl_qa_inventory) <> 533 then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_TEMP_COUNTS_INVALID';
  end if;
  if exists (
    select 1 from tl_qa_clubs expected
    join public.football_clubs current on current.id = expected.id
    where current.provider is distinct from expected.provider
       or current.provider_team_id is distinct from expected."providerTeamId"
       or current.competition_id is distinct from expected."competitionId"
       or current.name is distinct from expected.name
       or current.source_updated_at is distinct from expected."sourceUpdatedAt"
  ) or exists (
    select 1 from tl_qa_clubs expected
    join public.football_clubs current on current.provider = expected.provider and current.provider_team_id = expected."providerTeamId"
    where current.id <> expected.id
  ) then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_CLUB_CONFLICT';
  end if;
  if exists (
    select 1 from tl_qa_players expected
    join public.football_players current on current.id = expected.id
    where current.provider is distinct from expected.provider
       or current.provider_player_id is distinct from expected."providerPlayerId"
       or current.current_club_id is distinct from expected."currentClubId"
       or current.name is distinct from expected.name
       or current.display_name is distinct from expected."displayName"
       or current.source_updated_at is distinct from expected."sourceUpdatedAt"
  ) or exists (
    select 1 from tl_qa_players expected
    join public.football_players current on current.provider = expected.provider and current.provider_player_id = expected."providerPlayerId"
    where current.id <> expected.id
  ) then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_PLAYER_CONFLICT';
  end if;
  if exists (
    select 1 from tl_qa_memberships expected
    join public.football_squad_members current on current.id = expected.id
    where current.provider is distinct from expected.provider
       or current.club_id is distinct from expected."clubId"
       or current.player_id is distinct from expected."playerId"
       or current.competition_id is distinct from expected."competitionId"
       or current.status is distinct from expected.status
       or current.source_updated_at is distinct from expected."sourceUpdatedAt"
  ) then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_MEMBERSHIP_CONFLICT';
  end if;
  if exists (
    select 1 from tl_qa_inventory expected
    join public.touchline_card_inventory current on current.player_id = expected."playerId"
    where current.player_id is distinct from expected."playerId"
       or current.club_id is distinct from expected."clubId"
       or current.player_name is distinct from expected."playerName"
       or current.club_name is distinct from expected."clubName"
       or current.frame_color is distinct from expected.tier
       or current.frame_url is distinct from expected."frameUrl"
       or current.card_template_url is distinct from expected."cardTemplateUrl"
       or current.art_status <> 'ready'
       or current.card_status <> 'published'
       or current.sale_status <> 'available'
       or current.competition_tier is distinct from expected.tier
       or current.price_table_version is distinct from expected."priceTableVersion"
       or current.supply_limit <> 1000
       or current.market_value_eur is distinct from expected."marketValueEur"
       or current.market_value_source is distinct from 'manual_approval'
  ) or exists (
    select 1 from tl_qa_inventory expected
    join public.touchline_card_inventory current on current.id = expected.id
    where current.player_id is distinct from expected."playerId"
  ) then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_INVENTORY_CONFLICT';
  end if;
end
$qa_identity_fence$;

insert into public.touchline_qa_fixture_runs (
  id, project_ref, fixture_version, source_fingerprint_sha256, package_fingerprint_sha256,
  status, expected_counts
) values (
  ${runId}::uuid, ${projectRef}, ${fixtureVersion}, ${sourceFingerprint}, ${packageFingerprint},
  'planned', ${sqlJson(plan.counts)}
) on conflict (id) do nothing;

do $qa_run_fence$
declare current_run public.touchline_qa_fixture_runs%rowtype;
begin
  select * into current_run from public.touchline_qa_fixture_runs where id = ${runId}::uuid for update;
  if current_run.project_ref <> ${projectRef}
     or current_run.fixture_version <> ${fixtureVersion}
     or current_run.source_fingerprint_sha256 <> ${sourceFingerprint}
     or current_run.package_fingerprint_sha256 <> ${packageFingerprint}
     or current_run.status not in ('planned','applying','applied') then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_RUN_CONFLICT';
  end if;
end
$qa_run_fence$;
update public.touchline_qa_fixture_runs set status = 'applying' where id = ${runId}::uuid and status <> 'applied';

insert into public.football_clubs (id, provider, provider_team_id, competition_id, name, source_updated_at)
select id, provider, "providerTeamId", "competitionId", name, "sourceUpdatedAt"
from tl_qa_clubs where not existed_before;
insert into public.football_players (
  id, provider, provider_player_id, current_club_id, name, display_name, position, source_updated_at
)
select id, provider, "providerPlayerId", "currentClubId", name, "displayName", position, "sourceUpdatedAt"
from tl_qa_players where not existed_before;
insert into public.football_squad_members (
  id, provider, club_id, player_id, competition_id, jersey_number, position, status, source_updated_at
)
select id, provider, "clubId", "playerId", "competitionId", "jerseyNumber", position, status, "sourceUpdatedAt"
from tl_qa_memberships where not existed_before;

insert into public.touchline_qa_fixture_objects (run_id, object_kind, object_id, ownership)
select ${runId}::uuid, 'club', id, case when existed_before then 'preserved_canonical' else 'created_by_run' end
from tl_qa_clubs on conflict do nothing;
insert into public.touchline_qa_fixture_objects (run_id, object_kind, object_id, ownership)
select ${runId}::uuid, 'player', id, case when existed_before then 'preserved_canonical' else 'created_by_run' end
from tl_qa_players on conflict do nothing;
insert into public.touchline_qa_fixture_objects (run_id, object_kind, object_id, ownership)
select ${runId}::uuid, 'membership', id, case when existed_before then 'preserved_canonical' else 'created_by_run' end
from tl_qa_memberships on conflict do nothing;

do $qa_batch_fence$
begin
  if exists (
    select 1 from public.touchline_card_publication_batches
    where manifest_fingerprint_sha256 = ${publicationFingerprint}
      and manifest_payload is distinct from ${sqlJson(plan.publicationRows)}
  ) then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_PUBLICATION_BATCH_CONFLICT';
  end if;
end
$qa_batch_fence$;

select * from public.touchline_apply_owner_approved_533_card_publications(
  ${sqlJson(plan.publicationRows)}, ${publicationFingerprint}, ${actor}::uuid
)
where not exists (
  select 1 from public.touchline_card_publication_batches
  where manifest_fingerprint_sha256 = ${publicationFingerprint}
);
select * from public.touchline_publish_owner_approved_533_card_publications(${publicationFingerprint}, ${actor}::uuid);

insert into public.touchline_card_inventory (
  id, player_id, club_id, player_name, club_name, frame_color, frame_url, card_template_url,
  art_status, card_status, sale_status, published_at, metadata, created_by, updated_by,
  competition_tier, price_table_version, supply_limit, market_value_eur,
  market_value_updated_at, market_value_source
)
select expected.id, expected."playerId", expected."clubId", expected."playerName", expected."clubName",
  expected.tier, expected."frameUrl", expected."cardTemplateUrl", 'ready', 'published', 'available',
  expected."publishedAt",
  jsonb_build_object('touchline_qa_fixture_version', ${fixtureVersion}, 'qa_fixture_run_id', ${runId}),
  ${actor}::uuid, ${actor}::uuid, expected.tier, expected."priceTableVersion", 1000,
  expected."marketValueEur", expected."publishedAt", 'manual_approval'
from tl_qa_inventory expected where not expected.existed_before;

insert into public.touchline_qa_fixture_objects (run_id, object_kind, object_id, ownership, metadata)
select ${runId}::uuid, 'inventory', current.id,
  case when expected.existed_before then 'preserved_canonical' else 'created_by_run' end,
  jsonb_build_object('player_id', expected."playerId")
from tl_qa_inventory expected
join public.touchline_card_inventory current on current.player_id = expected."playerId"
on conflict do nothing;
insert into public.touchline_qa_fixture_objects (run_id, object_kind, object_id, ownership, metadata)
select ${runId}::uuid, 'publication_batch', batch.id, 'created_by_run',
  jsonb_build_object('manifest_fingerprint_sha256', ${publicationFingerprint})
from public.touchline_card_publication_batches batch
where batch.manifest_fingerprint_sha256 = ${publicationFingerprint}
on conflict do nothing;

do $qa_final_fence$
declare
  observed jsonb;
begin
  if (select count(*) from tl_qa_clubs expected join public.football_clubs current on current.id = expected.id) <> 20
     or (select count(*) from tl_qa_players expected join public.football_players current on current.id = expected.id) <> 588
     or (select count(*) from tl_qa_memberships expected join public.football_squad_members current on current.id = expected.id and current.status = 'active') <> 588
     or (select count(*) from tl_qa_inventory expected join public.touchline_card_inventory current on current.player_id = expected."playerId" and current.card_status = 'published') <> 533
     or (select count(*) from public.touchline_card_publications where publication_status = 'published') <> 562
     or (select count(*) from public.touchline_card_inventory where card_status = 'published' and sale_status = 'available') <> 562
     or (select count(distinct competition_tier) from public.touchline_card_inventory where card_status = 'published') <> 7 then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_FINAL_COUNTS_INVALID';
  end if;
  observed := jsonb_build_object(
    'clubs', 20, 'players', 588, 'memberships', 588,
    'ownerApprovedCards', 533, 'preservedLiverpoolCards', ${TOUCHLINE_QA_EXISTING_LIVERPOOL_CARDS},
    'publishedCards', 562, 'inventoryCards', 562, 'tiers', 7
  );
  update public.touchline_qa_fixture_runs
  set status = 'applied', observed_counts = observed, applied_at = coalesce(applied_at, clock_timestamp())
  where id = ${runId}::uuid;
end
$qa_final_fence$;
commit;
`;
}

export function renderTouchlineRepresentativeQaRollbackSql(plan: RepresentativePlan, actorId: string) {
  assertPlan(plan, actorId);
  const projectRef = sqlText(TOUCHLINE_QA_PROJECT_REF);
  const runId = sqlText(plan.fixture.runId);
  const actor = sqlText(actorId);
  const publicationFingerprint = sqlText(plan.source.ownerApprovedPublicationFingerprintSha256);
  return `-- Generated QA-only rollback. Canonical identities are retained because immutable audit history references them.
begin;
set local lock_timeout = '5s';
select public.touchline_assert_qa_fixture_target(${projectRef});
select pg_advisory_xact_lock(hashtext('touchline-representative-qa:' || ${runId}));
do $qa_rollback_fence$
begin
  if not exists (select 1 from public.users where id = ${actor}::uuid) then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_ACTOR_MISSING';
  end if;
  if not exists (
    select 1 from public.touchline_qa_fixture_runs
    where id = ${runId}::uuid and project_ref = ${projectRef}
      and package_fingerprint_sha256 = ${sqlText(plan.packageFingerprintSha256)}
      and status in ('applied','rolled_back')
  ) then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_ROLLBACK_RUN_INVALID';
  end if;
  if exists (
    select 1 from public.touchline_card_contracts contract
    join public.touchline_qa_fixture_objects object on object.object_id = contract.card_id
    where object.run_id = ${runId}::uuid and object.object_kind = 'inventory' and object.ownership = 'created_by_run'
  ) or exists (
    select 1 from public.touchline_market_order_items item
    join public.touchline_qa_fixture_objects object on object.object_id = item.card_id
    where object.run_id = ${runId}::uuid and object.object_kind = 'inventory' and object.ownership = 'created_by_run'
  ) then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_ROLLBACK_DEPENDENCIES_EXIST';
  end if;
end
$qa_rollback_fence$;
update public.touchline_qa_fixture_runs set status = 'rolling_back'
where id = ${runId}::uuid and status = 'applied';
delete from public.touchline_card_inventory inventory
using public.touchline_qa_fixture_objects object
where object.run_id = ${runId}::uuid and object.object_kind = 'inventory'
  and object.ownership = 'created_by_run' and inventory.id = object.object_id;
select * from public.touchline_revert_owner_approved_533_card_publications(${publicationFingerprint}, ${actor}::uuid);
update public.touchline_qa_fixture_runs
set status = 'rolled_back', rolled_back_at = coalesce(rolled_back_at, clock_timestamp())
where id = ${runId}::uuid;
commit;
`;
}

function parseArgs(args: readonly string[]) {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    invariant(key?.startsWith("--") && value && !value.startsWith("--"), "TL_QA_SQL_ARGUMENT_INVALID");
    parsed[key.slice(2)] = value;
  }
  invariant(["apply", "rollback"].includes(parsed.action), "TL_QA_SQL_ACTION_INVALID");
  for (const key of ["plan", "actor-id", "write-new"]) invariant(parsed[key], `TL_QA_SQL_ARGUMENT_REQUIRED:${key}`);
  return parsed as { action: "apply" | "rollback"; plan: string; "actor-id": string; "write-new": string };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = JSON.parse(await readFile(resolve(args.plan), "utf8")) as RepresentativePlan;
  const sql = args.action === "apply"
    ? renderTouchlineRepresentativeQaApplySql(plan, args["actor-id"])
    : renderTouchlineRepresentativeQaRollbackSql(plan, args["actor-id"]);
  await writeFile(resolve(args["write-new"]), sql, { encoding: "utf8", flag: "wx", mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ action: args.action, target: plan.target, runId: plan.fixture.runId, bytes: Buffer.byteLength(sql) })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "TL_QA_SQL_UNKNOWN_ERROR"}\n`);
    process.exitCode = 1;
  });
}
