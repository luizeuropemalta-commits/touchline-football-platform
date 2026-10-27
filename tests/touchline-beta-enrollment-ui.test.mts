import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";
import { getClubOwnerPlanShowcaseCopy } from "../lib/touchlineArena/club-owner-plan-showcase.ts";
import { getTouchlineBetaEnrollmentCopy, TOUCHLINE_BETA_ENROLLMENT_COPY } from "../lib/touchlineFantasy/beta-enrollment-i18n.ts";
import { isTouchlineFantasyMarketAccess } from "../lib/touchlineFantasy/market-plan-policy.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/touchline/fantasy/TouchlineBetaEnrollment.tsx", import.meta.url), "utf8");
const confirmed = { ok: true, planKey: "beta", status: "active", budgetEur: 100_000_000, allowedClubTeamIds: ["22", "117", "116", "52", "3", "13"] };
const response = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
type Element = { type: unknown; props: { children?: unknown; onClick?: () => Promise<void> | void; [key: string]: unknown } };
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}
function textOf(value: unknown): string {
  if (Array.isArray(value)) return value.map(textOf).join("");
  if (typeof value === "string" || typeof value === "number") return String(value);
  return value && typeof value === "object" && "props" in value ? textOf((value as Element).props.children) : "";
}
function harness(fetchImpl: (url: string, init: RequestInit) => Promise<unknown>, locale = "en-GB", autoStart = false) {
  const slots: unknown[] = []; let cursor = 0, refreshes = 0;
  const cleanups: Array<() => void> = [];
  const compiledModule = { exports: {} as { default: (props: { locale: string; draftLocalesEnabled: boolean; autoStart: boolean }) => Element; isConfirmedBetaEnrollment: (value: unknown) => boolean } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module: compiledModule, exports: compiledModule.exports, fetch: fetchImpl, AbortController, window: { setTimeout: () => 1, clearTimeout() {} },
    require: (id: string) => {
      if (id === "react") return {
        useState(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (value: unknown) => { slots[index] = value; }]; },
        useRef(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
        useCallback(callback: unknown, _deps: unknown[]) { const index = cursor++; if (!(index in slots)) slots[index] = callback; return slots[index]; },
        useEffect(effect: () => void | (() => void), _deps: unknown[]) { const index = cursor++; if (!(index in slots)) { slots[index] = true; const cleanup = effect(); if (typeof cleanup === "function") cleanups.push(cleanup); } },
      };
      if (id === "react/jsx-runtime") return require(id);
      if (id === "next/navigation") return { useRouter: () => ({ refresh: () => { refreshes++; } }) };
      if (id === "lucide-react") return { ShieldCheck: "svg" };
      if (id.endsWith("club-owner-plan-showcase")) return { getClubOwnerPlanShowcaseCopy };
      if (id.endsWith("beta-enrollment-i18n")) return { getTouchlineBetaEnrollmentCopy };
      if (id.endsWith("market-plan-policy")) return { isTouchlineFantasyMarketAccess };
      if (id.endsWith(".module.css")) return { default: { arena: "shared-arena" } };
      throw Error(`Unexpected dependency: ${id}`);
    },
  });
  const render = () => { cursor = 0; return compiledModule.exports.default({ locale, draftLocalesEnabled: true, autoStart }); };
  const button = () => elements(render()).find(node => node.type === "button")!;
  return { render, button, click: () => button().props.onClick!(), refreshes: () => refreshes, validate: compiledModule.exports.isConfirmedBetaEnrollment,
    unmount: () => { for (const cleanup of cleanups) cleanup(); } };
}

test("eight-language Beta CTA shows free budget, permitted clubs and no monthly checkout", () => {
  const starts = ["Start free with Beta", "Começar gratuitamente no Beta", "Empezar gratis con Beta", "Inizia gratis con Beta", "Commencer gratuitement avec Beta", "ابدأ مجانًا مع Beta", "Beta ile ücretsiz başla", "Kostenlos mit Beta starten"];
  for (const [index, locale] of Object.keys(TOUCHLINE_BETA_ENROLLMENT_COPY).entries()) {
    let requests = 0;
    const form = harness(async () => { requests++; throw Error("No automatic request"); }, locale);
    const text = textOf(form.render());
    assert.ok(text.includes(starts[index]));
    assert.ok(text.includes(getClubOwnerPlanShowcaseCopy(locale, true).betaPrice));
    assert.ok(text.includes(getClubOwnerPlanShowcaseCopy(locale, true).betaBenefit));
    assert.equal(requests, 0);
    assert.match(String(form.button().props.className), /shared-arena/);
  }
  assert.doesNotMatch(source, /stripe|checkout|subscription|localStorage|sessionStorage/i);
});

test("embedded ClubOwner automatically sends one confirmed Beta enrollment; standalone does not", async () => {
  const requests: string[] = [];
  const embedded = harness(async url => { requests.push(url); return response(200, confirmed); }, "pt-BR", true);
  embedded.render();
  embedded.render();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requests, ["/api/touchline-fantasy/beta/enroll"]);
  assert.equal(embedded.refreshes(), 1);
  const standalone = harness(async () => { throw Error("Unexpected standalone enrollment"); });
  standalone.render();
  assert.equal(standalone.refreshes(), 0);
});

test("success requires all authoritative Beta fields, not only ok:true", () => {
  const h = harness(async () => response(200, confirmed));
  assert.equal(h.validate(confirmed), true);
  for (const value of [null, { ok: true }, { ...confirmed, status: "pending" }, { ...confirmed, planKey: "pro" },
    { ...confirmed, budgetEur: 500_000_000 }, { ...confirmed, allowedClubTeamIds: null },
    { ...confirmed, allowedClubTeamIds: ["19", "117", "116", "52"] }, { ...confirmed, ok: false }]) assert.equal(h.validate(value), false);
});

test("one click sends exactly an empty same-origin command and refreshes only after confirmed persistence", async () => {
  let settle!: (value: unknown) => void;
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const h = harness(async (url, init) => { requests.push({ url, init }); return new Promise(resolve => { settle = resolve; }); });
  const first = h.click(); await h.click();
  assert.equal(requests.length, 1); assert.equal(h.refreshes(), 0);
  assert.equal(h.button().props.disabled, true);
  assert.equal(h.render().props["aria-busy"], true);
  assert.equal(requests[0].url, "/api/touchline-fantasy/beta/enroll");
  assert.equal(requests[0].init.credentials, "same-origin"); assert.equal(requests[0].init.body, "{}");
  settle(response(200, confirmed)); await first;
  assert.equal(h.refreshes(), 1);
  assert.ok(textOf(h.render()).includes("server confirmed"));
  await h.click(); assert.equal(h.refreshes(), 2); assert.equal(requests.length, 1);
});

test("lost responses and malformed success permit only an idempotent retry, with no optimistic access", async () => {
  for (const fail of ["network", "503", "malformed"]) {
    const bodies: unknown[] = [];
    const h = harness(async (_url, init) => {
      bodies.push(init.body);
      if (bodies.length > 1) return response(200, confirmed);
      if (fail === "network") throw Error("Response lost");
      return fail === "503" ? response(503, { ok: false, error: "BETA_UNAVAILABLE" }) : response(200, { ok: true });
    });
    await h.click(); assert.equal(h.refreshes(), 0);
    assert.ok(textOf(h.render()).includes("has not confirmed"));
    await h.click(); assert.equal(h.refreshes(), 1); assert.deepEqual(bodies, ["{}", "{}"]);
  }
});

test("a completed request from an unmounted CTA cannot refresh an unrelated page", async () => {
  let settle!: (value: unknown) => void;
  const h = harness(async () => new Promise(resolve => { settle = resolve; }));
  const pending = h.click(); h.unmount(); settle(response(200, confirmed)); await pending;
  assert.equal(h.refreshes(), 0);
});

test("existing plans and forbidden accounts get a read refresh action, not repeated enrollment", async () => {
  for (const [status, code, text] of [[409, "BETA_ACTIVE_PLAN_PRESERVED", "existing plan was preserved"],
    [409, "BETA_EXISTING_PLAN_REQUIRES_REVIEW", "requires review"], [403, "BETA_OWNER_EXCLUDED", "eligible player account"]] as const) {
    let requests = 0;
    const h = harness(async () => { requests++; return response(status, { ok: false, error: code }); });
    await h.click(); assert.equal(h.refreshes(), 0); assert.ok(textOf(h.render()).includes(text));
    await h.click(); assert.equal(requests, 1); assert.equal(h.refreshes(), 1);
  }
});

test("both Market presentations reach Beta onboarding only for a verified absent plan", () => {
  const client = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("market.tsx", client, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const guards: ts.IfStatement[] = [];
  function visit(node: ts.Node) {
    if (ts.isIfStatement(node) && node.expression.getText(tree).includes("snapshot?.betaEnrollmentAvailable")) guards.push(node);
    ts.forEachChild(node, visit);
  }
  visit(tree); assert.equal(guards.length, 1);
  assert.ok(guards[0].pos < client.indexOf("if (!snapshot || !isTouchlineFantasyMarketAccess(marketPolicy))"));
  const compiled = ts.transpileModule(`(() => { ${guards[0].getText(tree)} return null; })();`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const absent = { betaEnrollmentAvailable: true, entitlementActive: false, marketAccess: null };
  for (const embedded of [true, false]) for (const snapshot of [
    absent, null, { entitlementActive: false }, { ...absent, betaEnrollmentAvailable: false },
    { ...absent, entitlementActive: true }, { ...absent, marketAccess: { planKey: "standard" } },
  ]) {
    const actual = vm.runInNewContext(compiled, {
      React, TouchlineBetaEnrollment: "BetaEnrollment", snapshot, marketPolicy: snapshot?.marketAccess,
      embedded, locale: "pt-BR", draftLocalesEnabled: true,
    });
    if (snapshot !== absent) assert.equal(actual, null);
    else {
      assert.equal(actual.props["data-fantasy-context"], embedded ? "my-club" : "standalone");
      assert.equal(actual.props.children.type, "BetaEnrollment");
      assert.equal(actual.props.children.props.locale, "pt-BR");
    }
  }
  assert.equal(client.match(/<TouchlineBetaEnrollment\b/g)?.length, 1, "no alternate inactive-plan CTA may bypass the verified-no-plan guard");
  assert.doesNotMatch(client, /£29\.90|\/api\/touchline-fantasy\/subscription|Subscribe in test mode|Assinar em modo de teste/);
});
