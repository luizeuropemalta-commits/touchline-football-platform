import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';
const source=readFileSync(new URL('../components/touchline/fantasy/ClubOwnerCollectionSlots.tsx',import.meta.url),'utf8');
function render(area:string, indicators:unknown[]) {
 const fn=source.slice(source.indexOf('export function ClubOwnerCollectionSlots('),source.indexOf('/** Existing squad only:'));
 const exports:Record<string,React.ComponentType<Record<string,unknown>>>={};
 vm.runInNewContext(ts.transpileModule(fn,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{
 exports,require:()=>jsx,useMemo:(fn:()=>unknown)=>fn(),Map,
 getAllocationDialogCopy:()=>({}),collectionPositionName:()=>'',groupCollectionSlots:()=>({groups:[],unassigned:[]}),
 resolveTouchlineCatalogueLocale:()=> 'en-GB',layout:{},styles:{},controls:{},ArrowLeftRight:()=>null,
 TouchlineGameweekCard:()=>React.createElement('div',{'data-card':'owned'}),
 TouchlinePlayerAvailabilityBadge:({badge}: {badge:{reason:string}})=>React.createElement('span',{'data-availability':badge.reason}),
 });
 return renderToStaticMarkup(React.createElement(exports.ClubOwnerCollectionSlots,{state:{players:[{playerId:'owned',area,slot:0}]},catalogue:[{id:'owned'}],area,count:1,locale:'en-GB',enabled:true,onChoose:()=>{},playerAvailabilityIndicators:indicators}));
}
test('collection reserves and outside render only one exact owned-player availability indicator',()=>{
 for(const area of ['reserves','outside']) {
  const own={playerId:'owned',fixtureId:'1',badge:{reason:'injury'}};
  assert.match(render(area,[own]),/data-availability="injury"/);
  for(const indicators of [[],[{...own,playerId:'other'}],[own,own]])assert.doesNotMatch(render(area,indicators),/data-availability/);
 }
});
test('every collection rail receives current availability including Arena reserves',()=>{
 const page=readFileSync(new URL('../app/fantasy/FantasyGameweekClient.tsx',import.meta.url),'utf8');
 const rails=[...page.matchAll(/<ClubOwnerCollectionSlots\b[\s\S]*?\/>/g)];
 assert.equal(rails.length,4);
 for(const rail of rails)assert.match(rail[0],/playerAvailabilityIndicators=\{currentAvailability\}/);
});
