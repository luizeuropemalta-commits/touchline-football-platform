import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import React from 'react';import * as jsx from 'react/jsx-runtime';import {renderToStaticMarkup} from 'react-dom/server';import ts from 'typescript';
import {getExchangeNegotiationCopy,getExchangeProposalStatus,getExchangeBalancePreviewLabel,getExchangeRecoveryLabel,EXCHANGE_NEGOTIATION_ROWS} from '../lib/touchlineFantasy/exchange-negotiations-i18n.ts';
import {projectExchangeReadiness} from '../lib/touchlineFantasy/exchange-eligibility.ts';
import * as journal from '../lib/touchlineFantasy/exchange-command-journal.ts';
import {prepareExchangeCommand} from '../lib/touchlineFantasy/exchange-command-client.ts';import {quoteClubExchange} from '../lib/touchlineFantasy/club-market-rules.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const own={playerId:id(5),clubId:id(9),name:'Own athlete',valueTc:80_000_000,position:'MID',primaryDetail:'CM'};
const other={...own,playerId:id(6),name:'Other athlete',valueTc:100_000_000};
const data={version:1,accountId:id(1),seasonId:id(2),collectionRevision:7,ownListedIds:[id(5)],reservations:[],proposals:[],listings:[{owner:{accountId:id(1),name:'Me'},collectionRevision:7,player:own},{owner:{accountId:id(4),name:'Other club'},collectionRevision:8,player:other}]};
function harness(discovery:unknown=data,outcome='confirmed',plan='standard'){
 const values:unknown[]=[],effects:{deps:unknown[];cleanup?:()=>void}[]=[];let cursor=0,effectCursor=0,reads=0,reloads=0;const queued:(()=>void)[]=[];const commands:unknown[]=[];
 const exports:{default?:(props:Record<string,unknown>)=>React.ReactNode}={};
 const source=readFileSync(new URL('../components/touchline/market/ExchangeNegotiations.tsx',import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const modules:Record<string,unknown>={'@/lib/touchlineFantasy/exchange-eligibility':{projectExchangeReadiness},'@/lib/touchlineFantasy/exchange-command-journal':journal,'@/lib/touchlineFantasy/exchange-negotiations-i18n':{getExchangeNegotiationCopy,getExchangeProposalStatus,getExchangeBalancePreviewLabel,getExchangeRecoveryLabel},react:{useState:(initial:unknown)=>{const n=cursor++;if(!(n in values))values[n]=typeof initial==='function'?initial():initial;return [values[n],(next:unknown)=>{values[n]=typeof next==='function'?next(values[n]):next;}];},useRef:(initial:unknown)=>{const n=cursor++;if(!(n in values))values[n]={current:initial};return values[n];},useEffect:(fn:()=>void|(()=>void),deps:unknown[])=>{const n=effectCursor++,old=effects[n];if(!old||deps.some((v,i)=>v!==old.deps[i])){queued.push(()=>{old?.cleanup?.();effects[n]={deps,cleanup:fn()||undefined};});}}},'react/jsx-runtime':jsx,
 '@/lib/touchlineFantasy/exchange-discovery':{readExchangeDiscovery:async()=>{reads++;return discovery;}},
 '@/lib/touchlineFantasy/exchange-command-client':{prepareExchangeCommand,submitExchangeCommand:async(command:unknown)=>{commands.push(command);return {status:outcome};}},
 '@/lib/touchlineFantasy/club-market-rules':{quoteClubExchange},
 '@/components/touchline/fantasy/TouchlineGameweekCard':{default:({card}:{card:{name:string}})=>React.createElement('span',{'data-art':true},card.name)}};
 const storage=new Map<string,string>();
 runInNewContext(js,{exports,window:{sessionStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)}},AbortController,crypto:{randomUUID:()=>id(20)},require:(name:string)=>name.endsWith('.css')?{default:new Proxy({},{get:(_,k)=>String(k)})}:modules[name]??(()=>{throw Error(name);})()});
 const state={seasonId:id(2),revision:7,plan,balanceEur:200_000_000,players:Array.from({length:35},(_,i)=>({playerId:i===20?id(5):id(100+i),area:i<11?'starters':i<20?'reserves':'outside',slot:i<11?i:i<20?i-11:i-20,valueEur:80}))};
 const props={locale:'en-GB',ready:true,state,accountId:id(1),catalogue:[{canonicalPlayerId:id(5),name:own.name,editorialCard:{}},{canonicalPlayerId:id(6),name:other.name,editorialCard:{}}],onCommitted:()=>{reloads++;}};
 let tree:React.ReactNode;
 function render(){cursor=0;effectCursor=0;tree=exports.default!(props);return renderToStaticMarkup(tree);}
 async function flush(){for(const fn of queued.splice(0))fn();await Promise.resolve();await Promise.resolve();return render();}
 function nodes(type:string){const found:React.ReactElement<Record<string,unknown>>[]=[];function walk(node:React.ReactNode){if(!React.isValidElement<Record<string,unknown>>(node))return;if(node.type===type)found.push(node);React.Children.forEach(node.props.children as React.ReactNode,walk);}walk(tree);return found;}
 return {render,flush,commands,setOutcome:(next:string)=>{outcome=next;},reads:()=>reads,reloads:()=>reloads,nodes,close:()=>effects.forEach(e=>e.cleanup?.())};
}
test('gate unavailable never reads as empty; approved Beta may query scoped discovery',async()=>{
 const closed=harness(null);assert.match(closed.render(),/Loading negotiations/);assert.match(await closed.flush(),/currently unavailable/);assert.equal(closed.commands.length,0);closed.close();
 const beta=harness(data,'confirmed','beta');beta.render();await beta.flush();assert.equal(beta.reads(),1);assert.ok(beta.nodes('button').length>0);beta.close();
});
test('real proposal flow requires selection, paired cards and confirmation before one command',async()=>{
 const h=harness();h.render();await h.flush();assert.equal(h.commands.length,0);
 const select=h.nodes('select')[0];(select.props.onChange as (e:unknown)=>void)({target:{value:id(5)}});h.render();
 const prepare=h.nodes('button').find(b=>b.props.children==='Prepare proposal')!;assert.equal(prepare.props.disabled,false);(prepare.props.onClick as ()=>void)();
 const html=h.render();assert.match(html,/data-art/);assert.ok(html.indexOf('Other athlete')<html.indexOf('Own athlete'));assert.match(html,/5,000,000 TC/);assert.match(html,/175,000,000 TC/);assert.equal(h.commands.length,0);
 const confirm=h.nodes('button').find(b=>b.props.children==='Confirm')!;(confirm.props.onClick as ()=>void)();await h.flush();assert.equal(h.commands.length,1);assert.equal(h.reloads(),1);
 assert.equal((h.commands[0] as {command:{proposalId:string}}).command.proposalId,id(20));h.close();
});
test('unknown outcome retains intent and disables another submission until confirmed discovery',async()=>{
 const h=harness(data,'unconfirmed');h.render();await h.flush();
 const list=h.nodes('button').find(b=>b.props.children==='Withdraw listing')!;(list.props.onClick as ()=>void)();await h.flush();
 assert.match(h.render(),/not yet confirmed/);const again=h.nodes('button').find(b=>b.props.children==='Withdraw listing')!;assert.equal(again.props.disabled,true);assert.equal(h.commands.length,1);h.close();
});

test("all eight negotiation locales have complete action copy",()=>{const english=getExchangeNegotiationCopy("en-GB");for(const locale of ["pt-BR",...Object.keys(EXCHANGE_NEGOTIATION_ROWS)]){const copy=getExchangeNegotiationCopy(locale);assert.deepEqual(Object.keys(copy),Object.keys(english));assert.notEqual(copy.confirm,english.confirm);assert.ok(Object.values(copy).every(v=>v.trim().length>0));}});
test('parent remounts transaction lifetime for every account season revision and readiness change',()=>{
 const source=readFileSync(new URL('../components/touchline/market/ClubOwnerExchangeHub.tsx',import.meta.url),'utf8');
 assert.match(source,/key=\{JSON\.stringify\(\[expectedAccountId,state\?\.seasonId,state\?\.revision,ready\]\)\}/);
});

test('explicit recovery preserves exact identity and remains locked after rejected retry',async()=>{
 const h=harness(data,'unconfirmed');h.render();await h.flush();
 (h.nodes('select')[0].props.onChange as (e:unknown)=>void)({target:{value:id(5)}});h.render();
 (h.nodes('button').find(b=>b.props.children==='Prepare proposal')!.props.onClick as ()=>void)();h.render();
 (h.nodes('button').find(b=>b.props.children==='Confirm')!.props.onClick as ()=>void)();await h.flush();
 await h.flush();h.setOutcome('rejected');(h.nodes('button').find(b=>b.props.children==='Retry the same operation')!.props.onClick as ()=>void)();await h.flush();
 assert.equal(h.commands.length,2);assert.deepEqual(h.commands[0],h.commands[1]);assert.match(h.render(),/not yet confirmed/);
 assert.equal(h.nodes('button').find(b=>b.props.children==='Prepare proposal')!.props.disabled,true);h.close();
});
