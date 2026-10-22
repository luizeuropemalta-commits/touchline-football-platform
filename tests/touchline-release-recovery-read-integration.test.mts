import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { clubRoundDatabase } from "./helpers/club-round-database.mts";
import type { createClubReleaseRecoveryReadRepository, ReleaseRecoverySelectClient } from "../lib/touchlineFantasy/club-release-recovery-repository.ts";
import * as recovery from '../lib/touchlineFantasy/club-release-recovery.ts';
import * as release from '../lib/touchlineFantasy/club-release.ts';
import type {readClubReleaseRecovery} from '../lib/touchlineFantasy/club-release-recovery-server.ts';
const helper={} as {readClubReleaseRecovery:typeof readClubReleaseRecovery};
runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/touchlineFantasy/club-release-recovery-server.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:helper,require:(name:string)=>{if(name==='server-only')return {};if(name==='./club-release-recovery.ts')return recovery;if(name==='./club-release.ts')return release;throw Error(name);}});
const exports={} as {createClubReleaseRecoveryReadRepository:typeof createClubReleaseRecoveryReadRepository};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineFantasy/club-release-recovery-repository.ts",import.meta.url),"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
{exports,Error,require:(name:string)=>{assert.equal(name,"server-only");return {};}});

test("real read helper and repository keep reverse-delivered SQL results scoped to each reference",async()=>{
  const db=await clubRoundDatabase();
  const id=(n:number)=>`99000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
  try {
    await db.exec(readFileSync(new URL("../supabase/migrations/20261018051627_club_collection_atomic_release.sql",import.meta.url),"utf8"));
    await db.exec(`insert into users values('${id(1)}'),('${id(2)}');insert into football_seasons values('${id(3)}'),('${id(4)}');`);
    const key="shared_recovery_key";
    for(const owner of [1,2])for(const season of [3,4]) {
      const stamp=owner*10+season,playerId=id(stamp);
      await db.query("insert into touchline_club_collections(user_id,season_id,revision,state) values($1,$2,7,$3::jsonb)",
        [id(owner),id(season),JSON.stringify({seasonId:id(season),revision:7,plan:"vip",
          coach:{id:"fixture",tier:"sapphire-blue",valueEur:10_000_000},balanceEur:stamp,players:[],receipts:[]})]);
      await db.query("insert into touchline_club_collection_operations(user_id,season_id,idempotency_key,command,revision) values($1,$2,$3,$4::jsonb,5)",
        [id(owner),id(season),key,JSON.stringify({action:"release",playerId,expectedRevision:4,idempotencyKey:key})]);
      const paid=stamp*100;
      await db.query("insert into touchline_club_release_receipts(user_id,season_id,idempotency_key,player_id,paid_credits,fee_credits,refund_credits,contract,revision) values($1,$2,$3,$4,$5,$6,$7,'{}',5)",
        [id(owner),id(season),key,playerId,paid,paid/10,paid*9/10]);
    }
    const reference=(owner:number,season:number,k=key)=>({schemaVersion:1,createdAt:1,expectedAccountId:id(owner),expectedSeasonId:id(season),action:'release',playerId:id(owner*10+season),expectedRevision:4,idempotencyKey:k});
    const missingReceipt=reference(1,3,'receipt_missing_key');
    const {schemaVersion,createdAt,expectedAccountId,expectedSeasonId,...missingCommand}=missingReceipt;
    void schemaVersion;void createdAt;
    await db.query('insert into touchline_club_collection_operations(user_id,season_id,idempotency_key,command,revision) values($1,$2,$3,$4::jsonb,5)',[expectedAccountId,expectedSeasonId,missingCommand.idempotencyKey,JSON.stringify(missingCommand)]);
    await db.exec("set role service_role");
    // Bridge translates the adapter's actual selected columns/filter chain to SQL.
    // It does not inject owner/key filters itself. Not a real PostgREST transport.
    const queries:string[]=[];
    let hold=true;const pending:Array<()=>void>=[];
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
            if(hold && table==='touchline_club_collection_operations' && projection==='command,revision') await new Promise<void>(resolve=>pending.push(resolve));
            return rows.length>1?{data:null,error:new Error("multiple rows")}:{data:rows[0]??null,error:null};
          },
        };return query;
      }};
    }};
    const repository=exports.createClubReleaseRecoveryReadRepository(client);
    const refs=[reference(1,3),reference(1,4),reference(2,3),reference(2,4)];
    const completions:number[]=[];
    const jobs=refs.map((ref,i)=>helper.readClubReleaseRecovery(repository,ref.expectedAccountId,ref,i,true).then(value=>{completions.push(i);return value;}));
    for(let spins=0;pending.length<4&&spins<1000;spins++)await new Promise<void>(resolve=>setImmediate(resolve));
    assert.equal(pending.length,4);hold=false;
    // Deliver one SQL result at a time, in exact reverse order; await its full chain.
    for(let i=3;i>=0;i--){pending[i]();await jobs[i];}
    assert.deepEqual(completions,[3,2,1,0]);
    const results=await Promise.all(jobs);
    for(let i=0;i<results.length;i++) {
      const value=results[i];assert.ok(value.resolved);assert.equal(value.operationRevision,5);
      assert.equal(value.context.expectedAccountId,refs[i].expectedAccountId);assert.equal(value.context.expectedSeasonId,refs[i].expectedSeasonId);assert.equal(value.context.epoch,i);
      assert.equal(value.snapshot?.revision,7);assert.equal(value.snapshot?.seasonId,refs[i].expectedSeasonId);
      assert.equal(value.snapshot?.balanceEur,[13,14,23,24][i]);
      assert.equal(recovery.selectClubReleaseRecoverySnapshot(null,value,{...value.context,epoch:i+1}),null);
      assert.equal(recovery.selectClubReleaseRecoverySnapshot(null,value,{...value.context,expectedAccountId:id(9)}),null);
      assert.equal(recovery.selectClubReleaseRecoverySnapshot(null,value,value.context),value.snapshot);
    }
    assert.equal((await helper.readClubReleaseRecovery(repository,id(1),reference(1,3,'never_seen_key'),0)).status,'not_observed');
    assert.equal((await helper.readClubReleaseRecovery(repository,id(1),missingReceipt,0)).status,'unavailable','a different existing receipt must not substitute missing-key receipt');
    assert.equal((await helper.readClubReleaseRecovery(repository,id(1),{...refs[0],playerId:id(99)},0)).status,'conflict');
    const count=queries.length;assert.equal((await helper.readClubReleaseRecovery(repository,id(2),refs[0],0)).status,'context_changed');assert.equal(queries.length,count);
    assert.ok(queries.every(q=>q.startsWith('select ')));
  } finally {await db.close();}
});
