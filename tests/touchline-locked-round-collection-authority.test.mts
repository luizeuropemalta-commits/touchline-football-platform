import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../app/fantasy/FantasyGameweekClient.tsx',import.meta.url),'utf8');
const selection=source.slice(source.indexOf('  const hasLockedRound ='),source.indexOf('  function applyCollectionSnapshot'));
function project(preferCurrentSquad:boolean, round:unknown, marketOpen=false, persistedSelections:{playerId:string}[]=[]) {
 const code=ts.transpileModule(selection+'\nJSON.stringify({showLockedRound,displayedReserves});',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return JSON.parse(runInNewContext(code,{marketPage:true,collectionEnabled:true,marketOpen,preferCurrentSquad,persistedSelections,persistedUserGameweek:round,collection:{state:{players:[{playerId:'new-player',area:'reserves',slot:0},{playerId:'old-player',area:'outside',slot:2}]}}}));
}
test('locked round reserves use frozen20 and current view retains current35 placements after transfer',()=>{
 const round={state:'LOCKED',collectionRelatedSnapshot:[{playerId:'old-player',area:'reserves',slot:0}]};
 assert.equal(project(false,round).displayedReserves.players[0].playerId,'old-player');
 assert.equal(project(false,round,false,[{playerId:'old-player'}]).displayedReserves.players.length,0,'an automatic substitute appears on the field only, never twice');
 assert.equal(project(true,round).displayedReserves.players[0].playerId,'new-player');
 assert.equal(project(false,round).showLockedRound,true);
 assert.equal(project(true,round).showLockedRound,false);
 assert.equal(project(false,round,true).showLockedRound,false);
 assert.equal(project(false,{state:'DRAFT'}).showLockedRound,false);
 assert.equal(project(false,{state:'LOCKED'}).displayedReserves,null);
 assert.equal(project(false,{...round,state:'FINAL'}).showLockedRound,true);
 assert.match(source,/!arenaOpen && !showLockedRound[^]*?id="clubowner-exchange"/);
 const rails=[...source.matchAll(/<ClubOwnerCollectionSlots\b[\s\S]*?\/>/g)].map(m=>m[0]);
 assert.equal(rails.filter(s=>s.includes('state={displayedReserves}')).length,3);
});
