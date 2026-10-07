import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { getTouchlineFantasyMarketWorkflowCopy } from "../lib/touchlineFantasy/market-workflow-i18n.ts";
import { touchlineFantasyStatusCopy } from "../lib/touchlineFantasy/market-state-i18n.ts";

const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/fantasy/fantasy.module.css", import.meta.url), "utf8");

test("the existing dedicated frame displays Round plus the canonical number, never a fixed 6", () => {
  const frame = source.match(/<div className=\{styles.myClubCommandStatus\}[^]*?<\/div>/)?.[0] ?? "";
  assert.match(frame, /data-round-frame="true"/);
  assert.deepEqual([getTouchlineFantasyMarketWorkflowCopy("pt-BR").round, getTouchlineFantasyMarketWorkflowCopy("en-GB").round], ["Rodada", "Round"]);
  assert.match(source, /const workflowCopy = getTouchlineFantasyMarketWorkflowCopy\(locale, draftLocalesEnabled\)/);
  assert.match(frame, /<span>\{workflowCopy\.round\}<\/span>/);
  assert.match(frame, /<strong>\{activeGameweek\?\.number \?\? "—"\}<\/strong>/);
  assert.match(frame, /statusCopy\(activeGameweek\?\.state, locale, draftLocalesEnabled\)/);
  assert.doesNotMatch(frame, /Round 6|Rodada 6|>6<|"Gameweek"|>Gameweek</);
  assert.match(css, /\.myClubCommandStatus\[data-round-frame="true"\]/);
});

test("Round frame renders changing and unavailable canonical values without changing state labels", () => {
  const require = createRequire(import.meta.url);
  const ts = require("typescript");
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const frame = source.match(/<div className=\{styles.myClubCommandStatus\}[^]*?<\/div>/)?.[0];
  assert.ok(frame);
  const body = `export default function Frame({activeGameweek,locale,draftLocalesEnabled=false}) { const workflowCopy = getTouchlineFantasyMarketWorkflowCopy(locale,draftLocalesEnabled); return (${frame}); }`;
  const output = ts.transpileModule(body, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const compiled = { exports: {} as { default?: unknown } };
  runInNewContext(output, { module: compiled, exports: compiled.exports, require, styles: { myClubCommandStatus: "frame" }, statusCopy: touchlineFantasyStatusCopy, getTouchlineFantasyMarketWorkflowCopy });
  for (const locale of ["pt-BR", "en-GB"]) for (const number of [6, 12, null]) {
    const pt = locale === "pt-BR";
    const html = renderToStaticMarkup(React.createElement(compiled.exports.default, { activeGameweek: number ? { number, state: "MARKET_OPEN" } : null, locale }));
    assert.match(html, pt ? /<span>Rodada<\/span>/ : /<span>Round<\/span>/);
    assert.ok(html.includes(`<strong>${number ?? "—"}</strong>`));
    assert.ok(html.includes(`<small>${number ? (pt ? "Mercado aberto" : "Market open") : "—"}</small>`));
  }
});
