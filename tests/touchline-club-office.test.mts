import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as model from "../components/touchline/office/club-office-model.ts";
import type { ClubOwnerOfficeProps } from "../components/touchline/office/ClubOwnerOffice.tsx";
import type { ClubAcquisitionState } from "../lib/touchlineFantasy/club-acquisition.ts";

const state: ClubAcquisitionState = {
  revision: 2, seasonId: "season-fixture", plan: "vip", balanceEur: 1_170_000_000,
  coach: { id: "coach-fixture", tier: "ruby-red", valueEur: 5_000_000 }, receipts: [],
  players: [
    { playerId: "player-fixture-1", clubId: "club-fixture-1", position: "GK", valueEur: 10_000_000, area: "starters", slot: 0 },
    { playerId: "player-fixture-2", clubId: "club-fixture-2", position: "CB", valueEur: 15_000_000, area: "reserves", slot: 0 },
  ],
};
type Element = React.ReactElement<Record<string, unknown>>;
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement(value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props.children)];
}

/** Execute the actual component and its event handlers without launching a browser or Next. */
function fixture(initial: ClubOwnerOfficeProps) {
  let props = initial, cursor = 0, tree: React.ReactNode, focused = "", shows = 0, closes = 0;
  const slots: unknown[] = [], effects: (() => void)[] = [];
  const react = { ...React,
    useId: () => "office-fixture",
    useRef(value: unknown) { const index = cursor++; return slots[index] ?? (slots[index] = { current: value }); },
    useState(value: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = value;
      return [slots[index], (next: unknown) => { slots[index] = next; }]; },
    useEffect(fn: () => void, deps: unknown[]) { const index = cursor++, prior = slots[index] as unknown[] | undefined;
      if (!prior || prior.some((value, i) => value !== deps[i])) { slots[index] = deps; effects.push(fn); } },
  };
  const source = readFileSync(new URL("../components/touchline/office/ClubOwnerOffice.tsx", import.meta.url), "utf8");
  const actualExports: { default?: (props: ClubOwnerOfficeProps) => React.ReactNode } = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports: actualExports, Intl, Date, require: (name: string) => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return runtime;
      if (name === "lucide-react") return new Proxy({}, { get: () => "svg" });
      if (name === "./club-office-model") return model;
      if (name.endsWith(".module.css")) return { default: new Proxy({}, { get: (_target, key) => String(key) }) };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  function render() {
    cursor = 0; tree = actualExports.default!(props);
    for (const node of nodes(tree)) {
      const ref = node.props.ref as { current: unknown } | undefined;
      if (!ref) continue;
      ref.current = { focus: () => { focused = String(node.type); }, scrollTo() {}, showModal: () => { shows++; }, close: () => { closes++; (node.props.onClose as () => void)(); } };
    }
    while (effects.length) effects.shift()!();
    return tree;
  }
  render();
  const find = (predicate: (node: Element) => boolean) => { const node = nodes(tree).find(predicate); assert.ok(node); return node; };
  return {
    render, html: () => renderToStaticMarkup(tree), focused: () => focused, shows: () => shows, closes: () => closes,
    update: (next: ClubOwnerOfficeProps) => { props = next; render(); },
    click: (label: string) => { const button = find(node => node.type === "button" && (node.props["aria-label"] === label || renderToStaticMarkup(node).includes(`>${label}<`))); (button.props.onClick as () => void)(); render(); },
    open: () => { const button = find(node => node.props["aria-haspopup"] === "dialog"); (button.props.onClick as () => void)(); render(); },
    cancel: () => { const d = find(node => node.type === "dialog"); let prevented = false; (d.props.onCancel as (e: { preventDefault(): void }) => void)({ preventDefault() { prevented = true; } }); render(); return prevented; },
  };
}

test("office distinguishes unconfirmed balance from zero and never substitutes the VIP allowance", () => {
  for (const status of ["loading", "error", "unavailable"] as const) assert.equal(model.summarizeOffice({ status }), null);
  assert.deepEqual(model.summarizeOffice({ status: "ready", state: null }), { playerCount: 0, starters: 0, reserves: 0, outside: 0, balance: null, playersCost: null, coachCost: null });
  const summary = model.summarizeOffice({ status: "ready", state: { ...state, balanceEur: 0 } });
  assert.equal(summary?.balance, 0);
  assert.equal(summary?.starters, 1); assert.equal(summary?.reserves, 1); assert.equal(summary?.outside, 0);
  assert.equal(summary?.playersCost, 25_000_000); assert.equal(summary?.coachCost, 5_000_000);
});

test("office uses one modal, drills into confirmed data and returns focus on escape", () => {
  const office = fixture({ locale: "pt-BR", collection: { status: "ready", state }, playerLabels: new Map([["player-fixture-1", { name: "Fixture goalkeeper", clubName: "Fixture club" }]]), renderPlayerCard: p => React.createElement("span", { "data-original-card": p.playerId }, "original fixture card") });
  assert.doesNotMatch(office.html(), /data-office-view/);
  office.open(); assert.equal(office.shows(), 1); assert.equal(office.focused(), "h2");
  assert.equal((office.html().match(/<dialog/g) ?? []).length, 1);
  office.click("Abrir: Elenco e pontos"); assert.match(office.html(), /data-office-view="roster"/);
  assert.match(office.html(), /data-original-card="player-fixture-1"/);
  office.click("Ver detalhes: Fixture goalkeeper"); assert.match(office.html(), /data-office-view="player"/);
  assert.match(office.html(), /histórico ainda não está conectado/);
  assert.doesNotMatch(office.html(), /Nenhum ponto registrado/);
  office.click("Voltar"); assert.match(office.html(), /data-office-view="roster"/);
  office.click("Voltar"); assert.match(office.html(), /data-office-view="overview"/);
  office.click("Abrir: Balanço de créditos"); assert.match(office.html(), /1\.170\.000\.000 TC/);
  assert.ok(office.cancel()); assert.equal(office.closes(), 1); assert.equal(office.focused(), "button");
  assert.doesNotMatch(office.html(), /data-office-view/);
  office.open(); assert.match(office.html(), /data-office-view="overview"/);
});

test("empty, loading and failed collection stay browseable without invented players or balances", () => {
  for (const status of ["loading", "error", "unavailable", "ready"] as const) {
    const collection: model.OfficeCollection = status === "ready" ? { status, state: null } : { status };
    const office = fixture({ locale: "en-GB", collection }); office.open();
    office.click("Open: Credit balance"); assert.match(office.html(), /Balance not confirmed yet/);
    assert.doesNotMatch(office.html(), /1,200,000,000|0 TC/);
    office.click("Back"); office.click("Open: Squad &amp; points".replace("&amp;", "&"));
    if (status === "ready") assert.match(office.html(), /Your squad is still empty/);
    else assert.doesNotMatch(office.html(), /Your squad is still empty/);
    assert.doesNotMatch(office.html(), /data-original-card/);
  }
});

test("history drilldown only shows supplied confirmed account records, including signed credits", () => {
  const office = fixture({ locale: "en-GB", collection: { status: "ready", state }, history: { status: "ready", points: [], movements: [{ id: "movement-fixture", kind: "exchange", occurredAt: "2026-10-17T10:00:00Z", playerName: "Fixture A", counterpartPlayerName: "Fixture B", creditsDelta: -500_000 }] } });
  office.open(); office.click("Open: Signings & exchanges");
  office.click("View details: Exchange · Fixture A");
  assert.match(office.html(), /data-office-view="movement"/); assert.match(office.html(), /-500,000 TC/);
  assert.match(office.html(), /Fixture A ↔ Fixture B/);
  office.click("Back"); assert.match(office.html(), /data-office-view="movements"/);
  office.update({ locale: "en-GB", collection: { status: "error" }, history: { status: "error" } });
  assert.match(office.html(), /role="alert"/); assert.doesNotMatch(office.html(), /Fixture A/);
});

test("office copy has equal PT/EN coverage and scoped UI is read-only with shared controls", () => {
  assert.deepEqual(Object.keys(model.officeCopy("pt-BR")), Object.keys(model.officeCopy("en-GB")));
  assert.deepEqual(model.officeCopy("de-DE"), model.officeCopy("en-GB"));
  const source = readFileSync(new URL("../components/touchline/office/ClubOwnerOffice.tsx", import.meta.url), "utf8");
  assert.match(source, /TouchlineGlobalNavigation.module.css/);
  assert.doesNotMatch(source, /fetch\(|localStorage|sessionStorage|supabase|checkout/);
  const css = readFileSync(new URL("../components/touchline/office/ClubOwnerOffice.module.css", import.meta.url), "utf8");
  assert.match(css, /::backdrop[^}]*backdrop-filter: blur/);
  assert.match(css, /overflow: auto/);
});
