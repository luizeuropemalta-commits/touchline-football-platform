import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import * as i18n from '../lib/touchlineArena/i18n.ts';
import * as copy from '../lib/touchlineArena/account-locale-menu-i18n.ts';
import {startAccountLocaleBrowser} from '../lib/touchlineArena/account-locale-browser.ts';
import {createAccountLocaleSelection} from '../lib/touchlineArena/account-locale-selection.ts';
import * as intent from '../lib/touchlineArena/presentation-locale-intent.ts';

const account='11111111-1111-4111-8111-111111111111';
const locales=i18n.TOUCHLINE_APPROVED_LOCALES.map(entry=>entry.code);
const settle=async()=>{for(let n=0;n<60;n++)await Promise.resolve();};
type Element={type:unknown;props:Record<string,unknown>};
function nodes(tree:unknown,type:string):Element[]{
  if(Array.isArray(tree))return tree.flatMap(entry=>nodes(entry,type));
  if(!tree||typeof tree!=='object'||!('props'in tree))return [];
  const element=tree as Element;
  return [...(element.type===type?[element]:[]),...nodes(element.props.children,type)];
}
function harness(locale:string,draftLocalesEnabled:boolean,savedLocale:string|null=null,variant='menu'){
  let cursor=0,mounted=false,effect:(()=>()=>void)|undefined;
  const slots:unknown[]=[],requests:RequestInit[]=[],navigations:string[]=[];
  const session=new Map<string,string>();
  const document={cookie:''};
  const storage={getItem:(key:string)=>session.get(key)??null,setItem:(key:string,value:string)=>{session.set(key,value);},removeItem:(key:string)=>{session.delete(key);}};
  const browserWindow={location:{href:`https://test.invalid/live?fixture=123&lang=${locale}#events`,assign:(href:string)=>navigations.push(href)},localStorage:storage,sessionStorage:storage};
  let observer:((event:string,session:{user:{id:string}}|null)=>void)|undefined;
  const source=readFileSync(new URL('../components/touchline/AccountLocaleMenu.tsx',import.meta.url),'utf8');
  // Real intent module evaluated against this tab's storage, not a fake locale oracle.
  const intentExports:Record<string,unknown>={};
  const storageSource=readFileSync(new URL('../lib/touchlineArena/browser-storage.ts',import.meta.url),'utf8');
  const storageExports:Record<string,unknown>={};
  const compile=(text:string)=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  runInNewContext(compile(storageSource),{exports:storageExports,window:browserWindow});
  runInNewContext(compile(readFileSync(new URL('../lib/touchlineArena/presentation-locale-intent.ts',import.meta.url),'utf8')),{exports:intentExports,require:(name:string)=>{assert.ok(name==='./browser-storage.ts'||name==='./i18n.ts');return name==='./i18n.ts'?i18n:storageExports;}});
  const modules:Record<string,unknown>={
    react:{useState:(initial:unknown)=>{const index=cursor++;if(!(index in slots))slots[index]=initial;return [slots[index],(value:unknown)=>{slots[index]=value;}];},useRef:(initial:unknown)=>{const index=cursor++;if(!(index in slots))slots[index]={current:initial};return slots[index];},useLayoutEffect:(callback:()=>()=>void)=>{if(!mounted)effect=callback;}},
    'react/jsx-runtime':jsx,'next/navigation':{useRouter:()=>({refresh:()=>{}})},
    'lucide-react':{Check:()=>null,ChevronDown:()=>null,Languages:()=>null},
    '@/lib/supabase/client':{createClient:()=>({auth:{onAuthStateChange:(callback:typeof observer)=>{observer=callback;return {data:{subscription:{unsubscribe:()=>{observer=undefined;}}}};}}})},
    '@/lib/touchlineArena/account-locale-browser':{startAccountLocaleBrowser},
    '@/lib/touchlineArena/i18n':i18n,'@/lib/touchlineArena/account-locale-menu-i18n':copy,
    '@/lib/touchlineArena/presentation-locale-intent':intentExports,
  };
  const exports={} as {default:(props:unknown)=>Element};
  runInNewContext(compile(source),{exports,URL,window:browserWindow,document,queueMicrotask,
    fetch:async(_url:string,init:RequestInit)=>{requests.push(init);return init.method==='GET'?Response.json({ok:true,data:{accountId:account,gameLocale:savedLocale,gameLocaleRevision:'4'}}):Response.json({ok:true,data:{gameLocale:JSON.parse(String(init.body)).locale,gameLocaleRevision:'5',updatedAt:'2026-10-04T00:00:00Z'}});},
    require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  function render(){cursor=0;return exports.default({context:{mode:'account',accountId:account},locale,menuClassName:'menu',panelClassName:'panel',variant,draftLocalesEnabled});}
  render();const cleanup=effect!();mounted=true;
  return {render,cleanup,requests,navigations,document,session,intent:intentExports as typeof intent,
    invalidate:()=>observer?.('SIGNED_OUT',null),
    click(code:string){const anchor=nodes(render(),'a').find(node=>String(node.props.href).includes(`lang=${code}`));assert.ok(anchor);(anchor.props.onClick as (event:unknown)=>void)({button:0,defaultPrevented:false,currentTarget:{href:anchor.props.href},preventDefault(){}});}};
}

test('real menu/browser/host/controller select eight only under opt-in, preserving CAS payload and confirmation before navigation',async()=>{
  for(const locale of locales)for(const draft of [false,true]){
    const h=harness(locale,draft);
    try{
      await settle();
      const expected=draft?locales:['en-GB','pt-BR'];
      assert.deepEqual(nodes(h.render(),'a').map(node=>new URL(String(node.props.href),'https://test.invalid').searchParams.get('lang')),expected);
      assert.equal(nodes(h.render(),'summary')[0].props['aria-label'],copy.getTouchlineAccountLocaleMenuCopy(locale,draft).language);
      if(expected.includes(locale)){
        h.click(locale);assert.equal(h.navigations.length,0);await settle();
        assert.equal(h.requests.length,2);
        assert.deepEqual(JSON.parse(String(h.requests[1].body)),{action:'set_game_locale',locale,expectedRevision:'4'});
        assert.equal(new Headers(h.requests[1].headers).get('X-Touchline-Expected-Account'),account);
        assert.deepEqual(h.navigations,[]);
        assert.ok(h.document.cookie.includes(locale));
        assert.equal(h.intent.readTouchlinePresentationLocaleIntent(draft),locale);
        // Same-URL confirmation persists without a redundant navigation.
      }else assert.equal(h.requests.length,1);
    }finally{h.cleanup();}
  }
});

test('account restoration supports eight only with opt-in; no restoration PUT; invalidation fences later selection',async()=>{
  for(const locale of locales)for(const draft of [false,true]){
    const h=harness('en-GB',draft,locale);
    try{
      await settle();const permitted=draft||locale==='en-GB'||locale==='pt-BR';
      assert.equal(h.navigations.length,permitted&&locale!=='en-GB'?1:0);
      if(permitted)assert.ok(h.document.cookie.includes(locale));else assert.equal(h.document.cookie,'');
      assert.equal(h.requests.length,1);
      h.invalidate();await settle();h.click('pt-BR');await settle();assert.equal(h.requests.length,1);
    }finally{h.cleanup();}
  }
});

test('explicit draft choice navigates only after confirmation and replaces older tab intent',async()=>{
  const h=harness('en-GB',true);
  try{
    h.intent.rememberTouchlinePresentationLocaleIntent('pt-BR');await settle();
    h.click('ar-SA');assert.deepEqual(h.navigations,[]);await settle();
    assert.deepEqual(h.navigations,['https://test.invalid/live?fixture=123&lang=ar-SA#events']);
    assert.equal(h.intent.readTouchlinePresentationLocaleIntent(true),'ar-SA');
    assert.equal(h.intent.readTouchlinePresentationLocaleIntent(),null);
    assert.equal(h.requests.length,2);
  }finally{h.cleanup();}
});

test('select variant retains public PT/EN order and opt-in eight; intent drops no newer approved draft',async()=>{
  for(const draft of [false,true]){
    const h=harness('ar-SA',draft,null,'select');
    try{
      await settle();assert.deepEqual(nodes(h.render(),'option').map(node=>node.props.value),draft?locales:['pt-BR','en-GB']);
      assert.equal(h.intent.rememberTouchlinePresentationLocaleIntent('ar-SA',draft),draft);
      assert.equal(h.intent.readTouchlinePresentationLocaleIntent(draft),draft?'ar-SA':null);
      assert.equal(h.intent.readTouchlinePresentationLocaleIntent(),null);
      assert.equal(h.intent.rememberTouchlinePresentationLocaleIntent('__proto__',true),false);
    }finally{h.cleanup();}
  }
});

test('controller rejects invalid/draft public inputs before transport and never grants consent',async()=>{
  for(const draft of [false,true]){
    const calls:unknown[]=[];
    const controller=createAccountLocaleSelection({mode:'guest',draftLocalesEnabled:draft,request:async()=>assert.fail('guest never requests'),apply:locale=>calls.push(locale)});
    for(const invalid of [null,'__proto__','ar','AR-SA',{},undefined])assert.equal(await controller.select(invalid),'invalid');
    assert.equal(await controller.select('ar-SA'),draft?'local':'invalid');
    assert.deepEqual(calls,draft?['ar-SA']:[]);
  }
});
