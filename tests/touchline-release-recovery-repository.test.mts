import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { clubRoundDatabase } from "./helpers/club-round-database.mts";
import type { createClubReleaseRecoveryReadRepository, ReleaseRecoverySelectClient } from "../lib/touchlineFantasy/club-release-recovery-repository.ts";
const exports={} as {createClubReleaseRecoveryReadRepository:typeof createClubReleaseRecoveryReadRepository};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineFantasy/club-release-recovery-repository.ts",import.meta.url),"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
{exports,Error,require:(name:string)=>{assert.equal(name,"server-only");return {};}});

test("SELECT adapter isolates same key across two owners and seasons using actual SQL results",async()=>{
  const db=await clubRoundDatabase();
  const id=(n:number)=>`99000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
  try {
    await db.exec(readFileSync(new URL("../supabase/migrations/20261018051627_club_collection_atomic_release.sql",import.meta.url),"utf8"));
    await db.exec(`insert into users values('${id(1)}'),('${id(2)}');insert into football_seasons values('${id(3)}'),('${id(4)}');`);
    const key="shared_recovery_key";
    for(const owner of [1,2])for(const season of [3,4]) {
      const stamp=owner*10+season,playerId=id(stamp);
      await db.query("insert into touchline_club_collections(user_id,season_id,revision,state) values($1,$2,5,$3::jsonb)",
        [id(owner),id(season),JSON.stringify({seasonId:id(season),revision:5,plan:"vip",
          coach:{id:"fixture",tier:"sapphire-blue",valueEur:10_000_000},balanceEur:stamp,players:[],receipts:[]})]);
      await db.query("insert into touchline_club_collection_operations(user_id,season_id,idempotency_key,command,revision) values($1,$2,$3,$4::jsonb,5)",
        [id(owner),id(season),key,JSON.stringify({action:"release",playerId,expectedRevision:4,idempotencyKey:key})]);
      const paid=stamp*100;
      await db.query("insert into touchline_club_release_receipts(user_id,season_id,idempotency_key,player_id,paid_credits,fee_credits,refund_credits,contract,revision) values($1,$2,$3,$4,$5,$6,$7,'{}',5)",
        [id(owner),id(season),key,playerId,paid,paid/10,paid*9/10]);
    }
    await db.exec("set role service_role");
    // Bridge translates the adapter's actual selected columns/filter chain to SQL.
    // It does not inject owner/key filters itself. Not a real PostgREST transport.
    const queries:string[]=[];
    const tables=new Set(["touchline_club_collections","touchline_club_collection_operations","touchline_club_release_receipts"]);
    const columns=new Set(["state","command","revision","idempotency_key","player_id","paid_credits","fee_credits","refund_credits"]);
    const client:ReleaseRecoverySelectClient={from(table) {
      assert.ok(tables.has(table));
      return {select(projection) {
        assert.ok(projection.split(",").every(c=>columns.has(c)));
        const filters:Array<[string,string]>=[];
        const query={
          eq(column:string,value:string){assert.ok(["user_id","season_id","idempotency_key"].includes(column));filters.push([column,value]);return query;},
          async maybeSingle(){
            const sql=`select ${projection} from ${table} where ${filters.map(([column],i)=>`${column}=$${i+1}`).join(" and ")}`;
            queries.push(sql);
            const rows=(await db.query<Record<string,unknown>>(sql,filters.map(([,v])=>v))).rows;
            return rows.length>1?{data:null,error:new Error("multiple rows")}:{data:rows[0]??null,error:null};
          },
        };return query;
      }};
    }};
    const repository=exports.createClubReleaseRecoveryReadRepository(client);
    for(const owner of [1,2])for(const season of [3,4]) {
      const scope={ownerId:id(owner),seasonId:id(season),idempotencyKey:key},stamp=owner*10+season;
      const operation=await repository.operation(scope);
      assert.deepEqual(operation?.command,{action:"release",playerId:id(stamp),expectedRevision:4,idempotencyKey:key});
      const receipt=await repository.receipt(scope) as Record<string,unknown>;
      assert.equal(receipt.player_id,id(stamp));assert.equal(Number(receipt.paid_credits),stamp*100);
      assert.equal(Object.hasOwn(receipt,"contract"),false);assert.equal(Object.hasOwn(receipt,"user_id"),false);
      const snapshot=await repository.snapshot!(scope) as Record<string,unknown>;
      assert.equal(snapshot.balanceEur,stamp);assert.equal(snapshot.seasonId,id(season));assert.equal(snapshot.revision,5);
    }
    for(const scope of [
      {ownerId:id(9),seasonId:id(3),idempotencyKey:key},
      {ownerId:id(1),seasonId:id(9),idempotencyKey:key},
      {ownerId:id(1),seasonId:id(3),idempotencyKey:"missing_key"},
    ]) {
      assert.equal(await repository.operation(scope),null);assert.equal(await repository.receipt(scope),null);assert.equal(await repository.snapshot!(scope),null);
    }
    assert.ok(queries.every(q=>q.startsWith("select ")));
    const failing=exports.createClubReleaseRecoveryReadRepository({from:()=>({select:()=>({
      eq(){return this;},async maybeSingle(){return {data:null,error:new Error("private database detail")};},
    })})});
    await assert.rejects(failing.operation({ownerId:id(1),seasonId:id(3),idempotencyKey:key}),/^Error: RECOVERY_READ_UNAVAILABLE$/);
  } finally {await db.close();}
});
