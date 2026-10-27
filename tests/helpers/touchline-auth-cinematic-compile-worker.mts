import assert from "node:assert/strict";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { bundleIsolatedBrowserFixture } from "./touchline-isolated-browser-bundle.mts";

// Process exit releases TypeScript and PostCSS before the parent opens a browser.
assert.equal(process.argv.length, 3, "Expected one test-owned temporary directory");
const output = realpathSync(process.argv[2]);
assert.equal(path.dirname(output), "/private/tmp");
assert.match(path.basename(output), /^touchline-auth-playback-[A-Za-z0-9]+$/);
const root = path.resolve(import.meta.dirname, "../..");
const bundle = bundleIsolatedBrowserFixture({
  entryPath: "components/auth-cinematic-media.tsx",
  requiredSources: ["components/auth-cinematic-media.tsx", "lib/touchlineArena/arena-intro.ts"],
  mountScript: "flushSync(()=>root.render(React.createElement(loadEntry().AuthCinematicMedia)));",
});
// Extract only the component's actual global rules, preserving surrounding
// media conditions. This component has no Tailwind layout dependencies.
const require = createRequire(import.meta.url);
const postcss = createRequire(require.resolve("next/package.json"))("postcss") as typeof import("postcss");
const globals = postcss.parse(readFileSync(path.join(root, "app/globals.css"), "utf8"));
const wanted = new Set([".auth-cinematic-media", ".auth-cinematic-video", ".auth-cinematic-original", ".auth-cinematic-shade"]);
const rules: string[] = [];
globals.walkRules(rule => {
  if (!wanted.has(rule.selector)) return;
  let node: import("postcss").ChildNode = rule.clone();
  for (let parent = rule.parent; parent && parent.type !== "root"; parent = parent.parent) {
    assert.equal(parent.type, "atrule", "unexpected nested cinematic selector");
    const wrapper = parent.clone(); wrapper.removeAll(); wrapper.append(node); node = wrapper as import("postcss").ChildNode;
  }
  rules.push(node.toString());
});
for (const selector of wanted) assert.ok(rules.some(rule => rule.includes(selector)), selector);
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;background:#02050a}${rules.join("\n")}</style></head><body><div id="root"></div></body></html>`;
writeFileSync(path.join(output, "fixture.js"), bundle.script, { flag: "wx" });
writeFileSync(path.join(output, "fixture.html"), html, { flag: "wx" });
