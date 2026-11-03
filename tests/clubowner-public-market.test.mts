import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePublicMarket, projectPublicMarket, publicMarketContext, type PublicMarketDependencies } from '../lib/touchlineArena/clubowner-public-market-handler.ts';
import { parsePublicMarket, parsePublicMarketCommand } from '../lib/touchlineArena/clubowner-public-market-contract.ts';
import type { ExchangeDiscovery } from '../lib/touchlineFantasy/exchange-discovery.ts';
const id = (n: number) => `${n.toString().padStart(8,'0')}-1111-4111-8111-111111111111`;
const actor = id(1), target = id(2), other = id(3), publicId = id(4), season = id(5), out = id(6), incoming = id(7), proposal = id(8);
const player = (playerId: string, valueTc = 10_000_000) => ({ playerId, name: 'Synthetic Card', valueTc, position: 'CB', clubId: id(9), primaryDetail: 'Centre-Back' });
const listing = (owner: string, playerId: string, revision: number) => ({ owner: { accountId: owner, name: 'PRIVATE_LEGAL_NAME' }, player: player(playerId), collectionRevision: revision, negotiationAllowed: true, restrictionReason: null });
const command = () => ({ proposalId: proposal, seasonId: season, context: publicMarketContext(actor, publicId), outgoingPlayerId: out, incomingPlayerId: incoming, expectedRevision: 1, otherExpectedRevision: 2 });
function fixture() {
  const calls: unknown[][] = [];
  const discovery: ExchangeDiscovery = { version: 1, accountId: actor, seasonId: season, collectionRevision: 1, ownListedIds: [out], reservations: [],
    listings: [listing(actor, out, 1), listing(target, incoming, 2), listing(other, id(10), 3)], proposals: [] };
  const deps: PublicMarketDependencies = { enabled: true, actor: async () => ({ accountId: actor, allowed: true }), allow: () => true,
    target: async (p,a) => { calls.push(['target',p,a]); return target; },
    snapshot: async a => { calls.push(['snapshot',a]); return { seasonId: season, plan: 'standard', discovery }; },
    propose: async (a,t,c) => { calls.push(['propose',a,t,c]); return { ok: true, proposalId: c.proposalId, status: 'pending', replayed: false,
      terms: { proposer: { accountId: actor, balance: 999 }, accepter: { accountId: target }, outgoing: player(out), incoming: player(incoming), private: 'SECRET_CONTRACT', quote: { feeTc: 500000, bonusTc: 250000, compensationTc: 0 } } }; } };
  return { deps, discovery, calls, run: (body?: unknown, headers: Record<string,string> = {}) => handlePublicMarket(new Request(`https://qa.test/api/touchline/clubowners/${publicId}/market`,
    { method: body ? 'POST' : 'GET', headers: { ...(body ? { origin: 'https://qa.test', 'content-type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }), publicId, deps) };
}
test('market projects explicit target listings and own offers, never third-party IDs, private names, balance or contracts', async () => {
  const f = fixture(); const r = await f.run(); assert.equal(r.status,200); const data = await r.json();
  assert.equal(data.market.offers.length,1); assert.equal(data.market.ownOffers.length,1); assert.equal(data.market.quotes[0].quote.feeTc,500000);
  for (const privateValue of [actor,target,other,'PRIVATE_LEGAL_NAME','balance','contract']) assert.ok(!JSON.stringify(data).includes(privateValue));
  assert.equal(r.headers.get('Cache-Control'),'private, no-store'); assert.equal(r.headers.get('Vary'),'Cookie');
});
test('unlisted and reserved own cards never become options', async () => {
  const f = fixture(); f.discovery.ownListedIds=[]; assert.equal((await (await f.run()).json()).market.ownOffers.length,0);
  f.discovery.ownListedIds=[out]; f.discovery.reservations=[{playerId:out,proposalId:proposal}]; assert.equal((await (await f.run()).json()).market.ownOffers.length,0);
});
test('gate, auth, customer access, opt-in and self target fail before any mutation', async () => {
  for (const [change,status] of [
    [(f: ReturnType<typeof fixture>) => { f.deps.enabled=false; },503],
    [(f: ReturnType<typeof fixture>) => { f.deps.actor=async()=>null; },401],
    [(f: ReturnType<typeof fixture>) => { f.deps.actor=async()=>({accountId:actor,allowed:false}); },403],
    [(f: ReturnType<typeof fixture>) => { f.deps.target=async()=>null; },404],
    [(f: ReturnType<typeof fixture>) => { f.deps.target=async()=>actor; },403],
  ] as const) { const f=fixture(); change(f); assert.equal((await f.run(command())).status,status); assert.ok(!f.calls.some(c=>c[0]==='propose')); }
});
test('read/write reject cross-origin and body-supplied private identity or prices',async()=>{
  for(const headers of [{origin:'https://evil.test'},{'sec-fetch-site':'cross-site'}] as Record<string,string>[]) { const f=fixture();assert.equal((await f.run(command(),headers)).status,403);assert.equal(f.calls.length,0); }
  for(const key of ['otherAccountId','actorId','feeTc','balance','targetId']) { const f=fixture();assert.equal((await f.run({...command(),[key]:target})).status,400);assert.equal(f.calls.length,0); }
});
test('invalid public ID, oversized JSON, unrelated method and rate guard do not call mutation',async()=>{
  const f=fixture();assert.equal((await handlePublicMarket(new Request('https://qa.test'), 'bad',f.deps)).status,404);
  assert.equal((await handlePublicMarket(new Request('https://qa.test',{method:'DELETE'}),publicId,f.deps)).status,405);
  assert.equal((await f.run({...command(),junk:'x'.repeat(3000)})).status,400);
  f.deps.allow=()=>false;const r=await f.run(command());assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'60');assert.ok(!f.calls.some(c=>c[0]==='propose'));
});
test('valid proposal resolves target on server and only returns scoped acknowledgement and public quote',async()=>{
  const f=fixture();const r=await f.run(command());assert.equal(r.status,200);const data=await r.json();
  assert.deepEqual(Object.keys(data).sort(),['ok','proposalId','quote','replayed','status']);
  assert.ok(!JSON.stringify(data).includes(target));assert.ok(!JSON.stringify(data).includes('SECRET_CONTRACT'));
  assert.deepEqual(f.calls.find(c=>c[0]==='propose'),['propose',actor,target,command()]);
});
test('changed session, season, revision, target, position and Beta boundary reject before RPC',async()=>{
  for(const kind of ['context','season','revision','otherRevision','target','position','beta']) {
    const f=fixture();const c=command();
    if(kind==='context')c.context=publicMarketContext(other,publicId);
    if(kind==='season')c.seasonId=id(19);
    if(kind==='revision')c.expectedRevision=8;
    if(kind==='otherRevision')c.otherExpectedRevision=8;
    if(kind==='target')c.incomingPlayerId=id(10);
    if(kind==='position')f.discovery.listings[1]!.player.position='GK';
    if(kind==='beta'){f.discovery.listings[1]!.negotiationAllowed=false;f.discovery.listings[1]!.restrictionReason='beta-pair';}
    assert.equal((await f.run(c)).status,409,kind);assert.ok(!f.calls.some(c=>c[0]==='propose'),kind);
  }
});
test('atomic SQL is still authoritative for closed season/round, reservation, ownership and duplicate id',async()=>{
  for(const code of ['CLUB_SEASON_CLOSED','CLUB_PLAYER_ROUND_LOCKED','CLUB_MATCH_RELATED_PLAYER','CLUB_PLAYER_RESERVED','CLUB_ACCESS_REQUIRED','CLUB_IDEMPOTENCY_CONFLICT']) {
    const f=fixture();f.deps.propose=async()=>{throw new Error(`${code}: hidden details ${target}`);};const r=await f.run(command());assert.equal(r.status,409);
    assert.deepEqual(await r.json(),{ok:false,error:code});
  }
});
test('uncertain command replays original ID even after reservation, but never into another owner',async()=>{
  const f=fixture();f.discovery.proposals=[{proposalId:proposal,status:'pending',expiresAt:'2027-01-01T00:00:00Z',proposer:{accountId:actor,name:'Private'},accepter:{accountId:target,name:'Private'},outgoing:player(out),incoming:player(incoming),negotiationAllowed:true,restrictionReason:null,quote:{feeTc:500000,bonusTc:250000,retiredTc:250000,compensationTc:0}}];
  f.discovery.listings=[];f.discovery.reservations=[{playerId:out,proposalId:proposal}];assert.equal((await f.run(command())).status,200);
  f.discovery.proposals[0]!.accepter.accountId=other;assert.equal((await f.run(command())).status,409);
  assert.equal(f.calls.filter(c=>c[0]==='propose').length,1);
});
test('malformed receipts or errors fail closed without exposing source details',async()=>{
  for(const value of [null,{ok:true,proposalId:id(99),status:'pending',replayed:false,terms:{}},{ok:true,proposalId:proposal,status:'pending',replayed:false,terms:{quote:{feeTc:3,bonusTc:1,compensationTc:0}}}]) {
    const f=fixture();f.deps.propose=async()=>value;assert.deepEqual(await(await f.run(command())).json(),{ok:false,error:'CLUB_STORAGE_UNAVAILABLE'});
  }
  const f=fixture();f.deps.target=async()=>{throw new Error('SECRET_DATABASE_ERROR');};assert.deepEqual(await(await f.run()).json(),{ok:false,error:'CLUB_STORAGE_UNAVAILABLE'});
});
test('public parser rejects duplicate offers/quotes and invalid IDs while stripping unexpected fields',()=>{
  const f=fixture();const market=projectPublicMarket(publicId,actor,target,{seasonId:season,plan:'standard',discovery:f.discovery});
  assert.throws(()=>parsePublicMarket({...market,offers:[...market.offers,...market.offers]},publicId));
  assert.throws(()=>parsePublicMarket({...market,quotes:[...market.quotes,...market.quotes]},publicId));
  assert.equal(parsePublicMarketCommand({...command(),otherAccountId:target}),null);
  assert.ok(!JSON.stringify(parsePublicMarket({...market,privateWallet:123},publicId)).includes('privateWallet'));
});

test('an acknowledgement for another private party or card fails closed instead of confirming the wrong trade',async()=>{
 for(const key of ['proposer','accepter','outgoing','incoming']){
  const f=fixture();const original=f.deps.propose;f.deps.propose=async(...args)=>{
   const result=await original(...args) as {terms:Record<string,Record<string,unknown>>};
   result.terms[key]![key==='proposer'||key==='accepter'?'accountId':'playerId']=id(99);return result;
  };
  assert.deepEqual(await(await f.run(command())).json(),{ok:false,error:'CLUB_STORAGE_UNAVAILABLE'});
 }
});
