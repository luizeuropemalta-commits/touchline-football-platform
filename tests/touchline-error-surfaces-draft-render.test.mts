import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import * as resolver from '../lib/touchlineArena/catalogue-locale.ts';
import * as copy from '../lib/touchlineArena/public-error-i18n.ts';
const surfaces=[['app/error.tsx','ErrorBoundaryContent','error'],['app/global-error.tsx','GlobalErrorContent','error'],['components/touchline/TouchlineNotFound.tsx','NotFoundContent','notFound']] as const;
type CapturedProps = Record<string, unknown> & { children?: React.ReactNode; onClick?: () => void };
type Element = React.ReactElement<CapturedProps>;
type Renderer = (props: CapturedProps) => Element;
function harness(path:string,internal:string,locale:string,server=false) {
  const effects:Array<()=>void>=[];const reports:unknown[]=[];const nav:CapturedProps[]=[];
  const modules:Record<string,unknown>={
    react:{useSyncExternalStore:(_subscribe:unknown,client:()=>unknown,ssr:()=>unknown)=>server?ssr():client(),useEffect:(effect:()=>void)=>effects.push(effect)},
    'react/jsx-runtime':jsx,'@/lib/touchlineArena/catalogue-locale':resolver,'@/lib/touchlineArena/public-error-i18n':copy,
    '@sentry/nextjs':{captureException:(error:unknown)=>reports.push(error)},
    'next/error':{default:({title,statusCode}:{title:string;statusCode:number})=>React.createElement('h1',{'data-status':statusCode},title)},
    'next/navigation':{useSearchParams:()=>new URLSearchParams({lang:locale})},
    'lucide-react':{SearchX:()=>null,Shield:()=>null},
    './TouchlineGlobalNavigation':{default:(props:CapturedProps)=>{nav.push(props);return null;}},
  };
  const exports={} as {default:Renderer;isolated:Renderer};
  const source=readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source+`\nexport {${internal} as isolated};`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
    exports,URLSearchParams,window:{location:{search:`?lang=${locale}`}},require(name:string){assert.ok(name in modules,name);return modules[name];},
  });
  return {exports,effects,reports,nav};
}
function find(node:React.ReactNode,type:unknown):Element[] {
  if(Array.isArray(node))return node.flatMap(child=>find(child,type));
  if(!React.isValidElement(node))return [];
  const element=node as Element;
  return [...(element.type===type?[element]:[]),...find(element.props.children,type)];
}

for(const [path,internal,group] of surfaces) test(`${path}: actual content selects eight explicit drafts; public entry stays closed and private error stays private`,()=>{
  for(const locale of ['en-GB','pt-BR','es-ES','it-IT','fr-FR','ar-SA','tr-TR','de-DE']) for(const draft of [false,true]) {
    const h=harness(path,internal,locale);let resets=0;
    const error=Object.assign(Error('PRIVATE_DETAIL_987'),{digest:'PRIVATE_DIGEST_654'});
    const props={error,reset:()=>resets++,draftLocalesEnabled:true};
    const wrapper=h.exports.default(props);
    assert.equal(wrapper.props.draftLocalesEnabled,undefined,'public boundary must ignore injected draft prop');
    assert.equal(typeof wrapper.type,'function');
    const tree=draft?h.exports.isolated({...props,draftLocalesEnabled:true}):(wrapper.type as Renderer)(wrapper.props);
    const html=renderToStaticMarkup(tree);
    const expected=copy.getTouchlinePublicErrorCopy(locale,draft)[group].title;
    const encoded=renderToStaticMarkup(React.createElement('h1',null,expected)).slice(4,-5);
    assert.ok(html.includes(encoded));assert.ok(html.includes('dir="ltr"'));
    assert.ok(!html.includes('PRIVATE_DETAIL'));assert.ok(!html.includes('PRIVATE_DIGEST'));
    if(path==='app/error.tsx') {const click=find(tree,'button')[0].props.onClick;assert.ok(click);click();assert.equal(resets,1);}
    if(path==='app/global-error.tsx') {
      assert.equal(h.effects.length,1);h.effects[0]();assert.equal(h.reports[0],error);assert.ok(html.includes('data-status="0"'));
    }
    if(group==='notFound') {assert.equal(h.nav.length,1);assert.equal(h.nav[0].draftLocalesEnabled,draft);assert.equal(h.nav[0].locale,resolver.resolveTouchlineCatalogueLocale(locale,draft));}
  }
});

test('error surfaces retain stable English server snapshots before client locale restoration',()=>{
  for(const [path,internal] of surfaces.slice(0,2)) {
    const h=harness(path,internal,'ar-SA',true);
    const tree=h.exports.isolated({error:Error('private'),reset:()=>{},draftLocalesEnabled:true});
    assert.ok(renderToStaticMarkup(tree).includes(copy.getTouchlinePublicErrorCopy('en-GB').error.title));
  }
});
