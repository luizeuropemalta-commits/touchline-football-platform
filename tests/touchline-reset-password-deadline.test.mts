import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as auth from "../lib/touchlineArena/auth-i18n.ts";

const code = ts.transpileModule(readFileSync(new URL("../components/reset-password-form.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const routeCode = ts.transpileModule(readFileSync(new URL("../app/api/auth/recovery/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
type Element = React.ReactElement<Record<string, unknown>>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
type Reply = { ok: boolean; status: number; json(): Promise<unknown> };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

// Execute the real API handler with explicit synthetic auth/cookie boundaries.
// No SDK, signed recovery grant, environment credential or network is involved.
function recoveryRoute(mode: "ready" | "invalid" | "unavailable" | "provider-error" = "ready") {
  const writes: unknown[] = [], cookieWrites: unknown[][] = [];
  const exports = {} as { GET(request: Request): Promise<Response>; POST(request: Request): Promise<Response> };
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: { json(payload: unknown, init?: ResponseInit) {
      return Object.assign(Response.json(payload, init), { cookies: { set(...args: unknown[]) { cookieWrites.push(args); } } });
    } } },
    "next/headers": { cookies: async () => ({ get: () => ({ value: "synthetic-grant-not-a-credential" }) }) },
    "@/lib/server/password-recovery": {
      TOUCHLINE_PASSWORD_RECOVERY_COOKIE: "synthetic-recovery-cookie",
      touchLinePasswordRecoveryCookieOptions: () => ({}),
      verifyTouchLinePasswordRecoveryGrant: () => mode !== "invalid",
    },
    "@/lib/supabase/server": { createClient: async () => mode === "unavailable" ? null : {
      auth: {
        getUser: async () => ({ data: { user: { id: "synthetic-actor" } }, error: null }),
        updateUser: async (input: unknown) => { writes.push(input); return {
          error: mode === "provider-error" ? { message: "synthetic provider refusal" } : null,
        }; },
      },
    } },
  };
  runInNewContext(routeCode, { exports, require(name: string) { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; } });
  return { route: exports, writes, cookieWrites };
}

// The actual recovery component/helper run with controlled React hooks and a
// transport that deliberately ignores abort. No account, password or network
// mutation occurs. Timer callbacks are advanced explicitly, never by waiting.
function fixture(locale = "pt-BR") {
  let cursor = 0, effectCursor = 0, nextTimer = 0, mounted = true, lateWrites = 0;
  const state: unknown[] = [], queued: (() => void)[] = [];
  const effects: { deps: readonly unknown[]; cleanup?: () => void }[] = [];
  const timers = new Map<number, { callback(): void; ms: number }>();
  const calls: { url: string; init: RequestInit; reply: ReturnType<typeof deferred<Reply>> }[] = [];
  const exports: { ResetPasswordForm?: (props: unknown) => Element } = {};
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    react: {
      useState(initial: unknown) { const i = cursor++; if (!(i in state)) state[i] = initial;
        return [state[i], (value: unknown) => { if (!mounted) lateWrites++; state[i] = typeof value === "function" ? value(state[i]) : value; }]; },
      useRef(initial: unknown) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; },
      useEffect(run: () => (() => void) | void, deps: readonly unknown[]) {
        const i = effectCursor++, previous = effects[i];
        if (!previous || deps.some((value, index) => value !== previous.deps[index])) queued.push(() => {
          previous?.cleanup?.(); effects[i] = { deps, cleanup: run() || undefined };
        });
      },
    },
    "next/link": { __esModule: true, default: (props: React.ComponentProps<"a">) => React.createElement("a", props) },
    "lucide-react": { ArrowRight: () => null, Eye: () => null, EyeOff: () => null, Loader2: () => null },
    "./ui": { Button: (props: React.ComponentProps<"button">) => React.createElement("button", props), Input: (props: React.ComponentProps<"input">) => React.createElement("input", props) },
    "@/lib/touchlineArena/auth-i18n": auth,
  };
  runInNewContext(code, { exports, Error, AbortController,
    setTimeout(callback: () => void, ms: number) { const id = ++nextTimer; timers.set(id, { callback, ms }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    fetch(url: string, init: RequestInit) { const reply = deferred<Reply>(); calls.push({ url, init, reply }); return reply.promise; },
    require(name: string) { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; },
  });
  const nodes = (node: React.ReactNode): Element[] => React.Children.toArray(node).flatMap(child => React.isValidElement(child)
    ? [child as Element, ...nodes((child as Element).props.children as React.ReactNode)] : []);
  const render = () => { cursor = 0; effectCursor = 0; const tree = exports.ResetPasswordForm!({ locale });
    const result = { html: renderToStaticMarkup(tree), elements: nodes(tree) }; while (queued.length) queued.shift()!(); return result; };
  const field = (id: string) => { const element = render().elements.find(node => node.props.id === id); assert.ok(element); return element; };
  const fill = (id: string, value: string) => (field(id).props.onChange as (event: unknown) => void)({ target: { value } });
  const submit = () => { const form = render().elements.find(node => node.type === "form"); assert.ok(form); return (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} }); };
  return { render, calls, fill, submit, timers,
    reply(index: number, ok: boolean, status: number, payload: unknown) { calls[index].reply.resolve({ ok, status, json: async () => payload }); },
    expire() { assert.equal(timers.size, 1, "only one request deadline may exist"); for (const [id, timer] of [...timers]) { assert.equal(timer.ms, 10_000); timers.delete(id); timer.callback(); } },
    unmount() { mounted = false; for (const effect of effects) effect?.cleanup?.(); }, lateWrites: () => lateWrites };
}
async function ready(h: ReturnType<typeof fixture>) {
  h.render(); h.reply(0, true, 200, { ok: true }); await flush();
  h.fill("touchline-reset-password", "synthetic-password-only");
  h.fill("touchline-reset-password-confirmation", "synthetic-password-only");
}

test("stalled recovery check stops at the deadline with a localized manual retry path", async () => {
  for (const locale of ["pt-BR", "en-GB"]) {
    const h = fixture(locale), copy = auth.getTouchLineAuthCopy(locale).form;
    assert.ok(h.render().html.includes(copy.recoveryChecking));
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].init.cache, "no-store");
    h.expire(); await flush();
    assert.ok(h.render().html.includes(copy.authenticationUnavailable));
    assert.ok(h.render().html.includes(`/forgot-password?lang=${locale}`));
    assert.ok(!h.render().html.includes(copy.recoveryInvalid));
    assert.equal(h.calls[0].init.signal?.aborted, true); assert.equal(h.timers.size, 0);
    assert.equal(h.calls.length, 1, "no automatic retry or reset email");
    h.calls[0].reply.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) }); await flush();
    assert.ok(h.render().html.includes(copy.authenticationUnavailable), "late success cannot reopen the form");
    h.unmount(); const revisited = fixture(locale); revisited.render();
    assert.equal(revisited.calls.length, 1, "a deliberate new visit can check again"); revisited.unmount(); await flush();
  }
});

test("recovery deadline includes a stalled response body and rejects malformed success", async () => {
  const h = fixture(), body = deferred<unknown>(); h.render();
  h.calls[0].reply.resolve({ ok: true, status: 200, json: () => body.promise }); await flush();
  h.expire(); await flush(); body.resolve({ ok: true }); await flush();
  assert.ok(h.render().html.includes(auth.getTouchLineAuthCopy("pt-BR").form.authenticationUnavailable));
  assert.equal(h.timers.size, 0); h.unmount();
  const malformed = fixture(); malformed.render(); malformed.reply(0, true, 200, null); await flush();
  assert.ok(malformed.render().html.includes(auth.getTouchLineAuthCopy("pt-BR").form.authenticationUnavailable)); malformed.unmount();
});

test("unconfirmed password POST stops pending without success or automatic replay", async () => {
  const h = fixture(), copy = auth.getTouchLineAuthCopy("pt-BR").form; await ready(h);
  const work = h.submit(), duplicate = h.submit();
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].init.method, "POST");
  await duplicate;
  assert.deepEqual(JSON.parse(String(h.calls[1].init.body)), { password: "synthetic-password-only" });
  const body = deferred<unknown>(); h.calls[1].reply.resolve({ ok: true, status: 200, json: () => body.promise }); await flush();
  h.expire(); await work;
  assert.ok(h.render().html.includes(copy.authenticationUnavailable)); assert.ok(!h.render().html.includes(copy.recoveryUpdated));
  assert.ok(h.render().html.includes("/forgot-password?lang=pt-BR"));
  assert.equal(h.calls[1].init.signal?.aborted, true); assert.equal(h.calls.length, 2); assert.equal(h.timers.size, 0);
  body.resolve({ ok: true }); await flush();
  assert.ok(!h.render().html.includes(copy.recoveryUpdated)); h.unmount();
});

test("unmount aborts GET and POST, clears timers and suppresses late state updates", async () => {
  for (const post of [false, true]) {
    const h = fixture(); if (post) await ready(h); else h.render();
    const work = post ? h.submit() : undefined;
    const request = h.calls.at(-1)!; h.unmount(); await flush();
    assert.equal(request.init.signal?.aborted, true); await work; assert.equal(h.timers.size, 0);
    request.reply.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) }); await flush();
    assert.equal(h.lateWrites(), 0, "no state setter after cleanup");
  }
});

test("real recovery API replies preserve GET and password-command meanings in the form", async () => {
  const url = "https://synthetic-recovery.test/api/auth/recovery";
  const copy = auth.getTouchLineAuthCopy("pt-BR").form;
  for (const mode of ["ready", "invalid", "unavailable"] as const) {
    const api = recoveryRoute(mode), response = await api.route.GET(new Request(url));
    const payload = await response.json();
    assert.equal(response.status, mode === "unavailable" ? 503 : 200);
    assert.deepEqual(payload, mode === "ready" ? { ok: true } : { ok: false, error: mode });
    assert.equal(api.writes.length, 0, "GET never calls updateUser");
    const h = fixture(); h.render(); h.reply(0, response.ok, response.status, payload); await flush();
    if (mode === "ready") assert.ok(h.render().elements.some(node => node.type === "form"));
    else assert.ok(h.render().html.includes(mode === "invalid" ? copy.recoveryInvalid : copy.authenticationUnavailable));
    assert.equal(h.timers.size, 0); h.unmount();
  }
  for (const scenario of [
    { mode: "ready", password: "short", status: 400, error: "invalid_password" },
    { mode: "provider-error", password: "synthetic-password-only", status: 400, error: "synthetic provider refusal" },
    { mode: "invalid", password: "synthetic-password-only", status: 401, error: "invalid" },
    { mode: "unavailable", password: "synthetic-password-only", status: 503, error: "unavailable" },
    { mode: "ready", password: "synthetic-password-only", status: 200, error: null },
  ] as const) {
    const api = recoveryRoute(scenario.mode), response = await api.route.POST(new Request(url, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: scenario.password }),
    }));
    const payload = await response.json();
    assert.equal(response.status, scenario.status);
    assert.deepEqual(payload, scenario.error === null ? { ok: true } : { ok: false, error: scenario.error });
    assert.equal(api.writes.length, scenario.mode === "provider-error" || scenario.status === 200 ? 1 : 0);
    if (scenario.status === 200) assert.equal(api.cookieWrites.length, 1, "acknowledged write clears recovery grant");
    const h = fixture(); await ready(h); h.fill("touchline-reset-password", scenario.password); h.fill("touchline-reset-password-confirmation", scenario.password);
    // Invoke the real handler directly: short input exercises the API guard,
    // while native minlength validation belongs to separate browser coverage.
    const work = h.submit(); h.reply(1, response.ok, response.status, payload); await work;
    const rendered = h.render();
    if (scenario.status === 400) {
      assert.ok(rendered.html.includes(scenario.error!));
      assert.equal(rendered.elements.find(node => node.props.id === "touchline-reset-password")?.props.value, scenario.password);
      assert.ok(rendered.elements.some(node => node.type === "form"), "validation/provider rejection keeps editable form");
      assert.ok(!rendered.elements.find(node => node.props.type === "submit")?.props.disabled);
    } else {
      assert.ok(rendered.html.includes(scenario.status === 200 ? copy.recoveryUpdated : scenario.status === 401 ? copy.recoveryInvalid : copy.authenticationUnavailable));
      assert.ok(!rendered.elements.some(node => node.type === "form"));
    }
    assert.equal(h.calls.length, 2, "no automatic command replay"); assert.equal(h.timers.size, 0); h.unmount();
  }
});

test("HTTP success without a confirmed recovery acknowledgement never reports password updated", async () => {
  const copy = auth.getTouchLineAuthCopy("pt-BR").form;
  for (const payload of [null, {}, { ok: false }, { ok: "true" }, [], "ok"]) {
    const h = fixture(); await ready(h); const work = h.submit(); h.reply(1, true, 200, payload); await work;
    assert.ok(h.render().html.includes(copy.authenticationUnavailable));
    assert.ok(!h.render().html.includes(copy.recoveryUpdated));
    assert.ok(h.render().html.includes("/forgot-password?lang=pt-BR"));
    assert.equal(h.calls.length, 2); assert.equal(h.timers.size, 0); h.unmount();
  }
  const h = fixture(); await ready(h); const work = h.submit();
  h.calls[1].reply.resolve({ ok: true, status: 200, json: async () => { throw new SyntaxError("synthetic invalid JSON"); } }); await work;
  assert.ok(h.render().html.includes(copy.authenticationUnavailable)); assert.ok(!h.render().html.includes(copy.recoveryUpdated));
  assert.equal(h.calls.length, 2); assert.equal(h.timers.size, 0); h.unmount();
});

test("verified invalid recovery and acknowledged password success keep existing meanings", async () => {
  const copy = auth.getTouchLineAuthCopy("pt-BR").form;
  const invalid = fixture(); invalid.render(); invalid.reply(0, true, 200, { ok: false, error: "invalid" }); await flush();
  assert.ok(invalid.render().html.includes(copy.recoveryInvalid)); assert.equal(invalid.timers.size, 0); invalid.unmount();
  const h = fixture(); await ready(h); const work = h.submit(); h.reply(1, true, 200, { ok: true }); await work;
  assert.ok(h.render().html.includes(copy.recoveryUpdated)); assert.ok(h.render().html.includes("/intro?lang=pt-BR"));
  assert.equal(h.calls.length, 2); assert.equal(h.timers.size, 0); h.unmount();
});
