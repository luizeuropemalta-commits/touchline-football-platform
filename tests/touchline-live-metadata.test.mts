import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

function compile(path: string, requireModule: (name: string) => unknown) {
  const exports: Record<string, unknown> = {};
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: requireModule });
  return exports;
}

const locale = compile("../lib/touchlineArena/i18n.ts", name => {
  throw new Error(`Unexpected locale dependency: ${name}`);
});
const page = compile("../app/live/page.tsx", name => {
  if (name === "@/lib/touchlineArena/i18n") return locale;
  return new Proxy({}, { get: () => () => assert.fail("Metadata must not load fixtures, auth or network") });
});

for (const [lang, title] of [
  ["en-GB", "Live | TouchLine England"],
  ["pt-BR", "Ao vivo | TouchLine England"],
  [undefined, "Live | TouchLine England"],
  ["unknown", "Live | TouchLine England"],
  [["en-GB", "pt-BR"], "Live | TouchLine England"],
] as const) {
  test(`Live metadata respects requested locale ${JSON.stringify(lang)}`, async () => {
    assert.equal(typeof page.generateMetadata, "function");
    const generate = page.generateMetadata as (props: { searchParams: Promise<object> }) => Promise<{ title: string; description: string }>;
    const result = await generate({ searchParams: Promise.resolve({ lang }) });
    assert.equal(result.title, title);
    assert.match(result.description, title.startsWith("Live") ? /Live matches/ : /partidas/);
    assert.equal(page.metadata, undefined, "Do not retain conflicting static metadata");
  });
}
