import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("development read timing is a single safe serialized string and production stays silent",async()=>{
  for(const mode of ["development","production"]) {
    const logs:unknown[][]=[];
    const modules:Record<string,unknown>={
      "next/server":{NextResponse:{json:(body:unknown,init:ResponseInit)=>Response.json(body,init)}},
      "@/lib/supabase/server":{createClient:async()=>({auth:{getUser:async()=>({error:null,data:{user:{id:"private-owner"}}})}})},
      "@/lib/touchlineFantasy/club-collection-read-server":{readClubCollectionServer:async(_owner:string,mark:(phase:string)=>void)=>{
        mark("season");mark("collection");mark("budget");
        return {status:"confirmed",accountId:"private-owner",seasonId:"private-season",state:{balanceEur:682_500_000},initialBudget:null,releaseAvailable:false};
      }},
    };
    const exports:{GET?:()=>Promise<Response>}={};
    const source=ts.transpileModule(readFileSync(new URL("../lib/touchlineFantasy/club-collection-read-handler.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(source,{exports,performance,process:{env:{NODE_ENV:mode}},console:{info:(...args:unknown[])=>logs.push(args)},require:(name:string)=>{assert.ok(name in modules);return modules[name];}});
    const response=await exports.GET!();assert.equal(response.status,200);
    if(mode==="production"){assert.equal(logs.length,0);assert.equal(response.headers.get("Server-Timing"),null);continue;}
    assert.equal(logs.length,1);assert.equal(logs[0].length,1);
    const message=String(logs[0][0]);assert.doesNotMatch(message,/private-owner|private-season|682500000|balanceEur/);
    const detail=JSON.parse(message.slice(message.indexOf("{")));
    assert.deepEqual(Object.keys(detail).sort(),["releaseAvailable","status","timing"]);assert.equal(detail.status,200);
    assert.equal(detail.releaseAvailable,false);
    for(const phase of ["auth","season","collection","budget","total"])assert.match(detail.timing,new RegExp(`${phase};dur=\\d+`));
    assert.equal(response.headers.get("Server-Timing"),detail.timing);
  }
});
