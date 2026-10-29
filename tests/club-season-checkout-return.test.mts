import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { ClubSeasonCheckoutReturnProps } from "../components/touchline/ClubSeasonCheckoutReturn.tsx";

type Element = React.ReactElement<Record<string, unknown>>;
const source = readFileSync(new URL("../components/touchline/ClubSeasonCheckoutReturn.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const response = (status: string) => Response.json({ ok: true, status });
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement(value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props.children)];
}

function fixture(fetcher: typeof fetch, initial: Partial<ClubSeasonCheckoutReturnProps> = {}) {
  let cursor = 0, dirty = true, tree: React.ReactNode, refreshes = 0, now = 0, sequence = 0, mounted = true;
  let props: ClubSeasonCheckoutReturnProps = { checkout: "processing", sessionId: "cs_test_one", locale: "pt-BR", ...initial };
  const slots: unknown[] = [], effects: (() => void)[] = [], calls: { input: unknown; options?: RequestInit }[] = [];
  const timers = new Map<number, { due: number; callback: () => void }>();
  const router = { refresh() { refreshes++; } };
  const react = { ...React,
    useRef(value: unknown) { const index = cursor++; return slots[index] ?? (slots[index] = { current: value }); },
    useState(value: unknown) {
      const index = cursor++; if (!(index in slots)) slots[index] = value;
      return [slots[index], (next: unknown) => {
        const resolved = typeof next === "function" ? next(slots[index]) : next;
        if (!Object.is(resolved, slots[index])) { slots[index] = resolved; dirty = true; }
      }];
    },
    useEffect(fn: () => void | (() => void), deps: unknown[]) {
      const index = cursor++, prior = slots[index] as { deps: unknown[]; cleanup?: void | (() => void) } | undefined;
      if (!prior || deps.some((value, i) => value !== prior.deps[i])) {
        const next = { deps, cleanup: undefined as void | (() => void) }; slots[index] = next;
        effects.push(() => { prior?.cleanup?.(); next.cleanup = fn(); });
      }
    },
  };
  const exports: { default?: (props: ClubSeasonCheckoutReturnProps) => React.ReactNode } = {};
  runInNewContext(compiled, { exports, AbortController, encodeURIComponent,
    setTimeout(callback: () => void, delay: number) { const id = ++sequence; timers.set(id, { due: now + delay, callback }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    fetch(input: string, options?: RequestInit) { calls.push({ input, options }); return fetcher(input, options); },
    require(name: string) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return runtime;
      if (name === "next/navigation") return { useRouter: () => router };
      if (name.endsWith(".module.css")) return { default: { arena: "shared-arena-button" } };
      throw new Error(name);
    },
  });
  function render() {
    let passes = 0;
    while (dirty && mounted) {
      assert.ok(++passes < 20, "effect must not create a render loop");
      dirty = false; cursor = 0; tree = exports.default!(props);
      while (effects.length) effects.shift()!();
    }
  }
  async function settle() { await new Promise(resolve => setImmediate(resolve)); render(); }
  render();
  return {
    calls, settle, refreshes: () => refreshes, timerCount: () => timers.size,
    html: () => renderToStaticMarkup(tree),
    update(next: Partial<ClubSeasonCheckoutReturnProps>) { props = { ...props, ...next }; dirty = true; render(); },
    async advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, timer]) => timer.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        now = next[1].due; timers.delete(next[0]); next[1].callback(); await settle();
      }
      now = target; await settle();
    },
    click(label: string) {
      const button = nodes(tree).find(node => node.type === "button" && renderToStaticMarkup(node).includes(`>${label}<`));
      assert.ok(button, `button ${label}`); (button.props.onClick as () => void)(); render();
    },
    unmount() {
      mounted = false;
      for (const slot of slots) if (slot && typeof slot === "object" && "cleanup" in slot) (slot as { cleanup?: () => void }).cleanup?.();
      tree = null;
    },
  };
}

test("return polls the authenticated ledger and refreshes once only after confirmed payment", async () => {
  let checks = 0;
  const view = fixture(async () => response(++checks === 1 ? "pending" : "paid"));
  assert.match(view.html(), /Confirmando pagamento/); assert.equal(view.refreshes(), 0);
  await view.settle(); await view.advance(3_000);
  assert.equal(view.calls.length, 2); assert.equal(view.refreshes(), 1); assert.match(view.html(), /Pagamento de teste confirmado/);
  assert.equal(view.calls[0].input, "/api/touchline-fantasy/season-checkout/status?session_id=cs_test_one");
  assert.equal(view.calls[0].options?.credentials, "same-origin"); assert.equal(view.calls[0].options?.cache, "no-store");
  assert.match(view.html(), /role="status" aria-live="polite" aria-atomic="true"/);
  view.update({ locale: "en-GB" }); await view.advance(60_000);
  assert.match(view.html(), /Test payment confirmed/); assert.equal(view.calls.length, 2); assert.equal(view.refreshes(), 1);
  view.update({ sessionId: "cs_test_two" }); await view.settle(); assert.equal(view.refreshes(), 2);
  view.update({ sessionId: "cs_test_one" }); await view.settle(); assert.equal(view.refreshes(), 2);
});

test("pending polling is bounded and explicit retry starts a fresh check", async () => {
  let status = "pending";
  const view = fixture(async () => response(status)); await view.settle(); await view.advance(120_000);
  assert.equal(view.calls.length, 8); assert.equal(view.timerCount(), 0); assert.equal(view.refreshes(), 0);
  assert.match(view.html(), /A confirmação ainda não chegou/); assert.match(view.html(), /shared-arena-button/);
  status = "paid"; view.click("Verificar novamente"); await view.settle();
  assert.equal(view.calls.length, 9); assert.equal(view.refreshes(), 1);
});

test("review and expired are terminal safe states, never payment success", async () => {
  for (const status of ["review", "expired"]) {
    const view = fixture(async () => response(status)); await view.settle(); await view.advance(120_000);
    assert.equal(view.calls.length, 1); assert.equal(view.refreshes(), 0); assert.equal(view.timerCount(), 0);
    assert.doesNotMatch(view.html(), /Pagamento de teste confirmado/);
    assert.match(view.html(), status === "review" ? /Pagamento de teste em análise/ : /Sessão de pagamento de teste encerrada/);
  }
});

test("transport, ownership and malformed-status failures never activate or auto-retry", async () => {
  for (const result of [new Response(null, { status: 503 }), new Response(null, { status: 404 }), new Response("bad json"),
    Response.json({ ok: false, status: "paid" }), Response.json({ ok: true, status: ["paid"] }), Response.json({ ok: true, status: "active" })]) {
    const view = fixture(async () => result, { locale: "en-GB" }); await view.settle(); await view.advance(120_000);
    assert.equal(view.calls.length, 1); assert.equal(view.refreshes(), 0); assert.equal(view.timerCount(), 0);
    assert.match(view.html(), /Unable to check test payment/); assert.match(view.html(), /Check again/);
  }
});

test("cancelled return and invalid sessions never query or claim payment succeeded", async () => {
  for (const props of [{ checkout: "cancelled" as const }, { sessionId: undefined }, { sessionId: "cs_live_one" }, { sessionId: "cs_test_one&user=other" }]) {
    const view = fixture(async () => { throw new Error("must not request"); }, props); await view.settle();
    assert.equal(view.calls.length, 0); assert.equal(view.refreshes(), 0); assert.doesNotMatch(view.html(), /Pagamento de teste confirmado/);
  }
  const cancelled = fixture(async () => response("paid"), { checkout: "cancelled" });
  cancelled.click("Atualizar meu plano"); assert.equal(cancelled.refreshes(), 1); assert.equal(cancelled.calls.length, 0);
});

test("request deadline aborts a stalled check and exposes safe retry", async () => {
  let signal: AbortSignal | null | undefined;
  const view = fixture(async (_input, options) => new Promise((_resolve, reject) => {
    signal = options?.signal; signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }));
  await view.advance(8_000);
  assert.equal(signal?.aborted, true); assert.equal(view.refreshes(), 0); assert.equal(view.timerCount(), 0);
  assert.match(view.html(), /Não foi possível consultar o pagamento/);
});

test("session change and unmount ignore stale results and clean up timers", async () => {
  let resolve!: (value: Response) => void;
  const view = fixture(async () => new Promise<Response>(done => { resolve = done; }));
  const oldResolve = resolve, oldSignal = view.calls[0].options?.signal;
  view.update({ sessionId: "cs_test_other" }); assert.equal(oldSignal?.aborted, true);
  oldResolve(response("paid")); await view.settle(); assert.equal(view.refreshes(), 0); assert.match(view.html(), /Confirmando pagamento/);
  const newSignal = view.calls[1].options?.signal; view.unmount();
  assert.equal(newSignal?.aborted, true); assert.equal(view.timerCount(), 0); resolve(response("paid")); await view.settle();
  assert.equal(view.refreshes(), 0); assert.equal(view.timerCount(), 0);
});
