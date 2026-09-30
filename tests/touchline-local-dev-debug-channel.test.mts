import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const javascript = ts.transpileModule(readFileSync(new URL("../next.config.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function configFor(env: Record<string, string | undefined>) {
  const exports: { default?: { experimental?: { reactDebugChannel?: boolean }; allowedDevOrigins: string[] } } = {};
  let isolationChecked = false;
  let monitoringRetained = false;
  runInNewContext(javascript, {
    exports, process: { env },
    require(name: string) {
      if (name === "./lib/touchlinePreview/isolation.ts") return {
        assertTouchlineIsolatedPreviewEnvironment() { isolationChecked = true; },
      };
      if (name === "@sentry/nextjs") return {
        withSentryConfig(config: unknown) { monitoringRetained = true; return config; },
      };
      throw new Error(`Unexpected config dependency: ${name}`);
    },
  });
  assert.equal(isolationChecked, true);
  assert.equal(monitoringRetained, true);
  return exports.default!;
}

test("local development avoids the separate React debug stream that can force reloads before hydration", () => {
  const config = configFor({ NODE_ENV: "development", VERCEL_ENV: "preview" });
  assert.equal(config.experimental?.reactDebugChannel, false);
  assert.deepEqual(Array.from(config.allowedDevOrigins), ["127.0.0.1", "localhost"]);
});

test("published builds and non-development execution retain their existing Next configuration", () => {
  for (const env of [
    { NODE_ENV: "production" },
    { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview" },
    { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production" },
    { NODE_ENV: "development", VERCEL: "1" },
    { NODE_ENV: "test" },
    {},
  ]) assert.equal(configFor(env).experimental?.reactDebugChannel, undefined, JSON.stringify(env));
});
