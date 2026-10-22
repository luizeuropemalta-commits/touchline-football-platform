import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as roomCopy from "../lib/touchlineFantasy/exchange-room-i18n.ts";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
type SceneProps = { plan?: "beta" | "standard" | "master" | "vip"; counterpartyPlan?: "beta" | "standard" | "master" | "vip"; locale?: string; draftLocalesEnabled?: boolean; ownerName?: string; agentNotice?: React.ReactNode };
function renderComponent(name: string, props: SceneProps) {
  const exports: Record<string, React.ComponentType<SceneProps>> = {};
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": jsxRuntime,
    "./exchange-showcase": { CLUBOWNER_EXCHANGE_NAME: "ClubOwner Exchange" },
    "@/lib/touchlineFantasy/exchange-room-i18n": roomCopy,
    "./ClubOwnerNegotiationRoom.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
  };
  const js = ts.transpileModule(read("components/touchline/market/ClubOwnerNegotiationRoom.tsx"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(js, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  assert.ok(exports[name]);
  return renderToStaticMarkup(React.createElement(exports[name], props));
}
const renderScene = (props: SceneProps) => renderComponent("ClubOwnerNegotiationScene", props);

test("Exchange room draft copy stays opt-in and never asserts a confirmed plan or proposal", () => {
  const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"];
  assert.deepEqual(Object.keys(roomCopy.TOUCHLINE_EXCHANGE_ROOM_COPY), locales);
  assert.deepEqual(roomCopy.getExchangeRoomCopy("en-GB"), { unknownPlan: "Plan to be confirmed", instruction: "Players in the same position. Every condition, before acceptance." });
  assert.deepEqual(roomCopy.getExchangeRoomCopy("pt-BR"), { unknownPlan: "Plano a confirmar", instruction: "Jogadores da mesma posição. Cada condição, antes do aceite." });
  for (const locale of locales) {
    const copy = roomCopy.getExchangeRoomCopy(locale, true);
    assert.deepEqual(Object.keys(copy), ["unknownPlan", "instruction"]);
    for (const value of Object.values(copy)) { assert.ok(value.trim()); assert.doesNotMatch(value, /TODO|FIXME|https?:|\{[^}]*\}/); }
    const expectedText = (value: string) => renderToStaticMarkup(React.createElement("span", null, value)).slice(6, -7);
    const room = renderComponent("default", { locale, draftLocalesEnabled: true });
    assert.ok(room.includes(expectedText(copy.instruction)));
    assert.ok(room.includes(expectedText(copy.unknownPlan)), "representative inherits the draft opt-in");
    assert.ok(renderScene({ locale, draftLocalesEnabled: true }).includes(expectedText(copy.unknownPlan)));
    if (!['en-GB', 'pt-BR'].includes(locale)) {
      assert.equal(roomCopy.getExchangeRoomCopy(locale), roomCopy.TOUCHLINE_EXCHANGE_ROOM_COPY['en-GB']);
      assert.match(renderComponent("default", { locale }), /Plan to be confirmed/);
    }
  }
  assert.equal(roomCopy.getExchangeRoomCopy("unknown", true), roomCopy.TOUCHLINE_EXCHANGE_ROOM_COPY['en-GB']);
});

test("main Exchange frame shows one owner representative, not an invented negotiation", () => {
  const html = renderComponent("default", { plan: "vip", ownerName: "Confirmed Owner", agentNotice: React.createElement("span", { "data-real-notice": true }, "Interests unavailable") });
  assert.equal((html.match(/class="representative"/g) ?? []).length, 1);
  assert.equal((html.match(/<span>ClubOwner<\/span>/g) ?? []).length, 1);
  assert.match(html, /Confirmed Owner/);
  assert.match(html, /<strong>VIP<\/strong>/);
  assert.match(html, /class="agentNotice"/);
  assert.match(html, /data-real-notice="true"/);
  assert.doesNotMatch(html, /handshake|tableTop|Plan to be confirmed|Plano a confirmar/);
  const absent = renderComponent("default", {});
  assert.equal((absent.match(/Plano a confirmar/g) ?? []).length, 1);
  assert.doesNotMatch(absent, /class="agentNotice"|data-plan=/);
});

test("the long fine neon is normalised to half the path and reduced motion stays static", () => {
  const html = renderComponent("ClubOwnerRepresentative", { plan: "vip" });
  assert.match(html, /pathLength="272"/);
  const css = read("components/touchline/market/ClubOwnerNegotiationRoom.module.css");
  assert.match(css, /stroke-dasharray: 136 136/);
  assert.match(css, /negotiationGlint 3s linear infinite/);
  assert.match(css, /--representative-ink: #b34dff/);
  assert.match(css, /\.agentNotice::before/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("original suited representatives meet over one table and show each supplied plan explicitly", () => {
  const html = renderScene({ plan: "standard", counterpartyPlan: "vip" });
  assert.equal((html.match(/class="handshake"/g) ?? []).length, 1);
  assert.equal((html.match(/class="tableTop"/g) ?? []).length, 1);
  assert.equal((html.match(/class="representative"/g) ?? []).length, 2);
  assert.equal((html.match(/<span>ClubOwner<\/span>/g) ?? []).length, 2);
  assert.match(html, /class="representative" data-plan="standard"/);
  assert.match(html, /class="representative" data-plan="vip"/);
  assert.match(html, /<strong>Standard<\/strong>/);
  assert.match(html, /<strong>VIP<\/strong>/);
  assert.doesNotMatch(html, /<button|<a |<image|<img|€| TC|aceita|confirmed/);
});

test("a missing counterparty is neutral and is never assigned the owner's plan", () => {
  for (const [locale, label] of [["pt-BR", "Plano a confirmar"], ["en-GB", "Plan to be confirmed"]]) {
    const html = renderScene({ plan: "master", locale });
    assert.equal((html.match(/data-plan="master"/g) ?? []).length, 2, "one representative and one caption only");
    assert.match(html, new RegExp(`<strong>${label}<\\/strong>`));
    assert.doesNotMatch(html, /VIP|Standard/);
  }
  const empty = renderScene({});
  assert.equal((empty.match(/Plano a confirmar/g) ?? []).length, 2);
  assert.doesNotMatch(empty, /data-plan=/);
});

test("plan names remain text, not colour-only identification, for all supported plans", () => {
  for (const plan of ["beta", "standard", "master", "vip"] as const) {
    const html = renderScene({ plan, counterpartyPlan: plan });
    assert.equal((html.match(/<strong>/g) ?? []).length, 2);
    assert.match(html, /<figcaption/);
    assert.match(html, /aria-hidden="true" focusable="false"/);
  }
  const css = read("components/touchline/market/ClubOwnerNegotiationRoom.module.css");
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /@media \(prefers-contrast: more\) \{ \.art \{ display: none/);
});

test("room preserves trophy asset offscreen, decorative vector and no account or card transformation", () => {
  const room = read("components/touchline/market/ClubOwnerNegotiationRoom.tsx");
  assert.match(room, /aria-hidden="true"/);
  assert.match(room, /focusable="false"/);
  assert.doesNotMatch(room, /<Image|className=\{styles.trophy\}/);
  assert.ok(existsSync(new URL('../public/touchlineArena/trophies/touchline-england-league-trophy-lion-cup-candidate-v4-text.png', import.meta.url)));
  assert.doesNotMatch(room, /fetch\(|localStorage|sessionStorage|touchlinePoints|marketValueEur/);
});

test("candidate embeds all 15 original collection slots inside the Exchange below the pitch", () => {
  const client = read('app/fantasy/FantasyGameweekClient.tsx');
  const start = client.indexOf('className={`${collectionLayout.outside} ${collectionLayout.exchange}`}');
  const end = client.indexOf('</ClubOwnerNegotiationRoom>', start);
  assert.ok(start > client.indexOf('</TouchlinePitchSurface>'));
  const content = client.slice(start, end);
  assert.match(content, /area="outside" count=\{15\} grouped/);
  assert.match(content, /slotPositions=\{collectionPlan\?\.outside\}/);
  assert.equal((content.match(/<ClubOwnerCollectionSlots /g) ?? []).length, 1);
  assert.doesNotMatch(content, /start=\{8\}|count=\{7\}/);
  assert.equal((client.match(/<ClubOwnerNegotiationRoom /g) ?? []).length, 1);
});
test("room keeps all four original ClubOwner plan colours and decoration cannot capture clicks", () => {
  const css = read("components/touchline/market/ClubOwnerNegotiationRoom.module.css");
  const original = read("components/touchline/ClubOwnerMarketHeader.module.css");
  for (const rgb of ["203,67,79", "65,139,226", "111,191,143", "162,116,206"]) {
    assert.ok(css.includes(rgb)); assert.ok(original.includes(rgb));
  }
  assert.match(css, /pointer-events: none/);
  assert.match(css, /max-width: 600px/);
  assert.match(css, /\.representative path \{ fill: none;/);
  assert.match(css, /drop-shadow\(0 0 1\.4px currentColor\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /animation: none; display: none/);
});
test("negotiation uses canonical controls and has no free-text conversation surface", () => {
  const thread = read("components/touchline/market-preview/PreviewNegotiationThread.tsx");
  const screen = read("components/touchline/market-preview/MarketExperiencePreview.tsx");
  assert.match(thread, /import \{ Button \} from "@\/components\/ui"/);
  assert.match(thread, /ClubOwnerNegotiationRoom plan=\{ledger.plan\}/);
  assert.doesNotMatch(thread, /<Input|<textarea|<form|p\.messages|type: "message"/);
  assert.doesNotMatch(screen, /Detalhes e mensagens|mensagens<\/p>/);
  assert.match(thread, /Confirmar troca/);
  assert.match(thread, /Preparar contraproposta/);
});

test("compact copy retains decision amounts and withdrawal warning without a tutorial", () => {
  const thread = read("components/touchline/market-preview/PreviewNegotiationThread.tsx");
  const screen = read("components/touchline/market-preview/MarketExperiencePreview.tsx");
  const showcase = read("components/touchline/market/ClubOwnerExchangeShowcase.tsx");
  assert.match(thread, /Sua taxa/);
  assert.match(thread, /Taxa do outro clube/);
  assert.match(thread, /Seu saldo após aceite/);
  assert.match(thread, /Saldo insuficiente/);
  assert.match(screen, /Retirar o anúncio não cancela propostas pendentes/);
  assert.match(showcase, /\{CLUBOWNER_SHOWCASE_LIMIT\} na vitrine/);
  assert.doesNotMatch(screen, /Sem surpresas\.|Você escolhe de zero a/);
  assert.doesNotMatch(thread, /O aceite confere os dois elencos/);
});
