import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import * as contract from "../lib/touchlineArena/club-owner-avatar-selection-contract.ts";
import * as client from "../lib/touchlineArena/club-owner-avatar-client.ts";
import * as copy from "../lib/touchlineArena/club-owner-avatar-ui-i18n.ts";
import { TOUCHLINE_APPROVED_LOCALES } from "../lib/touchlineArena/i18n.ts";

const actor = "11111111-1111-4111-8111-111111111111", operation = "22222222-2222-4222-8222-222222222222";
const recovery = { accountId: actor, revision: "0", avatarUrl: null, generation: "0", activeOperationId: null,
  fencedThroughGeneration: "-1", operationId: null, operationState: null, committedRevision: null,
  uploadAllowed: true, canUpload: false as const, readyForSelection: false as const };
test("selection uses independent fail-closed capabilities and leaves recovery DTO unchanged", () => {
  assert.equal(contract.projectClubOwnerAvatarSelectionContext(recovery), null);
  assert.equal(contract.projectClubOwnerAvatarSelectionContext(recovery, true), null);
  assert.equal(contract.projectClubOwnerAvatarSelectionContext(recovery, false, true), null);
  assert.equal(contract.projectClubOwnerAvatarSelectionContext(recovery, true, true)?.accountId, actor);
  assert.equal(recovery.canUpload, false); assert.equal(recovery.readyForSelection, false);
  for (const patch of [{ uploadAllowed: false }, { activeOperationId: operation }, { operationId: operation }, { revision: "9223372036854775807" },
    { generation: "9223372036854775806" }, { fencedThroughGeneration: "0" }, { accountId: "other" }, { revision: "1", avatarUrl: "https://external.invalid" }]) {
    assert.equal(contract.projectClubOwnerAvatarSelectionContext({ ...recovery, ...patch }, true, true), null);
  }
});
test("local byte admission distinguishes HEIC from supported signatures without treating it as decoding", () => {
  assert.equal(contract.inspectClubOwnerAvatarSelection(Uint8Array.of(255,216,255,1), "image/jpeg"), null);
  assert.equal(contract.inspectClubOwnerAvatarSelection(Uint8Array.of(1,2,3), "image/jpeg"), "invalid");
  assert.equal(contract.inspectClubOwnerAvatarSelection(Uint8Array.of(1), "image/heic"), "heic");
  assert.equal(contract.inspectClubOwnerAvatarSelection(new Uint8Array(4_000_001), "image/png"), "invalid");
});
test("selection copy covers approved eight locales behind the real catalogue gate", () => {
  for (const { code } of TOUCHLINE_APPROVED_LOCALES) {
    const translated = copy.getTouchlineClubOwnerAvatarSelectionCopy(code, true);
    assert.equal(Object.keys(translated).length, 9);
    for (const value of Object.values(translated)) assert.ok(value.trim());
    assert.match(translated.guidance, /JPEG/); assert.match(translated.heic, /HEIC\/HEIF/);
    if (!["en-GB", "pt-BR"].includes(code)) assert.deepEqual(copy.getTouchlineClubOwnerAvatarSelectionCopy(code), copy.getTouchlineClubOwnerAvatarSelectionCopy("en-GB"));
  }
});

type Node = { type: unknown; props: Record<string, unknown> };
const nodes = (tree: unknown, type: string): Node[] => Array.isArray(tree) ? tree.flatMap(child => nodes(child, type))
  : tree && typeof tree === "object" && "props" in tree ? [...((tree as Node).type === type ? [tree as Node] : []), ...nodes((tree as Node).props.children, type)] : [];
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture(enabled = true, retentionReady = true) {
  let cursor = 0, mounted = false, now = 0, identity = true;
  const slots: unknown[] = [], effects: { index: number; callback: () => void | (() => void) }[] = [];
  const cleanups = new Map<number, () => void>(), timers = new Set<() => void>();
  const calls: string[] = [], requests: RequestInit[] = [];
  let response = () => Response.json({ ok: false, error: "OUTPUT_TOO_LARGE", state: "unknown" }, { status: 422 });
  const hook = {
    useState(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (value: unknown) => { slots[index] = value; }]; },
    useRef(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useId: () => "selection-test",
    useLayoutEffect(callback: () => void | (() => void), deps: unknown[]) { const index = cursor++, previous = slots[index] as unknown[] | undefined;
      if (!mounted || !previous || deps.some((value, i) => value !== previous[i])) { effects.push({ index, callback }); slots[index] = deps; } },
  };
  const dependencies: Record<string, unknown> = {
    react: hook, "react/jsx-runtime": jsx,
    "@/lib/touchlineArena/club-owner-avatar-client": client,
    "@/lib/touchlineArena/club-owner-avatar-selection-contract": contract,
    "@/lib/touchlineArena/club-owner-avatar-ui-i18n": copy,
    "./TouchlineGlobalNavigation.module.css": { default: { link: "shared-control" } },
  };
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../components/touchline/ClubOwnerAvatarUploadSelection.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
    Uint8Array, Blob, crypto: { randomUUID: () => operation }, performance: { now: () => now },
    URL: { createObjectURL: () => { calls.push("preview"); return "blob:local-preview"; }, revokeObjectURL: () => calls.push("revoke") },
    setTimeout: (callback: () => void) => { timers.add(callback); return callback; }, clearTimeout: (callback: () => void) => timers.delete(callback),
    fetch: async (_input: unknown, init: RequestInit) => { requests.push(init); return response(); },
  });
  const Component = exports.default as (props: unknown) => unknown;
  const props = { context: contract.projectClubOwnerAvatarSelectionContext(recovery, true, true), enabled, retentionReady, visible: true, locale: "en-GB",
    isCurrent: () => identity, registerUpload: () => {}, onRefreshRequired: () => calls.push("refresh") };
  function render() { cursor = 0; return Component(props); }
  function commit() { for (const effect of effects.splice(0)) { cleanups.get(effect.index)?.(); const result = effect.callback(); if (result) cleanups.set(effect.index, result); } mounted = true; return render(); }
  render(); commit();
  return { calls, requests, render,
    choose: () => { const input = nodes(render(), "input")[0]; assert.ok(input); (input.props.onChange as (event: unknown) => void)({ currentTarget: {
      value: "", files: [{ size: 4, type: "image/jpeg", arrayBuffer: async () => Uint8Array.of(255,216,255,1).buffer }],
    } }); },
    confirm: () => { const button = nodes(render(), "button")[0]; assert.ok(button); (button.props.onClick as () => void)(); },
    expire: () => { now = 60_001; for (const timer of [...timers]) timer(); },
    identity: () => { identity = false; },
    committed: () => { response = () => Response.json({ ok: true, state: "committed", requiresRefresh: true, accountId: actor, operationId: operation, revision: "1", avatarUrl: `/api/account/avatar?version=${operation}` }); },
    dispose: () => { for (const cleanup of cleanups.values()) cleanup(); },
  };
}
test("real selection component is dormant by either gate and file choice alone sends nothing", async () => {
  for (const gates of [[false, false], [true, false], [false, true]]) { const h = fixture(...gates as [boolean, boolean]); assert.equal(h.render(), null); assert.equal(h.requests.length, 0); h.dispose(); }
  const h = fixture(); h.choose(); await tick(); assert.equal(h.requests.length, 0); assert.equal(nodes(h.render(), "img")[0].props.src, "blob:local-preview"); h.dispose(); assert.ok(h.calls.includes("revoke"));
});
test("explicit confirm sends once; unknown including output cap blocks replacement and preserves old photo", async () => {
  const h = fixture(); h.choose(); await tick(); h.confirm(); await tick();
  assert.equal(h.requests.length, 1); assert.equal(nodes(h.render(), "input")[0].props.disabled, true);
  h.choose(); await tick(); assert.equal(h.requests.length, 1); assert.equal(nodes(h.render(), "button").length, 0);
  assert.ok(!h.calls.includes("refresh")); h.dispose();
});
test("committed result requests authoritative refresh, not preview publication; expiry and identity block confirm", async () => {
  const committed = fixture(); committed.committed(); committed.choose(); await tick(); committed.confirm(); await tick();
  assert.equal(committed.calls.filter(value => value === "refresh").length, 1); assert.equal(nodes(committed.render(), "img")[0].props.src, "blob:local-preview"); committed.dispose();
  const expired = fixture(); expired.choose(); await tick(); expired.expire(); assert.equal(nodes(expired.render(), "button").length, 0); assert.equal(expired.requests.length, 0); expired.dispose();
  const drift = fixture(); drift.choose(); await tick(); drift.identity(); drift.confirm(); await tick(); assert.equal(drift.requests.length, 0); drift.dispose();
});

// Compose both real components and real C2 controllers. Only React scheduling,
// auth notifications, time, object URLs and transport are controlled boundaries.
function hostFixture() {
  type Hooks = { slots: unknown[]; cursor: number; effects: { index: number; callback: () => void | (() => void) }[]; cleanup: Map<number, () => void> };
  const makeHooks = (): Hooks => ({ slots: [], cursor: 0, effects: [], cleanup: new Map() });
  const parent = makeHooks(), child = makeHooks(); let active = parent, now = 0;
  const timers = new Map<() => void, number>(), calls: string[] = [], requests: string[] = [];
  let finishUpload!: (value: Response) => void;
  const uploadResponse = new Promise<Response>(resolve => { finishUpload = resolve; });
  const hook = {
    useState(initial: unknown) { const scope = active, index = scope.cursor++; if (!(index in scope.slots)) scope.slots[index] = initial;
      return [scope.slots[index], (value: unknown) => { scope.slots[index] = value; }]; },
    useRef(initial: unknown) { const scope = active, index = scope.cursor++; if (!(index in scope.slots)) scope.slots[index] = { current: initial }; return scope.slots[index]; },
    useId: () => active === parent ? "host" : "child",
    useLayoutEffect(callback: () => void | (() => void), deps: unknown[]) { const scope = active, index = scope.cursor++, previous = scope.slots[index] as unknown[] | undefined;
      if (!previous || deps.some((value, i) => value !== previous[i])) { scope.slots[index] = deps; scope.effects.push({ index, callback }); } },
  };
  const request = async (input: unknown, init: RequestInit) => {
    requests.push(String(input));
    if (input === "/api/account/avatar") return uploadResponse;
    assert.equal(input, "/api/account/avatar/recovery");
    assert.deepEqual(JSON.parse(init.body as string), { action: "status" });
    return Response.json({ ok: true, state: "observed", context: recovery });
  };
  const dependencies: Record<string, unknown> = {
    react: hook, "react/jsx-runtime": jsx,
    "@/lib/touchlineArena/club-owner-avatar-client": client,
    "@/lib/touchlineArena/club-owner-avatar-selection-contract": contract,
    "@/lib/touchlineArena/club-owner-avatar-ui-i18n": copy,
    "next/navigation": { useRouter: () => ({ refresh: () => calls.push("refresh") }) },
    "@/lib/supabase/client": { createClient: () => ({ auth: { onAuthStateChange: (callback: (event: string, session: { user: { id: string } }) => void) => {
      calls.push("auth-subscription"); callback("INITIAL_SESSION", { user: { id: actor } }); return { data: { subscription: { unsubscribe: () => calls.push("unsubscribe") } } };
    } } }) },
    "./TouchlineGlobalNavigation.module.css": { default: { link: "shared-control" } },
    "./ClubOwnerMarketHeader.module.css": { default: {} },
  };
  function compile(name: string) {
    const exports: Record<string, unknown> = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../components/touchline/${name}.tsx`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, { exports, require: (path: string) => { assert.ok(path in dependencies, path); return dependencies[path]; },
      Uint8Array, Blob, crypto: { randomUUID: () => operation }, performance: { now: () => now }, fetch: request,
      URL: { createObjectURL: () => "blob:preview", revokeObjectURL: () => calls.push("revoke") },
      setTimeout: (callback: () => void, ms: number) => { timers.set(callback, ms); return callback; }, clearTimeout: (callback: () => void) => timers.delete(callback),
    });
    return exports.default as (props: unknown) => unknown;
  }
  const Child = compile("ClubOwnerAvatarUploadSelection"); dependencies["./ClubOwnerAvatarUploadSelection"] = { default: Child };
  const Parent = compile("ClubOwnerAvatarControl");
  function expand(tree: unknown): unknown {
    if (Array.isArray(tree)) return tree.map(expand);
    if (!tree || typeof tree !== "object" || !("props" in tree)) return tree;
    const node = tree as Node;
    if (node.type === Child) { active = child; child.cursor = 0; return expand(Child(node.props)); }
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  }
  function render() {
    active = parent; parent.cursor = 0;
    return expand(Parent({ accountId: actor, context: recovery, locale: "en-GB", children: "OLD PHOTO", avatarSelectionEnabled: true, retentionReady: true }));
  }
  function settle() {
    let tree = render();
    for (let attempt = 0; attempt < 8 && (parent.effects.length || child.effects.length); attempt++) {
      for (const scope of [parent, child]) for (const effect of scope.effects.splice(0)) { scope.cleanup.get(effect.index)?.(); const cleanup = effect.callback(); if (cleanup) scope.cleanup.set(effect.index, cleanup); }
      tree = render();
    }
    return tree;
  }
  function clickAction(action: string) { const button = nodes(settle(), "button").find(node => node.props["data-avatar-action"] === action); assert.ok(button); (button.props.onClick as () => void)(); return settle(); }
  settle(); clickAction("open");
  return { calls, requests, settle, clickAction, finishUpload,
    choose: () => { const input = nodes(settle(), "input")[0]; assert.ok(input); (input.props.onChange as (value: unknown) => void)({ currentTarget: { value: "", files: [{ size: 4, type: "image/jpeg", arrayBuffer: async () => Uint8Array.of(255,216,255,1).buffer }] } }); },
    confirm: () => { const button = nodes(settle(), "button").find(node => node.props.children === "Confirm photo upload"); assert.ok(button); (button.props.onClick as () => void)(); settle(); },
    expire: () => { now = 60_001; for (const [callback, ms] of [...timers]) if (ms === 60_000) callback(); return settle(); },
    dispose: () => { for (const scope of [child, parent]) for (const cleanup of scope.cleanup.values()) cleanup(); },
  };
}
test("real host observation during upload retires preview without losing committed or uncertain result", async () => {
  for (const committed of [true, false]) {
    const h = hostFixture(); h.choose(); await tick(); h.confirm();
    assert.deepEqual(h.requests, ["/api/account/avatar"]);
    h.clickAction("observe"); await tick();
    assert.equal(nodes(h.settle(), "img").length, 0); assert.ok(h.calls.includes("revoke"));
    h.finishUpload(committed ? Response.json({ ok: true, state: "committed", requiresRefresh: true, accountId: actor, operationId: operation, revision: "1", avatarUrl: `/api/account/avatar?version=${operation}` })
      : Response.json({ ok: false, error: "OUTPUT_TOO_LARGE", state: "unknown" }, { status: 422 }));
    await tick(); const tree = h.settle();
    assert.equal(h.calls.filter(value => value === "refresh").length, committed ? 1 : 0);
    assert.equal(nodes(tree, "input")[0].props.disabled, true);
    assert.ok(nodes(tree, "section").every(node => node.props["aria-busy"] !== true));
    assert.equal(h.calls.filter(value => value === "auth-subscription").length, 1);
    h.choose(); await tick(); assert.equal(h.requests.filter(value => value === "/api/account/avatar").length, 1); h.dispose();
  }
});
test("real host TTL releases pending-upload preview without cancelling uncertain server work", async () => {
  const h = hostFixture(); h.choose(); await tick(); h.confirm();
  assert.equal(nodes(h.settle(), "img").length, 1);
  assert.equal(nodes(h.expire(), "img").length, 0); assert.ok(h.calls.includes("revoke"));
  h.finishUpload(Response.json({ ok: false, error: "OUTPUT_TOO_LARGE", state: "unknown" }, { status: 422 })); await tick();
  assert.equal(nodes(h.settle(), "input")[0].props.disabled, true); assert.equal(h.requests.length, 1); assert.ok(!h.calls.includes("refresh")); h.dispose();
});
