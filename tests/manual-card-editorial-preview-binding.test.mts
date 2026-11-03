import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";
const requireNative=createRequire(import.meta.url);
const source=readFileSync(new URL('../components/admin-manual-card-editorial-actions.tsx',import.meta.url),'utf8');
type E=React.ReactElement<Record<string,unknown>>;
function nodes(value:unknown):E[]{if(Array.isArray(value))return value.flatMap(nodes);if(!React.isValidElement(value))return[];const e=value as E;return[e,...nodes(e.props.children)];}
function text(value:unknown):string{if(Array.isArray(value))return value.map(text).join('');if(React.isValidElement(value))return text((value as E).props.children);return typeof value==='string'?value:'';}
const id='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const preview=(player=id,value=100)=>({ok:true,previewOnly:true,authority:'TouchLine',providerConflict:null,player:{canonicalPlayerId:player,displayName:'Player A',clubName:'Club A',clubLogoUrl:null,shirtNumber:10,countryCode3:'ENG',position:'Forward'},marketValueEur:value,effectiveSeason:'2026-27',publicationStatus:'published',calculatedTier:'gold',nominalPriceGbp:10,cardReview:{state:'COMPLETE',missingFields:[]}});
function fixture(){let cursor=0;const slots:unknown[]=[];const calls:{url:string;body:Record<string,unknown>;resolve:(v:unknown)=>void}[]=[];
 const hooks={...React,useMemo:(f:()=>unknown)=>f(),useRef:(value:unknown)=>{const i=cursor++;if(!(i in slots))slots[i]={current:value};return slots[i];},useState:(initial:unknown)=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],(value:unknown)=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];}};
 const exports:Record<string,unknown>={};runInNewContext(ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Intl,fetch:(url:string,init:RequestInit)=>new Promise(resolve=>calls.push({url,body:JSON.parse(init.body as string),resolve:(value:unknown)=>resolve({ok:true,json:async()=>value})})),require:(name:string)=>{if(name==='react')return hooks;if(name==='react/jsx-runtime')return requireNative(name);if(name==='lucide-react')return{Check:()=>null,Eye:()=>null,Search:()=>null,X:()=>null};if(name.includes('TouchlineEliteExactCard'))return{default:()=>null};throw Error(name);}});
 const render=()=>{cursor=0;return nodes((exports.ManualCardEditorialEditor as (p:unknown)=>unknown)({players:[{id,name:'Player A',clubName:'Club A'},{id:other,name:'Player B',clubName:'Club B'}],initialPlayerId:id}));};
 const click=(label:string)=>{const node=render().find(n=>n.type==='button'&&text(n)===label);assert.ok(node,label);return(node.props.onClick as ()=>Promise<void>)();};
 const value=(newValue:string)=>{const node=render().find(n=>n.type==='input'&&n.props.inputMode==='numeric')!;(node.props.onChange as (e:unknown)=>void)({target:{value:newValue}});};
 return{render,calls,click,value,season:(season:string)=>{const node=render().find(n=>n.type==='input'&&n.props.value==='2026-27')!;(node.props.onChange as (e:unknown)=>void)({target:{value:season}});}};
}
test('late preview cannot authorize a different player or market value',async()=>{const f=fixture();f.value('100');const pending=f.click('Preview card');await f.click('Player BClub B');f.value('200');f.calls[0].resolve(preview());await pending;const save=f.click('SAVE & REVALIDATE');assert.equal(f.calls.length,1,'mismatched current draft must require a fresh preview, never publish');await save;});
test('preview and commit allow one in-flight operation and bind the inspected draft',async()=>{const f=fixture();f.value('100');const pending=f.click('Preview card');const second=f.click('Prepare preview');assert.equal(f.calls.length,1);await second;assert.ok(f.render().filter(n=>n.type==='input'||n.type==='textarea').every(n=>n.props.disabled===true));f.calls[0].resolve(preview());await pending;const save=f.click('SAVE & REVALIDATE');assert.equal(f.calls.length,2);assert.deepEqual(f.calls[1].body,f.calls[0].body);f.calls[1].resolve({ok:true,cardReview:{state:'COMPLETE'},publicationStatus:'published',calculatedTier:'gold',nominalPriceGbp:10});await save;});
test('wrong-player preview is rejected without a confirmation dialog',async()=>{const f=fixture();f.value('100');const pending=f.click('Preview card');f.calls[0].resolve(preview(other));await pending;assert.equal(f.render().filter(n=>n.props.role==='dialog').length,0);assert.equal(f.calls.length,1);});

test('season snapshot follows the API whitespace normalization without changing scope',async()=>{const f=fixture();f.value('100');f.season(' 2026/2027 ');const pending=f.click('Preview card');f.calls[0].resolve({...preview(),effectiveSeason:'2026/2027'});await pending;assert.equal(f.render().filter(n=>n.props.role==='dialog').length,1);const save=f.click('SAVE & REVALIDATE');assert.equal(f.calls[1].body.effectiveSeason,'2026/2027');f.calls[1].resolve({ok:true,cardReview:{state:'COMPLETE'}});await save;});
