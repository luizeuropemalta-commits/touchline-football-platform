import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import tailwind from "@tailwindcss/postcss";

test("Tailwind disables automatic discovery and includes only the explicit product sources", async () => {
  const stylesheet = new URL("../app/globals.css", import.meta.url);
  const css = await readFile(stylesheet, "utf8");
  assert.match(css, /^@import "tailwindcss" source\(none\);/, "automatic discovery must stay disabled so generated ancestors cannot become watched inputs");
  const productSources = [...css.matchAll(/^@source\s+["']([^"']+)["']\s*;/gm)].map(match => match[1]);
  assert.deepEqual(productSources, ["./", "../components", "../lib", "../data"], "include all product roots explicitly without opening archives, tests or artifact ancestors");
});

test("real Tailwind/PostCSS dependencies cannot watch the events directory through an ancestor", async () => {
  const require = createRequire(import.meta.resolve("@tailwindcss/postcss"));
  const postcss: (plugins: unknown[]) => { process: (css: string, options: { from: string }) => Promise<{
    messages: { type: string; dir?: string; file?: string }[];
  }> } = require("postcss");
  const stylesheet = new URL("../app/globals.css", import.meta.url);
  const source = await readFile(stylesheet, "utf8");
  const result = await postcss([tailwind({ optimize: false })]).process(source, { from: fileURLToPath(stylesheet) });
  const eventDirectory = fileURLToPath(new URL("../artifacts/social-studio/events", import.meta.url));
  const watchedDirectories = result.messages.filter(message => message.type === "dir-dependency" && typeof message.dir === "string");
  for (const dependency of watchedDirectories) {
    const path = dependency.dir!;
    const descendant = relative(path, eventDirectory);
    assert.ok(descendant.startsWith(".."), `recursive watcher still covers event outputs: ${path}`);
  }
  for (const directory of ["app", "components", "lib"]) {
    assert.ok(watchedDirectories.some(message => message.dir === resolve(directory)), `${directory} must remain observed`);
  }
});
