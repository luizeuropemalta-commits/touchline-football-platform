import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("site locale policy reads only the exact runtime server flag and excludes administration", () => {
  const env: Record<string, string | undefined> = {};
  const exports = {} as { isTouchLineSiteLocalesEnabled(pathname?: string): boolean };
  const source = readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, process: { env } });
  for (const value of [undefined, "false", "TRUE", "1", " true", "true "]) {
    env.TOUCHLINE_SITE_LOCALES_ENABLED = value;
    env.NEXT_PUBLIC_TOUCHLINE_SITE_LOCALES_ENABLED = "true";
    assert.equal(exports.isTouchLineSiteLocalesEnabled(), false);
    assert.equal(exports.isTouchLineSiteLocalesEnabled("/intro"), false);
  }
  env.TOUCHLINE_SITE_LOCALES_ENABLED = "true";
  for (const path of [undefined, "/intro", "/login", "/register", "/reset-password", "/clubowner", "/administrator", "/visual-qa-extra"]) {
    assert.equal(exports.isTouchLineSiteLocalesEnabled(path), true, path);
  }
  for (const path of ["/admin", "/admin/", "/admin/login", "/admin/finance", "/visual-qa", "/visual-qa/cards"]) {
    assert.equal(exports.isTouchLineSiteLocalesEnabled(path), false, path);
  }
  env.TOUCHLINE_SITE_LOCALES_ENABLED = "false";
  assert.equal(exports.isTouchLineSiteLocalesEnabled("/intro"), false, "decision must not be cached at import time");
});
