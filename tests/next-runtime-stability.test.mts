import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Next.js development and production builds use the stable Webpack compiler", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.match(packageJson.scripts?.dev ?? "", /next dev --webpack/);
  assert.match(packageJson.scripts?.build ?? "", /next build --webpack/);
});
