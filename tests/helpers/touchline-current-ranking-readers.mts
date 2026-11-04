import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import * as current from "../../lib/touchlineArena/current-player-ranking.ts";
import * as editorial from "../../lib/touchlineArena/editorial-card-profile.ts";
import * as provisional from "../../lib/touchlineArena/card-engine-provisional-policy.ts";
import * as compatibility from "../../lib/touchlineArena/card-engine-provisional-schema-compat.ts";
import * as seasons from "../../lib/touchlineArena/editorial-season.ts";
import * as cacheCore from "../../lib/touchlineArena/current-ranking-cache.ts";
import * as coach from "../../lib/touchlineArena/current-coach-ranking.ts";
import type { readTouchlineCurrentLeagueScope, readTouchlineCurrentPlayerRanking } from "../../lib/touchlineArena/current-player-eligibility-server";
import type { readTouchlineCurrentCoachRanking } from "../../lib/touchlineArena/current-coach-ranking-server";
function moduleAt(name:string, imports:Record<string,unknown>, environment:Record<string,string|undefined> = {}) {
  const source=readFileSync(new URL(`../../lib/touchlineArena/${name}.ts`,import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:Record<string,unknown>={};
  vm.runInThisContext(`(function(exports,require,process){${code}\n})`)(exports,(key:string)=>{assert.ok(Object.hasOwn(imports,key),`Unexpected import ${key}`);return imports[key];},{env:environment});
  return exports;
}
const publication=moduleAt('card-publication-read-model',{'server-only':{},'next/cache':{unstable_noStore(){}},'@/lib/supabase/admin':{createAdminClient(){throw Error('Unexpected admin');}},
  './editorial-card-profile.ts':editorial,'./card-engine-provisional-policy.ts':provisional,'./card-engine-provisional-schema-compat.ts':compatibility,'./editorial-season.ts':seasons});
export const reader=moduleAt('current-player-eligibility-server',{'server-only':{},'node:crypto':{createHash},'./editorial-season':seasons,
  './card-publication-read-model':publication,'./current-player-ranking':current}) as {readTouchlineCurrentLeagueScope:typeof readTouchlineCurrentLeagueScope;readTouchlineCurrentPlayerRanking:typeof readTouchlineCurrentPlayerRanking};
export const coachReader = moduleAt('current-coach-ranking-server', {'server-only':{},'./current-coach-ranking.ts':coach}) as {readTouchlineCurrentCoachRanking:typeof readTouchlineCurrentCoachRanking};

export function createCachedRankingReader(options: {
  environment?: Record<string,string|undefined>;
  unstableCache?: (fresh:()=>Promise<unknown>,keys:string[],options:{revalidate:number})=>()=>Promise<unknown>;
} = {}) {
  const values = new Map<string,unknown>();
  const unstable_cache = options.unstableCache ?? ((fresh:()=>Promise<unknown>,keys:string[]) => async()=> {
    const key=keys.join(':');
    if (values.has(key)) return values.get(key);
    const value=await fresh();values.set(key,value);return value;
  });
  return moduleAt('current-ranking-cache-server', {'server-only':{},'node:crypto':{createHash},'next/cache':{unstable_cache},
    './current-player-ranking':current,'./current-coach-ranking':coach,'./current-player-eligibility-server':reader,
    './current-coach-ranking-server':coachReader,'./current-ranking-cache':cacheCore},
    options.environment ?? {NODE_ENV:'test',SUPABASE_URL:'https://synthetic-current.supabase.co',TOUCHLINE_COACH_CATALOGUE_ENABLED:'true'}) as {
      readSharedTouchlineCurrentRankings:typeof import('../../lib/touchlineArena/current-ranking-cache-server').readSharedTouchlineCurrentRankings;
      touchlineCurrentRankingCacheKey:typeof import('../../lib/touchlineArena/current-ranking-cache-server').touchlineCurrentRankingCacheKey;
    };
}
