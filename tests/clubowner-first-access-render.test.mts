import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {getTouchLineDiscoveryRegistrationCopy} from '../lib/touchlineArena/auth-i18n.ts';
import * as contract from '../lib/touchlineArena/clubowner-public-contract.ts';
const require=createRequire(import.meta.url),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
test('first-access renders existing smoky dialog with explicit empty public name and disclosure in both locales',()=>{
 for(const locale of ['pt-BR','en-GB']){
 let stateCalls=0;const exports:Record<string,unknown>={};
 const styles=new Proxy({},{get:(_,key)=>String(key)});
 const mocks:Record<string,unknown>={
 react:{...React,useEffect:()=>{},useState:(initial:unknown)=>React.useState(stateCalls++===0?true:initial)},
 'react/jsx-runtime':require('react/jsx-runtime'),'react-dom':{createPortal:(node:unknown)=>node},
 'next/navigation':{useRouter:()=>({refresh:()=>{}})},'lucide-react':{X:()=>React.createElement('span')},
 '@/lib/touchlineArena/auth-i18n':{getTouchLineDiscoveryRegistrationCopy},
 '@/lib/touchlineArena/clubowner-public-contract':contract,
 '../a11y/TouchlineDialog':{useTouchlineDialog:({label}:{label:string})=>({dialogProps:{role:'dialog','aria-label':label}}),useTouchlineDialogScrollLock:()=>{}},
 './usePublicOwnersRequest':{usePublicOwnersRequest:()=>({alive:()=>true,request:()=>assert.fail('render must not write')})},
 };
 const source=readFileSync(new URL('../components/touchline/social/ClubOwnerDiscoveryOnboarding.tsx',import.meta.url),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,document:{body:{}},require:(name:string)=>name.endsWith('.css')?{__esModule:true,default:styles}:mocks[name]});
 const html=renderToStaticMarkup(React.createElement(exports.default,{locale}));
 assert.doesNotMatch(html,/first-access-handle|@username/);assert.match(html,/role="dialog"/);assert.match(html,/class="overlay"/);assert.match(html,/autoComplete="nickname"/);assert.match(html,/value=""/);assert.match(html,/first-access-disclosure/);
 assert.ok(html.includes(getTouchLineDiscoveryRegistrationCopy(locale).notice.replaceAll('&','&amp;')));
 assert.doesNotMatch(html,/type="email"|Public ID|publicId|full_name/);
 }
});
test('ClubOwner integration distinguishes confirmed absence from failure/private profile and keeps recovery independent',()=>{
 const source=readFileSync(new URL('../app/clubowner/page.tsx',import.meta.url),'utf8');
 assert.match(source,/publicDiscoveryEnabled && publicProfile && !publicProfile\.error && publicProfile\.data === null/);
 assert.match(source,/<ClubOwnerDiscoveryOnboarding key=\{user\.id\}/);
 const component=readFileSync(new URL('../components/touchline/social/ClubOwnerDiscoveryOnboarding.tsx',import.meta.url),'utf8');
 assert.match(component,/useTouchlineDialogScrollLock\(true\)/);assert.match(component,/intentVersion:1/);
 assert.match(component,/io\.request\("\/api\/account\/public-profile"\)/);
});
