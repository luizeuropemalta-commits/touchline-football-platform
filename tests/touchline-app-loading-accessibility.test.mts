import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";
import * as localeResolver from "../lib/touchlineArena/root-locale.ts";

const source = readFileSync(new URL("../app/(app)/loading.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

test("actual server loading announces the resolved locale and hides only decorative skeletons", async () => {
  const labels = { "en-GB": "Loading…", "pt-BR": "Carregando…", "es-ES": "Cargando…", "it-IT": "Caricamento…",
    "fr-FR": "Chargement…", "ar-SA": "جارٍ التحميل…", "tr-TR": "Yükleniyor…", "de-DE": "Wird geladen…" };
  for (const enabled of [false, true]) for (const requested of [...Object.keys(labels), "invalid", null]) {
    let headerReads = 0;
    const modules: Record<string, unknown> = {
      "react/jsx-runtime": jsx,
      "next/headers": { headers: async () => { headerReads++; return { get: (key: string) => {
        assert.equal(key, localeResolver.TOUCHLINE_PRESENTATION_LOCALE_HEADER); return requested;
      } }; } },
      "@/lib/touchlineArena/root-locale": localeResolver,
      "@/lib/touchlineArena/site-locales-release": { isTouchLineSiteLocalesEnabled: () => enabled },
    };
    const exports = {} as { default: () => Promise<ReactElement> };
    runInNewContext(code, { exports, require(name: string) { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; } });
    const html = renderToStaticMarkup(await exports.default());
    const locale = localeResolver.resolveTouchLinePresentationLocale(requested, enabled);
    assert.equal(headerReads, 1);
    assert.ok(html.includes(`<p role="status" class="sr-only" lang="${locale}">${labels[locale]}</p><div aria-hidden="true">`));
    assert.equal((html.match(/class="skeleton /g) ?? []).length, 12);
    assert.doesNotMatch(html, /<(button|a|input)\b/);
    assert.ok(html.includes('class="mx-auto max-w-[1500px] animate-in"'));
  }
});
