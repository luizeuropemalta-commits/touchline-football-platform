import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

// Separate process: no real secrets inherited, no session changes, no Next
// server. Real proxy modules/NextRequest/route; only outbound RPC is synthetic.
test('central authority traverses real proxy only in approved modes and retains OFF/auth boundaries', () => {
  const script = String.raw`
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    import { pathToFileURL } from 'node:url';
    const root = pathToFileURL(process.cwd() + '/');
    registerHooks({ resolve(s,c,next) {
      if(s==='next/server') s='next/server.js';
      if(s==='server-only') s=new URL('tests/fixtures/server-only.mts',root).href;
      if(s.startsWith('@/')) s=new URL(s.slice(2)+'.ts',root).href;
      return next(s,c);
    }});
    const {NextRequest}=await import('next/server.js');
    const {POST}=await import(new URL('app/api/internal/football-data/quota/route.ts',root));
    const {inspectTouchlineIsolatedPreviewEnvironment}=await import(new URL('lib/touchlinePreview/isolation.ts',root));
    const ref='a'.repeat(20), token='q'.repeat(40), serviceKey='central'.repeat(8);
    const qa={VERCEL_ENV:'preview',VERCEL_URL:'qa-candidate.vercel.app',TOUCHLINE_DEPLOYMENT_MODE:'qa-preview',NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE:'qa-preview',NEXT_PUBLIC_SUPABASE_URL:'https://'+ref+'.supabase.co',SUPABASE_URL:'https://'+ref+'.supabase.co',TOUCHLINE_QA_SUPABASE_PROJECT_REF:ref,NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic',SUPABASE_SERVICE_ROLE_KEY:'synthetic'};
    const central={TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED:'false',TOUCHLINE_SPORTMONKS_CENTRAL_URL:'https://authority.invalid/api/internal/football-data/quota',TOUCHLINE_SPORTMONKS_CENTRAL_WORKER_TOKEN:token,TOUCHLINE_QUOTA_AUTHORITY_ENABLED:'false',TOUCHLINE_QUOTA_AUTHORITY_PROJECT_REF:ref,TOUCHLINE_QUOTA_AUTHORITY_SERVICE_KEY:serviceKey,TOUCHLINE_QUOTA_AUTHORITY_ACCOUNT_SCOPE:'shared',TOUCHLINE_QUOTA_AUTHORITY_WORKERS_JSON:JSON.stringify([{workerId:'qa-live',environment:'qa',token}])};
    const isolated={VERCEL_ENV:'preview',VERCEL_URL:'qa-candidate.vercel.app',TOUCHLINE_DEPLOYMENT_MODE:'isolated-preview',NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE:'isolated-preview',TOUCHLINE_ISOLATED_PREVIEW_PROJECT_ID:'p',VERCEL_PROJECT_ID:'p',TOUCHLINE_ISOLATED_PREVIEW_TEAM_ID:'t',VERCEL_ORG_ID:'t'};
    assert.equal(Object.keys(central).length,8);
    for(const [key,value] of Object.entries(central)) {
      assert.equal(inspectTouchlineIsolatedPreviewEnvironment({...qa,[key]:value}).status,'qa');
      assert.equal(inspectTouchlineIsolatedPreviewEnvironment({...isolated,[key]:value}).status,'invalid');
    }
    for(const key of ['TOUCHLINE_SPORTMONKS_CENTRAL_UNKNOWN','TOUCHLINE_QUOTA_AUTHORITY_UNKNOWN','TOUCHLINE_RECOVERY_OPERATOR_ENABLED','TOUCHLINE_RECOVERY_DB_PASSWORD'])
      assert.equal(inspectTouchlineIsolatedPreviewEnvironment({...qa,[key]:'synthetic'}).status,'invalid');
    for(const otherRef of ['b'.repeat(20),'c'.repeat(20),'']) {
      const result=inspectTouchlineIsolatedPreviewEnvironment({...qa,...central,TOUCHLINE_QUOTA_AUTHORITY_PROJECT_REF:otherRef});
      assert.equal(result.status,'invalid'); assert.deepEqual(result.reasons,['mismatched-qa-authority-project']);
    }
    let fetches=0, routes=0, proxyNumber=0;
    globalThis.fetch=async(input,init)=>{
      fetches++;
      assert.equal(String(input),'https://'+ref+'.supabase.co/rest/v1/rpc/touchline_central_quota_admit');
      assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+serviceKey);
      assert.equal(new Headers(init.headers).get('apikey'),serviceKey);
      const args=JSON.parse(init.body); assert.equal(args.p_worker_id,'qa-live'); assert.equal(args.p_environment,'qa'); assert.equal(args.p_account_scope,'shared');
      return Response.json({allowed:false});
    };
    async function invoke(environment,host='qa-candidate.vercel.app',bearer=token,path='/api/internal/football-data/quota') {
      for(const key of Object.keys(process.env)) if(key!=='PATH') delete process.env[key];
      Object.assign(process.env,environment);
      const {proxy}=await import(new URL('proxy.ts?centralBoundary='+proxyNumber++,root));
      const req=new NextRequest('https://'+host+path,{method:'POST',headers:{authorization:'Bearer '+bearer,'content-type':'application/json'},body:JSON.stringify({operation:'admit',args:{p_account_scope:'shared',p_request_id:'12345678-1234-4234-8234-123456789abc',p_endpoint:'fixture',p_attempt:1,p_budget_ms:1000}})});
      const response=await proxy(req);
      const next=response.headers.get('x-middleware-next')==='1';
      if(next && path==='/api/internal/football-data/quota') {routes++;return {next,proxyStatus:response.status,response:await POST(req)};}
      return {next,proxyStatus:response.status,response};
    }
    const off=await invoke({...qa,...central}); assert.equal(off.next,true); assert.equal(off.response.status,503); assert.equal(off.response.headers.get('cache-control'),'no-store'); assert.equal(fetches,0);
    const enabled={...qa,...central,TOUCHLINE_QUOTA_AUTHORITY_ENABLED:'true'};
    const unauthorized=await invoke(enabled,'qa-candidate.vercel.app','x'.repeat(40)); assert.equal(unauthorized.next,true); assert.equal(unauthorized.response.status,401); assert.equal(fetches,0);
    const allowed=await invoke(enabled); assert.equal(allowed.response.status,200); assert.deepEqual(await allowed.response.json(),{allowed:false}); assert.equal(fetches,1);
    const production=await invoke({...central,VERCEL_ENV:'production',TOUCHLINE_QUOTA_AUTHORITY_ENABLED:'true'},'touchline.com.br'); assert.equal(production.next,true); assert.equal(production.response.status,200); assert.equal(fetches,2);
    const beforeRoutes=routes;
    const www=await invoke({VERCEL_ENV:'production'},'www.touchline.com.br'); assert.equal(www.response.status,308); assert.equal(www.response.headers.get('location'),'https://touchline.com.br/api/internal/football-data/quota'); assert.equal(www.next,false);
    for(const [env,host,status] of [[isolated,'qa-candidate.vercel.app',404],[{...isolated,...central},'qa-candidate.vercel.app',503],[{VERCEL_ENV:'production',TOUCHLINE_AUDIT_MODE:'true'},'audit.vercel.app',404],[{VERCEL_ENV:'production',TOUCHLINE_SITE_OFFLINE:'true'},'touchline.com.br',503],[{...qa,...central,TOUCHLINE_RECOVERY_OPERATOR_ENABLED:'false'},'qa-candidate.vercel.app',503]]) {
      const result=await invoke(env,host); assert.equal(result.next,false); assert.equal(result.response.status,status);
    }
    assert.equal(routes,beforeRoutes); assert.equal(fetches,2);
    const wrongDatabase=await invoke({...qa,...central,TOUCHLINE_QUOTA_AUTHORITY_PROJECT_REF:'b'.repeat(20)});
    assert.equal(wrongDatabase.next,false); assert.equal(wrongDatabase.response.status,503);
    assert.equal(routes,beforeRoutes); assert.equal(fetches,2);
    // Central names no longer take unrelated public QA pages offline.
    const page=await invoke({...qa,...central},'qa-candidate.vercel.app',token,'/rankings'); assert.equal(page.next,true); assert.equal(fetches,2);
    console.log(JSON.stringify({passed:true,syntheticRpcCalls:fetches,handlerCalls:routes}));
  `;
  const result = spawnSync(process.execPath, ['--max-old-space-size=128', '--experimental-strip-types', '--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url), env: { PATH: process.env.PATH, NODE_ENV: 'test' }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { passed: true, syntheticRpcCalls: 2, handlerCalls: 4 });
});
