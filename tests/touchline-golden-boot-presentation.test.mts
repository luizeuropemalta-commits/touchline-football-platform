import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("fixture denies hosted production and permits only local development or validated QA", () => {
  const fixture = readFileSync(new URL("../app/visual-qa/golden-boot-preview/page.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(fixture, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const denied = new Error("not found");
  for (const [env, status, allowed] of [
    [{ NODE_ENV: "development" }, "inactive", true],
    [{ NODE_ENV: "production", VERCEL_ENV: "preview" }, "qa", true],
    [{ NODE_ENV: "production", VERCEL_ENV: "production" }, "qa", false],
    [{ NODE_ENV: "production" }, "inactive", false],
    [{ NODE_ENV: "development", VERCEL_ENV: "preview", VERCEL: "1" }, "invalid", false],
    [{ NODE_ENV: "production", VERCEL_ENV: "preview" }, "invalid", false],
    [{ NODE_ENV: "production", VERCEL_ENV: "preview" }, "active", false],
  ] as const) {
    const loaded = { exports: {} as { default?: () => unknown } };
    const requireFixture = (id: string) => id === "next/navigation" ? { notFound: () => { throw denied; } }
      : id.endsWith("/isolation") ? { inspectTouchlineIsolatedPreviewEnvironment: () => ({ status }) }
      : id.endsWith("/player-leader-crown-presentation") ? { touchlinePlayerLeaderCrownStyle: () => ({ top: -10, width: 20 }) }
      : { default: () => null };
    new Function("require", "module", "exports", "React", "process", output)(requireFixture, loaded, loaded.exports, React, { env });
    if (allowed) assert.doesNotThrow(() => loaded.exports.default!());
    else assert.throws(() => loaded.exports.default!(), (error) => error === denied);
  }
  assert.match(fixture, /inspectTouchlineIsolatedPreviewEnvironment\(\)/);
});

const source = readFileSync(new URL("../components/touchline/cards/TouchlineGoldenBootPresentation.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const compiledModule = { exports: {} as { default?: React.ComponentType<{cardWidth: number; label: string; children?: React.ReactNode}> } };
new Function("require", "module", "exports", "React", compiled)(() => ({ default: { frame: "frame", card: "card", award: "award" } }), compiledModule, compiledModule.exports, React);
const Presentation = compiledModule.exports.default!;

test("all preview widths reserve a separate award row without changing the card", () => {
  for (const width of [64, 100, 300]) {
    const html = renderToStaticMarkup(React.createElement(Presentation, { cardWidth: width, label: "Demo only" }, React.createElement("div", { "data-card": "unchanged" })));
    assert.match(html, /data-card="unchanged"/);
    assert.ok(html.includes(`padding-top:${width * 0.025}px`));
    assert.ok(html.includes(`width:${width * 0.30}px;height:${width * 0.30}px`));
    assert.match(html, /alt="Demo only"/);
    assert.match(html, /golden-boot-v1\.png/);
  }
});
test("invalid geometry fails closed", () => {
  for (const width of [0, -1, NaN, Infinity]) assert.equal(renderToStaticMarkup(React.createElement(Presentation, { cardWidth: width, label: "Demo" }, null)), "");
});
test("isolated fixture uses real card without ranking subscription or manufactured authority", () => {
  const fixture = readFileSync(new URL("../app/visual-qa/golden-boot-preview/page.tsx", import.meta.url), "utf8");
  assert.match(fixture, /<TouchlineEliteExactCard/);
  assert.match(fixture, /subscribeToRanking=\{false\}/);
  assert.doesNotMatch(fixture, /TouchlineCardLeadershipProvider|fetch\(|createClient|canonicalPlayerId:/);
  assert.match(fixture, /synthetic-no-award-authority/);
});
