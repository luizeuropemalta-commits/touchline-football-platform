import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {NextRequest, NextResponse} from 'next/server.js';
import * as auth from '../lib/touchlineArena/auth-i18n.ts';
import * as recovery from '../lib/server/password-recovery.ts';
import * as cookieSecurity from '../lib/server/login-cookie-security.ts';

const origin='https://candidate.example.test';
const languages=['en-GB','pt-BR','es-ES','it-IT','fr-FR','ar-SA','tr-TR','de-DE'];
function harness(flag?:string, failed=false, accessFails=false) {
  let providerCalls=0;
  let signOuts=0;
  const env={TOUCHLINE_SITE_LOCALES_ENABLED:flag,NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic'};
  const modules:Record<string,unknown>={
    'next/server':{NextResponse},
    '@/lib/touchlineArena/auth-i18n':auth,'../touchlineArena/auth-i18n.ts':auth,
    '@/lib/server/password-recovery':recovery,
    '@/lib/server/login-cookie-security':cookieSecurity,
    '@/lib/server/touchline-arena-access':{ensureTouchlineArenaAccess:async()=>{if(accessFails)throw Error('synthetic provisioning failure');}},
  };
  function load(path:string) {
    const exports:Record<string,unknown>={};
    runInNewContext(ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
      {exports,URL,process:{env},require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
    return exports;
  }
  const policy=load('lib/touchlineArena/site-locales-release.ts');
  modules['@/lib/touchlineArena/site-locales-release']=policy;
  modules['../touchlineArena/site-locales-release.ts']=policy;
  modules['@/lib/server/auth-callback-destination']=load('lib/server/auth-callback-destination.ts');
  modules['@/lib/server/login-request-security']=load('lib/server/login-request-security.ts');
  const result=()=>{providerCalls++;return {data:{user:failed?null:{id:'synthetic-user',email:'synthetic@example.test'},session:{access_token:'synthetic',refresh_token:'synthetic'}},error:failed?{code:'invalid_credentials'}:null};};
  modules['@/lib/supabase/server']={createClient:async()=>({auth:{exchangeCodeForSession:async()=>result(),signOut:async()=>{signOuts++;return {error:null};}}})};
  modules['@supabase/ssr']={createServerClient:(_url:string,_key:string,options:{cookies:{setAll:(items:unknown[])=>void}})=>({auth:{signInWithPassword:async()=>{
    options.cookies.setAll([{name:'synthetic-session',value:'synthetic',options:{httpOnly:true,domain:'untrusted.example',path:'/wrong'}}]);
    return result();
  }}})};
  const GET=load('app/auth/callback/route.ts').GET as (request:NextRequest)=>Promise<NextResponse>;
  const POST=load('app/api/auth/login/route.ts').POST as (request:NextRequest)=>Promise<NextResponse>;
  return {GET,POST,calls:()=>providerCalls,signOuts:()=>signOuts};
}
function nativeRequest(locale:string,returnTo:string,loginPath='/login',crossOrigin=false){
  return new NextRequest(origin+'/api/auth/login',{method:'POST',headers:{origin:crossOrigin?'https://evil.example':origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'synthetic@example.test',password:'synthetic',locale,return_to:returnTo,login_path:loginPath})});
}
test('exported callback and native POST honor trusted public release and preserve same-origin destinations',async()=>{
  for(const flag of [undefined,'false','true'])for(const lang of languages)for(const path of ['/clubowner','/club-owner/foreign','/admin','/visual-qa/cards']){
    const expected=flag==='true'&&!path.startsWith('/admin')&&!path.startsWith('/visual-qa')?lang:lang==='pt-BR'?'pt-BR':'en-GB';
    const input=`${path}?lang=${lang}&tab=squad#section`;
    for(const failed of [false,true]){
      const h=harness(flag,failed);
      const callback=await h.GET(new NextRequest(origin+'/auth/callback?'+new URLSearchParams({code:'synthetic',next:input})));
      const next=new URL(callback.headers.get('location')!);
      assert.equal(next.origin,origin);
      assert.equal(next.searchParams.get('lang'),expected,`callback ${flag} ${lang} ${path} ${failed}`);
      if(failed) assert.equal(new URL(next.searchParams.get('returnTo')!,origin).searchParams.get('lang'),expected);
      else assert.equal(next.pathname,path.startsWith('/club-owner')?'/clubowner':path);
      const response=await h.POST(nativeRequest(lang,input,path.startsWith('/admin')||path.startsWith('/visual-qa')?'/admin/login':'/login'));
      const target=new URL(response.headers.get('location')!);
      assert.equal(response.status,303);
      assert.equal(target.origin,origin);
      assert.equal(target.searchParams.get('lang'),expected,`native ${flag} ${lang} ${path} ${failed}`);
      if(failed) assert.equal(new URL(target.searchParams.get('returnTo')!,origin).searchParams.get('lang'),expected);
      else {
        const cookie=response.headers.get('set-cookie')??'';
        assert.match(cookie,/Path=\//);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=lax/);
        assert.doesNotMatch(cookie,/Domain=/);
        assert.equal(response.headers.get('cache-control'),'no-store');
      }
      assert.equal(h.calls(),2);
    }
  }
});
test('callback recovery requires signed intent, issues user-bound grant and preserves cleanup on provisioning failure',async()=>{
  const previous=process.env.TOUCHLINE_AUTH_RECOVERY_SECRET;
  process.env.TOUCHLINE_AUTH_RECOVERY_SECRET='synthetic-test-secret-at-least-thirty-two-characters';
  try {
    const next='/reset-password?lang=ar-SA';
    const url=origin+'/auth/callback?'+new URLSearchParams({code:'synthetic',next});
    const h=harness('true');
    const invalid=await h.GET(new NextRequest(url));
    assert.equal(h.signOuts(),1);
    assert.equal(new URL(invalid.headers.get('location')!).searchParams.get('error'),'auth_callback');
    assert.equal(invalid.cookies.get(recovery.TOUCHLINE_PASSWORD_RECOVERY_COOKIE)?.value,'');
    const intent=recovery.createTouchLinePasswordRecoveryIntent('synthetic@example.test');
    const valid=await h.GET(new NextRequest(url,{headers:{cookie:`${recovery.TOUCHLINE_PASSWORD_RECOVERY_INTENT_COOKIE}=${intent}`}}));
    assert.equal(valid.headers.get('location'),origin+next);
    assert.equal(recovery.verifyTouchLinePasswordRecoveryGrant(valid.cookies.get(recovery.TOUCHLINE_PASSWORD_RECOVERY_COOKIE)?.value,'synthetic-user'),true);
    assert.equal(valid.cookies.get(recovery.TOUCHLINE_PASSWORD_RECOVERY_INTENT_COOKIE)?.value,'');
    assert.equal(h.signOuts(),1);
    const failing=harness('true',false,true);
    const response=await failing.GET(new NextRequest(origin+'/auth/callback?'+new URLSearchParams({code:'synthetic',next:'/clubowner?lang=ar-SA'})));
    assert.equal(response.status,503);assert.equal(failing.signOuts(),1);
    assert.equal(response.cookies.get(recovery.TOUCHLINE_PASSWORD_RECOVERY_COOKIE)?.value,'');
  } finally {
    if(previous===undefined)delete process.env.TOUCHLINE_AUTH_RECOVERY_SECRET;
    else process.env.TOUCHLINE_AUTH_RECOVERY_SECRET=previous;
  }
});
test('request input cannot activate release or escape origin; login provenance rejects before provider',async()=>{
  const h=harness();
  const response=await h.GET(new NextRequest(origin+'/auth/callback?'+new URLSearchParams({next:'/clubowner?lang=ar-SA&siteLocalesEnabled=true',siteLocalesEnabled:'true'}),{headers:{'x-touchline-site-locales-enabled':'true'}}));
  assert.equal(new URL(response.headers.get('location')!).searchParams.get('lang'),'en-GB');
  for(const next of ['https://evil.example','//evil.example','/\\evil.example','/clubowner\n']){
    assert.equal((await h.GET(new NextRequest(origin+'/auth/callback?'+new URLSearchParams({next})))).headers.get('location'),origin+'/clubowner');
  }
  assert.equal((await h.POST(nativeRequest('ar-SA','/clubowner','/login',true))).status,403);
  assert.equal(h.calls(),0);
});
test('recovery callback retains accepted query and dedicated destination and clears failed exchange intent',async()=>{
  for(const flag of [undefined,'true']){
    const h=harness(flag,true);
    const response=await h.GET(new NextRequest(origin+'/auth/callback?'+new URLSearchParams({code:'synthetic',next:'/reset-password?lang=ar-SA'})));
    const target=new URL(response.headers.get('location')!);
    assert.equal(target.pathname,'/reset-password');
    assert.equal(target.searchParams.get('lang'),'ar-SA');
    assert.equal(target.searchParams.get('error'),'auth_callback');
    assert.match(response.headers.get('set-cookie')??'',/Max-Age=0/);
  }
});
