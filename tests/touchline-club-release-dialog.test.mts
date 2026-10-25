import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as release from "../lib/touchlineFantasy/club-release.ts";
import type { ClubAcquisitionState } from "../lib/touchlineFantasy/club-acquisition.ts";

const require = createRequire(import.meta.url);
const playerId = "50000000-0000-4000-8000-000000000003";
const state: ClubAcquisitionState = { revision: 1, seasonId: "50000000-0000-4000-8000-000000000002", plan: "vip", balanceEur: 1_145_000_000,
  coach: { id: "coach", tier: "sapphire-blue", valueEur: 10_000_000 },
  players: [{ playerId, clubId: "club", position: "RB", area: "outside", slot: 0, valueEur: 45_000_000 }],
  receipts: [{ key: "original_purchase", playerId, area: "outside", slot: 0, valueEur: 45_000_000, revision: 1 }] };
const compiled = ts.transpileModule(readFileSync(new URL("../components/touchline/fantasy/ClubOwnerReleaseDialog.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
type Props = Record<string, unknown>;
type Element = React.ReactElement<Props>;

function fixture(success = true) {
  // A mounted-instance hook model retains lazy state across explicit rerenders.
  // The component, quote calculation, JSX and SSR renderer remain the real code.
  const cells: unknown[] = [];
  let cursor = 0, closes = 0;
  let dialogOptions: { onDismiss: () => void; initialFocusRef: unknown } | undefined;
  const confirmations: [string, number][] = [];
  const refs: { current: unknown }[] = [];
  const modules: Record<string, unknown> = {
    "lucide-react": require("lucide-react"),
    "@/components/touchline/market/TouchlineMarketMarks": { TouchlineCoinMark: () => React.createElement("svg", { "data-touchline-coin": true }) },
    react: { ...React,
      useState(initial: unknown) {
        const index = cursor++;
        if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial;
        return [cells[index], () => { throw new Error("Unexpected local state write"); }];
      },
      useRef(initial: unknown) {
        const index = cursor++;
        if (!refs[index]) refs[index] = { current: initial };
        return refs[index];
      },
    },
    "react/jsx-runtime": require("react/jsx-runtime"),
    "react-dom": { createPortal: (children: React.ReactNode) => children },
    "@/lib/touchlineFantasy/club-release": release,
    "@/lib/touchlineArena/demo-data": { squadCardToExactPlayer: (card: unknown) => card },
    "@/components/touchline/cards/TouchlineEliteExactCard": { __esModule: true, default: (props: Props) => {
      assert.equal(props.showCardActions,false);assert.equal(props.showProfileAction,false);
      assert.equal(props.enableInteractiveNeon,false);assert.equal(props.subscribeToRanking,false);
      return React.createElement("span", { "data-original-card": true }, (props.player as {name:string}).name);
    } },
    "@/components/touchline/a11y/TouchlineDialog": {
      useTouchlineDialog(options: typeof dialogOptions) {
        dialogOptions = options;
        return { dialogProps: { role: "dialog", "aria-modal": true } };
      },
      useTouchlineDialogScrollLock(open: boolean) { assert.equal(open, true); },
    },
  };
  const exports: { ClubOwnerReleaseDialog?: (props: Props) => React.ReactNode } = {};
  runInNewContext(compiled, { exports, document: { body: {} }, require(name: string) {
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    assert.ok(Object.hasOwn(modules, name), name); return modules[name];
  } });
  function render(overrides: Props = {}) {
    cursor = 0;
    const currentState = (overrides.state ?? structuredClone(state)) as ClubAcquisitionState;
    const before = structuredClone(currentState);
    const tree = exports.ClubOwnerReleaseDialog!({ state: currentState, playerId, playerName: "Owned player", locale: "en-GB",
      enabled: true, available: true, busy: false, pending: false, error: null,
      onClose: () => { closes++; }, onConfirm: async (id: string, revision: number) => { confirmations.push([id, revision]); return success; },
      ...overrides });
    assert.deepEqual(currentState, before, "review cannot mutate supplied collection");
    const buttons: Element[] = [];
    let heading: Element | undefined;
    function walk(node: React.ReactNode) {
      React.Children.forEach(node, child => {
        if (!React.isValidElement<Props>(child)) return;
        if (child.type === "button") buttons.push(child);
        if (child.type === "h2") heading = child;
        walk(child.props.children as React.ReactNode);
      });
    }
    walk(tree);
    assert.equal(buttons.length, 2);
    assert.ok(heading);
    return { html: renderToStaticMarkup(tree), heading, keep: buttons[0], confirm: buttons[1], dismiss: () => dialogOptions!.onDismiss(),
      initialFocusRef: dialogOptions!.initialFocusRef };
  }
  return { render, confirmations, get closes() { return closes; } };
}
const click = async (button: Element) => (button.props.onClick as () => Promise<void> | void)();

test("release review renders paid45M/fee4.5M/refund40.5M with no opening or keep mutation", async () => {
  for (const [locale, paid, fee, refund, keepLabel] of [
    ["en-GB", "45,000,000 TC", "4,500,000 TC", "40,500,000 TC", "Keep in squad"],
    ["pt-BR", "45.000.000 TC", "4.500.000 TC", "40.500.000 TC", "Manter no elenco"],
  ]) {
    const h = fixture(), view = h.render({ locale });
    for (const value of [paid, fee, refund, "10%", keepLabel]) assert.ok(view.html.includes(value), value);
    assert.match(view.html, /role="dialog"/);
    const headings = locale === "pt-BR" ? ["Rescisão de contrato"] : ["Contract termination"];
    for (const heading of headings) assert.ok(view.html.includes(`aria-label="${heading}"`));
    assert.equal((view.html.match(/<section /g) ?? []).length, 1);
    assert.deepEqual(h.confirmations, []); assert.equal(h.closes, 0);
    await click(view.keep);
    assert.deepEqual(h.confirmations, []); assert.equal(h.closes, 1);
  }
});

test("release review starts focus at its heading, not the offscreen footer, even while actions are disabled", () => {
  for (const overrides of [{}, { available: false }, { busy: true }, { pending: true }, {
    locale: "pt-BR", card: { id: "display-id", canonicalPlayerId: playerId, name: "Original athlete" },
  }]) {
    const h = fixture(), view = h.render(overrides);
    assert.equal(view.heading.props.ref, view.initialFocusRef);
    assert.equal(view.heading.props.tabIndex, -1, "heading receives initial focus without adding a tab stop");
    assert.notEqual(view.keep.props.ref, view.initialFocusRef);
    assert.notEqual(view.confirm.props.ref, view.initialFocusRef);
    assert.match(view.html, /<h2 tabindex="-1">/);
    assert.deepEqual(h.confirmations, []); assert.equal(h.closes, 0);
  }
});

test("release review shows original matching card and confirmed/preview balances without enabling the gate",()=>{
  const h=fixture(),card={id:"display-id",canonicalPlayerId:playerId,name:"Original athlete"};
  const view=h.render({card,available:false});
  assert.match(view.html,/data-original-card="true"/);
  assert.match(view.html,/inert=""/);
  assert.match(view.html,/1,145,000,000 TC/);assert.match(view.html,/1,185,500,000 TC/);
  assert.match(view.html,/90%/);assert.match(view.html,/only after the release is confirmed/);
  assert.equal(view.confirm.props.disabled,true);assert.deepEqual(h.confirmations,[]);
  const stale=h.render({card,state:{...state,revision:2,balanceEur:1_000_000_000}});
  assert.match(stale.html,/1,000,000,000 TC/);assert.doesNotMatch(stale.html,/1,040,500,000 TC/);
  assert.equal(stale.confirm.props.disabled,true);
  assert.doesNotMatch(h.render({card:{...card,canonicalPlayerId:"another"}}).html,/data-original-card/);
});

test("release review removes club identity and contracted squad total while preserving cash",()=>{
  const h=fixture();
  const other={...state.players[0],playerId:"50000000-0000-4000-8000-000000000004",slot:1,valueEur:20_000_000};
  const view=h.render({ownerName:"Test ClubOwner",state:{...state,players:[...state.players,other]}});
  assert.doesNotMatch(view.html,/ClubOwner · Test ClubOwner|Contracted squad value|65,000,000 TC/);
  assert.doesNotMatch(view.html,/75,000,000 TC/);
  assert.doesNotMatch(view.html,/excluding the coach/);assert.match(view.html,/1,145,000,000 TC/);
  assert.doesNotMatch(fixture().render().html,/ClubOwner ·/);
  assert.equal((view.html.match(/data-touchline-coin/g) ?? []).length, 5);
});

test("zero confirmed cash stays zero and release uses the original contract, not the card's current market value", async () => {
  for (const [locale, paid, fee, refund, currentLabel, previewLabel] of [
    ["en-GB", "45,000,000 TC", "4,500,000 TC", "40,500,000 TC", "Current confirmed balance", "Balance after release · preview"],
    ["pt-BR", "45.000.000 TC", "4.500.000 TC", "40.500.000 TC", "Saldo atual confirmado", "Saldo após a liberação · previsão"],
  ]) {
    const h = fixture(), suppliedState = { ...structuredClone(state), balanceEur: 0 };
    const before = structuredClone(suppliedState);
    const view = h.render({ locale, state: suppliedState,
      card: { id: "display-id", canonicalPlayerId: playerId, name: "Original athlete", marketValue: "€95M" } });
    assert.match(view.html, /data-original-card="true"/);
    for (const amount of [paid, fee, refund]) assert.ok(view.html.includes(amount), amount);
    assert.ok(view.html.includes(`${currentLabel}</dt><dd>`));
    assert.ok(view.html.includes('aria-label="0 TC"'));
    assert.ok(view.html.includes(`${previewLabel}</dt><dd>`));
    assert.ok(view.html.includes(`aria-label="${refund}"`));
    assert.doesNotMatch(view.html, /95[,.]000[,.]000 TC|9[,.]500[,.]000 TC|85[,.]500[,.]000 TC/);
    assert.equal(view.confirm.props.disabled, false, "a return does not require available cash for a new purchase");
    await click(view.keep);
    assert.deepEqual(suppliedState, before, "cancelling never credits the projected return");
    assert.deepEqual(h.confirmations, []);
  }
});

test("other contracts do not replace the selected player's quote or balance", () => {
  const starter = { ...state.players[0], playerId: "50000000-0000-4000-8000-000000000004", area: "starters" as const, slot: 0, valueEur: 20_000_000 };
  const reserve = { ...state.players[0], playerId: "50000000-0000-4000-8000-000000000005", area: "reserves" as const, slot: 0, valueEur: 10_000_000 };
  const view = fixture().render({ state: { ...state, players: [...state.players, starter, reserve] } });
  assert.doesNotMatch(view.html, /Contracted squad value|75,000,000 TC/);
  assert.match(view.html, /aria-label="1,145,000,000 TC"/);
  assert.match(view.html, /aria-label="1,185,500,000 TC"/);
});

test("full-screen review displays athlete record without inventing contract dates or months", () => {
  const view = fixture().render({ locale: "pt-BR", card: { id: playerId, name: "Atleta" } });
  assert.match(view.html, /fullscreenOverlay/);
  assert.match(view.html, /Registro do atleta/);
  assert.match(view.html, /Data não registrada/);
  assert.match(view.html, /Prazo não informado/);
  assert.doesNotMatch(view.html, /ID do atleta|Player ID/);
  assert.doesNotMatch(view.html, /Seu clube|Valor do elenco contratado|Valores originais pagos/);
  const css = readFileSync(new URL("../components/touchline/fantasy/ClubOwnerReleaseDialog.module.css", import.meta.url), "utf8");
  assert.match(css, /height: 100dvh/);
  assert.match(css, /border: 0; border-radius: 0/);
  assert.match(css, /background: rgb\(4 11 8 \/ 82%\)/);
  assert.match(css, /grid-auto-rows: minmax\(52px, auto\)/);
  assert.match(css, /\.money strong \{ font-size: 20\.7px/);
});

test("missing or mismatched card uses the full-width review fallback", () => {
  assert.match(fixture().render().html, /data-has-card="false"/);
  assert.match(fixture().render({ card: { id: "different-player", name: "Other player" } }).html, /data-has-card="false"/);
  const css = readFileSync(new URL("../components/touchline/fantasy/ClubOwnerReleaseDialog.module.css", import.meta.url), "utf8");
  assert.match(css, /\.review\[data-has-card="false"\]\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test("only explicit confirmation submits frozen player/revision, closing only on success", async () => {
  for (const success of [false, true]) {
    const h = fixture(success), view = h.render();
    assert.equal(view.confirm.props.disabled, false);
    assert.deepEqual(h.confirmations, []);
    await click(view.confirm);
    assert.deepEqual(h.confirmations, [[playerId, 1]], "no client monetary values enter the write callback");
    assert.equal(h.closes, success ? 1 : 0);
  }
});

test("confirmation waits for the authoritative result without closing or changing the supplied balance", async () => {
  const h = fixture(), suppliedState = structuredClone(state), before = structuredClone(suppliedState);
  const calls: [string, number][] = [];
  let settle!: (success: boolean) => void;
  const result = new Promise<boolean>(resolve => { settle = resolve; });
  const view = h.render({ state: suppliedState, onConfirm: (id: string, revision: number) => {
    calls.push([id, revision]);
    return result;
  } });
  const confirmation = click(view.confirm);
  assert.deepEqual(calls, [[playerId, 1]]);
  assert.equal(h.closes, 0);
  assert.deepEqual(suppliedState, before);
  const busy = h.render({ state: suppliedState, busy: true });
  assert.equal(busy.confirm.props.disabled, true);
  assert.equal(busy.keep.props.disabled, true);
  assert.match(busy.html, /Confirming…/);
  busy.dismiss();
  assert.equal(h.closes, 0);
  settle(true);
  await confirmation;
  assert.equal(h.closes, 1);
  assert.deepEqual(suppliedState, before, "the dialog itself never writes money or deletes a contract");
});

test("mobile source contract keeps review, long labels and footer within the scrollable shared dialog", () => {
  const css = readFileSync(new URL("../components/touchline/fantasy/ClubOwnerReleaseDialog.module.css", import.meta.url), "utf8");
  const shared = readFileSync(new URL("../components/touchline/fantasy/ClubOwnerCollectionSlots.module.css", import.meta.url), "utf8");
  assert.match(css, /\.dialog h2,\s*\.owner,\s*\.safety\s*\{\s*overflow-wrap:\s*anywhere/);
  assert.match(css, /\.details\s*\{\s*min-width:\s*0/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)\s*\{\s*\.review\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.amounts\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);\s*gap:\s*4px/);
  assert.match(shared, /\.dialog\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*32px\);\s*overflow:\s*auto/);
  assert.match(shared, /\.pickerModes\s*\{[^}]*flex-wrap:\s*wrap/);
  const view = fixture().render({ ownerName: "ClubOwnerWithAVeryLongUnbrokenName".repeat(4), playerName: "FootballerWithAVeryLongUnbrokenName".repeat(4) });
  assert.equal(view.heading.props.tabIndex, -1);
  assert.equal(view.keep.props.disabled, false);
  assert.equal(view.confirm.props.disabled, false);
  // Source/render regression only: no native browser layout or touch PASS is implied.
});

test("gate-off, pending, unavailable state and busy disable and guard confirmation", async () => {
  for (const override of [{ available: false }, { enabled: false }, { pending: true }, { busy: true }]) {
    const h = fixture(), view = h.render(override);
    assert.equal(view.confirm.props.disabled, true);
    await click(view.confirm);
    assert.deepEqual(h.confirmations, []); assert.equal(h.closes, 0);
    if ("busy" in override) {
      assert.equal(view.keep.props.disabled, true); view.dismiss(); assert.equal(h.closes, 0);
    } else {
      assert.equal(view.keep.props.disabled, false); await click(view.keep); assert.equal(h.closes, 1);
    }
    if ("available" in override) assert.match(view.html, /Confirmation unavailable/);
    if ("pending" in override) assert.match(view.html, /Confirmation is pending/);
  }
});

test("rerendered revision/contract changes freeze quote and require a fresh review", async () => {
  const h = fixture();
  h.render();
  const updated = structuredClone(state);
  updated.revision = 2;
  updated.players = updated.players.map(player => ({ ...player, valueEur: 95_000_000 }));
  const view = h.render({ state: updated });
  assert.match(view.html, /45,000,000 TC/); assert.match(view.html, /40,500,000 TC/);
  assert.match(view.html, /Signing value<\/dt><dd>.*?aria-label="45,000,000 TC"/);
  assert.doesNotMatch(view.html, /aria-label="95,000,000 TC"/);
  assert.doesNotMatch(view.html, /Contracted squad value/);
  assert.match(view.html, /Your squad changed/);
  assert.equal(view.confirm.props.disabled, true);
  await click(view.confirm); assert.deepEqual(h.confirmations, []);
  const missing = h.render({ state: { ...updated, players: [] } });
  assert.equal(missing.confirm.props.disabled, true);
  await click(missing.confirm); assert.deepEqual(h.confirmations, []);
});

test("pending/error review remains escapable after network work ends without retrying", () => {
  const h = fixture(), view = h.render({ pending: true, error: "Unable to confirm the squad. Please retry." });
  assert.match(view.html, /role="alert"/);
  assert.match(view.html, /Confirm pending operation/);
  assert.equal(view.confirm.props.disabled, true);
  view.dismiss();
  assert.equal(h.closes, 1); assert.deepEqual(h.confirmations, []);
});
