import assert from "node:assert/strict";
import test from "node:test";
import { runAvatarRetentionDiscoveryPage } from "../lib/touchlineArena/club-owner-avatar-retention-discovery-worker.ts";
import type { AvatarRetentionRpc } from "../lib/touchlineArena/club-owner-avatar-retention-worker.ts";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const origin = "https://xgxbwqxjssxxuihuwmgy.supabase.co";
const digest = "a".repeat(64), prefix = `${id(1)}/${id(2)}/`;
const file = { id: id(3), name: `${digest}.webp` };
type Options = { page?: unknown; changeScan?: (scan: Record<string, unknown>) => void; registration?: unknown; registrationError?: boolean; environment?: () => void; onList?: () => void; signal?: AbortSignal; empty?: boolean; ack?: unknown };
async function run(options: Options = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = []; let lists = 0;
  const rpc: AvatarRetentionRpc = async (name, args) => {
    calls.push({ name, args }); assert.equal(args.p_project_ref, "xgxbwqxjssxxuihuwmgy");
    if (name.includes("claim")) {
      assert.equal(args.p_limit, 1);
      const scan = { actorId: id(1), operationId: id(2), prefix, attemptId: args.p_attempt, offset: 0, limit: 25, expiresAt: new Date(Date.now() + 30_000).toISOString() };
      options.changeScan?.(scan);
      return { data: { version: 1, allowed: true, scans: options.empty ? [] : [scan] }, error: null };
    }
    if (name.includes("register")) return { data: options.registration ?? { version: 1, allowed: true, candidateId: id(4) }, error: options.registrationError ? { message: "private error" } : null };
    return { data: options.ack ?? { version: 1, acknowledged: true, reconciliationRequired: true }, error: null };
  };
  const result = await runAvatarRetentionDiscoveryPage({ supabaseOrigin: origin, assertEnvironment: options.environment ?? (() => {}), rpc,
    listPage: async (actualPrefix, offset, limit, signal) => {
      lists++; assert.equal(actualPrefix, prefix); assert.equal(offset, 0); assert.equal(limit, 25); assert.equal(signal.aborted, false);
      options.onList?.(); return options.page ?? [file];
    },
  }, options.signal ?? new AbortController().signal);
  return { result, calls, lists };
}
test("one prefix -> exact registration -> complete ACK; no deletion seam", async () => {
  const { result, calls } = await run();
  assert.deepEqual(result, { status: "processed", listed: 1, registered: 1, denied: 0, skipped: 0, acknowledged: true });
  assert.deepEqual(calls.map(c => c.name), ["touchline_claim_qa_avatar_retention_discovery", "touchline_register_qa_avatar_retention_candidate", "touchline_ack_qa_avatar_retention_discovery"]);
  assert.deepEqual(calls[1].args, { p_project_ref: "xgxbwqxjssxxuihuwmgy", p_actor: id(1), p_operation: id(2), p_digest: digest, p_object_key: `${prefix}${digest}.webp` });
  assert.equal(calls[2].args.p_complete, true); assert.equal(calls[2].args.p_next_offset, 0);
  assert.equal(calls[2].args.p_attempt, calls[0].args.p_attempt);
});
test("empty page ACK restarts future cycle; empty batch performs no list or ACK", async () => {
  const page = await run({ page: [] }); assert.equal(page.result.acknowledged, true);
  assert.equal(page.calls.at(-1)!.args.p_complete, true); assert.equal(page.calls.at(-1)!.args.p_next_offset, 0);
  const batch = await run({ empty: true }); assert.equal(batch.lists, 0); assert.equal(batch.calls.length, 1);
});
test("full 25-object page advances exactly25 only after every registration", async () => {
  const { result, calls } = await run({ page: Array.from({ length: 25 }, (_, n) => ({ id: id(n + 10), name: `${n.toString(16).padStart(64, "0")}.webp` })) });
  assert.equal(result.registered, 25); assert.equal(calls.length, 27);
  assert.equal(calls.at(-1)!.args.p_next_offset, 25); assert.equal(calls.at(-1)!.args.p_complete, false);
});
test("folders, path-like names and nonfiles are skipped, never recursed or registered", async () => {
  const { result, calls } = await run({ page: [{ id: null, name: file.name }, { id: id(5), name: `../${file.name}` }, { id: "not-uuid", name: file.name }, null, { id: id(5), name: "A".repeat(64) + ".webp" }, file] });
  assert.equal(result.skipped, 5); assert.equal(result.registered, 1); assert.equal(calls.length, 3);
});
test("explicit authority denial is durably processed, malformed/lost registration stops without ACK", async () => {
  const denied = await run({ registration: { version: 1, allowed: false } });
  assert.equal(denied.result.denied, 1); assert.equal(denied.result.acknowledged, true);
  for (const options of [{ registrationError: true }, { registration: {} }, { registration: { version: 1, allowed: true } }, { registration: { version: 1, allowed: "false" } }]) {
    const failed = await run(options); assert.equal(failed.result.status, "incomplete");
    assert.equal(failed.calls.some(c => c.name.includes("ack_")), false);
  }
});
test("foreign/malformed/expired claim is rejected before list", async () => {
  for (const changeScan of [
    (s: Record<string, unknown>) => { s.actorId = "invalid"; },
    (s: Record<string, unknown>) => { s.prefix = "other/"; },
    (s: Record<string, unknown>) => { s.attemptId = id(99); },
    (s: Record<string, unknown>) => { s.offset = 1; },
    (s: Record<string, unknown>) => { s.offset = 2_147_483_625; },
    (s: Record<string, unknown>) => { s.limit = 26; },
    (s: Record<string, unknown>) => { s.expiresAt = new Date(Date.now() - 1).toISOString(); },
    (s: Record<string, unknown>) => { s.expiresAt = new Date(Date.now() + 60_000).toISOString(); },
  ]) { const failed = await run({ changeScan }); assert.equal(failed.result.status, "incomplete"); assert.equal(failed.lists, 0); }
});
test("oversized or invalid page, environment drift and cancellation never ACK", async () => {
  for (const page of [{ data: [file] }, Array(26).fill(file)]) {
    const failed = await run({ page }); assert.equal(failed.result.status, "incomplete"); assert.equal(failed.calls.length, 1);
  }
  let drift = false;
  const environment = await run({ environment: () => { if (drift) throw Error("changed"); }, onList: () => { drift = true; } });
  assert.equal(environment.result.status, "incomplete"); assert.equal(environment.calls.length, 1);
  const controller = new AbortController();
  const cancelled = await run({ signal: controller.signal, onList: () => controller.abort() });
  assert.equal(cancelled.result.status, "incomplete"); assert.equal(cancelled.calls.length, 1);
});
test("unconfirmed ACK reports incomplete rather than successful cursor advancement", async () => {
  const failed = await run({ ack: { version: 1, acknowledged: false } });
  assert.equal(failed.result.status, "incomplete"); assert.equal(failed.result.acknowledged, false);
});
test("caller cannot replace validated scan identity while listPage is pending", async () => {
  let captured: Record<string, unknown> | undefined;
  const result = await run({ changeScan: scan => { captured = scan; }, onList: () => {
    Object.assign(captured!, { actorId: id(99), operationId: id(98), prefix: "foreign/", offset: 500, attemptId: id(97) });
  } });
  assert.equal(result.result.acknowledged, true);
  assert.equal(result.calls[1].args.p_actor, id(1)); assert.equal(result.calls[1].args.p_operation, id(2));
  assert.equal(result.calls[1].args.p_object_key, `${prefix}${file.name}`);
  assert.equal(result.calls[2].args.p_expected_offset, 0); assert.equal(result.calls[2].args.p_actor, id(1));
});
