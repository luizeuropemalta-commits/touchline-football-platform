import assert from 'node:assert/strict';
import test from 'node:test';
import { selectPostMatchRechecks, decideLiveSyncCadence } from '../lib/football-data/live-sync-cadence.ts';
import type { TouchlineFixture } from '../lib/football-data/types.ts';
const now = Date.parse('2026-10-26T12:00:00Z');
const hour = 3600000;
const fixture = (id: string, age: number, status = 'Full Time'): TouchlineFixture => ({
 id: `sportmonks:${id}`, provider: 'sportmonks', providerId: id, competitionId: '8',
 startsAt: new Date(now - age * hour).toISOString(), status,
 source: { provider: 'sportmonks', providerId: id },
});
test('completed recent matches remain eligible, hourly boundary and clock rollback respected', () => {
 const f = fixture('19722126', 22);
 for (const [age, expected] of [[0, []], [1, [f.providerId]], [-1, []]] as const) {
   assert.deepEqual(selectPostMatchRechecks([f], new Map([[f.providerId, new Date(now-age*hour).toISOString()]]), now), expected);
 }
});
test('older matches never age out; refreshed daily with deterministic oldest-first batching', () => {
 const fs = [fixture('1', 800),fixture('2',900),fixture('3',1000)];
 const checked = new Map(fs.map((f,i) => [f.providerId,new Date(now-(25+i)*hour).toISOString()]));
 assert.deepEqual(selectPostMatchRechecks(fs,checked,now), ['3','2']);
 checked.set('3',new Date(now).toISOString()); checked.set('2',new Date(now).toISOString());
 assert.deepEqual(selectPostMatchRechecks(fs,checked,now), ['1']);
});
test('cancelled, future, unknown, abandoned and live matches are not postmatch corrections', () => {
 assert.deepEqual(selectPostMatchRechecks(['Cancelled','Live','Abandoned','Awarded','Not Started'].map((s,i)=>fixture(String(i),22,s)),new Map(),now), []);
 assert.deepEqual(selectPostMatchRechecks([fixture('future',-1)],new Map(),now), []);
});
test('postmatch work uses five-minute scheduling, does not become one-minute live traffic, deduplicates', () => {
 const options = { now, postMatchFixtureIds:['19722126','19722126'], lastSuccessfulSyncAt:new Date(now-5*60000).toISOString() };
 const decision=decideLiveSyncCadence([],options);
 assert.equal(decision.cadence,'matchday'); assert.equal(decision.due,true);
 assert.deepEqual(decision.candidateFixtureIds,['19722126']);
 assert.equal(decideLiveSyncCadence([],{...options,lastSuccessfulSyncAt:new Date(now-60000).toISOString()}).due,false);
});

test('two persistently failed imports yield to other matches without faking feed freshness', () => {
 const fs = [fixture('1',22),fixture('2',22),fixture('3',22)];
 const checked = new Map<string,string>();
 const attempts = new Map<string,string>();
 assert.deepEqual(selectPostMatchRechecks(fs,checked,now,attempts), ['1','2']);
 attempts.set('1',new Date(now).toISOString()); attempts.set('2',new Date(now).toISOString());
 assert.deepEqual(selectPostMatchRechecks(fs,checked,now+5*60000,attempts), ['3']);
 assert.deepEqual(selectPostMatchRechecks(fs,checked,now+15*60000,attempts), ['3','1']);
 assert.equal(checked.size,0);
});

test('large failed backlog cannot starve never-tried or older-attempted fixtures', () => {
 const fs = Array.from({length:64},(_,i)=>fixture(String(i+1),22));
 const attempts = new Map<string,string>();
 const seen = new Set<string>();
 for (let tick=0;tick<32;tick++) {
   const time = now+tick*60000;
   const selected=selectPostMatchRechecks(fs,new Map(),time,attempts);
   for (const id of selected) { seen.add(id); attempts.set(id,new Date(time).toISOString()); }
 }
 assert.equal(seen.size,64);
 const next=selectPostMatchRechecks(fs,new Map(),now+32*60000,attempts);
 assert.deepEqual(next,['1','10']);
});
