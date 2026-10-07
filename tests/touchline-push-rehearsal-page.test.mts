import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import * as catalogueLocale from '../lib/touchlineArena/catalogue-locale.ts';
import * as rehearsalCopy from '../lib/touchlineArena/push-rehearsal-i18n.ts';
const releasePolicy: { isTouchLineSiteLocalesEnabled?: (path?: string) => boolean } = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: releasePolicy, process: { env: {} } });


const actor='11111111-1111-4111-8111-111111111111';
const installation='22222222-2222-4222-8222-222222222222';
const qa='https://xgxbwqxjssxxuihuwmgy.supabase.co';
const origin='https://rehearsal.example.invalid';
function harness(overrides:Record<string,string|undefined>={},context:unknown={mode:'account',accountId:actor},host='rehearsal.example.invalid'){
  const source=readFileSync(new URL('../app/notifications/rehearsal/page.tsx',import.meta.url),'utf8');
  let reads=0;
  const ui=()=>null;
  const env={TOUCHLINE_PUSH_REHEARSAL_ENABLED:'true',SUPABASE_URL:qa,NEXT_PUBLIC_SUPABASE_URL:qa,
    TOUCHLINE_PUSH_REHEARSAL_ORIGIN:origin,TOUCHLINE_PUSH_REHEARSAL_ACCOUNT_ID:actor,
    TOUCHLINE_PUSH_REHEARSAL_INSTALLATION_ID:installation,VERCEL_ENV:'preview',...overrides};
  const exports:Record<string,unknown>={};
  const deps:Record<string,unknown>={
    '@/lib/touchlineArena/site-locales-release':releasePolicy,
    'react/jsx-runtime':jsx,
    '@/lib/touchlineArena/catalogue-locale':catalogueLocale,
    '@/lib/touchlineArena/push-rehearsal-i18n':rehearsalCopy,
    'next/headers':{headers:async()=>new Headers({host})},
    'next/navigation':{notFound:()=>{throw Error('not-found');}},
    '@/components/touchline/notifications/TouchlinePushRehearsal':{default:ui},
    '@/lib/touchlineArena/account-locale-context-server':{loadAccountLocaleContext:async()=>{reads++;return context;}},
  };
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {exports,process:{env},URL,require:(name:string)=>{assert.ok(name in deps,name);return deps[name];}});
  return {run:(locale:string|string[]='en-GB')=>(exports.default as (p:unknown)=>Promise<{props:Record<string,unknown>}> )({searchParams:Promise.resolve({lang:locale})}),reads:()=>reads,ui,exports};
}
function find(node:unknown,type:unknown):Record<string,unknown>|undefined{
  if(Array.isArray(node)){for(const entry of node){const result=find(entry,type);if(result)return result;}return;}
  if(!node||typeof node!=='object'||!('props' in node))return;
  const n=node as {type:unknown;props:Record<string,unknown>};
  return n.type===type?n.props:find(n.props.children,type);
}
test('rehearsal page default-off and QA/origin configuration refuse before authentication',async()=>{
  for(const overrides of [
    {TOUCHLINE_PUSH_REHEARSAL_ENABLED:undefined},{TOUCHLINE_PUSH_REHEARSAL_ENABLED:'false'},
    {VERCEL_ENV:'production'},{SUPABASE_URL:'https://other.supabase.co'},
    {NEXT_PUBLIC_SUPABASE_URL:'https://other.supabase.co'},
    {TOUCHLINE_PUSH_REHEARSAL_ACCOUNT_ID:'invalid'},
    {TOUCHLINE_PUSH_REHEARSAL_ORIGIN:'http://rehearsal.example.invalid'},
    {TOUCHLINE_PUSH_REHEARSAL_ORIGIN:origin+'/path'},
    {TOUCHLINE_PUSH_REHEARSAL_INSTALLATION_ID:'invalid'},
    {TOUCHLINE_DEPLOYMENT_MODE:'isolated-preview'},
    {NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE:'isolated-preview'},
  ]){
    const h=harness(overrides);await assert.rejects(h.run(),/not-found/);assert.equal(h.reads(),0);
  }
  const host=harness({},undefined,'other.example.invalid');await assert.rejects(host.run(),/not-found/);assert.equal(host.reads(),0);
});
test('only the configured authenticated owner receives the diagnostic component',async()=>{
  for(const context of [{mode:'guest'},{mode:'demo'},{mode:'unavailable'},{mode:'account',accountId:installation}]){
    const h=harness({},context);await assert.rejects(h.run(),/not-found/);assert.equal(h.reads(),1);
  }
  for(const locale of ['en-GB','pt-BR']){
    const h=harness();const props=find(await h.run(locale),h.ui);assert.ok(props);
    assert.deepEqual(JSON.parse(JSON.stringify(props)),{accountId:actor,configuredInstallationId:installation,locale,draftLocalesEnabled:false});
    assert.equal(h.exports.dynamic,'force-dynamic');
    const metadata=await (h.exports.generateMetadata as (props:unknown)=>Promise<{robots:unknown}>)({searchParams:Promise.resolve({lang:locale})});
    assert.deepEqual(JSON.parse(JSON.stringify(metadata.robots)),{index:false,follow:false});
  }
});
test('unbound installation permits preparation only, never invents a send target',async()=>{
  const h=harness({TOUCHLINE_PUSH_REHEARSAL_INSTALLATION_ID:undefined});
  const props=find(await h.run('ar-SA'),h.ui);assert.ok(props);
  assert.equal(props.configuredInstallationId,null);assert.equal(props.locale,'en-GB');
});
test('repeated locale query uses its first value consistently with the document',async()=>{
  for(const [query,expected] of [[['pt-BR','en-GB'],'pt-BR'],[['en-GB','pt-BR'],'en-GB'],[[],'en-GB']] as const){
    const h=harness();const props=find(await h.run([...query]),h.ui);
    assert.equal(props?.locale,expected);
  }
});
