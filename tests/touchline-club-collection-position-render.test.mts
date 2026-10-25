import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as positionDisplay from "../lib/touchlineFantasy/collection-position-display.ts";
import * as allocationCopy from "../lib/touchlineFantasy/allocation-dialog-i18n.ts";
import * as position from "../lib/touchlineFantasy/club-position.ts";
import * as allocation from "../lib/touchlineFantasy/club-allocation.ts";
import * as slotPlan from "../lib/touchlineFantasy/collection-slot-plan.ts";
import * as primaryIndex from "../lib/touchlineFantasy/club-primary-position-index.ts";
import * as primaryPolicy from "../lib/touchlineFantasy/club-primary-position-policy.ts";
import * as swapPresentation from "../lib/touchlineFantasy/squad-swap-presentation.ts";
const { collectionSlotPlan } = slotPlan;
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY } from "../lib/touchlineArena/formation-geometry.ts";

const nativeRequire = createRequire(import.meta.url);
const runtime = nativeRequire("react/jsx-runtime");
const compiled = ts.transpileModule(readFileSync(new URL("../components/touchline/fantasy/ClubOwnerCollectionSlots.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
type Props = Record<string, unknown>;
type Element = React.ReactElement<Props>;
const players = [
  { playerId: "owned-forward", position: "CF", area: "outside", slot: 2 },
  { playerId: "owned-keeper", position: "GK", area: "outside", slot: 9 },
  { playerId: "owned-defender", position: "RB", area: "outside", slot: 7 },
  { playerId: "owned-midfielder", position: "MID", area: "outside", slot: 4 },
];
const catalogue = players.map((player, i) => ({ id: `display-${i}`, canonicalPlayerId: player.playerId, name: player.playerId }));

function render(overrides: Props = {}) {
  const elements: Element[] = [], cards: Props[] = [], chosen: unknown[] = [], fielded: string[] = [];
  const capture = (kind: "jsx" | "jsxs") => (type: unknown, props: Props, key?: string) => {
    // Preserve React's static-children semantics as well as the original keys.
    const element = runtime[kind](type, props, key) as Element;
    elements.push(element); return element;
  };
  const unused = () => { throw new Error("Unexpected unrelated component/hook execution"); };
  const modules: Record<string, unknown> = {
    react: React, "react/jsx-runtime": { ...runtime, jsx: capture("jsx"), jsxs: capture("jsxs") }, "react-dom": { createPortal: unused },
    "lucide-react": { ArrowLeftRight: () => React.createElement("svg", { "aria-hidden": "true" }) },
    "@/lib/touchlineFantasy/collection-position-display": positionDisplay,
    "@/lib/touchlineFantasy/allocation-dialog-i18n": allocationCopy,
    "@/lib/touchlineFantasy/club-position": position,
    "@/lib/touchlineFantasy/club-allocation": allocation,
    "@/lib/touchlineFantasy/collection-slot-plan": slotPlan,
    "@/lib/touchlineFantasy/club-primary-position-index": primaryIndex,
    "@/lib/touchlineFantasy/club-primary-position-policy": primaryPolicy,
    "@/lib/touchlineFantasy/squad-swap-presentation": swapPresentation,
    "@/components/touchline/a11y/TouchlineDialog": { useTouchlineDialog: unused, useTouchlineDialogScrollLock: unused },
    "./TouchlineGameweekCard": { __esModule: true, default: (props: Props) => {
      cards.push(props); const card = props.card as { canonicalPlayerId: string };
      return React.createElement("div", { "data-mocked-card": card.canonicalPlayerId });
    } },
    "@/components/touchline/market/TouchlineMarketPlayerTile": { __esModule: true, default: unused },
  };
  const exports: { ClubOwnerCollectionSlots?: React.ComponentType<Props> } = {};
  runInNewContext(compiled, { exports, require(name: string) {
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    assert.ok(Object.hasOwn(modules, name), name); return modules[name];
  } });
  const state = { players: structuredClone(players) };
  const before = structuredClone(state);
  const html = renderToStaticMarkup(React.createElement(exports.ClubOwnerCollectionSlots!, {
    state, catalogue, area: "outside", count: 15, grouped: true, locale: "en-GB", enabled: true, guidedSlot: 0,
    onChoose: (destination: unknown) => chosen.push(JSON.parse(JSON.stringify(destination))),
    onFieldPlayer: (playerId: string) => fielded.push(playerId), ...overrides,
  }));
  assert.deepEqual(state, before, "presentation cannot mutate the collection");
  const slots = elements.filter(element => element.props["data-collection-slot"] !== undefined);
  return { html, elements, slots, cards, chosen, fielded };
}

function children(slot: Element) {
  return React.Children.toArray(slot.props.children as React.ReactNode).filter(React.isValidElement) as Element[];
}

test("rendered position groups preserve all fifteen persisted slot IDs and canonical cards", () => {
  const result = render();
  assert.equal(result.slots.length, 15);
  assert.deepEqual(result.slots.map(slot => Number(slot.props["data-collection-slot"])).sort((a, b) => a - b), Array.from({ length: 15 }, (_, i) => i));
  assert.deepEqual(result.cards.map(props => (props.card as { canonicalPlayerId: string }).canonicalPlayerId),
    ["owned-keeper", "owned-defender", "owned-midfielder", "owned-forward"]);
  assert.ok(result.html.indexOf('data-collection-slot="9"') < result.html.indexOf('data-collection-slot="2"'));
  for (const [group, code, name] of [["Goalkeepers", "GK", "Goalkeeper"], ["Defence", "RB", "Right-back"],
    ["Midfield", "MID", "Midfielder"], ["Attack", "CF", "Centre-forward"]]) {
    assert.ok(result.html.includes(`aria-label="${group}"`));
    assert.ok(result.html.includes(`aria-label="${code} · ${name}"`));
    assert.ok(result.html.includes(`>${code}</b>`));
  }
  assert.match(result.html, /Unassigned positions/);
  assert.equal((result.html.match(/<h3>[^<]+ <span>1<\/span>/g) ?? []).length, 4);
});

test("planned fifteen vacancies render inside the four football sectors with position labels, not a bottom strip", () => {
  const plan = collectionSlotPlan(TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY["4-3-3"])!;
  const result = render({ state: { players: [] }, slotPositions: plan.outside });
  assert.equal(result.slots.length, 15);
  assert.doesNotMatch(result.html, /Unassigned positions|No players in this unit/);
  assert.equal((result.html.match(/<span>0<\/span>/g) ?? []).length, 4, "headings count contracted players, not empty places");
  for (const slot of result.slots) {
    const index = Number(slot.props["data-collection-slot"]);
    assert.equal(slot.props["data-position"], plan.outside[index]);
  }
  const buttons = result.slots.flatMap(children).filter(child => child.props["data-collection-placeholder"] === "true");
  assert.equal(buttons.filter(button => button.props.disabled === false).length, 1);
  for (const button of buttons) (button.props.onClick as () => void)();
  assert.deepEqual(result.chosen, [{ area: "outside", slot: 0 }]);
});

test("reordered owned-card callbacks retain original area/slot and canonical player ID", () => {
  const result = render();
  const keeperSlot = result.slots.find(slot => slot.props["data-collection-slot"] === 9)!;
  const change = children(keeperSlot).find(child => child.type === "button")!;
  (change.props.onClick as () => void)();
  assert.deepEqual(result.chosen, [{ area: "outside", slot: 9 }]);
  const action = result.cards[0].replacementAction as { disabled: boolean; onSelect: () => void };
  assert.equal(action.disabled, false);
  action.onSelect();
  assert.deepEqual(result.fielded, ["owned-keeper"]);
});

test("only the original guided empty slot is enabled and its real callback is guarded", () => {
  const result = render();
  const buttons = result.slots.flatMap(children).filter(child => child.props["data-collection-placeholder"] === "true");
  assert.equal(buttons.length, 11);
  assert.equal(buttons.filter(button => button.props.disabled === false).length, 1);
  assert.equal(buttons.filter(button => button.props["data-guided-action"] === "true").length, 1);
  for (const button of buttons) (button.props.onClick as () => void)();
  assert.deepEqual(result.chosen, [{ area: "outside", slot: 0 }]);
  const disabled = render({ enabled: false });
  for (const button of disabled.slots.flatMap(children).filter(child => child.props["data-collection-placeholder"] === "true")) {
    assert.equal(button.props.disabled, true);
    assert.notEqual(button.props["data-guided-action"], "true");
    (button.props.onClick as () => void)();
  }
  for (const card of disabled.cards) {
    const action = card.replacementAction as { disabled: boolean; onSelect: () => void };
    assert.equal(action.disabled, true); action.onSelect();
  }
  assert.deepEqual(disabled.chosen, []); assert.deepEqual(disabled.fielded, []);
});

test("unconfirmed state announces pending, not zero athletes, in English and Portuguese", () => {
  for (const [locale, waiting, empty] of [["en-GB", "Awaiting squad confirmation.", "No players in this unit."],
    ["pt-BR", "Aguardando confirmação do elenco.", "Nenhum atleta neste setor."]]) {
    const result = render({ state: null, locale });
    assert.equal((result.html.match(/<span>—<\/span>/g) ?? []).length, 4);
    assert.equal(result.html.split(waiting).length - 1, 4);
    assert.ok(!result.html.includes(empty));
    assert.doesNotMatch(result.html, /<span>0<\/span>/);
    assert.equal(result.slots.length, 15); assert.equal(result.cards.length, 0);
    for (const button of result.slots.flatMap(children).filter(child => child.type === "button")) {
      assert.equal(button.props.disabled, true); (button.props.onClick as () => void)();
    }
    assert.deepEqual(result.chosen, []);
  }
  const confirmedEmpty = render({ state: { players: [] } });
  assert.equal((confirmedEmpty.html.match(/<span>0<\/span>/g) ?? []).length, 4);
  assert.match(confirmedEmpty.html, /No players in this unit/);
  assert.doesNotMatch(confirmedEmpty.html, /Awaiting squad confirmation/);
});

test("collection card presentation gate defaults off and is forwarded without changing card identity", () => {
  for (const gate of [undefined, false, true]) {
    const result = render({ locale: "de-DE", ...(gate === undefined ? {} : { draftLocalesEnabled: gate }) });
    assert.equal(result.cards.length, players.length);
    for (const card of result.cards) {
      assert.equal(card.draftLocalesEnabled, gate ?? false);
      assert.equal(card.locale, "de-DE");
      assert.equal(card.compact, true);
      assert.equal(card.displayWidth, 70);
    }
    assert.deepEqual(result.chosen, []);
    assert.deepEqual(result.fielded, []);
  }
});

test("collection groups and position titles opt into draft labels without changing IDs or counts", () => {
  const draft = render({ locale: "de-DE", draftLocalesEnabled: true });
  const closed = render({ locale: "de-DE" });
  assert.match(draft.html, /Torhüter/);
  assert.match(draft.html, /Abwehr/);
  assert.match(draft.html, /Mittelfeld/);
  assert.match(draft.html, /Angriff/);
  assert.match(draft.html, /title="Torwart"/);
  assert.match(draft.html, /title="Mittelstürmer"/);
  assert.match(closed.html, /Goalkeepers/);
  assert.match(closed.html, /title="Centre-forward"/);
  assert.deepEqual(draft.slots.map(slot => [slot.props["data-collection-slot"], slot.props["data-position"]]),
    closed.slots.map(slot => [slot.props["data-collection-slot"], slot.props["data-position"]]));
  assert.equal(draft.cards.length, closed.cards.length);
  assert.deepEqual(draft.chosen, []);
  assert.deepEqual(draft.fielded, []);
});

test("draft slot states distinguish pending from empty and retain action guards and release text", () => {
  const base = { locale: "de-DE", draftLocalesEnabled: true };
  const pending = render({ ...base, state: null });
  assert.match(pending.html, /Kaderbestätigung ausstehend/);
  assert.doesNotMatch(pending.html, /Keine Spieler in diesem Bereich/);
  assert.equal((pending.html.match(/<span>—<\/span>/g) ?? []).length, 4);
  const empty = render({ ...base, state: { players: [] } });
  assert.match(empty.html, /Keine Spieler in diesem Bereich/);
  assert.doesNotMatch(empty.html, /Kaderbestätigung ausstehend/);
  assert.match(empty.html, /Nicht zugewiesene Positionen/);
  assert.match(render({ ...base, catalogue: [] }).html, /Karte nicht verfügbar/);
  const released: string[] = [];
  const disabled = render({ ...base, enabled: false, onReleasePlayer: (id: string) => released.push(id) });
  for (const card of disabled.cards) {
    const field = card.replacementAction as { label: string; disabled: boolean; onSelect: () => void };
    assert.equal(field.label, "Spieler ersetzen");
    assert.equal(field.disabled, true);
    field.onSelect();
    const release = card.releaseAction as { label: string; disabled: boolean; onSelect: () => void };
    assert.equal(release.label, "Release player");
    assert.equal(release.disabled, true);
    release.onSelect();
  }
  assert.deepEqual(disabled.fielded, []);
  assert.deepEqual(released, []);
  const reserve = render({ ...base, area: "reserves", grouped: false, state: { players: [{ ...players[0], area: "reserves", slot: 0 }] }, onOutsidePlayer: () => {} });
  assert.match(reserve.html, /Ersatzspieler/);
  assert.equal((reserve.cards[0].replacementAction as { label: string }).label, "Spieler ersetzen");
  assert.equal(reserve.cards[0].removalAction, undefined, "Unified replacement must not expose a second removal action");
});

test("missing card remains in its real position group and reserve range preserves its start offset", () => {
  const missing = render({ catalogue: [] });
  assert.equal(missing.cards.length, 0);
  assert.equal((missing.html.match(/Card unavailable/g) ?? []).length, 4);
  assert.match(missing.html, /data-position="GK"/);
  const reserve = render({ grouped: false, area: "reserves", start: 4, count: 5, state: { players: [] }, guidedSlot: 6 });
  assert.deepEqual(reserve.slots.map(slot => slot.props["data-collection-slot"]), [4, 5, 6, 7, 8]);
  for (const button of reserve.slots.flatMap(children).filter(child => child.type === "button")) (button.props.onClick as () => void)();
  assert.deepEqual(reserve.chosen, [{ area: "reserves", slot: 6 }]);
});
