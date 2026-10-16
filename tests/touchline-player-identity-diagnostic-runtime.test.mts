import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../app/api/football-data/provider-diagnostic/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
}).outputText;

function fixture(options: {owner?: boolean; production?: boolean; wrongQa?: boolean; isolation?: string; player?: string; fails?: boolean; mismatch?: boolean; unavailable?: boolean; wrongProvider?: boolean} = {}) {
  let calls = 0;
  const output: Record<string, unknown> = {};
  new Function('require', 'exports', 'process', compiled)((id: string) => {
    if (id === 'next/server') return {NextResponse: {json: (body: unknown, init: {status?: number}) => ({body, status: init.status ?? 200})}};
    if (id.endsWith('/admin/owner')) return {isOwnerEmail: () => options.owner !== false};
    if (id.endsWith('/supabase/server')) return {createClient: async () => ({auth: {getUser: async () => ({data: {user: {email: 'owner@example.invalid'}}})}})};
    if (id.endsWith('/touchlineArena/auth-access')) return {hasTouchLineArenaAccess: () => true};
    if (id.endsWith('/touchlinePreview/isolation')) return {inspectTouchlineIsolatedPreviewEnvironment: () => ({status: options.isolation ?? 'qa'})};
    if (id.endsWith('/provider-factory')) return {createFootballDataProvider: () => ({getPlayerById: async (requested: string) => {
      calls++;
      if (options.fails) throw new Error('private upstream diagnostic');
      if (options.unavailable) return {ok: false, error: {message: 'private quota error'}};
      return {ok: true, data: {provider: options.wrongProvider ? 'other' : 'sportmonks', providerId: options.mismatch ? '999' : requested, name: 'Official name', raw: {private: true}}};
    }})};
    return {};
  }, output, {env: {VERCEL_ENV: options.production ? 'production' : 'preview', TOUCHLINE_QA_SUPABASE_PROJECT_REF: options.wrongQa ? 'wrong-project' : 'xgxbwqxjssxxuihuwmgy'}});
  return {calls: () => calls, run: () => (output.GET as (r: unknown) => Promise<{status: number; body: Record<string, unknown>}>)(
    {nextUrl: new URL('https://qa.invalid/api?scope=player&playerId=' + encodeURIComponent(options.player ?? '37761771'))}),
  };
}

for (const [label, options, status, calls] of [
  ['unauthorized', {owner: false}, 401, 0],
  ['production', {production: true}, 403, 0],
  ['wrong QA binding', {wrongQa: true}, 403, 0],
  ['invalid isolation', {isolation: 'invalid'}, 403, 0],
  ['inactive isolation', {isolation: 'inactive'}, 403, 0],
  ['zero ID', {player: '0'}, 400, 0],
  ['malformed ID', {player: '1/search'}, 400, 0],
  ['mismatched identity', {mismatch: true}, 502, 1],
  ['provider failure', {fails: true}, 502, 1],
  ['quota unavailable', {unavailable: true}, 502, 1],
  ['wrong provider', {wrongProvider: true}, 502, 1],
] as const) {
  test(`identity diagnostic rejects ${label}`, async () => {
    const f = fixture(options); const response = await f.run();
    assert.equal(response.status, status); assert.equal(f.calls(), calls);
    assert.doesNotMatch(JSON.stringify(response.body), /private upstream|private quota|"raw"/);
  });
}
test('identity diagnostic returns exact sanitized identity without persistence', async () => {
  const f = fixture(); const response = await f.run();
  assert.equal(response.status, 200); assert.equal(f.calls(), 1);
  assert.equal(response.body.persisted, false);
  assert.doesNotMatch(JSON.stringify(response.body), /"raw"|"private"/);
});
