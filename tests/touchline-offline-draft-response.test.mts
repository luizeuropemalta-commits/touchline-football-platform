import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {resolveTouchlineCatalogueLocale} from '../lib/touchlineArena/catalogue-locale.ts';
import {getTouchlinePublicErrorCopy} from '../lib/touchlineArena/public-error-i18n.ts';

const source=readFileSync(new URL('../proxy.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('proxy.ts',source,ts.ScriptTarget.Latest,true);
const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='offlineResponse') as ts.FunctionDeclaration;
assert.ok(fn);
function fixture(getCopy=getTouchlinePublicErrorCopy) {
  const exports:Record<string,unknown>={};
  runInNewContext(ts.transpileModule(fn.getText(ast)+'\nexport {offlineResponse};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports,resolveTouchlineCatalogueLocale,getTouchlinePublicErrorCopy:getCopy,
    // Only the framework HTTP constructor is substituted; the response body,
    // status, headers, resolver and catalogues are the real implementation.
    NextResponse:class extends Response {},
  });
  return exports.offlineResponse as (locale:string,draft?:boolean)=>Response;
}
const expected={
  'en-GB':{title:'TouchLine — Temporarily unavailable',description:'The Arena is temporarily unavailable. Please try again shortly.',statusLabel:'Please try again shortly'},
  'pt-BR':{title:'TouchLine — Temporariamente indisponível',description:'A Arena está temporariamente indisponível. Tente novamente em instantes.',statusLabel:'Tente novamente em instantes'},
};

test('offline real response keeps exact EN/PT and gated defaults; all eight explicit catalogues preserve 503 and physical layout',async()=>{
  const response=fixture();
  for(const locale of ['en-GB','pt-BR','es-ES','it-IT','fr-FR','ar-SA','tr-TR','de-DE']) for(const draft of [false,true]) {
    const result=response(locale,draft);const html=await result.text();
    const effective=resolveTouchlineCatalogueLocale(locale,draft);
    assert.equal(result.status,503);
    assert.equal(result.headers.get('content-type'),'text/html; charset=utf-8');
    assert.equal(result.headers.get('cache-control'),'no-store, no-cache, must-revalidate');
    assert.equal(result.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
    assert.ok(html.includes(`<html lang="${effective}" dir="ltr">`));
    const copy=getTouchlinePublicErrorCopy(locale,draft).offline;
    for(const value of Object.values(copy)) assert.ok(html.includes(value));
    if(effective==='en-GB'||effective==='pt-BR') assert.deepEqual(copy,expected[effective]);
    assert.ok(html.includes('<small>Private build</small>'));
    assert.ok(html.includes('<h1>TouchLine Arena</h1>'));
    assert.ok(html.includes('/touchlineArena/brand/tl-shield-lime.png'));
    assert.ok(html.includes('/touchlineArena/arena/touchline-arena-poster-20260722.jpg'));
  }
  for(const hostile of ['<script>alert(1)</script>','__proto__','pt','ar']) {
    const html=await response(hostile,true).text();
    assert.ok(html.includes('<html lang="en-GB" dir="ltr">'));
    assert.ok(!html.includes(hostile==='pt'?'lang="pt"':hostile==='ar'?'lang="ar"':hostile));
  }
});

test('catalogue strings are escaped before raw HTML construction',async()=>{
  const hostile=`<script>"'&`;
  const response=fixture((locale,draft)=>({...getTouchlinePublicErrorCopy(locale,draft),offline:{title:hostile,description:hostile,statusLabel:hostile}}));
  const html=await response('ar-SA',true).text();
  assert.equal((html.match(/&lt;script&gt;&quot;&#39;&amp;/g)||[]).length,3);
  assert.ok(!html.includes(hostile));
});

test('offline opt-in is internal only; emergency auth/admin policies and response protocol stay unchanged',()=>{
  assert.equal(fn.parameters[1].initializer?.getText(ast),'false');
  const calls:ts.CallExpression[]=[];
  function visit(node:ts.Node) {if(ts.isCallExpression(node)&&node.expression.getText(ast)==='offlineResponse')calls.push(node);node.forEachChild(visit);}
  visit(ast);assert.equal(calls.length,2);
  for(const call of calls) {
    assert.equal(call.arguments.length,2);
    assert.equal(call.arguments[0].getText(ast),'requestLocale(request, draftLocalesEnabled)');
    assert.equal(call.arguments[1].getText(ast),'draftLocalesEnabled');
  }
  // Both callers receive the same trusted, default-OFF presentation seam.
  const handler=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='handleTouchLineRequest') as ts.FunctionDeclaration;
  assert.ok(handler);
  assert.equal(handler.parameters[1].initializer?.getText(ast),'false');
  assert.match(source,/const isEmergencyOffline = siteOffline && !isVercelHost/);
  assert.match(source,/if \(isEmergencyOffline && !isProtectedArenaRoute && !isAuth\)/);
  assert.match(source,/if \(isEmergencyOffline && user && !isAdmin && !isAuth\) return offlineResponse/);
  const body=fn.body!.getText(ast);
  assert.doesNotMatch(body,/fetch\(|cookies|redirect\(|requestPermission|serviceWorker/);
  assert.equal((body.match(/status: 503/g)||[]).length,1);
});
