import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function fixture() {
  const slots: unknown[]=[],effects:(()=>void)[]=[],requests:boolean[]=[];let cursor=0;
  let reject!: (error:Error)=>void;
  const router={refresh:()=>{}};
  const react={
    useState:(initial:unknown)=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],(value:unknown)=>{slots[i]=value;}];},
    useRef:(initial:unknown)=>{const i=cursor++;return slots[i]??(slots[i]={current:initial});},
    useCallback:(fn:unknown,deps:unknown[])=>{const i=cursor++;const old=slots[i] as {deps:unknown[];fn:unknown}|undefined;if(!old||deps.some((d,n)=>d!==old.deps[n]))slots[i]={deps,fn};return (slots[i] as {fn:unknown}).fn;},
    useEffect:(fn:()=>void,deps:unknown[])=>{const i=cursor++;const old=slots[i] as unknown[]|undefined;if(!old||deps.some((d,n)=>d!==old[n])){slots[i]=deps;effects.push(fn);}},
  };
  const modules:Record<string,unknown>={react,"react/jsx-runtime":{jsx:(type:unknown,props:unknown)=>({type,props}),jsxs:(type:unknown,props:unknown)=>({type,props})},
    "next/navigation":{useRouter:()=>router},
    "@/lib/touchlineFantasy/round-continuity-client":{recoverFantasyRound:({prepare}:{prepare:boolean})=>{requests.push(prepare);return new Promise((_resolve,no)=>{reject=no;});}},
    "@/lib/touchlineFantasy/round-continuity-i18n":{getFantasyContinuityCopy:()=>({})},"../TouchlineGlobalNavigation.module.css":{default:{}},
  };
  const exports:{default?:(props:Record<string,unknown>)=>unknown}={};
  const source=ts.transpileModule(readFileSync(new URL("../components/touchline/fantasy/TouchlineFantasyRoundContinuity.tsx",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  runInNewContext(source,{exports,AbortController,window:{setTimeout:()=>1,clearTimeout:()=>{}},require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  return {requests,reject:()=>reject(new Error("unconfirmed")),render:(startAllowed?:boolean)=>{cursor=0;const result=exports.default!({accountId:"owner",gameweekId:"round",locale:"en-GB",onReady:()=>{},...(startAllowed===undefined?{}:{startAllowed})});while(effects.length)effects.shift()!();return result;}};
}

test("collection readiness delays preparation and readiness churn never repeats an uncertain POST",async()=>{
  const h=fixture();assert.equal(h.render(false),null);h.render(false);assert.deepEqual(h.requests,[]);
  h.render(true);assert.deepEqual(h.requests,[true]);h.render(false);h.render(true);assert.deepEqual(h.requests,[true]);
  h.reject();await new Promise(resolve=>setImmediate(resolve));
  const tree=h.render(true) as {props:{children:unknown[]}};
  const button=tree.props.children[2] as {props:{onClick:()=>void}};button.props.onClick();assert.deepEqual(h.requests,[true,false]);
});

test("nonmarket default preserves automatic preparation and caller gates only collection market",()=>{
  const h=fixture();h.render();assert.deepEqual(h.requests,[true]);
  const caller=readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx",import.meta.url),"utf8");
  assert.match(caller,/startAllowed=\{!collectionEnabled \|\| \(collection\.ready && !collection\.busy && !collection\.hasPending\)\}/);
  assert.match(caller,/if \(roundRecoveryPending && !marketPage\)/);
});
