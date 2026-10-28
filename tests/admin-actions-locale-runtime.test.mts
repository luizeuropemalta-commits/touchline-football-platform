import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

type Locale = "pt-BR" | "en-GB";
type Phase = "idle" | "busy" | "success" | "error";
type Element = React.ReactElement<Record<string, unknown>>;
type ResponseFixture = { ok: boolean; json(): Promise<Record<string, unknown>> };
type Request = { url: string; method?: string; headers?: Record<string, string>; body?: string };
type Scenario = {
  file: string;
  name: string;
  endpoint: string;
  method: string;
  inputValues: string[];
  payload?: Record<string, unknown>;
  labels: Record<Locale, Record<Phase, string>>;
};

const scenarios: Scenario[] = [
  {
    file: "components/admin-card-inventory-actions.tsx", name: "SyncCardInventoryButton",
    endpoint: "/api/admin/cards", method: "POST", inputValues: [],
    labels: {
      "pt-BR": { idle: "Sincronizar rascunhos", busy: "Sincronizando", success: "Sincronizado", error: "Falha ao sincronizar" },
      "en-GB": { idle: "Sync drafts", busy: "Syncing", success: "Synced", error: "Sync failed" },
    },
  },
  {
    file: "components/admin-card-inventory-actions.tsx", name: "CardInventoryQuickEdit",
    endpoint: "/api/admin/cards", method: "PATCH", inputValues: ["editorial-value"],
    payload: { cardId: "synthetic-card", cardStatus: "pending", saleStatus: "not_listed", artStatus: "missing", frameColor: "editorial-value" },
    labels: {
      "pt-BR": { idle: "Salvar", busy: "Salvando", success: "Salvo", error: "Falha ao salvar" },
      "en-GB": { idle: "Save", busy: "Saving", success: "Saved", error: "Save failed" },
    },
  },
  {
    file: "components/admin-promotions-actions.tsx", name: "CreatePromotionForm",
    endpoint: "/api/admin/promotions", method: "POST",
    inputValues: ["Synthetic promotion", "Untouched description"],
    payload: { action: "create_promotion", name: "Synthetic promotion", description: "Untouched description", status: "draft" },
    labels: {
      "pt-BR": { idle: "Criar", busy: "Criando", success: "Criada", error: "Falha ao criar" },
      "en-GB": { idle: "Create", busy: "Creating", success: "Created", error: "Create failed" },
    },
  },
  {
    file: "components/admin-promotions-actions.tsx", name: "GrantCreditForm",
    endpoint: "/api/admin/promotions", method: "POST",
    inputValues: ["synthetic-user", "123.45", "Synthetic reason", "synthetic-key"],
    payload: { action: "grant_credit", userId: "synthetic-user", amountCents: 12345, reason: "Synthetic reason", idempotencyKey: "synthetic-key" },
    labels: {
      "pt-BR": { idle: "Conceder", busy: "Concedendo", success: "Concedido", error: "Falha ao conceder" },
      "en-GB": { idle: "Grant", busy: "Granting", success: "Granted", error: "Grant failed" },
    },
  },
];

const compiled = new Map([...new Set(scenarios.map(scenario => scenario.file))].map(file => [
  file,
  ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText,
]));

function elements(node: unknown, tag: string): Element[] {
  if (Array.isArray(node)) return node.flatMap(child => elements(child, tag));
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [...(element.type === tag ? [element] : []), ...elements(element.props.children, tag)];
}

function onlyButton(tree: React.ReactNode): Element {
  const buttons = elements(tree, "button");
  assert.equal(buttons.length, 1, "the tested action must expose exactly one button");
  return buttons[0];
}

// Executes the real components and handlers in memory. A persistent useState
// adapter supplies rerenders; the transport and reload are synthetic. This is
// not a browser, React scheduling, hydration, or real account integration test.
function harness(scenario: Scenario) {
  const state: unknown[] = [];
  const requests: Request[] = [];
  let cursor = 0, reloads = 0;
  let resolveResponse: ((response: ResponseFixture) => void) | undefined;
  const hooks = {
    ...React,
    useState(initial: unknown) {
      const slot = cursor++;
      if (!Object.hasOwn(state, slot)) state[slot] = initial;
      return [state[slot], (next: unknown) => {
        state[slot] = typeof next === "function" ? next(state[slot]) : next;
      }];
    },
  };
  const exports: Record<string, unknown> = {};
  runInNewContext(compiled.get(scenario.file)!, {
    exports, Date, Error,
    window: { location: { reload() { reloads++; } } },
    fetch(url: string, options: Omit<Request, "url">) {
      requests.push({ url, ...options });
      return new Promise<ResponseFixture>(resolve => { resolveResponse = resolve; });
    },
    require(name: string) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return jsx;
      if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
      throw new Error(`Unexpected component dependency: ${name}`);
    },
  });
  const Component = exports[scenario.name] as (props: Record<string, unknown>) => React.ReactNode;
  return {
    requests,
    reloads: () => reloads,
    render(locale: Locale) {
      cursor = 0;
      return Component({ locale, cardId: "synthetic-card", cardStatus: "pending", saleStatus: "not_listed", artStatus: "missing", frameColor: "gold" });
    },
    settle(ok: boolean) {
      assert.ok(resolveResponse, "a synthetic request must be pending");
      resolveResponse({ ok, json: async () => ok ? { status: "RAW_STATUS_NOT_FOR_DISPLAY" } : { error: "PRIVATE_ERROR_SENTINEL" } });
    },
  };
}

for (const scenario of scenarios) {
  for (const start of ["pt-BR", "en-GB"] as const) {
    for (const ok of [true, false]) {
      const next: Locale = start === "pt-BR" ? "en-GB" : "pt-BR";
      test(`${scenario.name} runtime ${start} → ${next} preserves pending ${ok ? "success" : "failure"}, draft and one request`, async () => {
        const h = harness(scenario);
        const check = (locale: Locale, phase: Phase, disabled: boolean) => {
          const tree = h.render(locale), button = onlyButton(tree);
          assert.equal(renderToStaticMarkup(button).replace(/<[^>]*>/g, "").trim(), scenario.labels[locale][phase]);
          assert.equal(Boolean(button.props.disabled), disabled);
          assert.doesNotMatch(renderToStaticMarkup(tree), /PRIVATE_ERROR_SENTINEL|RAW_STATUS_NOT_FOR_DISPLAY/);
          return tree;
        };

        for (const locale of [start, next, start]) {
          const button = onlyButton(h.render(locale));
          assert.equal(renderToStaticMarkup(button).replace(/<[^>]*>/g, "").trim(), scenario.labels[locale].idle);
        }
        assert.equal(h.requests.length, 0, "locale changes must not dispatch actions");
        const inputs = elements(h.render(start), "input");
        assert.equal(inputs.length, scenario.inputValues.length);
        inputs.forEach((input, index) => {
          const onChange = input.props.onChange as (event: { target: { value: string } }) => void;
          onChange({ target: { value: scenario.inputValues[index] } });
        });

        const ready = check(start, "idle", false);
        const selectValues = elements(ready, "select").map(select => select.props.value);
        const click = onlyButton(ready).props.onClick as () => Promise<void>;
        const action = click();
        check(start, "busy", true);
        check(next, "busy", true);
        assert.equal(h.requests.length, 1);
        assert.equal(h.reloads(), 0, "a pending action cannot reload the page");
        const request = h.requests[0];
        assert.equal(request.url, scenario.endpoint);
        assert.equal(request.method, scenario.method);
        if (scenario.payload) {
          assert.equal(request.headers?.["content-type"], "application/json");
          assert.deepEqual(JSON.parse(request.body!), scenario.payload);
        } else assert.equal(request.body, undefined);

        h.settle(ok);
        await action;
        check(next, ok ? "success" : "error", false);
        check(start, ok ? "success" : "error", false);
        const settled = h.render(next);
        assert.deepEqual(elements(settled, "input").map(input => input.props.value), scenario.inputValues);
        assert.deepEqual(elements(settled, "select").map(select => select.props.value), selectValues);
        assert.equal(h.requests.length, 1, "pending and settled locale changes must not retry a write");
        assert.equal(h.reloads(), ok ? 1 : 0, "only a successful action may reload");
      });
    }
  }
}
