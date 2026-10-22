import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { resolveTouchLineRootLocale } from "../lib/touchlineArena/root-locale.ts";

test("retired coming-soon entry preserves every released locale without bypassing the release gate", async () => {
  const source = readFileSync(new URL("../app/coming-soon/page.tsx", import.meta.url), "utf8");
  for (const enabled of [false, true]) {
    let redirected = "";
    const exports = {} as { default: (props: { searchParams: Promise<{ lang: string }> }) => Promise<void> };
    const modules: Record<string, unknown> = {
      "next/navigation": { redirect(url: string) { redirected = url; } },
      "@/lib/touchlineArena/root-locale": { resolveTouchLineRootLocale },
      "@/lib/touchlineArena/site-locales-release": {
        isTouchLineSiteLocalesEnabled(path: string) { assert.equal(path, "/coming-soon"); return enabled; },
      },
    };
    runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
      exports, require(name: string) { assert.ok(name in modules); return modules[name]; },
    });
    for (const lang of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
      await exports.default({ searchParams: Promise.resolve({ lang }) });
      assert.equal(redirected, `/intro?lang=${encodeURIComponent(resolveTouchLineRootLocale(lang, enabled))}`);
      if (enabled) assert.equal(redirected, `/intro?lang=${lang}`);
    }
  }
});
