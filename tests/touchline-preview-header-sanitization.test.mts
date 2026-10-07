import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as rootLocale from '../lib/touchlineArena/root-locale.ts';
import * as authLocale from '../lib/touchlineArena/auth-i18n.ts';
import {TOUCHLINE_ISOLATED_PREVIEW_HEADER} from '../lib/touchlinePreview/isolation.ts';

const source=readFileSync(new URL('../proxy.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('proxy.ts',source,ts.ScriptTarget.Latest,true);
const names=['matchesRoute','hasProtectedAuthReturn','requestLocale','isolatedPreviewResponse','applyIsolatedPreviewHeaders','nextResponseWithPresentationLocale'];
const functions=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text??''));
assert.equal(functions.length,names.length);
type PreviewResponse = { status: number; headers: Headers; forwardedHeaders: Headers };
type PreviewHandler = (input: ReturnType<typeof request>) => PreviewResponse;
const exports = {} as { isolatedPreviewResponse: PreviewHandler; nextResponseWithPresentationLocale: PreviewHandler };
runInNewContext(ts.transpileModule(functions.map(node=>node.getText(ast)).join('\n')+'\nexport {isolatedPreviewResponse,nextResponseWithPresentationLocale};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports,Headers,...rootLocale,...authLocale,TOUCHLINE_ISOLATED_PREVIEW_HEADER,
  NextResponse:{next:({request}:{request:{headers:Headers}})=>({status:200,headers:new Headers(),forwardedHeaders:request.headers})},
});
function request(path:string,lang:string,injected:string) {
  return {nextUrl:new URL(`https://preview.example${path}?lang=${encodeURIComponent(lang)}`),headers:new Headers({
    [rootLocale.TOUCHLINE_LOGIN_PRESENTATION_LOCALE_HEADER]:injected,
    [rootLocale.TOUCHLINE_PRESENTATION_LOCALE_HEADER]:'ar-SA',
    [TOUCHLINE_ISOLATED_PREVIEW_HEADER]:'attacker-controlled',
    'x-preserve-test':'ordinary-header',
  })};
}

test('isolated preview drops client-supplied login draft headers before forwarding while preserving inert policy',()=>{
  for(const injected of ['ar-SA','pt-BR','fr-FR','untrusted']) for(const [lang,expected] of [['en-GB','en-GB'],['pt-BR','pt-BR'],['ar-SA','en-GB'],['unknown','en-GB']]) {
    const input=request('/preview',lang,injected);
    const result=exports.isolatedPreviewResponse(input);
    assert.equal(result.forwardedHeaders.has(rootLocale.TOUCHLINE_LOGIN_PRESENTATION_LOCALE_HEADER),false);
    assert.equal(result.forwardedHeaders.get(rootLocale.TOUCHLINE_PRESENTATION_LOCALE_HEADER),expected);
    assert.equal(result.forwardedHeaders.get(TOUCHLINE_ISOLATED_PREVIEW_HEADER),'true');
    assert.equal(result.forwardedHeaders.get('x-preserve-test'),'ordinary-header');
    assert.equal(input.headers.get(rootLocale.TOUCHLINE_LOGIN_PRESENTATION_LOCALE_HEADER),injected,'do not mutate original request');
    assert.equal(result.status,200);
    assert.equal(result.headers.get('cache-control'),'no-store, no-cache, must-revalidate');
    assert.equal(result.headers.get('x-robots-tag'),'noindex, nofollow, noarchive, nosnippet');
    assert.equal(result.headers.get('x-touchline-preview'),'isolated');
    assert.equal(result.headers.get('content-security-policy'),"default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
  }
});

test('ordinary requests stay sanitized and only real login draft URL may reconstruct login presentation header',()=>{
  const ordinary=exports.nextResponseWithPresentationLocale(request('/clubowner','en-GB','ar-SA'));
  assert.equal(ordinary.forwardedHeaders.has(rootLocale.TOUCHLINE_LOGIN_PRESENTATION_LOCALE_HEADER),false);
  const login=exports.nextResponseWithPresentationLocale(request('/login','ar-SA','fr-FR'));
  assert.equal(login.forwardedHeaders.get(rootLocale.TOUCHLINE_LOGIN_PRESENTATION_LOCALE_HEADER),'ar-SA');
  const approved=exports.nextResponseWithPresentationLocale(request('/login','en-GB','ar-SA'));
  assert.equal(approved.forwardedHeaders.has(rootLocale.TOUCHLINE_LOGIN_PRESENTATION_LOCALE_HEADER),false);
});
