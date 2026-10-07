import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import ts from "typescript";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { getTouchlineMatchCentreCopy } from "../lib/touchlineArena/match-centre-i18n.ts";
import { touchlineMatchEventLabel, touchlineMatchEventRelatedPlayerLabel } from "../lib/touchlineArena/match-event-i18n.ts";
import { orderTouchlineMatchEvents } from "../lib/touchlineArena/match-centre.ts";

const source = readFileSync(new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("match.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const route = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "TouchlineMatchCentre");
assert.ok(route?.body);
const timelines: ts.JsxElement[] = [];
const declarations: Record<string, ts.VariableDeclaration[]> = { language: [], dictionary: [] };
function visit(node: ts.Node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === "ol" && node.getText(ast).includes("orderTouchlineMatchEvents(verifiedDetail.events)")) timelines.push(node);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) in declarations) declarations[node.name.getText(ast)].push(node);
  node.forEachChild(visit);
}
visit(route.body);
assert.equal(timelines.length, 1);
for (const nodes of Object.values(declarations)) assert.equal(nodes.length, 1);
const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ["eventMoment", "teamName"].includes(node.name?.text ?? ""));
assert.equal(helpers.length, 2);
const extracted = `${helpers.map(node => node.getText(ast)).join("\n")}
export function renderEvents(initialLocale, verifiedDetail, draftLocalesEnabled = false) {
  const ${declarations.language[0].getText(ast)};
  const ${declarations.dictionary[0].getText(ast)};
  return (${timelines[0].getText(ast)});
}`;
const exports: { renderEvents?: (locale: string, detail: unknown, draft?: boolean) => ReactNode } = {};
runInNewContext(ts.transpileModule(extracted, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText, {
  exports, resolveTouchlineCatalogueLocale, getTouchlineMatchCentreCopy,
  touchlineMatchEventLabel, touchlineMatchEventRelatedPlayerLabel, orderTouchlineMatchEvents,
  require(name: string) { assert.equal(name, "react/jsx-runtime"); return jsxRuntime; },
});
assert.ok(exports.renderEvents);
const render = exports.renderEvents;

function fixture() {
  return {
    fixture: { homeTeam: { id: "home", name: "Official Home $&" }, awayTeam: { id: "away", name: "Official Away" } },
    events: [
      { id: "goal", teamId: "home", type: "Goal", minute: 45, extraMinute: 2, playerName: "Scorer <&> $&", relatedPlayerName: "Assist $&" },
      { id: "card", teamId: "away", type: "yellowcard", minute: 30, playerName: "Booked", relatedPlayerName: "Related" },
      { id: "sub", teamId: "home", type: "substitution", minute: 90, playerName: "Entering $&", relatedPlayerName: "Leaving $&" },
      { id: "unknown", teamId: "away", type: "unknown-provider-private-code", minute: 40, playerName: "Player", relatedPlayerName: "Other" },
    ],
  };
}

test("actual event JSX renders Portuguese and opted-in Arabic while default Arabic remains English", () => {
  for (const [locale, draft, expected, relations] of [
    ["pt-BR", false, ["Substituição", "Gol", "Evento", "Cartão amarelo"], ["entrou por", "Assistência", "Jogador relacionado"]],
    ["ar-SA", true, ["تبديل", "هدف", "حدث", "بطاقة صفراء"], ["بدلًا من", "تمريرة حاسمة", "لاعب مرتبط بالحدث"]],
    ["ar-SA", false, ["Substitution", "Goal", "Event", "Yellow card"], ["for", "Assist", "Related player"]],
  ] as const) {
    const detail = fixture();
    const before = JSON.stringify(detail);
    const html = renderToStaticMarkup(render(locale, detail, draft));
    assert.deepEqual([...html.matchAll(/<strong>(.*?)<\/strong>/g)].map(match => match[1]), [...expected]);
    assert.ok(html.includes(`<small>${relations[0]}: Leaving $&amp;</small>`));
    assert.ok(html.includes(`<small>${relations[1]}: Assist $&amp;</small>`));
    assert.ok(html.includes(`<small>${relations[2]}: Related</small>`));
    assert.ok(html.includes("Scorer &lt;&amp;&gt; $&amp;"));
    assert.ok(html.includes("Entering $&amp;"));
    assert.ok(html.includes("Official Home $&amp;"));
    assert.deepEqual([...html.matchAll(/<time>(.*?)<\/time>/g)].map(match => match[1]), ["90′", "45+2′", "40′", "30′"]);
    assert.doesNotMatch(html, /unknown-provider-private-code/);
    assert.equal(JSON.stringify(detail), before, "render must not mutate type, names, facts or insertion order");
  }
});

test("a changed event snapshot resolves its new type without inventing an assist or mutating facts", () => {
  const detail = fixture();
  const first = renderToStaticMarkup(render("pt-BR", detail));
  assert.ok(first.includes("<strong>Gol</strong>"));
  detail.events[0] = { ...detail.events[0], type: "own goal" };
  const before = JSON.stringify(detail);
  const second = renderToStaticMarkup(render("pt-BR", detail));
  assert.ok(second.includes("<strong>Gol contra</strong>"));
  assert.ok(second.includes("<small>Jogador relacionado: Assist $&amp;</small>"));
  assert.doesNotMatch(second, /<small>Assistência:/);
  assert.equal(JSON.stringify(detail), before);
});
