import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {NextRequest,NextResponse} from 'next/server.js';
import * as hosts from '../lib/server/touchline-host-routing.ts';
import * as origin from '../lib/touchlineArena/public-origin.ts';
import * as auth from '../lib/touchlineArena/auth-i18n.ts';
import * as access from '../lib/touchlineArena/auth-access.ts';
import * as locale from '../lib/touchlineArena/root-locale.ts';
import * as resolver from '../lib/touchlineArena/catalogue-locale.ts';
import * as errors from '../lib/touchlineArena/public-error-i18n.ts';

type Handler=(request:NextRequest,draft?:boolean)=>Promise<NextResponse>;
function harness(releaseFlag?: string, failPolicy = false){
  let reads=0;
  const env = {NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic', TOUCHLINE_SITE_LOCALES_ENABLED: releaseFlag};
  const policy = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/touchlineArena/site-locales-release.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {exports:policy,process:{env}});
  const modules:Record<string,unknown>={
    'next/server':{NextResponse},'@/lib/server/touchline-host-routing':hosts,
    '@/lib/touchlineArena/public-origin':origin,'@/lib/touchlineArena/auth-i18n':auth,
    '@/lib/touchlineArena/auth-access':access,'@/lib/touchlineArena/root-locale':locale,
    '@/lib/touchlineArena/catalogue-locale':resolver,'@/lib/touchlineArena/public-error-i18n':errors,
    '@/lib/touchlineArena/site-locales-release':policy,
    '@/lib/touchlineAudit/access':{isTouchlineAuditMode:()=>false},
    '@/lib/touchlinePreview/isolation':{resolveTouchlineIsolatedPreviewRoutePolicy:()=>{if(failPolicy)throw Error('synthetic policy failure');return {status:'inactive'};}},
    '@/lib/touchlinePreview/qa-visual-review':{TOUCHLINE_STABLE_QA_HOST:'qa.example.test',isTouchlineQaAuthenticatedVisualReviewRoute:()=>false},
    '@supabase/ssr':{createServerClient:()=>({auth:{getUser:async()=>{reads++;return {data:{user:null},error:null};}}})},
    '@/lib/admin/owner':{isOwnerEmail:()=>false},
  };
  const exports={} as {proxy:Handler;internal:Handler};
  const source=readFileSync(new URL('../proxy.ts',import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source+'\nexport {handleTouchLineRequest as internal};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,URL,Headers,process:{env},require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  return {run:(request:NextRequest,draft:boolean)=>draft?exports.internal(request,true):exports.proxy(request),publicRun:(request:NextRequest)=>exports.proxy(request),reads:()=>reads};
}
const languages=['en-GB','pt-BR','es-ES','it-IT','fr-FR','ar-SA','tr-TR','de-DE'];
const host='https://candidate.vercel.app';

test('protected authentication returns keep document headers EN/PT, including normalized paths', async()=>{
  for(const flag of [undefined,'false','true']) for(const path of ['/login','/register','/forgot-password']) {
    for(const destination of ['/admin/finance','/visual-qa/cards','/clubowner/../admin']) {
      const h=harness(flag);
      const {response}=await followCanonical(h.publicRun,`${path}?lang=ar-SA&returnTo=${encodeURIComponent(destination)}`,false);
      assert.equal(response.headers.get(`x-middleware-request-${locale.TOUCHLINE_PRESENTATION_LOCALE_HEADER}`),'en-GB');
      assert.equal(response.headers.get(`x-middleware-request-${locale.TOUCHLINE_LOGIN_PRESENTATION_LOCALE_HEADER}`),null);
    }
  }
});

test('exported proxy uses runtime public policy for eight languages, with administration always EN/PT', async()=>{
  for(const flag of [undefined,'false','true'])for(const language of languages){
    const h=harness(flag);
    for(const path of ['/intro','/register','/forgot-password','/reset-password','/admin/login']){
      const expected=flag==='true'&&path!=='/admin/login'?language:language==='pt-BR'?'pt-BR':'en-GB';
      const {response}=await followCanonical(h.publicRun,`${path}?lang=${language}`,false);
      assert.equal(response.headers.get('location'),null,`${flag} ${path} ${language}`);
      assert.equal(response.headers.get(`x-middleware-request-${locale.TOUCHLINE_PRESENTATION_LOCALE_HEADER}`),expected);
    }
    for(const path of ['/clubowner','/admin','/visual-qa/cards']){
      const expected=flag==='true'&&path==='/clubowner'?language:language==='pt-BR'?'pt-BR':'en-GB';
      const {request,response}=await followCanonical(h.publicRun,`${path}?lang=${language}&tab=squad`,false);
      const target=new URL(response.headers.get('location')!);
      assert.equal(target.origin,host);
      assert.equal(target.pathname,path==='/clubowner'?'/login':'/admin/login');
      assert.equal(target.searchParams.get('lang'),expected);
      assert.equal(target.searchParams.get('returnTo'),request.nextUrl.pathname+request.nextUrl.search);
    }
    const {response}=await followCanonical(h.publicRun,`/club-owner/foreign?lang=${language}&owner=foreign`,false);
    assert.equal(response.headers.get('location'),`${host}/clubowner?lang=${flag==='true'?language:language==='pt-BR'?'pt-BR':'en-GB'}`);
  }
});

test('public policy cannot be enabled by request flags and survives proxy fallback without widening admin',async()=>{
  for(const flag of [undefined,'false']){
    const h=harness(flag);
    const response=await h.publicRun(new NextRequest(`${host}/register?lang=ar-SA&siteLocalesEnabled=true&draftLocalesEnabled=true`,{headers:{'x-touchline-site-locales-enabled':'true','x-touchline-draft-locales-enabled':'true',[locale.TOUCHLINE_PRESENTATION_LOCALE_HEADER]:'ar-SA'}}));
    assert.equal(new URL(response.headers.get('location')!).searchParams.get('lang'),'en-GB');
    assert.equal(h.reads(),0);
  }
  for(const language of languages){
    const h=harness('true',true);
    const response=await h.publicRun(new NextRequest(`${host}/register?lang=${language}`));
    assert.equal(response.headers.get(`x-middleware-request-${locale.TOUCHLINE_PRESENTATION_LOCALE_HEADER}`),language);
    const admin=await h.publicRun(new NextRequest(`${host}/admin/finance?lang=${language}`));
    const target=new URL(admin.headers.get('location')!);
    assert.equal(target.pathname,'/admin/login');
    assert.equal(target.searchParams.get('lang'),language==='pt-BR'?'pt-BR':'en-GB');
  }
});
async function followCanonical(run:(request:NextRequest,draft:boolean)=>Promise<NextResponse>,path:string,draft:boolean){
  let request=new NextRequest(host+path);
  let response=await run(request,draft);
  // Public draft requests canonicalize language before route/auth processing.
  const location=response.headers.get('location');
  if(location&&new URL(location).pathname===request.nextUrl.pathname){
    request=new NextRequest(location);response=await run(request,draft);
  }
  return {request,response};
}

test('retired owner route strips foreign context and preserves eight only with trusted opt-in',async()=>{
  for(const language of languages)for(const draft of [false,true]){
    const h=harness();
    const {response}=await followCanonical(h.run,`/club-owner/foreign/substitution?lang=${language}&owner=foreign&tab=private`,draft);
    const expected=draft?language:language==='pt-BR'?'pt-BR':'en-GB';
    assert.equal(response.status,307);
    assert.equal(response.headers.get('location'),`${host}/clubowner?lang=${expected}`);
    assert.equal(h.reads(),0,'retired compatibility route must not authenticate');
    assert.match(response.headers.get('cache-control')??'',/no-store/);
  }
});

test('protected account route redirects to same-origin login with exact intended returnTo and gate-bound language',async()=>{
  for(const language of languages)for(const draft of [false,true]){
    const h=harness();
    const {request,response}=await followCanonical(h.run,`/clubowner?lang=${language}&tab=squad`,draft);
    const destination=new URL(response.headers.get('location')!);
    const expected=draft?language:language==='pt-BR'?'pt-BR':'en-GB';
    assert.equal(destination.origin,host);assert.equal(destination.pathname,'/login');
    assert.equal(destination.searchParams.get('lang'),expected);
    assert.equal(destination.searchParams.get('returnTo'),request.nextUrl.pathname+request.nextUrl.search);
    assert.equal(h.reads(),1);
  }
});

test('query/header cannot enable drafts; auth entry itself remains free of session lookup',async()=>{
  const h=harness();
  const request=new NextRequest(`${host}/club-owner/foreign?lang=ar-SA&draftLocalesEnabled=true`,{headers:{'x-touchline-draft-locales-enabled':'true'}});
  const first=await h.run(request,false);
  assert.equal(new URL(first.headers.get('location')!).searchParams.get('lang'),'en-GB');
  for(const draft of [false,true]){
    const entry=await h.run(new NextRequest(`${host}/login?lang=ar-SA&returnTo=https%3A%2F%2Fevil.test`),draft);
    assert.equal(entry.headers.get('location'),null);
    assert.equal(h.reads(),0,'do not make public auth entry depend on Supabase to exercise an unreachable post-auth branch');
  }
});

test('remote public API, callback and resource requests bypass locale redirects and proxy identity lookup',async()=>{
  // Endpoint-owned authentication is outside this proxy contract. These paths
  // are not account-backed page routes and must not initiate edge getUser.
  const paths=['/api/notifications/preferences','/auth/callback?code=synthetic',
    '/auth/callback/nested?code=synthetic','/_next/data/sample','/assets/demo.png'];
  for(const draft of [false,true])for(const method of ['GET','HEAD'])for(const language of ['invalid','ar-SA'])for(const saved of [undefined,'pt-BR']){
    const h=harness();
    for(const path of paths){
      const join=path.includes('?')?'&':'?';
      const request=new NextRequest(`${host}${path}${join}lang=${language}`,{
        method,headers:saved?{cookie:`touchline:locale:v1=${saved}`}:{},
      });
      const response=await h.run(request,draft);
      assert.equal(response.status,200,`${method} ${path} ${language} ${draft}`);
      assert.equal(response.headers.get('location'),null);
      assert.equal(h.reads(),0,'public proxy path must not authenticate');
    }
  }
});

test('remote mutations bypass locale canonicalization without suppressing protected-route authentication',async()=>{
  for(const draft of [false,true]){
    for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS'])for(const path of ['/login?lang=invalid','/intro?lang=ar-SA']){
      const h=harness();
      const response=await h.run(new NextRequest(host+path,{method,headers:{cookie:'touchline:locale:v1=pt-BR'}}),draft);
      assert.equal(response.status,200,`${method} ${path} ${draft}`);
      assert.equal(response.headers.get('location'),null);
      assert.equal(h.reads(),0);
    }
    const protectedPath='/clubowner?lang=en-GB&tab=squad';
    const h=harness();
    const response=await h.run(new NextRequest(host+protectedPath,{method:'POST',headers:{cookie:'touchline:locale:v1=pt-BR'}}),draft);
    const destination=new URL(response.headers.get('location')!);
    assert.equal(response.status,307);
    assert.equal(destination.origin,host);
    assert.equal(destination.pathname,'/login','auth redirect is not a locale redirect');
    assert.equal(destination.searchParams.get('lang'),'en-GB');
    assert.equal(destination.searchParams.get('returnTo'),'/clubowner?lang=en-GB&tab=squad');
    assert.equal(h.reads(),1,'protected mutation still requires verified identity');
  }
  // Public default mode restores complete saved preferences for GET/HEAD,
  // before touching auth. Trusted draft mode intentionally prefers explicit URL.
  for(const method of ['GET','HEAD']){
    const h=harness();
    const response=await h.run(new NextRequest(`${host}/clubowner?lang=en-GB&tab=squad`,{method,headers:{cookie:'touchline:locale:v1=pt-BR'}}),false);
    assert.equal(response.status,307);
    assert.equal(response.headers.get('location'),`${host}/clubowner?lang=pt-BR&tab=squad`);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.equal(h.reads(),0);
  }
});
