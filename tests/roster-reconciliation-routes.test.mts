import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { timingSafeEqual } from 'node:crypto';
import { parseRosterCommand } from '../lib/football-data/roster-reconciliation-contract.ts';
type ResponseLike = {
    status: number;
    body: Record<string, unknown>;
    headers: Record<string, string>;
};
function harness(kind: 'owner' | 'cron', options: {
    owner?: boolean;
    access?: boolean;
    authError?: boolean;
    error?: string;
} = {}) {
    let clients = 0;
    const actions: unknown[] = [];
    const exports: Record<string, (r?: unknown) => Promise<ResponseLike>> = {};
    const dependencies: Record<string, unknown> = {
        'next/server': { NextResponse: { json: (body: unknown, init: {
                    status?: number;
                    headers: unknown;
                }) => ({ status: init.status ?? 200, body, headers: init.headers }) } },
        '@/lib/admin/owner': { isOwnerEmail: () => options.owner !== false },
        '@/lib/touchlineArena/auth-access': { hasTouchLineArenaAccess: () => options.access !== false },
        '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: '00000000-0000-4000-8000-000000000001', email: 'owner@synthetic.invalid' } }, error: options.authError ? {} : null }) } }) },
        '@/lib/supabase/admin': { createAdminClient: () => { clients++; return {}; } },
        '@/lib/football-data/roster-reconciliation-contract': { parseRosterCommand },
        '@/lib/football-data/roster-reconciliation-server': { readRosterStatus: async () => { if (options.error)
                throw new Error(options.error); return { enabled: false, applyEnabled: false, snapshots: [], jobs: [] }; }, runRosterCommand: async (...args: unknown[]) => { actions.push(args); if (options.error)
                throw new Error(options.error); return { status: 'review', requestId: 'synthetic' }; }, rosterCronCommand: () => ({ action: 'capture', requestId: 'server-slot' }) },
        'node:crypto': { timingSafeEqual },
    };
    const source = readFileSync(new URL(`../app/api/${kind === 'owner' ? 'admin/football-data/rosters' : 'football-data/roster-sync'}/route.ts`, import.meta.url), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; }, process: { env: { TOUCHLINE_ROSTER_CRON_SECRET: 's'.repeat(32) } }, Buffer, Error, TextDecoder });
    const request = (body: unknown = { action: 'capture', requestId: '00000000-0000-4000-8000-000000000002' }, headers: Record<string, string> = {}) => Object.assign(new Request('https://qa.invalid/api/ignored',{method:'POST',headers:{origin:'https://qa.invalid','sec-fetch-site':'same-origin','content-type':'application/json',...headers},body:JSON.stringify(body)}),{nextUrl:new URL('https://qa.invalid/api/ignored')});
    return { ...exports, request, counts: () => ({ clients, actions }) };
}
test('actual owner routes deny session/access/origin before privileged clients or actions', async () => {
    for (const options of [{ owner: false }, { access: false }, { authError: true }]) {
        const h = harness('owner', options);
        assert.equal((await h.GET()).status, 403);
        assert.equal((await h.POST(h.request())).status, 403);
        assert.deepEqual(h.counts(), { clients: 0, actions: [] });
    }
    for (const headers of [{ origin: 'https://other.invalid' }, { 'sec-fetch-site': 'cross-site' }]) {
        const h = harness('owner');
        assert.equal((await h.POST(h.request(undefined, headers))).status, 403);
        assert.equal(h.counts().clients, 0);
    }
});
test('actual owner routes preserve exact validated commands, gate errors, private error redaction and readonly GET', async () => {
    const h = harness('owner');
    assert.equal((await h.GET()).status, 200);
    assert.equal(h.counts().actions.length, 0);
    assert.equal((await h.POST(h.request())).status, 200);
    assert.equal(h.counts().actions.length, 1);
    assert.equal((await h.POST(h.request({ action: 'capture', requestId: '00000000-0000-4000-8000-000000000002', marketValue: 5 }))).status, 400);
    for (const message of ['ROSTER_PAUSED', 'ROSTER_REVISION_CONFLICT', 'secret provider error bearer-value']) {
        const f = harness('owner', { error: message });
        const result = await f.POST(f.request());
        assert.equal(result.status, message.startsWith('ROSTER_') ? 409 : 503);
        assert.ok(!JSON.stringify(result).includes('bearer-value'));
        assert.match(result.headers['Cache-Control'], /no-store/);
    }
});
test('actual cron route is POST secret protected and only derives server capture slot', async () => {
    const h = harness('cron');
    assert.equal((await h.GET()).status, 405);
    for (const authorization of ['', `Bearer wrong`, `s`.repeat(32)])
        assert.equal((await h.POST(h.request({}, { authorization }))).status, 403);
    assert.deepEqual(h.counts(), { clients: 0, actions: [] });
    const result = await h.POST(h.request({ action: 'apply', provider: 'evil' }, { authorization: `Bearer ${'s'.repeat(32)}` }));
    assert.equal(result.status, 200);
    const action = h.counts().actions[0] as unknown[];
    assert.equal(action[1], 'cron:roster-v1');
    assert.deepEqual(action[2], { action: 'capture', requestId: 'server-slot' });
});

test('POST validates content type and declared size before reading body or constructing privileged client',async()=>{
 for(const headers of [{'content-type':'text/plain'},{'content-type':'application/jsonp'},{'content-type':'application/json; charset=iso-8859-1'},{'content-type':''},{'content-length':'4097'},{'content-length':'not-a-number'}]){
  const h=harness('owner');let read=false;
  const req={headers:new Headers({origin:'https://qa.invalid','content-type':'application/json',...headers}),nextUrl:new URL('https://qa.invalid/api/ignored'),get body(){read=true;throw Error('must not read body');},text:async()=>{read=true;throw Error('must not buffer body');}};
  const response=await h.POST(req);
  assert.equal(response.status,'content-length' in headers?(headers['content-length']==='4097'?413:400):415);
  assert.equal(read,false);assert.equal(h.counts().clients,0);
 }
});
test('POST caps streamed bytes despite missing/spoofed length and cancels before later chunks',async()=>{
 for(const contentLength of [null,'1']){
  const h=harness('owner');let pulls=0,cancelled=false;
  const body=new ReadableStream<Uint8Array>({pull(controller){pulls++;controller.enqueue(new Uint8Array(2048).fill(32));},cancel(){cancelled=true;}},{highWaterMark:0});
  const headers=new Headers({origin:'https://qa.invalid','content-type':'application/json'});if(contentLength!==null)headers.set('content-length',contentLength);
  const result=await h.POST({headers,nextUrl:new URL('https://qa.invalid/api/ignored'),body,text:()=>{throw Error('whole-body buffering forbidden');}});
  assert.equal(result.status,413);assert.equal(pulls,3);assert.equal(cancelled,true);assert.equal(h.counts().clients,0);assert.deepEqual(h.counts().actions,[]);
 }
});
test('POST accepts bounded chunked JSON at exact byte cap and rejects invalid UTF8/length spoof',async()=>{
 const command={action:'capture',requestId:'00000000-0000-4000-8000-000000000002'};const json=JSON.stringify(command);
 for(const data of [new TextEncoder().encode(json.padEnd(4096,' ')),new Uint8Array([255,255])]){
  const h=harness('owner');let offset=0;
  const body=new ReadableStream<Uint8Array>({pull(controller){if(offset>=data.length){controller.close();return;}controller.enqueue(data.slice(offset,offset+7));offset+=7;}},{highWaterMark:0});
  const response=await h.POST({headers:new Headers({origin:'https://qa.invalid','content-type':'application/json; charset=utf-8'}),nextUrl:new URL('https://qa.invalid/api/ignored'),body,text:()=>{throw Error('whole-body buffering forbidden');}});
  assert.equal(response.status,data.length===4096?200:400);assert.equal(h.counts().actions.length,data.length===4096?1:0);
 }
 const h=harness('owner');assert.equal((await h.POST(h.request(command,{'content-length':'1'}))).status,400);assert.equal(h.counts().clients,0);
});
