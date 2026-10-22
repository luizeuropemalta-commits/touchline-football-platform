import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type * as TypeScript from 'typescript';

const require = createRequire(import.meta.url);
const ts = require('typescript') as typeof TypeScript;
const origin = 'http://127.0.0.1:3130';
const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
// Intended destination: tests/touchline-login-interceptor-behavior.test.mts.
const source = read('./touchline-login-membership-layout.test.mts');
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true };
const exerciseStatement = ts.createSourceFile('injected.ts', 'await __exercise(context, t);', ts.ScriptTarget.ES2022, true).statements[0]!;
let extracted = 0;
const compiled = ts.transpileModule(source, {
  compilerOptions: options,
  transformers: { before: [(context: TypeScript.TransformationContext) => (file: TypeScript.SourceFile) => {
    const visit: TypeScript.Visitor = (node) => {
      if (ts.isPropertyAccessExpression(node) && node.name.text === 'url' && ts.isMetaProperty(node.expression)
        && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword) {
        return ts.factory.createStringLiteral('file:///synthetic-touchline/tests/login-harness.mts');
      }
      if (ts.isTryStatement(node)) {
        const statements = [...node.tryBlock.statements];
        const pageIndex = statements.findIndex((s) => ts.isVariableStatement(s) && s.declarationList.declarations.some((d) => d.name.getText(file) === 'page'));
        if (pageIndex >= 0 && node.finallyBlock?.getText(file).includes('await closeBrowser()')) {
          const prefix = statements.slice(0, pageIndex);
          assert.ok(prefix.some((s) => s.getText(file).includes("context.route('**/*'")));
          assert.ok(prefix.some((s) => s.getText(file).includes("context.routeWebSocket('**/*'")));
          extracted++;
          return ts.factory.updateTryStatement(node, ts.factory.updateBlock(node.tryBlock, [...prefix, exerciseStatement]), node.catchClause, node.finallyBlock);
        }
      }
      return ts.visitEachChild(node, visit, context);
    };
    return ts.visitNode(file, visit) as TypeScript.SourceFile;
  }] },
}).outputText;
assert.equal(extracted, 1, 'exactly one visual tail must be replaced; interception/lifecycle stay real');

function purePolicy() {
  const cache = new Map<string, unknown>();
  const load = (id: string): unknown => {
    if (cache.has(id)) return cache.get(id);
    const relative = id === './helpers/local-login-browser-policy.ts' ? './helpers/local-login-browser-policy.ts'
      : id === './local-browser-target.ts' ? './helpers/local-browser-target.ts' : undefined;
    assert.ok(relative, `Unexpected policy dependency: ${id}`);
    const compiledModule = { exports: {} };
    const js = ts.transpileModule(read(relative), { compilerOptions: options }).outputText;
    new Function('require', 'module', 'exports', js)(load, compiledModule, compiledModule.exports);
    cache.set(id, compiledModule.exports); return compiledModule.exports;
  };
  return load('./helpers/local-login-browser-policy.ts');
}

type Hook = () => void | Promise<void>;
type HttpCallback = (route: ReturnType<typeof transport>['route']) => void | Promise<void>;
interface SocketDouble { close(): void; }
type WebSocketCallback = (socket: SocketDouble) => void | Promise<void>;
interface TestContextDouble { signal: AbortSignal; after(callback: Hook): void; }
type TestBody = (context: TestContextDouble) => void | Promise<void>;
interface ExerciseContext { http: HttpCallback; websocket: WebSocketCallback; events: string[]; abort(): void; }
type Exercise = (context: ExerciseContext) => void | Promise<void>;
async function run(exercise: Exercise, settings: { preAbort?: boolean; abortLaunch?: boolean; closeError?: Error } = {}) {
  const controller = new AbortController();
  const events: string[] = [];
  const hooks: Hook[] = [];
  let http: HttpCallback | undefined, websocket: WebSocketCallback | undefined, body: TestBody | undefined;
  const fakeContext = {
    route: async (pattern: string, callback: HttpCallback) => { assert.equal(pattern, '**/*'); events.push('route'); http = callback; },
    routeWebSocket: async (pattern: string, callback: WebSocketCallback) => { assert.equal(pattern, '**/*'); events.push('websocket'); websocket = callback; },
    newPage: () => { throw new Error('Visual execution is forbidden'); },
  };
  const browser = {
    close: async () => { events.push('close'); if (settings.closeError) throw settings.closeError; },
    newContext: async (config: { serviceWorkers: string }) => { events.push('context'); assert.equal(config.serviceWorkers, 'block'); return fakeContext; },
  };
  const fakeTest = (name: string, ...args: unknown[]) => {
    if (name.startsWith('rendered customer login ')) { assert.equal(body, undefined); body = args.at(-1) as TestBody; }
    else assert.equal(name, 'login plans share the approved live-text artwork without payment, fictional identity or account writes');
  };
  const closedRequire = (id: string) => {
    if (id === 'node:test') return fakeTest;
    if (id === 'node:assert/strict') return assert;
    if (id === 'node:fs') return { readFileSync: () => { throw new Error('Harness source IO forbidden'); } };
    if (id === './helpers/local-login-browser-policy.ts') return purePolicy();
    if (id === '@playwright/test') return {
      webkit: { launch: async (config: { headless: boolean; timeout: number }) => { events.push('launch'); assert.deepEqual(config, { headless: true, timeout: 15_000 }); if (settings.abortLaunch) controller.abort(); return browser; } },
      expect: () => { throw new Error('Visual assertions forbidden'); },
    };
    throw new Error(`Unexpected harness dependency: ${id}`);
  };
  const compiledModule = { exports: {} };
  const fakeT: TestContextDouble = { signal: controller.signal, after: (callback: Hook) => { events.push('after-registered'); hooks.push(callback); } };
  new Function('require', 'module', 'exports', 'process', '__exercise', compiled)(closedRequire, compiledModule, compiledModule.exports,
    { env: { TOUCHLINE_LOGIN_BROWSER_URL: `${origin}/login?lang=en-GB` } },
    async () => { assert.ok(http && websocket); return exercise({ http, websocket, events, abort: () => controller.abort() }); });
  assert.ok(body);
  if (settings.preAbort) controller.abort();
  let bodyError: unknown, hookError: unknown;
  try { await body(fakeT); } catch (error) { bodyError = error; }
  for (const hook of hooks) { try { await hook(); } catch (error) { hookError = error; } }
  return { events, bodyError, hookError };
}

function transport(method = 'GET', url = `${origin}/asset`, status = 200, fail?: 'fetch' | 'fulfill') {
  const events: string[] = [];
  const fault = new Error(`synthetic ${fail}`);
  const response = { status: () => status, dispose: async () => { events.push('dispose'); } };
  const route = {
    request: () => ({ url: () => url, method: () => method }),
    abort: async (reason: string) => { assert.equal(reason, 'blockedbyclient'); events.push('abort'); },
    fetch: async (config: unknown) => { events.push('fetch'); assert.deepEqual(config, { maxRedirects: 0, maxRetries: 0, timeout: 10_000 }); if (fail === 'fetch') throw fault; return response; },
    fulfill: async (value: unknown) => { events.push('fulfill'); assert.deepEqual(value, { response }); if (fail === 'fulfill') throw fault; },
  };
  return { route, events, fault };
}

test('real interceptors fulfill same-origin GET/HEAD and dispose; normal cleanup is once', async () => {
  const result = await run(async ({ http }) => {
    for (const method of ['GET', 'HEAD']) { const t = transport(method); await http(t.route); assert.deepEqual(t.events, ['fetch', 'fulfill', 'dispose']); }
  });
  assert.equal(result.bodyError, undefined); assert.equal(result.hookError, undefined);
  assert.deepEqual(result.events, ['after-registered', 'launch', 'context', 'route', 'websocket', 'close']);
});

test('real interceptors abort writes/origin changes and blocked attempts fail after-hook', async () => {
  for (const [method, url] of [['POST', `${origin}/x`], ['PUT', `${origin}/x`], ['GET', 'https://example.invalid/x'], ['GET', 'http://127.0.0.1:3131/x']]) {
    const result = await run(async ({ http }) => { const t = transport(method, url); await http(t.route); assert.deepEqual(t.events, ['abort']); });
    assert.equal(result.bodyError, undefined); assert.ok(result.hookError instanceof assert.AssertionError);
    assert.equal(result.events.filter(e => e === 'close').length, 1);
  }
});

test('real 3xx branch aborts and disposes without fulfill', async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    const result = await run(async ({ http }) => { const t = transport('GET', `${origin}/x`, status); await http(t.route); assert.deepEqual(t.events, ['fetch', 'abort', 'dispose']); });
    assert.equal(result.bodyError, undefined); assert.ok(result.hookError instanceof assert.AssertionError);
  }
});

test('fetch and fulfill errors preserve cleanup; only acquired response is disposed', async () => {
  for (const fail of ['fetch', 'fulfill'] as const) {
    const t = transport('GET', `${origin}/x`, 200, fail);
    const result = await run(async ({ http }) => { await http(t.route); });
    assert.equal(result.bodyError, t.fault); assert.equal(result.hookError, undefined);
    assert.deepEqual(t.events, fail === 'fetch' ? ['fetch'] : ['fetch', 'fulfill', 'dispose']);
    assert.equal(result.events.filter(e => e === 'close').length, 1);
  }
});

test('real websocket callback closes locally and leaves blocked oracle failing', async () => {
  let closed = 0;
  const result = await run(async ({ websocket }) => { websocket({ close: () => { closed++; } }); });
  assert.equal(closed, 1); assert.equal(result.bodyError, undefined); assert.ok(result.hookError instanceof assert.AssertionError);
});

test('abort before launch and during/after launch close only acquired browser once', async () => {
  const before = await run(() => assert.fail('must not exercise'), { preAbort: true });
  assert.ok(before.bodyError); assert.equal(before.hookError, undefined); assert.deepEqual(before.events, ['after-registered']);
  const during = await run(() => assert.fail('must not exercise'), { abortLaunch: true });
  assert.ok(during.bodyError); assert.equal(during.hookError, undefined); assert.deepEqual(during.events, ['after-registered', 'launch', 'close']);
  const after = await run(async ({ abort }) => { abort(); });
  assert.equal(after.bodyError, undefined); assert.equal(after.hookError, undefined); assert.equal(after.events.filter(e => e === 'close').length, 1);
});

test('rejected close remains observable without retrying close in after-hook', async () => {
  const fault = new Error('synthetic close rejection');
  const result = await run(async () => {}, { closeError: fault });
  assert.equal(result.bodyError, fault); assert.equal(result.hookError, fault); assert.equal(result.events.filter(e => e === 'close').length, 1);
});
