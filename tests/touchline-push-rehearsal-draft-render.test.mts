import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';

const siteLocaleEnv: Record<string, string | undefined> = {};
const siteLocalePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: siteLocalePolicy, process: { env: siteLocaleEnv } });
import * as copy from '../lib/touchlineArena/push-rehearsal-i18n.ts';
import * as resolver from '../lib/touchlineArena/catalogue-locale.ts';
const account='11111111-1111-4111-8111-111111111111';
const installation='22222222-2222-4222-8222-222222222222';
const locales=['en-GB','pt-BR','es-ES','it-IT','fr-FR','ar-SA','tr-TR','de-DE'];
type ControlProps={accountId:string;configuredInstallationId:string;locale:string;draftLocalesEnabled:boolean};
type PageProps={searchParams:Promise<{lang:string}>};
type PageTree=React.ReactElement<{dir:string;children:React.ReactNode}>;
type PageModule={default:(props:PageProps)=>Promise<PageTree>;isolated:(props:PageProps,draft:boolean)=>Promise<PageTree>};
function load<T>(path:string,modules:Record<string,unknown>,globals:Record<string,unknown>={},tail=''):T {
  modules["@/lib/touchlineArena/site-locales-release"] = siteLocalePolicy;
  const exports:Record<string,unknown>={};
  runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),'utf8')+tail,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,...globals,require(name:string){if(name==='react/jsx-runtime')return jsx;assert.ok(name in modules,name);return modules[name];}});
  return exports as T;
}
const escape=(text:string)=>renderToStaticMarkup(React.createElement('span',null,text)).slice(6,-7);
test('real component renders all thirteen phase states in eight languages without performing side effects',()=>{
  for(const locale of locales)for(const draft of [false,true])for(const phase of ['idle','preparing','ready','registered-disabled','sending','accepted','unconfirmed','blocked','permission','unsupported','unconfigured','storage','previous']) {
    let effects=0;
    const fail=()=>assert.fail('presentation render must not operate registration, permission, auth or send');
    const Component=load<{default:(props:ControlProps)=>React.ReactElement}>('components/touchline/notifications/TouchlinePushRehearsal.tsx',{
      react:{useId:()=>':test:',useRef:()=>({current:null}),useState:()=>[{key:`${account}:${installation}`,phase,consent:false},fail],useLayoutEffect:()=>effects++},
      '@/lib/supabase/client':{createClient:fail},
      '@/lib/touchlineArena/push-device-registration':{registerTouchlinePushDeviceForRehearsal:fail,touchlinePushIsConfigured:fail},
      '@/lib/touchlineArena/push-rehearsal-attempt':{createPushRehearsalAttempt:fail},
      '@/components/touchline/TouchlineGlobalNavigation.module.css':{default:{link:'canonical-control'}},
      '@/lib/touchlineArena/push-rehearsal-i18n':copy,
    }).default;
    const tree=Component({accountId:account,configuredInstallationId:installation,locale,draftLocalesEnabled:draft});
    const html=renderToStaticMarkup(tree);
    const expected=copy.getTouchlinePushRehearsalCopy(locale,draft);
    assert.ok(html.includes(escape(expected[phase as keyof typeof expected])));
    assert.ok(html.includes(escape(expected.title)));
    assert.ok(html.includes('role="status"'));assert.equal(effects,1,'effect registered but not executed by this render harness');
    if(['ready','sending','accepted','previous'].includes(phase)) {assert.ok(html.includes(escape(expected.consent)));assert.ok(html.includes('type="checkbox"'));}
    else assert.ok(!html.includes('type="checkbox"'));
  }
});
test('real admitted page defaults closed and explicit presentation preserves exact account/installation; production stays denied',async()=>{
  let reads=0;const Child=()=>null;
  const env:Record<string,string>={TOUCHLINE_PUSH_REHEARSAL_ENABLED:'true',TOUCHLINE_PUSH_REHEARSAL_ACCOUNT_ID:account,TOUCHLINE_PUSH_REHEARSAL_INSTALLATION_ID:installation,TOUCHLINE_PUSH_REHEARSAL_ORIGIN:'https://qa.example',VERCEL_ENV:'preview',NEXT_PUBLIC_SUPABASE_URL:'https://xgxbwqxjssxxuihuwmgy.supabase.co'};
  const page=load<PageModule>('app/notifications/rehearsal/page.tsx',{
    'next/headers':{headers:async()=>new Headers({host:'qa.example'})},'next/navigation':{notFound:()=>{throw Error('not-found');}},
    '@/components/touchline/notifications/TouchlinePushRehearsal':{default:Child},
    '@/lib/touchlineArena/account-locale-context-server':{loadAccountLocaleContext:async()=>{reads++;return {mode:'account',accountId:account};}},
    '@/lib/touchlineArena/catalogue-locale':resolver,'@/lib/touchlineArena/push-rehearsal-i18n':copy,
  },{process:{env},URL},'\nexport {renderPushRehearsalPage as isolated};');
  for(const locale of locales)for(const draft of [false,true]) {
    const before=reads,props={searchParams:Promise.resolve({lang:locale})};
    const tree=draft?await page.isolated(props,true):await page.default(props);
    assert.equal(tree.props.dir,'ltr');assert.equal(reads,before+1);
    const child=React.Children.toArray(tree.props.children).find((node):node is React.ReactElement<ControlProps>=>React.isValidElement<ControlProps>(node)&&node.type===Child)!;
    assert.equal(child.props.accountId,account);assert.equal(child.props.configuredInstallationId,installation);
    assert.equal(child.props.draftLocalesEnabled,draft);assert.equal(child.props.locale,resolver.resolveTouchlineCatalogueLocale(locale,draft));
    assert.ok(renderToStaticMarkup(tree).includes(escape(copy.getTouchlinePushRehearsalCopy(locale,draft).pageTitle)));
  }
  env.VERCEL_ENV='production';const before=reads;
  await assert.rejects(page.isolated({searchParams:Promise.resolve({lang:'ar-SA'})},true),/not-found/);assert.equal(reads,before);
});
