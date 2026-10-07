import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import ts from "typescript";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";

const load = () => import("../lib/touchlineArena/public-error-i18n.ts");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const baseline = {
  "en-GB": {
    error: { eyebrow: "TouchLine · safe state", title: "This area could not be opened right now.", body: "No club data has been changed. Try again or return to ClubOwner.", retry: "Try again", arena: "Return to ClubOwner" },
    notFound: { eyebrow: "Safe navigation", title: "This area is not available", description: "The address may have changed or may not exist. No club data was changed.", code: "Error 404" },
  },
  "pt-BR": {
    error: { eyebrow: "TouchLine · estado seguro", title: "Não foi possível abrir esta área agora.", body: "Nenhum dado do seu clube foi alterado. Você pode tentar novamente ou voltar para o ClubOwner.", retry: "Tentar novamente", arena: "Voltar ao ClubOwner" },
    notFound: { eyebrow: "Navegação segura", title: "Esta área não está disponível", description: "O endereço pode ter mudado ou não existir. Nenhum dado do seu clube foi alterado.", code: "Erro 404" },
  },
} as const;
type Copy = { error: Record<keyof typeof baseline["en-GB"]["error"], string>; notFound: Record<keyof typeof baseline["en-GB"]["notFound"], string> };
// Offline is an additive, independently tested surface. These explicit
// oracles retain all nine error/404 keys, with the owner-approved ClubOwner
// destination wording replacing the former Market label.
const originalGroups = ({ error, notFound }: Copy): Copy => ({ error, notFound });
const unpublishedDrafts = {
  "es-ES": {
    error: { eyebrow: "TouchLine · estado seguro", title: "No se ha podido abrir esta sección ahora.", body: "No se ha modificado ningún dato de tu club. Puedes volver a intentarlo o regresar a ClubOwner.", retry: "Volver a intentarlo", arena: "Volver a ClubOwner" },
    notFound: { eyebrow: "Navegación segura", title: "Esta sección no está disponible", description: "La dirección puede haber cambiado o no existir. No se ha modificado ningún dato de tu club.", code: "Error 404" },
  },
  "it-IT": {
    error: { eyebrow: "TouchLine · stato sicuro", title: "Al momento non è stato possibile aprire questa sezione.", body: "Nessun dato del tuo club è stato modificato. Puoi riprovare o tornare a ClubOwner.", retry: "Riprova", arena: "Torna a ClubOwner" },
    notFound: { eyebrow: "Navigazione sicura", title: "Questa sezione non è disponibile", description: "L’indirizzo potrebbe essere cambiato o non esistere. Nessun dato del tuo club è stato modificato.", code: "Errore 404" },
  },
  "fr-FR": {
    error: { eyebrow: "TouchLine · état sûr", title: "Cette section n’a pas pu être ouverte pour le moment.", body: "Aucune donnée de votre club n’a été modifiée. Vous pouvez réessayer ou revenir à ClubOwner.", retry: "Réessayer", arena: "Revenir à ClubOwner" },
    notFound: { eyebrow: "Navigation sécurisée", title: "Cette section n’est pas disponible", description: "L’adresse a peut-être changé ou n’existe pas. Aucune donnée de votre club n’a été modifiée.", code: "Erreur 404" },
  },
  "ar-SA": {
    error: { eyebrow: "TouchLine · حالة آمنة", title: "تعذّر فتح هذا القسم الآن.", body: "لم تتغير أي بيانات لناديك. يمكنك المحاولة مجددًا أو العودة إلى ClubOwner.", retry: "المحاولة مجددًا", arena: "العودة إلى ClubOwner" },
    notFound: { eyebrow: "تصفّح آمن", title: "هذا القسم غير متاح", description: "ربما تغيّر العنوان أو لم يعد موجودًا. لم تتغير أي بيانات لناديك.", code: "خطأ 404" },
  },
  "tr-TR": {
    error: { eyebrow: "TouchLine · güvenli durum", title: "Bu alan şu anda açılamadı.", body: "Kulübünüzün hiçbir verisi değiştirilmedi. Tekrar deneyebilir veya ClubOwner’a dönebilirsiniz.", retry: "Tekrar dene", arena: "ClubOwner’a dön" },
    notFound: { eyebrow: "Güvenli gezinme", title: "Bu alan kullanılamıyor", description: "Adres değişmiş olabilir veya mevcut olmayabilir. Kulübünüzün hiçbir verisi değiştirilmedi.", code: "Hata 404" },
  },
  "de-DE": {
    error: { eyebrow: "TouchLine · sicherer Zustand", title: "Dieser Bereich konnte gerade nicht geöffnet werden.", body: "Es wurden keine Daten deines Vereins geändert. Du kannst es erneut versuchen oder zu ClubOwner zurückkehren.", retry: "Erneut versuchen", arena: "Zurück zu ClubOwner" },
    notFound: { eyebrow: "Sichere Navigation", title: "Dieser Bereich ist nicht verfügbar", description: "Die Adresse hat sich möglicherweise geändert oder existiert nicht. Es wurden keine Daten deines Vereins geändert.", code: "Fehler 404" },
  },
} satisfies Partial<Record<typeof locales[number], Copy>>;
const sources = {
  error: readFileSync(new URL("../app/error.tsx", import.meta.url), "utf8"),
  notFound: readFileSync(new URL("../components/touchline/TouchlineNotFound.tsx", import.meta.url), "utf8"),
};
const escape = (text: string) => renderToStaticMarkup(React.createElement(React.Fragment, null, text));
function compile(source: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.React } }).outputText,
    { exports, React, URLSearchParams, require: (name: string) => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; }, ...globals });
  return exports;
}

test("public errors keep nine exact EN/PT literals with approved ClubOwner wording and six unapproved draft gates", async () => {
  const mod = await load();
  assert.deepEqual(Object.keys(mod.TOUCHLINE_PUBLIC_ERROR_CATALOGUES), locales);
  assert.deepEqual(mod.TOUCHLINE_PUBLIC_ERROR_DRAFT_LOCALES, locales.slice(2));
  assert.equal(mod.TOUCHLINE_PUBLIC_ERROR_DRAFT_STATUS, "draft");
  for (const locale of ["en-GB", "pt-BR"] as const) assert.deepEqual(originalGroups(mod.getTouchlinePublicErrorCopy(locale)), baseline[locale]);
  for (const locale of locales) {
    const copy = mod.TOUCHLINE_PUBLIC_ERROR_CATALOGUES[locale];
    assert.deepEqual(Object.keys(copy.error), Object.keys(baseline["en-GB"].error));
    assert.deepEqual(Object.keys(copy.notFound), Object.keys(baseline["en-GB"].notFound));
    for (const entry of [...Object.values(copy.error), ...Object.values(copy.notFound)]) assert.ok(entry.trim());
    assert.match(copy.error.eyebrow, /^TouchLine · /); assert.match(copy.notFound.code, /404/);
    assert.match(copy.error.body, /ClubOwner/);
    assert.match(copy.error.arena, /ClubOwner/);
  }
  for (const locale of [...locales.slice(2), "", "pt", "constructor", "__proto__", null, undefined]) assert.deepEqual(originalGroups(mod.getTouchlinePublicErrorCopy(locale)), baseline["en-GB"]);
  for (const locale of locales.slice(2)) assert.equal(i18n.isTouchLineLocaleComplete(locale), false);
});

test("all nine literal error values remain authored for each unpublished draft without opening its gate", async () => {
  const mod = await load();
  for (const [locale, expected] of Object.entries(unpublishedDrafts) as Array<[keyof typeof unpublishedDrafts, Copy]>) {
    assert.deepEqual(originalGroups(mod.TOUCHLINE_PUBLIC_ERROR_CATALOGUES[locale]), expected, locale);
    assert.deepEqual(originalGroups(mod.getTouchlinePublicErrorCopy(locale)), baseline["en-GB"], `${locale} remains unpublished`);
    assert.equal(i18n.isTouchLineLocaleComplete(locale), false);
  }
});

async function fixture(kind: keyof typeof sources, query: string, options: { future?: boolean; sentinel?: boolean; server?: boolean } = {}) {
  const mod = await load();
  const requests: string[] = [], navigation: Record<string, unknown>[] = [];
  let resetCalls = 0, windowReads = 0, subscriptions = 0, notifications = 0;
  const error = new Error();
  for (const key of ["message", "stack", "digest"]) Object.defineProperty(error, key, { get: () => assert.fail(`Private ${key} read`) });
  const deps = {
    react: options.server ? React : { ...React, useSyncExternalStore: (subscribe: (listener: () => void) => () => void, snapshot: () => string, serverSnapshot: () => string) => {
      assert.equal(serverSnapshot(), "en-GB"); subscriptions++;
      const cleanup = subscribe(() => { notifications++; }); assert.equal(typeof cleanup, "function"); cleanup();
      return snapshot();
    } },
    "next/navigation": { useSearchParams: () => new URLSearchParams(query) },
    "lucide-react": icons,
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    "@/lib/touchlineArena/public-error-i18n": { getTouchlinePublicErrorCopy: (locale: string, draftLocalesEnabled = false) => {
      requests.push(locale);
      if (options.sentinel) return Object.fromEntries(Object.entries(baseline["en-GB"]).map(([group, values]) => [group, Object.fromEntries(Object.keys(values).map(key => [key, `${locale}:${group}:${key}`]))]));
      return mod.getTouchlinePublicErrorCopy(locale, draftLocalesEnabled);
    } },
    "./TouchlineGlobalNavigation": { default: (props: Record<string, unknown>) => { navigation.push(props); return React.createElement("nav", { "data-test-navigation": true }); } },
  };
  const globals = { window: { get location() { windowReads++; assert.ok(!options.server, "SSR must use server snapshot without window"); return { search: query }; } },
    document: new Proxy({}, { get: () => assert.fail("No DOM access") }), console: { error: () => assert.fail("No private logging") } };
  const internal = kind === "error" ? "ErrorBoundaryContent" : "NotFoundContent";
  const compiled = compile(sources[kind] + `\nexport { ${internal} as isolated };`, deps, globals);
  const Component = (options.future ? compiled.isolated : compiled.default) as React.ComponentType<{ error: Error; reset: () => void; draftLocalesEnabled?: boolean }>;
  const props = { error, reset: () => { resetCalls++; } };
  const supplied = options.future ? { ...props, draftLocalesEnabled: true } : props;
  const wrapper = options.server ? null : (Component as (input: typeof supplied) => React.ReactElement)(supplied);
  const tree = options.server ? React.createElement(Component, supplied)
    : options.future ? wrapper! : (wrapper!.type as (props: unknown) => React.ReactElement)(wrapper!.props);
  const html = renderToStaticMarkup(tree);
  return { tree, html, requests, navigation, get resetCalls() { return resetCalls; }, windowReads, subscriptions, notifications };
}
function elements(tree: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  const found: React.ReactElement<Record<string, unknown>>[] = [];
  React.Children.forEach(tree, child => { if (React.isValidElement<Record<string, unknown>>(child)) { found.push(child); found.push(...elements(child.props.children as React.ReactNode)); } });
  return found;
}

test("real error SSR keeps English snapshot without reading window or private error details", async () => {
  const h = await fixture("error", "?lang=pt-BR", { server: true });
  for (const text of Object.values(baseline["en-GB"].error)) assert.ok(h.html.includes(escape(text)));
  assert.deepEqual(h.requests, ["en-GB"]); assert.equal(h.windowReads, 0); assert.equal(h.resetCalls, 0);
  assert.ok(h.html.includes('href="/clubowner?lang=en-GB"')); assert.equal(h.subscriptions, 0);
});

test("controlled client snapshot preserves first query locale, no-op subscription, reset gesture and ClubOwner link", async () => {
  const queries = [["", "en-GB"], ["?lang=", "en-GB"], ["?lang=unknown", "en-GB"], ["?lang=pt-BR&lang=en-GB", "pt-BR"], ["?lang=en-GB&lang=pt-BR", "en-GB"], ...locales.map(locale => [`?lang=${locale}`, locale === "pt-BR" ? "pt-BR" : "en-GB"])];
  for (const [query, locale] of queries) {
    const h = await fixture("error", query);
    assert.deepEqual(h.requests, [locale]); assert.equal(h.windowReads, 1); assert.equal(h.subscriptions, 1); assert.equal(h.notifications, 0);
    for (const text of Object.values(baseline[locale as "en-GB" | "pt-BR"].error)) assert.ok(h.html.includes(escape(text)));
    assert.ok(h.html.includes(`href="/clubowner?lang=${locale}"`));
    assert.equal(h.resetCalls, 0);
    const buttons = elements(h.tree).filter(node => node.type === "button"); assert.equal(buttons.length, 1); assert.equal(buttons[0].props.type, "button");
    assert.equal(typeof buttons[0].props.onClick, "function"); (buttons[0].props.onClick as () => void)(); assert.equal(h.resetCalls, 1);
  }
});

test("real 404 consumer preserves public navigation props and query fallback without reading private details", async () => {
  for (const query of ["", "?lang=", "?lang=unknown", "?lang=pt-BR&lang=en-GB", ...locales.map(locale => `?lang=${locale}`)]) {
    const locale = i18n.normalizeTouchLineLocale(new URLSearchParams(query).get("lang"));
    const h = await fixture("notFound", query);
    for (const text of Object.values(baseline[locale === "pt-BR" ? "pt-BR" : "en-GB"].notFound)) assert.ok(h.html.includes(escape(text)));
    assert.deepEqual(h.requests, [locale]); assert.deepEqual(h.navigation, [{ locale, draftLocalesEnabled: false, currentRoute: "notFound", surface: "public", className: "mt-8" }]);
    assert.equal(h.resetCalls, 0); assert.equal(h.windowReads, 0); assert.equal(h.subscriptions, 0);
  }
});

test("both real consumers expose eight isolated catalogues and every per-key sentinel without changing public gates", async () => {
  const errorTitles = ["This area could not be opened right now.", "Não foi possível abrir esta área agora.", "No se ha podido abrir esta sección ahora.", "Al momento non è stato possibile aprire questa sezione.", "Cette section n’a pas pu être ouverte pour le moment.", "تعذّر فتح هذا القسم الآن.", "Bu alan şu anda açılamadı.", "Dieser Bereich konnte gerade nicht geöffnet werden."];
  const notFoundTitles = ["This area is not available", "Esta área não está disponível", "Esta sección no está disponible", "Questa sezione non è disponibile", "Cette section n’est pas disponible", "هذا القسم غير متاح", "Bu alan kullanılamıyor", "Dieser Bereich ist nicht verfügbar"];
  for (const [index, locale] of locales.entries()) for (const kind of ["error", "notFound"] as const) {
    const h = await fixture(kind, `?lang=${locale}`, { future: true });
    assert.ok(h.html.includes(escape(kind === "error" ? errorTitles[index] : notFoundTitles[index]))); assert.deepEqual(h.requests, [locale]);
    const s = await fixture(kind, `?lang=${locale}`, { future: true, sentinel: true });
    for (const key of Object.keys(baseline["en-GB"][kind])) assert.ok(s.html.includes(`${locale}:${kind}:${key}`));
  }
});

test("authorized wrapper, locale opt-in and fixed direction leave prior callback, CSS, links and ARIA bytes intact", () => {
  const hash = (text: string) => createHash("sha256").update(text).digest("hex");
  for (const kind of ["error", "notFound"] as const) {
    const ast = ts.createSourceFile("boundary.tsx", sources[kind], ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === (kind === "error" ? "ErrorBoundaryContent" : "NotFoundContent"));
    assert.ok(component && ts.isFunctionDeclaration(component) && component.body);
    const returned = component.body.statements.find(ts.isReturnStatement); assert.ok(returned);
    const currentReturn = returned.getText(ast);
    assert.equal((currentReturn.match(/ dir="ltr"/g) ?? []).length, 1);
    if (kind === "notFound") assert.equal((currentReturn.match(/ draftLocalesEnabled=\{draftLocalesEnabled\}/g) ?? []).length, 1);
    // Only the explicitly authorized direction/prop additions are removed
    // before comparing against the original immutable subtree digest.
    const priorReturn = currentReturn.replace(' dir="ltr"', '').replace(' draftLocalesEnabled={draftLocalesEnabled}', '');
    assert.equal(hash(priorReturn), kind === "error" ? "6fbeaf0e226dae189f08ce2151c15182610e1e8d5214d8042d3fe2ef56bf2312" : "e1706b74200271874b97975976e0474c2e76b44d364192ce98b9efe4a0513157");
    if (kind === "error") {
      const hooks: string[] = []; const visit = (node: ts.Node) => { if (ts.isCallExpression(node) && node.expression.getText(ast) === "useSyncExternalStore") {
        const current = node.getText(ast);
        assert.match(current, /resolveTouchlineCatalogueLocale\(new URLSearchParams\(window.location.search\).get\("lang"\), draftLocalesEnabled\)/);
        hooks.push(hash(current.replace('resolveTouchlineCatalogueLocale', 'normalizeTouchLineLocale').replace(', draftLocalesEnabled)', ')')));
      } ts.forEachChild(node, visit); }; visit(ast);
      assert.deepEqual(hooks, ["91621de8e4dcb3e73b2a05a135ad769a1786f90f4711d1ddef903febc2aad137"]);
    }
  }
});
