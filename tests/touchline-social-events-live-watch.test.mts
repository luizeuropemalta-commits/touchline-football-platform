import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import tailwind from "@tailwindcss/postcss";

test("Tailwind excludes the generated ancestor required to isolate events, without hiding application sources", async () => {
  const stylesheet = new URL("../app/globals.css", import.meta.url);
  const css = await readFile(stylesheet, "utf8");
  const exclusions = [...css.matchAll(/@source\s+not\s+["']([^"']+)["']\s*;/g)].map(match => match[1]);
  assert.ok(exclusions.includes("../artifacts"), "Next watches generated ancestor directories recursively");
  const resolved = new URL("../artifacts", stylesheet);
  assert.equal(fileURLToPath(resolved), fileURLToPath(new URL("../artifacts", import.meta.url)));
  assert.match(css, /^@import "tailwindcss";/, "keep automatic discovery of actual application sources");
  assert.ok(!exclusions.includes("..") && !exclusions.includes("../app") && !exclusions.includes("../components"), "do not hide application code from discovery");
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
