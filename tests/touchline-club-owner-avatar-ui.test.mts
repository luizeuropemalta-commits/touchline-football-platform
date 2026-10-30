import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import * as client from "../lib/touchlineArena/club-owner-avatar-client.ts";
import { startAccountLocaleIdentityObserver } from "../lib/touchlineArena/account-locale-identity-observer.ts";
import * as catalogue from "../lib/touchlineArena/club-owner-avatar-ui-i18n.ts";
import * as localeModule from "../lib/touchlineArena/i18n.ts";
import * as selection from "../lib/touchlineArena/club-owner-avatar-selection-contract.ts";
import * as profileMetrics from "../lib/touchlineArena/club-owner-profile-metrics.ts";
import * as planShowcase from "../lib/touchlineArena/club-owner-plan-showcase.ts";
import * as acquisition from "../lib/touchlineFantasy/club-acquisition.ts";
import * as budgetCopy from "../lib/touchlineFantasy/market-budget-i18n.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";

const actor = "11111111-1111-4111-8111-111111111111", other = "33333333-3333-4333-8333-333333333333";
const operation = "22222222-2222-4222-8222-222222222222";
const context = (patch: Record<string, unknown> = {}) => ({ accountId: actor, revision: "0", avatarUrl: null, generation: "2",
  activeOperationId: operation, fencedThroughGeneration: "-1", operationId: operation, operationState: "pending", committedRevision: null,
  uploadAllowed: true, canUpload: false, readyForSelection: false, ...patch });
type Node = { type: unknown; props: Record<string, unknown> };
const nodes = (tree: unknown, type: string): Node[] => Array.isArray(tree) ? tree.flatMap(child => nodes(child, type))
  : tree && typeof tree === "object" && "props" in tree ? [...((tree as Node).type === type ? [tree as Node] : []), ...nodes((tree as Node).props.children, type)] : [];
const text = (tree: unknown): string => typeof tree === "string" ? tree : Array.isArray(tree) ? tree.map(text).join(" ")
  : tree && typeof tree === "object" && "props" in tree ? (tree as Node).type === "dialog" && (tree as Node).props["aria-modal"] !== true ? "" : text((tree as Node).props.children) : "";
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }
function compile(path: string, dependencies: Record<string, unknown>, globals = {}) {
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2017 },
  }).outputText, { exports, ...globals, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return exports;
}
function copyModule(_drafts = false) { return catalogue; }

test("real header forwards separate dormant selection capabilities without changing recovery identity", () => {
  const header = compile("components/touchline/ClubOwnerMarketHeader.tsx", {
    // This fixture inspects capability forwarding, not preview interaction.
    react: { useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, () => {}] },
    "react/jsx-runtime": jsx, "next/image": { default: "img" }, "next/link": { default: "a" },
    "lucide-react": { CalendarDays: "calendar", Camera: "camera", ChevronRight: "chevron-right", Crown: "crown", Diamond: "diamond", LockKeyhole: "lock", Shield: "shield" },
    "@/lib/touchlineArena/club-owner-market-i18n": { getTouchlineClubOwnerMarketCopy: () => ({ nameUnavailable: "Unavailable" }) },
    "@/lib/touchlineArena/club-owner-profile-metrics": profileMetrics,
    "@/lib/touchlineArena/club-owner-plan-showcase": planShowcase,
    "./market/TouchlineMarketMarks": { TouchlineCoinMark: "coin" },
    "./ClubOwnerPlanShowcase": { default: "plan-showcase", ClubOwnerPlanCard: "plan-card" },
    "./ClubOwnerPlanOnboarding": { default: "plan-onboarding" },
    "./ClubOwnerAvatarControl": { default: "avatar-control" },
    "./fantasy/ClubCollectionContext": { useConfirmedClubCollection: () => ({ state: null }) },
    "@/lib/touchlineFantasy/club-acquisition": acquisition,
    "@/lib/touchlineFantasy/market-budget-i18n": budgetCopy,
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    "./ClubOwnerPlanShowcase.module.css": { default: {} },
    "./TouchlineGlobalNavigation.module.css": { default: {} }, "./ClubOwnerMarketHeader.module.css": { default: {} },
  }).default as (props: unknown) => unknown;
  const recovery = context(), owner = { name: "Synthetic", avatarUrl: "", city: "", nationality: "", since: "" };
  for (const flags of [{}, { avatarSelectionEnabled: true }, { retentionReady: true }, { avatarSelectionEnabled: true, retentionReady: true }]) {
    const tree = header({ owner, locale: "en-GB", accountId: actor, avatarContext: recovery, ...flags });
    const controls = nodes(tree, "avatar-control"); assert.equal(controls.length, 1);
    assert.equal(controls[0].props.context, recovery);
    assert.equal(controls[0].props.avatarSelectionEnabled, "avatarSelectionEnabled" in flags && flags.avatarSelectionEnabled === true);
    assert.equal(controls[0].props.retentionReady, "retentionReady" in flags && flags.retentionReady === true);
  }
  assert.equal(nodes(header({ owner, locale: "en-GB", accountId: other, avatarContext: recovery,
    avatarSelectionEnabled: true, retentionReady: true }), "avatar-control").length, 0);
});

// Real component + real C2 controller. Hook slots/effects, auth notifications,
// router and HTTP are controlled boundaries; not a React scheduler or DOM proof.
function fixture(options: { context?: unknown; locale?: string; missingAuth?: boolean; delayedAuth?: boolean; initialSession?: unknown; drafts?: boolean; copy?: Record<string, unknown> } = {}) {
  let props = { accountId: actor, context: Object.hasOwn(options, "context") ? options.context : context(), locale: options.locale ?? "en-GB", children: "EXISTING PORTRAIT", draftLocalesEnabled: options.drafts ?? false };
  let cursor = 0, mounted = false;
  const slots: unknown[] = [], effects: { index: number; callback: () => void | (() => void); deps: unknown[] }[] = [];
  const cleanup = new Map<number, () => void>(); const calls: string[] = [], requests: { input: unknown; init: RequestInit }[] = [];
  const observers = new Set<(event: string, session: unknown) => void>();
  const identityTimers = new Map<number, { callback: () => void; delay: number }>(); let identityTimerId = 0, notifying = false;
  let userResponse = async (): Promise<unknown> => ({ data: { user: { id: actor } }, error: null });
  const notify = (session: unknown) => {
    notifying = true;
    try { for (const callback of observers) callback("SIGNED_IN", session); }
    finally { notifying = false; }
  };
  const timers = new Set<() => void>(); let now = 0;
  let responder = async (_input: unknown, _init: RequestInit): Promise<Response> => Response.json({ ok: true, state: "observed", context: context() });
  const hook = {
    useState(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (next: unknown) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }]; },
    useRef(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useId: () => "avatar-control-test",
    useLayoutEffect(callback: () => void | (() => void), deps: unknown[]) { const index = cursor++, old = slots[index] as unknown[] | undefined;
      if (!mounted || !old || deps.some((item, i) => item !== old[i])) { effects.push({ index, callback, deps }); slots[index] = deps; } },
  };
  const mod = compile("components/touchline/ClubOwnerAvatarControl.tsx", {
    react: hook, "react/jsx-runtime": jsx,
    "react-dom": { createPortal: (node: unknown) => node },
    "lucide-react": { X: "close-icon" },
    "./a11y/TouchlineDialog": { useTouchlineDialog: () => ({ dialogRef: { current: null }, dialogProps: { role: "dialog" } }), useTouchlineDialogScrollLock: () => {} },
    "./ClubOwnerAvatarControl.module.css": { default: {} },
    "next/navigation": { useRouter: () => ({ refresh: () => calls.push("refresh") }) },
    "@/lib/supabase/client": { createClient: () => { calls.push("auth-client"); return options.missingAuth ? null : { auth: {
      getUser: () => { assert.equal(notifying, false, "getUser must run outside the SDK callback"); calls.push("getUser"); return userResponse(); },
      onAuthStateChange(callback: typeof observers extends Set<infer T> ? T : never) {
        observers.add(callback); if (!options.delayedAuth) notify(Object.hasOwn(options, "initialSession") ? options.initialSession : { user: { id: actor } });
        return { data: { subscription: { unsubscribe: () => { calls.push("unsubscribe"); observers.delete(callback); } } } };
      },
    } }; } },
    "@/lib/touchlineArena/account-locale-identity-observer": {
      startAccountLocaleIdentityObserver: (input: Parameters<typeof startAccountLocaleIdentityObserver>[0]) => startAccountLocaleIdentityObserver({ ...input,
        setTimer: (callback, delay) => { identityTimers.set(++identityTimerId, { callback, delay }); return identityTimerId; },
        clearTimer: handle => { identityTimers.delete(handle as number); },
      }),
    },
    "@/lib/touchlineArena/club-owner-avatar-client": { ...client, createClubOwnerAvatarRecoveryClient: (input: Parameters<typeof client.createClubOwnerAvatarRecoveryClient>[0]) => client.createClubOwnerAvatarRecoveryClient({ ...input,
      now: () => now, scheduleTimeout: callback => { timers.add(callback); return () => { timers.delete(callback); }; } }) },
    "@/lib/touchlineArena/club-owner-avatar-ui-i18n": { ...copyModule(options.drafts), ...options.copy },
    "@/lib/touchlineArena/club-owner-avatar-selection-contract": selection,
    "./ClubOwnerAvatarUploadSelection": { default: function DormantSelection() { throw Error("Selection must remain off in recovery fixtures"); } },
    "./TouchlineGlobalNavigation.module.css": { default: { link: "global-link" } },
    "./ClubOwnerMarketHeader.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
  }, { document: { body: {} }, fetch: (input: unknown, init: RequestInit) => {
    assert.equal(input, "/api/account/avatar/recovery"); assert.equal(init.method, "POST"); assert.equal(init.credentials, "same-origin");
    requests.push({ input, init }); return responder(input, init);
  } });
  const Component = mod.default as (props: unknown) => unknown;
  function render() {
    cursor = 0; const tree = Component(props);
    for (const button of nodes(tree, "button")) { const ref = button.props.ref as { current?: unknown } | undefined; if (ref) ref.current = { focus: () => calls.push("focus:portrait") }; }
    for (const section of nodes(tree, "section")) { const ref = section.props.ref as { current?: unknown } | undefined; if (ref) ref.current = { focus: () => calls.push("focus:panel") }; }
    return tree;
  }
  function commit() { for (const effect of effects.splice(0)) { cleanup.get(effect.index)?.(); const dispose = effect.callback(); if (dispose) cleanup.set(effect.index, dispose); } mounted = true; return render(); }
  render(); commit();
  const button = (key: string) => { const found = nodes(render(), "button").find(node => node.props["data-avatar-action"] === key); assert.ok(found, `button ${key}`); return found; };
  return { calls, requests, render, button,
    expire: () => { now = 8_001; for (const callback of [...timers]) callback(); }, timers,
    click: (key: string) => { const found = button(key); assert.notEqual(found.props.disabled, true, key); (found.props.onClick as () => void)(); return commit(); },
    respond: (value: typeof responder) => { responder = value; },
    identity: (id: string | null) => notify(id ? { user: { id } } : null),
    session: notify,
    userResponse: (next: typeof userResponse) => { userResponse = next; },
    identityTimers,
    stepIdentity: () => {
      const entry = [...identityTimers].sort((a, b) => a[1].delay - b[1].delay)[0];
      assert.ok(entry, "an identity task must be scheduled"); const [key, value] = entry; identityTimers.delete(key); value.callback();
    },
    locale: (locale: string) => { props = { ...props, locale }; render(); return commit(); },
    account: (accountId: string) => { props = { ...props, accountId }; render(); return commit(); },
    unmount: () => { for (const dispose of cleanup.values()) dispose(); cleanup.clear(); },
    strictReplay: () => { for (const dispose of cleanup.values()) dispose(); cleanup.clear(); mounted = false; render(); return commit(); },
  };
}

test("C3 OFF and missing identity never request recovery or enable a file picker", () => {
  for (const ctx of [null, context({ uploadAllowed: false }), context({ accountId: other }), context({ canUpload: true })]) {
    const h = fixture({ context: ctx }); assert.deepEqual(h.calls, []); assert.equal(h.requests.length, 0);
    assert.equal(h.button("open").props.disabled, true); assert.equal(nodes(h.render(), "input").length, 0); h.unmount();
  }
  const h = fixture({ missingAuth: true }); assert.equal(h.button("open").props.disabled, true); assert.equal(h.requests.length, 0); h.unmount();
});

test("C3 real control opens locally, observes only by gesture and requires separate inline fence confirmation", async () => {
  const h = fixture(); assert.equal(h.requests.length, 0); h.click("open"); assert.equal(h.requests.length, 0);
  h.click("observe"); await tick(); assert.deepEqual(JSON.parse(h.requests[0].init.body as string), { action: "status" });
  h.click("prepare-fence"); assert.equal(h.requests.length, 1); assert.match(text(h.render()), /does not upload or replace your photo/);
  h.respond(async () => Response.json({ ok: true, state: "observed", barrierStatus: "barrier_applied", context: context({ generation: "3", fencedThroughGeneration: "2", activeOperationId: null, operationId: null, operationState: null }) }));
  h.click("confirm-fence"); await tick();
  assert.deepEqual(JSON.parse(h.requests[1].init.body as string), { action: "fence", generation: "2", expectedActiveOperationId: operation, explicitRecoveryConsent: true });
  assert.equal(h.calls.filter(call => call === "refresh").length, 1); assert.match(text(h.render()), /No photo was uploaded/);
  assert.equal(nodes(h.render(), "input").length, 0); assert.equal(nodes(h.render(), "dialog")[0].props["aria-modal"], true); h.click("close"); assert.equal(nodes(h.render(), "dialog")[0].props["aria-modal"], undefined); h.unmount();
});

test("C3 Back only closes; lost fence keeps its exact pair across close and locale changes", async () => {
  const h = fixture(); h.click("open"); h.click("observe"); await tick(); h.click("prepare-fence"); h.click("close"); assert.equal(h.requests.length, 1);
  h.click("open"); h.click("prepare-fence"); h.respond(async () => { throw Error("PRIVATE_TRANSPORT"); }); h.click("confirm-fence"); await tick();
  const original = h.requests[1].init.body; assert.match(text(h.render()), /unconfirmed/); h.click("close"); h.locale("pt-BR"); h.click("open");
  assert.equal(h.calls.filter(call => call === "auth-client").length, 1); h.click("retry"); await tick();
  assert.equal(h.requests[2].init.body, original); assert.equal(h.calls.filter(call => call === "refresh").length, 0); assert.doesNotMatch(text(h.render()), /PRIVATE_TRANSPORT/); h.unmount();
});

test("C3 pending status cannot fence; account drift and unmount abort and ignore late receipts", async () => {
  for (const mode of ["identity", "unmount", "account"] as const) {
    const h = fixture(), held = deferred<Response>(); h.respond(() => held.promise); h.click("open"); h.click("observe");
    assert.equal(h.button("observe").props.disabled, true); assert.equal(nodes(h.render(), "button").some(node => node.props["data-avatar-action"] === "confirm-fence"), false);
    if (mode === "identity") h.identity(other); else if (mode === "unmount") h.unmount(); else h.account(other);
    assert.equal(h.requests[0].init.signal?.aborted, true); held.resolve(Response.json({ ok: true, state: "observed", context: context() })); await tick();
    assert.equal(h.calls.filter(call => call === "refresh").length, 0); if (mode !== "unmount") { assert.equal(h.button("open").props.disabled, true); h.unmount(); }
  }
});

test("C3 matching session observation and StrictMode cleanup never auto-observe or auto-fence", () => {
  const h = fixture({ delayedAuth: true }); assert.equal(h.button("open").props.disabled, true); h.identity(actor); assert.equal(h.button("open").props.disabled, false);
  h.strictReplay(); assert.equal(h.button("open").props.disabled, true); h.identity(actor); assert.equal(h.button("open").props.disabled, false);
  assert.equal(h.requests.length, 0); h.identity(null); h.identity(actor); assert.equal(h.button("open").props.disabled, true); h.unmount();
});

test("C3 a late fence acknowledgement after identity change or disposal never refreshes the next account", async () => {
  for (const mode of ["identity", "dispose"] as const) {
    const h = fixture(); h.click("open"); h.click("observe"); await tick(); h.click("prepare-fence");
    const held = deferred<Response>(); h.respond(() => held.promise); h.click("confirm-fence");
    h.click("close"); assert.equal(h.requests.length, 2); assert.equal(h.requests[1].init.signal?.aborted, false);
    if (mode === "identity") h.identity(other); else h.unmount();
    assert.equal(h.requests[1].init.signal?.aborted, true);
    held.resolve(Response.json({ ok: true, state: "observed", barrierStatus: "barrier_applied", context: context({ generation: "3", fencedThroughGeneration: "2", activeOperationId: null, operationId: null, operationState: null }) }));
    await tick(); assert.equal(h.calls.filter(call => call === "refresh").length, 0); h.unmount();
  }
});

test("C3 malformed or failed observation is uncertain and offers no fence or file selection", async () => {
  const h = fixture(); h.respond(async () => Response.json({ ok: true, state: "observed", context: context({ readyForSelection: true }) }));
  h.click("open"); h.click("observe"); await tick(); assert.match(text(h.render()), /unconfirmed/);
  assert.equal(nodes(h.render(), "button").some(node => node.props["data-avatar-action"] === "prepare-fence"), false);
  assert.equal(nodes(h.render(), "input").length, 0); assert.equal(h.calls.includes("refresh"), false); h.unmount();
});

test("C3 a request deadline preserves uncertainty and late JSON cannot refresh or enable upload", async () => {
  const h = fixture(); h.click("open"); h.click("observe"); await tick(); h.click("prepare-fence");
  const held = deferred<Response>(); h.respond(() => held.promise); h.click("confirm-fence"); h.expire(); await tick();
  assert.match(text(h.render()), /unconfirmed/); assert.equal(h.requests.length, 2); assert.equal(h.timers.size, 0);
  held.resolve(Response.json({ ok: true, state: "observed", barrierStatus: "barrier_applied", context: context({ generation: "3", fencedThroughGeneration: "2", activeOperationId: null, operationId: null, operationState: null }) }));
  await tick(); assert.equal(h.calls.includes("refresh"), false); assert.match(text(h.render()), /unconfirmed/); h.unmount();
});

test("C3 real handlers consume every copy key including progress, uncertainty, confirmation and blocked states", async () => {
  const keys = ["open", "title", "noUpload", "observe", "observing", "fencing", "unobserved", "observed", "unknown", "refreshRequired", "blocked", "prepareFence", "confirmTitle", "confirmBody", "confirmFence", "retry", "close", "off"];
  const calls: string[] = [], values = Object.fromEntries(keys.map(key => [key, `marker-${key}`]));
  const copy = { getTouchlineClubOwnerAvatarUiCopy: (locale: string) => { calls.push(locale); return values; } };
  let captured = ""; const capture = (h: ReturnType<typeof fixture>) => { captured += text(h.render()) + nodes(h.render(), "button").map(button => button.props["aria-label"] ?? "").join(" "); };
  const off = fixture({ context: null, copy, locale: "ar-SA" }); capture(off); off.unmount();
  const h = fixture({ copy, locale: "ar-SA" }); capture(h); h.click("open"); capture(h);
  const held = deferred<Response>(); h.respond(() => held.promise); h.click("observe"); capture(h);
  held.resolve(Response.json({ ok: true, state: "observed", context: context() })); await tick(); capture(h);
  h.click("prepare-fence"); capture(h); h.respond(async () => { throw Error(); }); h.click("confirm-fence"); capture(h); await tick(); capture(h);
  h.respond(async () => Response.json({ ok: true, state: "observed", barrierStatus: "barrier_applied", context: context({ generation: "3", fencedThroughGeneration: "2", activeOperationId: null, operationId: null, operationState: null }) }));
  h.click("retry"); await tick(); capture(h); h.identity(other); capture(h); h.unmount();
  for (const key of keys) assert.ok(captured.includes(`marker-${key}`), key); assert.ok(calls.every(locale => locale === "ar-SA"));
});

test("C3 all eight draft catalogues reach the real UI through an isolated seam; public six remain gated", () => {
  const copy = copyModule(); const catalogues = copy.TOUCHLINE_CLUB_OWNER_AVATAR_UI_CATALOGUES as Record<string, Record<string, string>>;
  const getter = copy.getTouchlineClubOwnerAvatarUiCopy as (locale?: unknown) => Record<string, string>;
  const codes = localeModule.TOUCHLINE_APPROVED_LOCALES.map(item => item.code);
  assert.deepEqual(Object.keys(catalogues), codes); assert.equal(getter("en-GB").title, "Profile photo recovery"); assert.equal(getter("pt-BR").title, "Recuperação da foto do perfil");
  for (const locale of codes) {
    const h = fixture({ locale, drafts: true }); h.click("open"); assert.ok(text(h.render()).includes(catalogues[locale].title));
    assert.ok(text(h.render()).includes(catalogues[locale].noUpload)); assert.equal(h.button("observe").props.children, catalogues[locale].observe); h.unmount();
    assert.deepEqual(Object.keys(catalogues[locale]), Object.keys(catalogues["en-GB"]));
    for (const value of Object.values(catalogues[locale])) assert.ok(value.trim());
    if (!["en-GB", "pt-BR"].includes(locale)) assert.equal(getter(locale), catalogues["en-GB"]);
  }
  for (const locale of [null, undefined, "invalid"]) assert.equal(getter(locale), catalogues["en-GB"]);
});

test("C3 pending identity and later drift use neutral session copy without claiming a change or requesting reload", () => {
  const expected = {
    "en-GB": "Session not confirmed. Recovery is unavailable.",
    "pt-BR": "Sessão não confirmada. A recuperação está indisponível.",
    "es-ES": "Sesión no confirmada. La recuperación no está disponible.",
    "it-IT": "Sessione non confermata. Il recupero non è disponibile.",
    "fr-FR": "Session non confirmée. La récupération est indisponible.",
    "ar-SA": "لم تُؤكَّد الجلسة. الاستعادة غير متاحة.",
    "tr-TR": "Oturum doğrulanmadı. Kurtarma kullanılamıyor.",
    "de-DE": "Sitzung nicht bestätigt. Die Wiederherstellung ist nicht verfügbar.",
  };
  for (const [locale, message] of Object.entries(expected)) {
    const h = fixture({ locale, drafts: true, delayedAuth: true });
    assert.equal(text(h.render()).trim(), `EXISTING PORTRAIT ${message}`);
    assert.equal(h.button("open").props.disabled, true); assert.equal(h.requests.length, 0);
    h.identity(actor); assert.equal(h.button("open").props.disabled, false); assert.ok(!text(h.render()).includes(message));
    assert.equal(h.requests.length, 0);
    h.identity(other); assert.equal(h.button("open").props.disabled, true); assert.equal(text(h.render()).trim(), `EXISTING PORTRAIT ${message}`);
    assert.equal(h.requests.length, 0); h.unmount();
  }
});


const unknownUserProxy = () => ({ user: new Proxy({}, { get: () => { throw Error("unavailable token-only user"); } }) });

test("C3 token-only proxy is fenced and same-account verification restores an untouched control without avatar HTTP", async () => {
  const h = fixture({ initialSession: unknownUserProxy() });
  assert.equal(h.button("open").props.disabled, true); assert.equal(h.calls.includes("getUser"), false);
  assert.equal(h.requests.length, 0);
  h.stepIdentity(); await tick();
  assert.equal(h.button("open").props.disabled, false);
  assert.equal(h.calls.filter(call => call === "getUser").length, 1);
  assert.equal(h.requests.length, 0); assert.equal(h.calls.includes("refresh"), false);
  h.locale("pt-BR"); assert.equal(h.calls.filter(call => call === "auth-client").length, 1);
  h.unmount(); assert.equal(h.identityTimers.size, 0);
});

test("C3 unknown then different or absent verified account never restores the previous control", async () => {
  for (const user of [null, { id: other }]) {
    const h = fixture({ initialSession: unknownUserProxy() });
    h.userResponse(async () => ({ data: { user }, error: null }));
    h.stepIdentity(); await tick(); h.identity(actor);
    assert.equal(h.button("open").props.disabled, true); assert.equal(h.requests.length, 0);
    h.unmount();
  }
});

test("C3 identity deadlines remain bounded and late results or cleanup cannot revive retired clients", async () => {
  const h = fixture({ initialSession: unknownUserProxy() });
  const held = deferred<unknown>(); h.userResponse(() => held.promise);
  for (let step = 0; step < 6; step++) { h.stepIdentity(); await tick(); }
  assert.equal(h.calls.filter(call => call === "getUser").length, 3);
  assert.equal(h.identityTimers.size, 0); assert.equal(h.button("open").props.disabled, true);
  held.resolve({ data: { user: { id: actor } }, error: null }); await tick();
  assert.equal(h.button("open").props.disabled, true); assert.equal(h.requests.length, 0); h.unmount();
  const disposed = fixture({ initialSession: unknownUserProxy() });
  const pending = deferred<unknown>(); disposed.userResponse(() => pending.promise);
  disposed.stepIdentity(); disposed.unmount();
  pending.resolve({ data: { user: { id: actor } }, error: null }); await tick();
  assert.equal(disposed.identityTimers.size, 0); assert.equal(disposed.requests.length, 0);
  assert.equal(disposed.calls.filter(call => call === "unsubscribe").length, 1);
});

test("C3 an unknown identity after interaction cannot silently reopen or retry recovery", async () => {
  for (const operation of ["open", "observe", "fence"] as const) {
    const h = fixture(); h.click("open");
    const held = deferred<Response>();
    if (operation === "fence") {
      h.click("observe"); await tick(); h.click("prepare-fence");
      h.respond(() => held.promise); h.click("confirm-fence");
    } else if (operation === "observe") { h.respond(() => held.promise); h.click("observe"); }
    const count = h.requests.length;
    h.session(unknownUserProxy());
    assert.equal(h.button("open").props.disabled, true);
    if (count) assert.equal(h.requests.at(-1)?.init.signal?.aborted, true);
    h.stepIdentity(); await tick();
    held.resolve(Response.json({ ok: true, state: "observed", context: context() })); await tick();
    assert.equal(h.button("open").props.disabled, true); assert.equal(h.requests.length, count);
    assert.equal(h.calls.includes("refresh"), false); h.unmount();
  }
});

test("C3 known account can recover a fresh unused lifetime after a later unknown notification", async () => {
  const h = fixture(); assert.equal(h.button("open").props.disabled, false);
  h.session(unknownUserProxy()); assert.equal(h.button("open").props.disabled, true);
  h.stepIdentity(); await tick(); assert.equal(h.button("open").props.disabled, false);
  assert.equal(h.requests.length, 0); h.click("open"); h.click("observe"); await tick();
  assert.equal(h.requests.length, 1); h.unmount();
});
