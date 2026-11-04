import assert from 'node:assert/strict';
import test from 'node:test';
import { createTouchlineCurrentRankingCache, type CurrentRankingCacheEntry } from '../lib/touchlineArena/current-ranking-cache.ts';
import { createCachedRankingReader } from './helpers/touchline-current-ranking-readers.mts';
import { TOUCHLINE_PRESEASON_RANKING_STATE } from '../lib/touchlineArena/card-ranking-live.ts';
import { legacyCoachCatalogue } from '../lib/touchlineArena/coach-catalogue-contract.ts';

const key = 'a'.repeat(64), otherKey = 'b'.repeat(64);
const valid = (value:unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const entry = (value:number,completedAt=100,keyValue=key):CurrentRankingCacheEntry<number> => ({version:1,key:keyValue,completedAt,expiresAt:completedAt+5000,value});
function deferred<T>() { let resolve!:(value:T)=>void;let reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; }

test('concurrent same-key readers join one canonical read; distinct keys never share results',async()=>{
  const gate=deferred<number>(),started=deferred<void>();let calls=0;const values=new Map<string,unknown>();
  const cache=createTouchlineCurrentRankingCache<number>({now:()=>100,readCached:async(key,fresh)=>{
    if(values.has(key))return values.get(key);const result=await fresh();values.set(key,result);return result;
  }});
  const reads=Array.from({length:50},()=>cache.load(key,async()=>{calls++;started.resolve();return gate.promise;},valid));
  await started.promise;assert.equal(calls,1);gate.resolve(7);
  assert.deepEqual(await Promise.all(reads),Array(50).fill(7));assert.equal(calls,1);
  assert.equal(await cache.load(key,async()=>{throw Error('cached hit must not read');},valid),7);
  assert.equal(await cache.load(otherKey,async()=>{calls++;return 9;},valid),9);assert.equal(calls,2);
});

test('expired SWR value is never returned; background and foreground share exactly one fresh promise',async()=>{
  let clock=5100,calls=0;const gate=deferred<number>(),started=deferred<void>();let background:Promise<unknown>|null=null;
  const cache=createTouchlineCurrentRankingCache<number>({now:()=>clock,readCached:async(_key,fresh)=>{
    background=fresh();return entry(1);
  }});
  let settled=false;const reading=cache.load(key,async()=>{calls++;started.resolve();return gate.promise;},valid).then(v=>{settled=true;return v;});
  await started.promise;assert.equal(settled,false);assert.equal(calls,1);
  clock=5200;gate.resolve(2);assert.equal(await reading,2);await background;assert.equal(calls,1);
});

for(const [label,mutate] of Object.entries({
  'wrong key':(value:Record<string,unknown>)=>{value.key=otherKey;},
  'forged extension':(value:Record<string,unknown>)=>{value.expiresAt=999999;},
  'future timestamp':(value:Record<string,unknown>)=>{value.completedAt=101;value.expiresAt=5101;},
  'invalid value':(value:Record<string,unknown>)=>{value.value='untrusted';},
  'wrong version':(value:Record<string,unknown>)=>{value.version=2;},
})) test(`cache rejects ${label} and awaits fresh data`,async()=>{
  const cached={...entry(1)};mutate(cached);let calls=0;
  const cache=createTouchlineCurrentRankingCache<number>({now:()=>100,readCached:async()=>cached});
  assert.equal(await cache.load(key,async()=>{calls++;return 2;},valid),2);assert.equal(calls,1);
});

test('cache backend failure can use one successful fresh read, but canonical failure never returns last-good or retries',async()=>{
  let calls=0;const cache=createTouchlineCurrentRankingCache<number>({now:()=>100,readCached:async()=>{throw Error('cache unavailable');}});
  assert.equal(await cache.load(key,async()=>{calls++;return 2;},valid),2);assert.equal(calls,1);
  const canonical=createTouchlineCurrentRankingCache<number>({now:()=>100,readCached:async(_key,fresh)=>fresh()});
  await assert.rejects(canonical.load(key,async()=>{calls++;throw Error('canonical unavailable');},valid),/canonical unavailable/);
  assert.equal(calls,2,'failed canonical read is not automatically retried by cache fallback');
  const stale=createTouchlineCurrentRankingCache<number>({now:()=>6000,readCached:async()=>entry(1)});
  await assert.rejects(stale.load(key,async()=>{throw Error('withdraw');},valid),/withdraw/);
});

test('a deferred background callback retains singleflight with a later caller and does not leak another key',async()=>{
  let late:(()=>Promise<CurrentRankingCacheEntry<number>>)|null=null,calls=0,reads=0;
  const gate=deferred<number>();
  const cache=createTouchlineCurrentRankingCache<number>({now:()=>100,readCached:async(_key,fresh)=>{
    if(++reads===1){late=fresh;return entry(1);}return fresh();
  }});
  assert.equal(await cache.load(key,async()=>{calls++;return gate.promise;},valid),1);
  assert.ok(late);const pending=(late as ()=>Promise<CurrentRankingCacheEntry<number>>)();
  const second=cache.load(key,async()=>{calls++;return gate.promise;},valid);
  await Promise.resolve();await Promise.resolve();gate.resolve(3);
  assert.equal((await pending).value,3);assert.equal(await second,3);assert.equal(calls,1);
});

test('cache key isolates deployment/project/season/raw publications/catalogue/gates without credentials',()=>{
  const {touchlineCurrentRankingCacheKey:makeKey}=createCachedRankingReader();
  const scope={competitionId:'10000000-0000-4000-8000-000000000001',seasonId:'10000000-0000-4000-8000-000000000002',providerSeasonId:'70001',effectiveSeason:'2026-27'};
  const input={environment:{NODE_ENV:'test',VERCEL_ENV:'preview',SUPABASE_URL:'https://synthetic-qa.supabase.co',TOUCHLINE_COACH_CATALOGUE_ENABLED:'true'},scope,player:null,coach:null,catalogue:legacyCoachCatalogue()};
  const base=makeKey(input);assert.match(base!,/^[0-9a-f]{64}$/);
  for(const changed of [
    {...input,environment:{...input.environment,VERCEL_ENV:'production'}},
    {...input,environment:{...input.environment,SUPABASE_URL:'https://synthetic-prod.supabase.co'}},
    {...input,environment:{...input.environment,TOUCHLINE_COACH_CATALOGUE_ENABLED:'false'}},
    {...input,scope:{...scope,seasonId:'10000000-0000-4000-8000-000000000003',effectiveSeason:'2027-28'}},
    {...input,catalogue:{...input.catalogue,revision:8}},
    {...input,player:{...TOUCHLINE_PRESEASON_RANKING_STATE,snapshotId:'different-raw-player'}},
    {...input,coach:{phase:'unavailable' as const,snapshotId:'different-raw-coach',seasonId:null,scoringVersion:null,fixtureIds:[],generatedAt:null,rows:[]}},
  ])assert.notEqual(makeKey(changed),base);
  assert.equal(makeKey({...input,environment:{...input.environment,SUPABASE_SERVICE_ROLE_KEY:'secret-not-in-key'}}),base);
  assert.equal(makeKey({...input,environment:{...input.environment,SUPABASE_URL:'https://user:secret@synthetic-qa.supabase.co'}}),null);
  assert.equal(makeKey({...input,environment:{NODE_ENV:'test'}}),null);
});
