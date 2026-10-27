import assert from "node:assert/strict";
import { realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { frameCss, renderFrame, type FrameState } from "./touchline-site-frame-fixture.mts";

// Reuse the exact source fixture and compiler. Process exit releases TypeScript,
// React SSR and PostCSS caches before the parent starts the browser.
assert.equal(process.argv.length, 3, "Expected one test-owned temporary directory");
const output = realpathSync(process.argv[2]);
assert.equal(path.dirname(output), "/private/tmp");
assert.match(path.basename(output), /^touchline-site-frame-[A-Za-z0-9]+$/);
const markup = Object.fromEntries((["empty", "fallback", "short", "tall"] as FrameState[])
  .map(state => [state, renderFrame(state)]));
writeFileSync(path.join(output, "fixture.css"), frameCss(), { flag: "wx" });
writeFileSync(path.join(output, "fixture-markup.json"), JSON.stringify({ ...markup, isolated: renderFrame("short", true) }), { flag: "wx" });
