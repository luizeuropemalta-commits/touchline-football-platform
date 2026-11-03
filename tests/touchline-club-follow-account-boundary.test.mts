import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
type Node={type:unknown;props:Record<string,unknown>};
function fixture(options:{switchAccount?:boolean;invalidRead?:boolean;wrongReceipt?:boolean;deferPermission?:boolean}={}) {
 const hooks:unknown[]=[];let cursor=0;const effects:Array<()=>void|(()=>void)>=[];const cleanups:Array<()=>void>=[];let scheduled=false;
 const writes:RequestInit[]=[],registrations:unknown[]=[],devices:RequestInit[]=[];let releasePermission:()=>void=()=>{};let actualWrites=0;
 const data={accountId:A,settings:{scopes:{clubs:['club']}},channels:{in_app:true,push:false,email:false},frequency:'realtime',quietHours:{enabled:false,start:'22:00',end:'07:00',timezone:'UTC'},explicitConsentAt:null};
 const jsx=(type:unknown,props:Record<string,unknown>)=>({type,props});
 const mods:Record<string,unknown>={react:{useRef:(value:unknown)=>{const i=cursor++;if(!(i in hooks))hooks[i]={current:value};return hooks[i];},useState:(initial:unknown)=>{const i=cursor++;if(!(i in hooks))hooks[i]=initial;return[hooks[i],(v:unknown)=>{hooks[i]=v;}];},useEffect:(effect:()=>void)=>{if(!scheduled)effects.push(effect);}},'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':{Bell:'bell',BellOff:'off',BellRing:'ring'},'./TouchlineClubSocialFeed.module.css':{default:{}},'@/lib/touchlineArena/club-follow-preferences':{setTouchlineClubFollow:(_:unknown,c:string,on:boolean)=>on?[c]:[]},'@/lib/touchlineArena/push-device-registration':{touchlinePushIsConfigured:()=>true,registerTouchlinePushDevice:async(context:unknown)=>{registrations.push(context);return'registered';}}};
 const realRegistration:Record<string,unknown>={};
 const notification={permission:options.deferPermission?'default':'granted',requestPermission:()=>new Promise<string>(resolve=>{releasePermission=()=>{notification.permission='granted';resolve('granted');};})};
 const publicKey='AAAAAAAAAAAAAAAAAAAAAA';
 const browser={Notification:notification,PushManager:{},localStorage:{getItem:()=>A,setItem:()=>{}}};
 const registrationSource=ts.transpileModule(readFileSync(new URL('../lib/touchlineArena/push-device-registration.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const worker={pushManager:{getSubscription:async()=>({options:{applicationServerKey:Uint8Array.from(atob(publicKey),c=>c.charCodeAt(0)).buffer},toJSON:()=>({endpoint:'https://push.invalid/device',keys:{p256dh:'test',auth:'test'}})})}};
 new Function('exports','window','navigator','Notification','process','fetch',registrationSource)(realRegistration,browser,{serviceWorker:{register:async()=>worker,ready:Promise.resolve(worker)}},notification,{env:{NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY:publicKey}},async(_url:string,init:RequestInit)=>{devices.push(init);return{ok:!options.switchAccount,json:async()=>({ok:!options.switchAccount,delivery:'not-sent',accountId:A,installationId:A})};});
 mods['@/lib/touchlineArena/push-device-registration']={...realRegistration,registerTouchlinePushDevice:async(context:unknown)=>{registrations.push(context);return(realRegistration.registerTouchlinePushDevice as(c:unknown)=>Promise<string>)(context);}};
 const exp={} as {default:(p:unknown)=>Node};
 const compiled=ts.transpileModule(readFileSync(new URL('../components/touchline/club-social/TouchlineClubFollowButton.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports','fetch','window','Notification',compiled)((id:string)=>{assert.ok(Object.hasOwn(mods,id),id);return mods[id];},exp,async(_url:string,init:RequestInit={})=>{
  if(init.method!=='PUT') return {ok:true,status:200,json:async()=>({ok:true,data:{...data,...(options.invalidRead?{accountId:undefined}:{})}})};
  writes.push(init);const expected=new Headers(init.headers).get('X-Touchline-Expected-Account');
  if(options.switchAccount && expected !== null && expected!==B) return {ok:false,status:409,json:async()=>({ok:false})};
  actualWrites++;return{ok:true,status:200,json:async()=>({ok:true,data:{...data,accountId:options.wrongReceipt?B:A,channels:{...data.channels,push:true}}})};
 },browser,notification);
 const render=()=>{cursor=0;const n=exp.default({clubId:'club',clubName:'Club',locale:'pt-BR'});scheduled=true;return n;};
 const nodes=(n:unknown):Node[]=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n as Node,...nodes((n as Node).props?.children)];
 return{render,nodes,writes,registrations,devices,releasePermission:()=>releasePermission(),unmount:()=>cleanups.forEach(f=>f()),actualWrites:()=>actualWrites,load:async()=>{render();effects.forEach(f=>{const cleanup=f();if(cleanup)cleanups.push(cleanup);});for(let i=0;i<8;i++)await Promise.resolve();}};
}
test('club alerts bind follow writes to the verified account from preferences',async()=>{
 const f=fixture();await f.load();const button=f.nodes(f.render()).find(n=>n.type==='button')!;await(button.props.onClick as()=>Promise<void>)();
 assert.equal(new Headers(f.writes[0].headers).get('X-Touchline-Expected-Account'),A);
});
test('club push registration and consent remain bound to the same read account',async()=>{
 const f=fixture();await f.load();const buttons=f.nodes(f.render()).filter(n=>n.type==='button');await(buttons[1].props.onClick as()=>Promise<void>)();
 assert.equal(f.devices.length,1);
 assert.equal(new Headers(f.devices[0].headers).get('X-Touchline-Expected-Account'),A);
 assert.equal((f.registrations[0] as {expectedAccountId:string})?.expectedAccountId,A);
 assert.equal(new Headers(f.writes[0].headers).get('X-Touchline-Expected-Account'),A);
});
test('invalid identity never permits a follow write; mismatched save cannot show success',async()=>{
 const invalid=fixture({invalidRead:true});await invalid.load();await(invalid.nodes(invalid.render()).find(n=>n.type==='button')!.props.onClick as()=>Promise<void>)();assert.equal(invalid.writes.length,0);
 const wrong=fixture({wrongReceipt:true});await wrong.load();await(wrong.nodes(wrong.render()).find(n=>n.type==='button')!.props.onClick as()=>Promise<void>)();assert.ok(!JSON.stringify(wrong.render()).includes('preferência removida'));
});
test('session changed after read is rejected by server account condition without writing B',async()=>{
 const f=fixture({switchAccount:true});await f.load();await(f.nodes(f.render()).find(n=>n.type==='button')!.props.onClick as()=>Promise<void>)();assert.equal(f.actualWrites(),0);assert.equal(new Headers(f.writes[0].headers).get('X-Touchline-Expected-Account'),A);
});

test('unmount during permission prompt prevents registration and consent writes',async()=>{
 const f=fixture({deferPermission:true});await f.load();const buttons=f.nodes(f.render()).filter(n=>n.type==='button');const pending=(buttons[1].props.onClick as()=>Promise<void>)();f.unmount();f.releasePermission();await pending;assert.equal(f.devices.length,0);assert.equal(f.writes.length,0);
});
test('real device registration rejects changed account before consent write',async()=>{
 const f=fixture({switchAccount:true});await f.load();const buttons=f.nodes(f.render()).filter(n=>n.type==='button');await(buttons[1].props.onClick as()=>Promise<void>)();assert.equal(f.devices.length,1);assert.equal(f.writes.length,0);assert.equal(f.actualWrites(),0);
});
