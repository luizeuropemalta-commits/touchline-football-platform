import assert from 'node:assert/strict';
import test from 'node:test';
import { createVisibleOwnerAvatarRefresh, refreshPublicOwnerAvatar } from '../lib/touchlineArena/clubowner-avatar-refresh.ts';
const id = '20000000-0000-4000-8000-000000000001';
const tick = () => new Promise(resolve => setImmediate(resolve));
test('hidden consumer is removed from real metadata queue before transport, then resumes when visible', async () => {
  let release!: (value: Response) => void;
  const blocker = refreshPublicOwnerAvatar(id, new AbortController().signal, (async () => new Promise<Response>(resolve => { release = resolve; })) as typeof fetch);
  await tick();
  let visible = true, requests = 0, accepted = 0, errors = 0;
  const lifecycle = createVisibleOwnerAvatarRefresh(() => visible,
    signal => refreshPublicOwnerAvatar(id, signal, (async () => { requests++; return new Response(null, {status:404}); }) as typeof fetch),
    () => accepted++, () => errors++);
  lifecycle.refresh(); // queued behind blocker
  visible = false; lifecycle.refresh(); // visibilitychange or leaving viewport
  release(new Response(null, {status:404})); await blocker; await tick();
  assert.equal(requests, 0); assert.equal(accepted, 0); assert.equal(errors, 0);
  visible = true; lifecycle.refresh(); await tick();
  assert.equal(requests, 1); assert.equal(accepted, 1); assert.equal(errors, 0);
  lifecycle.dispose();
});
test('hiding aborts active transport, ignores late result and allows immediate visible retry', async () => {
  let visible = true;
  const pending: {signal: AbortSignal; resolve: (value:string)=>void}[] = [];
  const accepted: string[] = [];
  const lifecycle = createVisibleOwnerAvatarRefresh(() => visible,
    signal => new Promise<string>(resolve => pending.push({signal, resolve})),
    value => accepted.push(value), () => assert.fail('cancel must not show error'));
  lifecycle.refresh(); lifecycle.refresh(); assert.equal(pending.length,1);
  visible = false; lifecycle.refresh(); assert.equal(pending[0].signal.aborted,true);
  visible = true; lifecycle.refresh(); assert.equal(pending.length,2);
  pending[0].resolve('stale'); await tick(); assert.deepEqual(accepted,[]);
  lifecycle.refresh(); assert.equal(pending.length,2); // stale finally cannot erase current request
  pending[1].resolve('current'); await tick(); assert.deepEqual(accepted,['current']);
  lifecycle.refresh(); lifecycle.dispose(); assert.equal(pending[2].signal.aborted,true);
  pending[2].resolve('after unmount'); await tick(); lifecycle.refresh();
  assert.equal(pending.length,3); assert.deepEqual(accepted,['current']);
});
