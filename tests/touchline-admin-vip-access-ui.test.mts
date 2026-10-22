import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { CLUB_PLANS } from "../lib/touchlineFantasy/club-market-rules.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/admin-vip-access.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../app/(app)/admin/vip-access/page.tsx", import.meta.url), "utf8");
const commandId = "f181c784-11dd-4321-b720-c9b30ad12340";
const targetUserId = "3e2e403e-5242-4474-bf0d-5ed5343100e0";
const reply = (id = commandId) => ({ ok: true, replay: false, grant: { commandId: id, targetUserId,
  planKey: "vip", status: "active", source: "owner_vip_grant", expiresAt: null, grantedAt: "2026-10-11T11:00:00.000Z", accessReady: true } });
const response = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
type Element = { type: unknown; props: { children?: unknown; name?: string; className?: string;
  onChange?: (event: { target: { value: string | boolean; checked: string | boolean } }) => void;
  onSubmit?: (event: { preventDefault: () => void }) => Promise<void>; onClick?: () => void; [key: string]: unknown } };
function elements(root: unknown): Element[] {
  if (Array.isArray(root)) return root.flatMap(elements);
  if (!root || typeof root !== "object" || !("props" in root)) return [];
  const element = root as Element;
  return [element, ...elements(element.props.children)];
}
function textOf(root: unknown): string {
  if (Array.isArray(root)) return root.map(textOf).join("");
  if (typeof root === "string" || typeof root === "number") return String(root);
  if (root && typeof root === "object" && "props" in root) return textOf((root as Element).props.children);
  return "";
}
function harness(fetchImpl: (url: string, init: RequestInit) => Promise<unknown>, locale = "en-GB") {
  const slots: unknown[] = [], effects: Array<() => void> = [], listeners = new Map<string, unknown>();
  let cursor = 0, generated = 0;
  const hookReact = {
    useId: () => "vip-form",
    useState(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (next: unknown) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }]; },
    useRef(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const index = cursor++, previous = slots[index] as { deps: unknown[]; cleanup?: () => void } | undefined;
      if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() || undefined }; });
    },
  };
  const compiledModule = { exports: {} as { default: (props: { locale: string }) => Element; confirmedVipGrant: (value: unknown, commandId: string) => unknown } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module: compiledModule, exports: compiledModule.exports, AbortController, fetch: fetchImpl,
    crypto: { randomUUID: () => { generated++; return generated === 1 ? commandId : "f181c784-11dd-4321-b720-c9b30ad12341"; } },
    window: { setTimeout: () => 1, clearTimeout() {}, addEventListener: (type: string, fn: unknown) => listeners.set(type, fn), removeEventListener: (type: string) => listeners.delete(type) },
    require: (id: string) => {
      if (id === "react") return hookReact;
      if (id === "react/jsx-runtime") return require(id);
      if (id === "lucide-react") return { CheckCircle2: "svg", Loader2: "svg", ShieldCheck: "svg" };
      if (id.endsWith("club-market-rules")) return {CLUB_PLANS};
      if (id.endsWith(".module.css")) return { default: { arena: "shared-arena", link: "shared-link" } };
      throw new Error(`Unexpected dependency: ${id}`);
    },
  });
  const render = () => { cursor = 0; const root = compiledModule.exports.default({ locale }); while (effects.length) effects.shift()!(); return root as Element; };
  const input = (name: string) => elements(render()).find(element => element.props.name === name)!;
  const enter = (name: string, value: string | boolean) => input(name).props.onChange!({ target: { value, checked: value } });
  const fill = () => { enter("email", " Registered@Example.test "); enter("reason", " Approved by owner "); enter("confirm", true); };
  const submit = () => render().props.onSubmit!({ preventDefault() {} });
  return { render, input, enter, fill, submit, generated: () => generated, listeners, confirm: compiledModule.exports.confirmedVipGrant };
}

test("the actual VIP form requires email, reason and explicit confirmation before sending", async () => {
  let requests = 0;
  const form = harness(async () => { requests++; return response(200, reply()); });
  await form.submit(); form.enter("email", "invalid"); form.enter("reason", "x"); form.enter("confirm", true); await form.submit();
  assert.equal(requests, 0); assert.equal(form.generated(), 0);
  assert.ok(elements(form.render()).some(element => element.props.role === "alert"));
  for (const name of ["email", "reason", "confirm"]) assert.equal(form.input(name).props.required, true);
});

test("double submit sends one request and never displays success before a validated server receipt", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  let settle!: (reply: unknown) => void;
  const form = harness(async (url, init) => { requests.push({ url, init }); return new Promise(resolve => { settle = resolve; }); });
  form.fill();
  const first = form.submit(); await form.submit();
  assert.equal(requests.length, 1); assert.equal(form.generated(), 1);
  assert.equal(form.render().props["aria-busy"], true);
  for (const name of ["email", "reason", "confirm"]) assert.equal(form.input(name).props.disabled, true);
  assert.equal(elements(form.render()).some(element => element.props["data-vip-confirmed"]), false);
  assert.equal(requests[0].url, "/api/admin/vip-access"); assert.equal(requests[0].init.credentials, "same-origin");
  assert.deepEqual(JSON.parse(String(requests[0].init.body)), { email: "registered@example.test", reason: "Approved by owner", commandId,planKey:"vip" });
  settle(response(200, reply())); await first;
  assert.equal(elements(form.render()).some(element => element.props["data-vip-confirmed"] === "true"), true);
  assert.ok(textOf(form.render()).includes("No expiry date configured."));
  assert.equal(elements(form.render()).some(element => element.props.type === "submit"), false);
  await form.submit(); assert.equal(requests.length, 1);
});

test("guest form exposes canonical budgets and binds chosen plan across confirmation and retries",async()=>{
  for(const planKey of ["standard","master","vip"] as const) {
    const bodies:string[]=[];
    const form=harness(async(_url,init)=>{bodies.push(String(init.body));const source=planKey==="vip"?"owner_vip_grant":"owner_guest_grant";
      return response(200,{...reply(),grant:{...reply().grant,planKey,source}});});
    form.fill();form.enter("planKey",planKey);
    assert.equal(form.input("confirm").props.checked,false,"plan changes require renewed confirmation");
    assert.ok(textOf(form.render()).includes(new Intl.NumberFormat("en-GB").format(CLUB_PLANS[planKey].budget)));
    assert.ok(textOf(form.render()).includes("No automatic credit refill"));
    await form.submit();assert.equal(bodies.length,0);
    form.enter("confirm",true);await form.submit();
    assert.equal(JSON.parse(bodies[0]).planKey,planKey);
    assert.equal(form.input("planKey").props.disabled,true);
    assert.equal(elements(form.render()).some(element=>element.props["data-vip-confirmed"]==="true"),true);
  }
});

test("lost response and 503 preserve the exact command and freeze fields until replay confirms", async () => {
  const bodies: string[] = [];
  const form = harness(async (_url, init) => {
    bodies.push(String(init.body));
    if (bodies.length === 1) throw new Error("Response lost after write");
    if (bodies.length === 2) return response(503, { ok: false, error: "VIP_UNAVAILABLE" });
    return response(200, { ...reply(), replay: true });
  });
  form.fill(); await form.submit(); form.render();
  assert.ok(form.listeners.has("beforeunload"));
  assert.equal(form.input("email").props.disabled, true);
  assert.ok(textOf(form.render()).includes("Keep this page open"));
  assert.equal(elements(form.render()).some(element => textOf(element) === "Review request"), false);
  await form.submit(); await form.submit(); form.render();
  assert.equal(new Set(bodies).size, 1); assert.equal(form.generated(), 1);
  assert.equal(form.listeners.has("beforeunload"), false);
  assert.equal(elements(form.render()).some(element => element.props["data-vip-confirmed"] === "true"), true);
});

test("malformed or mismatched success cannot confirm a grant or silently replace its command", async () => {
  for (const payload of [{ ok: true }, reply("f181c784-11dd-4321-b720-c9b30ad12349"), { ...reply(), grant: { ...reply().grant, planKey: "pro" } },
    { ...reply(), grant: { ...reply().grant, accessReady: undefined } }, { ...reply(), grant: { ...reply().grant, accessReady: false } }]) {
    const form = harness(async () => response(200, payload)); form.fill(); await form.submit();
    assert.equal(elements(form.render()).some(element => element.props["data-vip-confirmed"]), false);
    assert.ok(textOf(form.render()).includes("not confirmed"));
    await form.submit(); assert.equal(form.generated(), 1);
  }
});

test("known first-attempt rejection can be corrected, but rejection after uncertainty cannot discard the command", async () => {
  for (const uncertainFirst of [false, true]) {
    let calls = 0;
    const form = harness(async () => { calls++; if (uncertainFirst && calls === 1) throw Error("lost"); return response(404, { ok: false, error: "VIP_TARGET_NOT_REGISTERED" }); });
    form.fill(); await form.submit(); if (uncertainFirst) await form.submit();
    assert.ok(textOf(form.render()).includes("No registered account"));
    const review = elements(form.render()).find(element => element.type === "button" && textOf(element) === "Review request");
    if (uncertainFirst) { assert.equal(review, undefined); assert.equal(form.generated(), 1); }
    else { assert.ok(review); review.props.onClick!(); assert.equal(form.input("email").props.disabled, false); assert.equal(form.input("confirm").props.checked, false); }
  }
});

test("owner errors are localized and arbitrary server text is never rendered", async () => {
  for (const [locale, phrase] of [["en-GB", "Only the authorised owner"], ["pt-BR", "Somente o proprietário autorizado"]]) {
    const form = harness(async () => response(403, { ok: false, error: "VIP_FORBIDDEN" }), locale); form.fill(); await form.submit();
    assert.ok(textOf(form.render()).includes(phrase));
    assert.ok(elements(form.render()).some(element => element.props.className?.includes("shared-arena")));
  }
  const form = harness(async () => response(500, { ok: false, error: "__proto__" })); form.fill(); await form.submit();
  assert.ok(textOf(form.render()).includes("not confirmed"));
  assert.doesNotMatch(textOf(form.render()), /__proto__/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\./);
});

test("paid subscription cannot be shown as a confirmed VIP grant before renewal cancellation", async () => {
  for (const [locale, phrase] of [["en-GB", "Stop future renewals"], ["pt-BR", "Interrompa as renovações futuras"]]) {
    const form = harness(async () => response(409, { ok: false, error: "VIP_PAID_SUBSCRIPTION_CANCELLATION_REQUIRED" }), locale);
    form.fill(); await form.submit();
    assert.ok(textOf(form.render()).includes(phrase));
    assert.equal(elements(form.render()).some(element => element.props["data-vip-confirmed"] === "true"), false);
  }
});

test("the actual server page is owner-only and never exposes the grant form without protected configuration", async () => {
  for (const mode of ["absent", "customer", "authError", "ownerNoArena", "configMissing", "owner"]) {
    const compiledModule = { exports: {} as { default: (props: Record<string, unknown>) => Promise<unknown> } };
    let adminReads = 0;
    vm.runInNewContext(ts.transpileModule(pageSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      module: compiledModule, exports: compiledModule.exports,
      require: (id: string) => {
        if (id === "react/jsx-runtime") return require(id);
        if (id === "next/navigation") return { notFound: () => { throw Error("NOT_FOUND"); } };
        if (id.endsWith("admin-vip-access")) return { default: "VipForm" };
        if (id.endsWith("arena-admin-ui")) return { GamePanel: "section", LivePill: "span" };
        if (id.endsWith("admin/owner")) return { isOwnerEmail: (email: string) => email === "owner@example.test" };
        if (id.endsWith("supabase/admin")) return { createAdminClient: () => { adminReads++; return mode === "configMissing" ? null : {}; } };
        if (id.endsWith("supabase/server")) return { createClient: async () => ({ auth: { getUser: async () => ({ error: mode === "authError" ? Error("Unavailable") : null,
          data: { user: mode === "absent" ? null : { email: mode === "customer" ? "customer@example.test" : "owner@example.test" } } }) } }) };
        if (id.endsWith("auth-i18n")) return { normalizeTouchLineAuthLocale: () => "pt-BR" };
        if (id.endsWith("auth-access")) return { hasTouchLineArenaAccess: () => mode !== "ownerNoArena" };
        throw Error(`Unexpected dependency: ${id}`);
      },
    });
    if (["absent", "customer", "authError", "ownerNoArena"].includes(mode)) { await assert.rejects(compiledModule.exports.default({}), /NOT_FOUND/); assert.equal(adminReads, 0); }
    else { const page = await compiledModule.exports.default({}); assert.equal(elements(page).some(element => element.type === "VipForm"), mode === "owner"); }
  }
});
