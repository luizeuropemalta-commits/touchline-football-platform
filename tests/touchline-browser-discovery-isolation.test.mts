import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { matchesGlob } from "node:path";
import { createRequire } from "node:module";

test("Playwright retains six specs and excludes Node integration", async () => {
  const require = createRequire(import.meta.url);
  const ts = require("typescript");
  const source = await readFile(new URL("../playwright.config.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: { default?: { testDir: string; testMatch: string; projects: object[] } } = {};
  new Function("exports", "require", js)(exports, (id: string) => {
    assert.equal(id, "@playwright/test");
    return { defineConfig: (config: unknown) => config };
  });
  const config = exports.default!;
  assert.equal(config.testDir, "./tests/browser");
  assert.equal(config.testMatch, "**/*.spec.ts");
  for (const project of config.projects) assert.equal(Object.hasOwn(project, "testMatch"), false);
  const names = ["clubhub-feed-scroll.spec.ts", "clubowner-exchange-frame.spec.ts", "tooling-smoke.spec.ts",
    "touchline-card-frame-decode.spec.ts", "touchline-player-leader-crown.spec.ts",
    "touchline-public-launch-gate.spec.ts", "touchline-clubhub-next-refresh.test.mts"];
  const selected = names.filter(name => matchesGlob(`tests/browser/${name}`, config.testMatch));
  assert.deepEqual(selected, names.slice(0, 6));
  const actual = await readdir(new URL("./browser/", import.meta.url));
  assert.deepEqual(actual.filter(name => /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(name)).sort(), [...names].sort());
  for (const name of selected) {
    const text = await readFile(new URL(`./browser/${name}`, import.meta.url), "utf8");
    assert.match(text, /from ["']@playwright\/test["']/);
    assert.doesNotMatch(text, /from ["']node:test["']/);
  }
  const integration = await readFile(new URL("./browser/touchline-clubhub-next-refresh.test.mts", import.meta.url), "utf8");
  assert.match(integration, /from ["']node:test["']/);
  // Only source reads: no integration import, discovery command or browser.
});
