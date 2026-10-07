import assert from "node:assert/strict";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { normalizeTouchLineLocale } from "../lib/touchlineArena/i18n.ts";
import { getTouchlinePublicErrorCopy } from "../lib/touchlineArena/public-error-i18n.ts";

const source = readFileSync(new URL("../app/global-error.tsx", import.meta.url), "utf8");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const titles = {
  "en-GB": "This area could not be opened right now.",
  "pt-BR": "Não foi possível abrir esta área agora.",
  "es-ES": "No se ha podido abrir esta sección ahora.",
  "it-IT": "Al momento non è stato possibile aprire questa sezione.",
  "fr-FR": "Cette section n’a pas pu être ouverte pour le moment.",
  "ar-SA": "تعذّر فتح هذا القسم الآن.",
  "tr-TR": "Bu alan şu anda açılamadı.",
  "de-DE": "Dieser Bereich konnte gerade nicht geöffnet werden.",
} as const;

function compile(query: string, { future = false, server = false }: { future?: boolean; server?: boolean } = {}) {
  const exports: Record<string, unknown> = {};
  const requests: string[] = [];
  const captured: unknown[] = [];
  const nextErrorProps: Array<{ statusCode: number; title?: string }> = [];
  const react = {
    ...React,
    useEffect: (effect: () => void) => { if (!server) effect(); },
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => string, serverSnapshot: () => string) => {
      assert.equal(serverSnapshot(), "en-GB");
      return server ? serverSnapshot() : snapshot();
    },
  };
  runInNewContext(
    ts.transpileModule(source + "\nexport { GlobalErrorContent };", { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.React } }).outputText,
    {
      exports,
      React,
      URLSearchParams,
      window: server
        ? new Proxy({}, { get: () => assert.fail("Server snapshot must not read window") })
        : { location: { search: query } },
      require: (name: string) => {
        if (name === "react") return react;
        if (name === "@sentry/nextjs") return { captureException: (error: unknown) => captured.push(error) };
        if (name === "next/error") return { default: ({ statusCode, title }: { statusCode: number; title?: string }) => {
          nextErrorProps.push({ statusCode, title });
          return React.createElement("article", { "data-status": statusCode }, title);
        } };
        if (name === "@/lib/touchlineArena/catalogue-locale") return { resolveTouchlineCatalogueLocale };
        if (name === "@/lib/touchlineArena/public-error-i18n") return { getTouchlinePublicErrorCopy: (locale: string, enabled = false) => {
          requests.push(locale);
          return getTouchlinePublicErrorCopy(locale, enabled);
        } };
        return assert.fail(`Unexpected dependency: ${name}`);
      },
    },
  );
  const Content = exports.GlobalErrorContent as React.ComponentType<{ error: Error; draftLocalesEnabled?: boolean }>;
  const Public = exports.default as React.ComponentType<{ error: Error }>;
  function Component(props: { error: Error }) { return React.createElement(future ? Content : Public, { ...props, ...(future ? { draftLocalesEnabled: true } : {}) }); }
  return { Component, requests, captured, nextErrorProps };
}

test("global error consumes the exact EN/PT safe-state title and keeps drafts behind the locale gate", () => {
  for (const locale of locales) {
    const error = new Error("private failure");
    const fixture = compile(`?lang=${locale}`);
    const html = renderToStaticMarkup(React.createElement(fixture.Component, { error }));
    const effective = normalizeTouchLineLocale(locale);
    assert.match(html, new RegExp(`lang=\"${effective}\"`));
    assert.ok(html.includes(titles[effective]));
    assert.equal(html.includes("private failure"), false);
    assert.deepEqual(fixture.requests, [effective]);
    assert.deepEqual(fixture.captured, [error]);
    assert.deepEqual(fixture.nextErrorProps, [{ statusCode: 0, title: titles[effective] }]);
  }
});

test("global error SSR uses the EN server snapshot without reading the client query", () => {
  const error = new Error("private failure");
  const fixture = compile("?lang=pt-BR", { server: true });
  const html = renderToStaticMarkup(React.createElement(fixture.Component, { error }));
  assert.match(html, /lang="en-GB"/);
  assert.ok(html.includes(titles["en-GB"]));
  assert.equal(html.includes("private failure"), false);
  assert.deepEqual(fixture.requests, ["en-GB"]);
  assert.deepEqual(fixture.captured, []);
  assert.deepEqual(fixture.nextErrorProps, [{ statusCode: 0, title: titles["en-GB"] }]);
});

test("global error has a future isolated seam for every authored draft title without changing the real gate", () => {
  for (const locale of locales) {
    const fixture = compile(`?lang=${locale}`, { future: true });
    const html = renderToStaticMarkup(React.createElement(fixture.Component, { error: new Error() }));
    assert.match(html, new RegExp(`lang=\"${locale}\"`));
    assert.ok(html.includes(titles[locale]));
    assert.deepEqual(fixture.requests, [locale]);
    assert.deepEqual(fixture.nextErrorProps, [{ statusCode: 0, title: titles[locale] }]);
  }
});
