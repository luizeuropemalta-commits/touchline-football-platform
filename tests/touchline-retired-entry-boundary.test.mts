import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { normalizeTouchLineLocale } from "../lib/touchlineArena/i18n.ts";
import { parseTouchlineArenaIntroIntent } from "../lib/touchlineArena/arena-intro.ts";
import { ARENA_ONLINE_ZONES } from "../lib/touchlineArena/arena-online-hub.ts";

const require = createRequire(import.meta.url);
test("legacy zone destinations lead only to retained Market, Live and Rankings pages", () => {
  const destinations = Object.fromEntries(ARENA_ONLINE_ZONES.map(({ key, href }) => [key, href]));
  assert.deepEqual(destinations, {
    live: "/live", bench: "/market-transfer", market: "/market-transfer",
    rankings: "/touchline-tables", news: "/live", watch: "/live",
  });
});
function route(path: string) {
  const entry = () => null;
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": require("react/jsx-runtime"),
    "next/navigation": { redirect: (url: string) => { throw new Error(url); } },
    "@/lib/touchlineArena/i18n": { normalizeTouchLineLocale },
    "@/lib/touchlineArena/arena-intro": { parseTouchlineArenaIntroIntent },
    "@/components/touchline/arena/TouchlineGameEntry": { default: entry },
  };
  const exports: { default?: (input: { searchParams: Promise<object> }) => Promise<unknown> } = {};
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, URLSearchParams, require(name: string) {
    assert.ok(name in modules, `Unexpected dependency (auth, geometry or legacy game): ${name}`);
    return modules[name];
  } });
  return { call: (params: object) => exports.default!({ searchParams: Promise.resolve(params) }), entry };
}

test("legacy QA switches cannot load a game, read an account or enable an editor", async () => {
  const retired = route("app/arena/page.tsx");
  for (const flags of [{}, { qaEditor: "1" }, { qaReadOnly: "1" }]) {
    await assert.rejects(retired.call({ ...flags, lang: "pt-BR", intro: "first" }), /\/intro\?lang=pt-BR&intro=first/);
  }
  assert.equal(existsSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../app/visual-qa/quick-substitution-readiness/page.tsx", import.meta.url)), false);
});

test("dedicated intro preserves locale and explicit intent without account or game reads", async () => {
  const intro = route("app/intro/page.tsx");
  const result = await intro.call({ lang: ["pt-BR"], intro: "first", skipIntro: "1" }) as { type: unknown; props: { locale: string; initialIntroIntent: string } };
  assert.equal(result.type, intro.entry);
  assert.equal(result.props.locale, "pt-BR");
  assert.equal(result.props.initialIntroIntent, "first");
});
