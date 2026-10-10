import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { RecoveryOperatorPort } from '../lib/football-data/recovery-measurement-server.ts';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return next(new URL('./fixtures/server-only.mts', import.meta.url).href, context);
  return next(specifier.startsWith('@/') ? new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href : specifier, context);
} });
const { createRecoveryMeasurement } = await import('../lib/football-data/recovery-measurement-server.ts');
const config = { enabled: true as const, caseId: '12345678-1234-4234-8234-123456789abc', workerId: 'qa-recovery', apiToken: 'secret-provider-token', relativePath: '/teams/19' };
const lease = '12345678-1234-4234-8234-123456789def';
const data = { rate_limit: { remaining: 1500, requested_entity: 'Team', resets_in_seconds: 3600 }, data: { secret: 'never-return-football-payload' } };

test('one-shot measurement orders durable admission, bounded HTTP and receipt; strips payload and secrets', async () => {
  const events: string[] = [];
  const operator: RecoveryOperatorPort = {
    async admit(args, signal) { events.push('admit'); assert.equal(signal.aborted, false); assert.equal(args.caseId, config.caseId); assert.equal(args.workerId, config.workerId); assert.equal(args.endpoint, 'team'); assert.ok(args.budgetMs <= 18000); return { allowed: true, token: lease }; },
    async complete(args) { events.push('complete'); assert.equal(args.token, lease); assert.equal(args.observation.remaining, 1500); assert.equal(args.observation.requestedEntity, 'Team'); return { persisted: true }; },
  };
  const measurement = createRecoveryMeasurement(config, operator, async (input, init) => {
    events.push('http'); const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.sportmonks.com'); assert.equal(url.pathname, '/v3/football/teams/19');
    assert.equal(url.searchParams.get('api_token'), config.apiToken); assert.equal(url.searchParams.get('per_page'), '1');
    assert.equal(url.searchParams.size, 2); assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store'); assert.equal(init?.method, 'GET');
    return Response.json(data);
  });
  const [first, second] = await Promise.all([measurement.run(), measurement.run()]);
  assert.equal(first.state, 'recorded'); assert.equal(second.state, 'already-used');
  assert.equal((await measurement.run()).state, 'already-used');
  assert.deepEqual(events, ['admit', 'http', 'complete']);
  assert.ok(!JSON.stringify(first).includes(config.apiToken)); assert.ok(!JSON.stringify(first).includes(lease)); assert.ok(!JSON.stringify(first).includes('never-return'));
});

test('OFF, malformed config, URLs and query injection never acquire authority', () => {
  let calls = 0;
  const operator: RecoveryOperatorPort = { async admit() { calls++; return {}; }, async complete() { calls++; return {}; } };
  for (const delta of [{ enabled: false }, { caseId: 'invalid' }, { workerId: '../other' }, { apiToken: 'bad\nsecret' }, { timeoutMs: 99 }, { timeoutMs: 15001 },
    ...['https://other.invalid/teams/19', '//other.invalid/teams/19', '/teams/19?include=players', '/teams/19#x', '/teams/../19', '/teams/%31%39'].map(relativePath => ({ relativePath }))]) {
    assert.throws(() => createRecoveryMeasurement({ ...config, ...delta } as typeof config, operator), /Recovery measurement unavailable/);
  }
  assert.equal(calls, 0);
});

test('denial, malformed admission and failed authority are fail-closed with zero HTTP', async () => {
  let http = 0, completes = 0;
  for (const answer of [{ allowed: false }, { allowed: true, token: 'bad' }, { allowed: true, token: lease, extra: true }, { allowed: false, token: lease }, null]) {
    const measurement = createRecoveryMeasurement(config, {
      async admit() { return answer; }, async complete() { completes++; return { persisted: true }; },
    }, async () => { http++; return Response.json(data); });
    assert.equal((await measurement.run()).state, answer?.allowed === false && Object.keys(answer).length === 1 ? 'denied' : 'unavailable');
  }
  const throwing = createRecoveryMeasurement(config, { async admit() { throw Error(config.apiToken); }, async complete() { throw Error(); } }, async () => { http++; return Response.json(data); });
  const result = await throwing.run(); assert.equal(result.state, 'unavailable'); assert.ok(!JSON.stringify(result).includes(config.apiToken));
  assert.equal(http, 0); assert.equal(completes, 0);
});

test('HTTP failure, 429 and oversized/invalid body never retry and persist only normalized quota', async () => {
  for (const mode of ['429', 'transport', 'oversized', 'invalid-json'] as const) {
    let http = 0, completes = 0;
    const measurement = createRecoveryMeasurement(config, {
      async admit() { return { allowed: true, token: lease }; },
      async complete(args) { completes++; assert.equal(args.observation.status, mode === '429' ? 429 : 0); return { persisted: true }; },
    }, async () => {
      http++;
      if (mode === 'transport') throw Error(config.apiToken);
      if (mode === 'oversized') return new Response('x'.repeat(128 * 1024 + 1));
      if (mode === 'invalid-json') return new Response('private-provider-error');
      return Response.json({ rate_limit: { remaining: 0, requested_entity: 'Team', resets_in_seconds: 120 } }, { status: 429, headers: { 'retry-after': '180' } });
    });
    const result = await measurement.run(); assert.equal(result.state, 'recorded'); assert.equal(http, 1); assert.equal(completes, 1);
    if (mode === '429') assert.ok(Date.parse(result.observation!.cooldownUntil!) > Date.parse(result.observation!.resetAt!));
    else assert.equal(result.observation?.remaining, null);
    assert.equal((await measurement.run()).state, 'already-used'); assert.equal(http, 1);
  }
});

test('completion failure never publishes the observation or repeats the provider request', async () => {
  for (const answer of [{ persisted: false }, { persisted: true, leaked: 'secret' }, null]) {
    let http = 0;
    const measurement = createRecoveryMeasurement(config, { async admit() { return { allowed: true, token: lease }; }, async complete() { return answer; } }, async () => { http++; return Response.json(data); });
    const result = await measurement.run(); assert.equal(result.state, 'unavailable'); assert.equal(result.observation, undefined);
    assert.equal((await measurement.run()).state, 'already-used'); assert.equal(http, 1);
  }
});

test('abort fences late admission and freezes configuration and operator methods', async () => {
  let release!: (answer: unknown) => void, http = 0;
  const mutable = { ...config };
  const operator: { admit: RecoveryOperatorPort['admit']; complete: RecoveryOperatorPort['complete'] } = {
    admit: async () => new Promise(resolve => { release = resolve; }), complete: async () => ({ persisted: true }),
  };
  const measurement = createRecoveryMeasurement(mutable, operator, async () => { http++; return Response.json(data); });
  const controller = new AbortController(); const pending = measurement.run(controller.signal);
  mutable.relativePath = '/teams/99'; mutable.apiToken = 'changed-provider-secret'; operator.admit = async () => ({ allowed: true, token: lease });
  controller.abort(); assert.equal((await pending).state, 'unavailable');
  release({ allowed: true, token: lease }); await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(http, 0); assert.equal((await measurement.run()).state, 'already-used');
});

test('abort cancels a stalled body without waiting for its cancellation hook', async () => {
  let cancelled = 0, http = 0, completes = 0, started!: () => void;
  const reading = new Promise<void>(resolve => { started = resolve; });
  const measurement = createRecoveryMeasurement(config, {
    async admit() { return { allowed: true, token: lease }; },
    async complete() { completes++; return { persisted: true }; },
  }, async () => {
    http++;
    return new Response(new ReadableStream<Uint8Array>({
      pull() { started(); return new Promise(() => {}); },
      cancel() { cancelled++; return new Promise(() => {}); },
    }), { headers: { 'content-type': 'application/json' } });
  });
  const controller = new AbortController(), pending = measurement.run(controller.signal);
  await reading; await new Promise(resolve => setTimeout(resolve, 0)); controller.abort();
  assert.equal((await pending).state, 'unavailable');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(cancelled, 1); assert.equal(http, 1); assert.equal(completes, 0);
  assert.equal((await measurement.run()).state, 'already-used');
});
