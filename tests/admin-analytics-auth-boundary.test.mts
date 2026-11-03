import assert from 'node:assert/strict';import test from 'node:test';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import React from 'react';import * as jsx from 'react/jsx-runtime';import {renderToStaticMarkup} from 'react-dom/server';
function harness(mode='ok',lang='en-GB'){
 const calls={admins:0,reads:0,users:0};const exports:Record<string,unknown>={};
 const panel=({children}:{children:React.ReactNode})=>React.createElement('section',null,children);
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/(app)/admin/analytics/page.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Date,Map,Set,require:(name:string)=>{
 if(name==='react/jsx-runtime')return jsx;
 if(name==='next/navigation')return{notFound:()=>{throw Error('NOT_FOUND');}};
 if(name==='next/link')return{default:panel};
 if(name==='lucide-react')return new Proxy({},{get:()=>()=>null});
 if(name==='@/components/arena-admin-ui')return{GamePanel:panel,LivePill:panel,StatTile:({label,value,delta}:{label:string,value:string,delta:string})=>React.createElement('p',null,`${label}: ${value} (${delta})`)};
 if(name==='@/lib/admin/owner')return{isOwnerEmail:()=>mode!=='customer'};
 if(name==='@/lib/touchlineArena/auth-access')return{hasTouchLineArenaAccess:()=>mode!=='no-access'};
 if(name==='@/lib/touchlineArena/auth-i18n')return{normalizeTouchLineAuthLocale:()=>lang,touchLineAuthHref:(v:string)=>v};
 if(name==='@/lib/supabase/server')return{createClient:async()=>{if(mode==='client-throw')throw Error('PRIVATE_CLIENT');return{auth:{getUser:async()=>{if(mode==='auth-throw')throw Error('PRIVATE_AUTH');return{data:{user:mode==='anonymous'?null:{id:'owner',email:'owner@invalid.test'}},error:mode==='auth-error'?{}:null};}}};}};
 if(name==='@/lib/supabase/admin')return{createAdminClient:()=>{calls.admins++;const q:Record<string,unknown>={};for(const m of ['select','gte','order','limit'])q[m]=()=>q;q.then=(resolve:(v:unknown)=>unknown)=>{calls.reads++;return Promise.resolve({data:mode==='future'?[{user_id:'future',last_seen_at:'2999-01-01',active_seconds:0,current_area:'club',device_class:'desktop'}]:[],error:mode==='db-error'?{message:'PRIVATE_DB'}:null}).then(resolve);};return{from:()=>q,auth:{admin:{listUsers:async()=>{calls.users++;return{data:{users:[]},error:null};}}}};}};
 throw Error(name);
 }});
 const Page=exports.default as (p:unknown)=>Promise<React.ReactNode>;
 return{calls,run:async()=>renderToStaticMarkup(await Page({searchParams:Promise.resolve({lang})}))};
}
test('analytics rejects invalid owner sessions before privileged presence or email reads',async()=>{
 for(const mode of ['auth-error','anonymous','customer','no-access']){const h=harness(mode);await assert.rejects(h.run,/NOT_FOUND/);assert.deepEqual(h.calls,{admins:0,reads:0,users:0});}
});
test('analytics auth transport failures render generic localized unavailable without privileged reads',async()=>{
 for(const mode of ['auth-throw','client-throw'])for(const lang of ['pt-BR','en-GB']){const h=harness(mode,lang);const html=await h.run();assert.match(html,lang==='pt-BR'?/indisponível/:/unavailable/);assert.doesNotMatch(html,/PRIVATE/);assert.deepEqual(h.calls,{admins:0,reads:0,users:0});}
});
test('authorized analytics preserves reads and distinguishes query error from empty records',async()=>{
 const h=harness();assert.match(await h.run(),/ClubOwner Activity/);assert.deepEqual(h.calls,{admins:1,reads:2,users:1});const failed=await harness('db-error').run();assert.match(failed,/unavailable/);assert.doesNotMatch(failed,/PRIVATE_DB|ClubOwner Activity/);
});

test('analytics labels loaded records and identity coverage without promising complete totals',async()=>{
 for(const lang of ['pt-BR','en-GB']){
  const html=await harness('ok',lang).run();
  assert.match(html,lang==='pt-BR'?/Indicadores dos registros carregados/:/Indicators for loaded records/);
  assert.match(html,/10[.,]?000/);assert.match(html,/1[.,]?000/);
  assert.match(html,lang==='pt-BR'?/não representam necessariamente toda a atividade/:/may not represent all activity/);
  assert.match(html,lang==='pt-BR'?/última área informada/:/last reported area/);
 }
});

test('future presence timestamps never count as active now or daily',async()=>{
 const html=await harness('future').run();assert.match(html,/Active now: 0/);assert.match(html,/Daily active: 0/);
});
