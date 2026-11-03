import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as contract from '../lib/touchlineArena/clubowner-public-market-contract.ts';
const id=(n:number)=>`${n.toString().padStart(8,'0')}-1111-4111-8111-111111111111`;
const publicId=id(4),seasonId=id(5),out=id(6),incoming=id(7),proposal=id(8);
const player=(playerId:string)=>({playerId,name:playerId===out?'My listed card':'Their listed card',valueTc:10000000,position:'CB',clubId:id(9),primaryDetail:'Centre-Back',revision:playerId===out?1:2,allowed:true,restriction:null});
const market={publicId,seasonId,context:'a'.repeat(64),revision:1,offers:[player(incoming)],ownOffers:[player(out)],proposals:[],quotes:[{outgoingPlayerId:out,incomingPlayerId:incoming,quote:{feeTc:500000,bonusTc:250000,compensationTc:0}}]};
type Node=React.ReactElement<Record<string,unknown>>;
function nodes(value:unknown):Node[]{if(Array.isArray(value))return value.flatMap(nodes);if(!React.isValidElement<Record<string,unknown>>(value))return[];return[value,...nodes(value.props.children)];}
function fixture(options:{locale?:string;stored?:string;storageFail?:boolean;ssr?:boolean}={}){
 const exported:Record<string,unknown>={},state:unknown[]=[],effects:(()=>void)[]=[],pending:{init:RequestInit;resolve:(r:Response)=>void;reject:(e:Error)=>void}[]=[];
 const storage=new Map<string,string>();if(options.stored)storage.set(`touchline.public-market.intent.v1:${publicId}:${market.context}:${seasonId}`,options.stored);
 const timers=new Map<number,()=>void>();let cursor=0,timer=0,unmounted=false,lateWrites=0;const cleanups:(()=>void)[]=[];
 const hooks={...React,useState(initial:unknown){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],(v:unknown)=>{if(unmounted)lateWrites++;state[i]=typeof v==='function'?(v as (x:unknown)=>unknown)(state[i]):v;}];},
  useRef(initial:unknown){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];},
  useEffect(fn:()=>void|(()=>void)){const i=cursor++;if(!(i in state)){state[i]=true;effects.push(()=>{const cleanup=fn();if(cleanup)cleanups.push(cleanup);});}}};
 const source=ts.transpileModule(readFileSync(new URL('../components/touchline/social/ClubOwnerPublicMarket.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 runInNewContext(source,{exports:exported,AbortController,queueMicrotask,crypto:{randomUUID:()=>proposal},sessionStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>{if(options.storageFail)throw new Error('storage');storage.set(k,v);},removeItem:(k:string)=>storage.delete(k)},
  setTimeout:(cb:()=>void)=>{timers.set(++timer,cb);return timer;},clearTimeout:(n:number)=>timers.delete(n),
  fetch:(_url:string,init:RequestInit)=>new Promise<Response>((resolve,reject)=>{pending.push({init,resolve,reject});init.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});}),
  require(name:string){if(name==='react')return options.ssr?React:hooks;if(name==='react/jsx-runtime')return jsx;
   if(name==='next/link')return{__esModule:true,default:({children,...p}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=>React.createElement('a',p,children)};
   if(name==='lucide-react')return{LockKeyhole:()=>null,ArrowLeftRight:()=>null};
   if(name==='@/lib/touchlineArena/clubowner-public-market-contract')return contract;
   if(name==='../market/TouchlineCreditAmount')return{__esModule:true,default:({value}:{value:number})=>React.createElement('span',{},`${value} TC`)};
   if(name.endsWith('.module.css'))return{__esModule:true,default:new Proxy({},{get:(_t,p)=>String(p)})};throw new Error(name);
  }});
 const Component=exported.default as (p:{publicId:string;locale:string})=>React.ReactElement;
 const render=()=>{cursor=0;const tree=Component({publicId,locale:options.locale??'en-GB'});while(effects.length)effects.shift()!();return tree;};
 const find=(predicate:(n:Node)=>boolean)=>{const n=nodes(render()).find(predicate);assert.ok(n);return n;};
 const button=(label:string)=>find(n=>n.type==='button'&&(n.props.children===label||Array.isArray(n.props.children)&&n.props.children.includes(label)));
 const click=(label:string)=>(button(label).props.onClick as()=>void)();
 return{Component,render,find,click,button,pending,storage,timers,lateWrites:()=>lateWrites,unmount(){unmounted=true;cleanups.forEach(c=>c());}};
}
const flush=async()=>{await new Promise(r=>setImmediate(r));};
const loaded=async(f:ReturnType<typeof fixture>)=>{f.render();await flush();f.pending[0]!.resolve(Response.json({ok:true,market}));await flush();f.render();};
function choose(f:ReturnType<typeof fixture>){f.click('Prepare proposal');(f.find(n=>n.type==='select').props.onChange as(e:unknown)=>void)({target:{value:out}});f.render();}
test('public market SSR starts with honest loading, private-squad notice and anchored existing Exchange link in both locales',()=>{
 assert.match(readFileSync(new URL('../app/fantasy/FantasyGameweekClient.tsx',import.meta.url),'utf8'), /id="clubowner-exchange"/);
 for(const locale of ['en-GB','pt-BR']){const f=fixture({locale,ssr:true});const html=renderToStaticMarkup(React.createElement(f.Component,{publicId,locale}));assert.match(html,/role="status"/);assert.match(html,/#clubowner-exchange/);assert.doesNotMatch(html,/PRIVATE_LEGAL_NAME|Their listed card/);assert.equal(f.pending.length,0);}
});
test('an unknown write keeps one durable proposal ID and retries exactly the same command',async()=>{
 const f=fixture();await loaded(f);choose(f);f.click('Send proposal');assert.equal(f.pending.length,2);const first=String(f.pending[1]!.init.body);assert.match(first,new RegExp(proposal));assert.equal(f.storage.size,1);
 f.pending[1]!.reject(new Error('network lost'));await flush();assert.equal(f.storage.size,1);f.click('Check submission');assert.equal(String(f.pending[2]!.init.body),first);
 f.pending[2]!.resolve(Response.json({ok:true,proposalId:proposal,status:'pending',replayed:true,quote:market.quotes[0]!.quote}));await flush();assert.equal(f.storage.size,0);assert.ok(nodes(f.render()).some(n=>n.props.children==='Proposal confirmed in Exchange. The trade requires acceptance.'));
});
test('reloading confirms a recorded proposal without a new write and does not replay another account context',async()=>{
 const command={proposalId:proposal,seasonId,context:market.context,outgoingPlayerId:out,incomingPlayerId:incoming,expectedRevision:1,otherExpectedRevision:2};
 const f=fixture({stored:JSON.stringify(command)});f.render();await flush();f.pending[0]!.resolve(Response.json({ok:true,market:{...market,proposals:[{proposalId:proposal,status:'pending'}]}}));await flush();f.render();assert.equal(f.storage.size,0);assert.equal(f.pending.length,1);
 const other=fixture({stored:JSON.stringify({...command,context:'b'.repeat(64)})});await loaded(other);assert.equal(other.storage.size,1);assert.ok(!nodes(other.render()).some(n=>n.type==='button'&&n.props.children==='Send proposal'));assert.equal(other.pending.length,1);
});
test('storage failure prevents write; unmount aborts pending fetch without losing the durable intent or writing state',async()=>{
 const blocked=fixture({storageFail:true});await loaded(blocked);choose(blocked);blocked.click('Send proposal');assert.equal(blocked.pending.length,1);
 const f=fixture();await loaded(f);choose(f);f.click('Send proposal');f.unmount();await flush();assert.equal(f.storage.size,1);assert.equal(f.lateWrites(),0);assert.equal(f.timers.size,0);
});
test('explicit first rejection clears unsent intent, while errors never become a false empty market',async()=>{
 const f=fixture();await loaded(f);choose(f);f.click('Send proposal');f.pending[1]!.resolve(Response.json({ok:false,error:'CLUB_BETA_EXCHANGE_ONLY'},{status:409}));await flush();assert.equal(f.storage.size,0);
 const failed=fixture();failed.render();await flush();failed.pending[0]!.resolve(Response.json({ok:false,error:'CLUB_STORAGE_UNAVAILABLE'},{status:503}));await flush();assert.ok(!nodes(failed.render()).some(n=>n.props.children==='No cards listed for exchange.'));
});

test('confirmed receipts show the recorded status and quote rather than the current estimate',async()=>{
 const f=fixture();await loaded(f);choose(f);f.click('Send proposal');
 f.pending[1]!.resolve(Response.json({ok:true,proposalId:proposal,status:'accepted',replayed:true,quote:{feeTc:600000,bonusTc:300000,compensationTc:5000000}}));await flush();
 assert.ok(nodes(f.render()).some(n=>n.props.children==='Trade completed.'));
 assert.ok(nodes(f.render()).some(n=>n.props.value===600000));
 assert.ok(!nodes(f.render()).some(n=>n.props.children==='Proposal confirmed in Exchange. The trade requires acceptance.'));
 f.click('Refresh market');assert.ok(!nodes(f.render()).some(n=>n.props.children==='Trade completed.'));
});
