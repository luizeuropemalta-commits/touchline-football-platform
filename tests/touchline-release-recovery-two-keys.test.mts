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

test("two successful keys on one owner season epoch retain their closure under reversed responses",async()=>{
  const db=await clubRoundDatabase();
  const id=(n:number)=>`99000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
  try {
    await db.exec(readFileSync(new URL("../supabase/migrations/20261018051627_club_collection_atomic_release.sql",import.meta.url),"utf8"));
    await db.exec(`insert into users values('${id(1)}'),('${id(2)}');insert into football_seasons values('${id(3)}'),('${id(4)}');`);
    const refs=[5,6].map(revision=>({schemaVersion:1,createdAt:1,expectedAccountId:id(1),expectedSeasonId:id(3),action:'release',playerId:id(revision+10),expectedRevision:revision-1,idempotencyKey:'distinct_release_'+revision}));
    await db.query('insert into touchline_club_collections(user_id,season_id,revision,state) values($1,$2,7,$3::jsonb)',[id(1),id(3),JSON.stringify({seasonId:id(3),revision:7,plan:'vip',coach:{id:'fixture',tier:'sapphire-blue',valueEur:10_000_000},balanceEur:103,players:[],receipts:[]})]);
    for(const ref of refs) {
      const command={action:ref.action,playerId:ref.playerId,expectedRevision:ref.expectedRevision,idempotencyKey:ref.idempotencyKey};
      const revision=ref.expectedRevision+1,paid=revision*100;
      await db.query('insert into touchline_club_collection_operations(user_id,season_id,idempotency_key,command,revision) values($1,$2,$3,$4::jsonb,$5)',[id(1),id(3),ref.idempotencyKey,JSON.stringify(command),revision]);
      await db.query("insert into touchline_club_release_receipts(user_id,season_id,idempotency_key,player_id,paid_credits,fee_credits,refund_credits,contract,revision) values($1,$2,$3,$4,$5,$6,$7,'{}',$8)",[id(1),id(3),ref.idempotencyKey,ref.playerId,paid,paid/10,paid*9/10,revision]);
    }
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
    const completions:string[]=[];
    const jobs=refs.map(ref=>helper.readClubReleaseRecovery(repository,id(1),ref,9,true).then(value=>{
      completions.push(ref.idempotencyKey);return {reference:ref,value};
    }));
    for(let spins=0;pending.length<2&&spins<1000;spins++)await new Promise<void>(resolve=>setImmediate(resolve));
    assert.equal(pending.length,2);hold=false;
    pending[1]();const second=await jobs[1];pending[0]();const first=await jobs[0];
    assert.deepEqual(completions,[refs[1].idempotencyKey,refs[0].idempotencyKey]);
    for(const item of [second,first]) {
      const value=item.value;assert.ok(value.resolved);
      assert.equal(value.operationRevision,item.reference.expectedRevision+1);
      assert.equal(value.context.epoch,9);assert.equal(value.context.expectedAccountId,id(1));assert.equal(value.context.expectedSeasonId,id(3));
      assert.equal(value.snapshot?.revision,7);assert.equal(value.snapshot?.balanceEur,103);
      assert.equal(recovery.selectClubReleaseRecoverySnapshot(null,value,value.context),value.snapshot);
    }
    assert.equal(first.reference,refs[0]);assert.equal(second.reference,refs[1]);
    const wrong=await helper.readClubReleaseRecovery(repository,id(1),{...refs[0],idempotencyKey:refs[1].idempotencyKey},9);
    assert.equal(wrong.status,'conflict','keyB cannot confirm player/revision from referenceA');
    assert.ok(queries.every(q=>q.startsWith('select ')));
  } finally {await db.close();}
});
