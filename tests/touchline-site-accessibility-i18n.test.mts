import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as rootLocale from "../lib/touchlineArena/root-locale.ts";
import * as authLocale from "../lib/touchlineArena/auth-i18n.ts";
import * as canonicalLocale from "../lib/touchlineArena/i18n.ts";
import * as accessibilityCopy from "../lib/touchlineArena/site-accessibility-i18n.ts";
import { isTouchlineIsolatedPreviewRequest, TOUCHLINE_ISOLATED_PREVIEW_HEADER } from "../lib/touchlinePreview/isolation.ts";

const nativeRequire = createRequire(import.meta.url);
const source = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const boundarySource = readFileSync(new URL("../components/touchline/TouchlineLandscapeBoundary.tsx", import.meta.url), "utf8");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const expected = {
  "en-GB": "Skip to main content", "pt-BR": "Pular para o conteúdo principal",
  "es-ES": "Saltar al contenido principal", "it-IT": "Vai al contenuto principale",
  "fr-FR": "Aller au contenu principal", "ar-SA": "انتقل إلى المحتوى الرئيسي",
  "tr-TR": "Ana içeriğe geç", "de-DE": "Zum Hauptinhalt springen",
};
type CopyModule = typeof import("../lib/touchlineArena/site-accessibility-i18n.ts");
function evaluate<T>(text: string, modules: Record<string, unknown>, globals = {}): T {
  const exports = {};
  const output = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  runInNewContext(output, { exports, URL, ...globals, require: (id: string) => { assert.ok(Object.hasOwn(modules, id), id); return modules[id]; } });
  return exports as T;
}
async function copyModule(): Promise<CopyModule> {
  return import("../lib/touchlineArena/site-accessibility-i18n.ts");
}

// Actual async layout, React JSX and landscape boundary are rendered. The
// request/runtime and client leaf components are controlled boundaries; this
// does not run effects, hydrate, exercise keyboard focus or change public gates.
function fixture(options: { releaseFlag?: string; copy?: Pick<CopyModule, "getTouchlineSiteAccessibilityCopy">; orientationCopy?: Pick<CopyModule, "getTouchlineSiteAccessibilityCopy">; loginLocale?: string; futureLocale?: string; header?: Promise<{ get: (key: string) => string | null }> } = {}) {
  const seen = { headerCalls: 0, keys: [] as string[], sync: [] as string[], activity: 0, audio: [] as boolean[], resolver: [] as unknown[], release: [] as boolean[] };
  const policy = evaluate(readFileSync(new URL('../lib/touchlineArena/site-locales-release.ts', import.meta.url), 'utf8'), {}, { process: { env: { TOUCHLINE_SITE_LOCALES_ENABLED: options.releaseFlag } } });
  const jsx = nativeRequire("react/jsx-runtime");
  const forbidden = () => { throw Error("SSR must not invoke orientation effects"); };
  const icon = () => React.createElement("svg");
  const boundary = evaluate<{ default: React.ComponentType<{ children: React.ReactNode; locale: string; skipLabel: string }> }>(boundarySource, {
    "react": React, "react/jsx-runtime": jsx, "lucide-react": { RotateCw: icon, Smartphone: icon },
    "next/image": { __esModule: true, default: (props: Record<string, unknown>) => { const imageProps = { ...props }; delete imageProps.unoptimized; return React.createElement("img", imageProps); } },
    "@/lib/touchlineArena/orientation-gate": { installTouchlineOrientationGate: forbidden, TOUCHLINE_PORTRAIT_QUERY: "(orientation: portrait)" },
    "@/lib/touchlineArena/site-accessibility-i18n": options.orientationCopy ?? accessibilityCopy,
    "./TouchlineLandscapeBoundary.module.css": { __esModule: true, default: { skip: "skip", content: "content", gate: "gate" } },
  }).default;
  return { seen, async render(headerLocale: string | null, isolated: boolean, dataSource: string) {
    const copy = options.copy ?? await copyModule();
    const header = options.header ?? Promise.resolve({ get: (key: string) => {
      seen.keys.push(key);
      if (key === rootLocale.TOUCHLINE_LOGIN_PRESENTATION_LOCALE_HEADER) return options.loginLocale ?? null;
      if (key === rootLocale.TOUCHLINE_PRESENTATION_LOCALE_HEADER) return headerLocale;
      if (key === TOUCHLINE_ISOLATED_PREVIEW_HEADER) return isolated ? "true" : null;
      throw Error(`unexpected header ${key}`);
    } });
    const modules: Record<string, unknown> = {
      "react": React, "react/jsx-runtime": jsx,
      "@/lib/touchlineArena/site-locales-release": policy,
      "@/components/touchline/SiteLocaleReleaseContext": { SiteLocaleReleaseProvider: ({ children, enabled }: { children: React.ReactNode; enabled: boolean }) => { seen.release.push(enabled); return children; } },
      "next/headers": { headers: () => { seen.headerCalls++; return header; } },
      "@/components/touchline/DocumentLocaleSync": { __esModule: true, default: ({ initialLocale }: { initialLocale: string }) => { seen.sync.push(initialLocale); return null; } },
      "@/components/touchline/TouchlineLandscapeBoundary": { __esModule: true, default: boundary },
      "@/components/touchline-activity-tracker": { TouchlineActivityTracker: () => { seen.activity++; return null; } },
      "@/components/auth-ambient-audio": { TouchlineAmbientAudioProvider: ({ children, enabled }: { children: React.ReactNode; enabled: boolean }) => { seen.audio.push(enabled); return children; } },
      "@/lib/touchlinePreview/isolation": { isTouchlineIsolatedPreviewRequest, TOUCHLINE_ISOLATED_PREVIEW_HEADER },
      "@/lib/touchlineArena/public-origin": { TOUCHLINE_PUBLIC_ORIGIN: "https://touchline.com.br" },
      "@/lib/touchlineArena/auth-i18n": authLocale,
      "@/lib/touchlineMirror/runtime": { resolveTouchlineDataSource: () => dataSource },
      "@/lib/touchlineArena/root-locale": { ...rootLocale,
        resolveTouchLinePresentationLocale: (value: string | null, enabled = false) => { seen.resolver.push(value); return options.futureLocale ?? rootLocale.resolveTouchLinePresentationLocale(value, enabled); },
      },
      "@/lib/touchlineArena/site-accessibility-i18n": copy,
      "./globals.css": {}, "./touchline-crest-visibility.css": {},
    };
    const layout = evaluate<{ default: (props: { children: React.ReactNode }) => Promise<React.ReactElement> }>(source, modules).default;
    return renderToStaticMarkup(await layout({ children: React.createElement("main", { "data-child": "preserved" }, "Child <&>") }));
  } };
}

test("one exact accessibility label across eight catalogues; six drafts stay behind the canonical gate", async () => {
  const c = await copyModule();
  assert.deepEqual(Object.keys(c.TOUCHLINE_SITE_ACCESSIBILITY_CATALOGUES), locales);
  assert.deepEqual(c.TOUCHLINE_SITE_ACCESSIBILITY_DRAFT_LOCALES, locales.slice(2));
  assert.equal(c.TOUCHLINE_SITE_ACCESSIBILITY_DRAFT_STATUS, "draft");
  for (const locale of locales) {
    assert.deepEqual({ skipToMainContent: c.TOUCHLINE_SITE_ACCESSIBILITY_CATALOGUES[locale].skipToMainContent }, { skipToMainContent: expected[locale] });
    assert.equal(c.getTouchlineSiteAccessibilityCopy(locale).skipToMainContent, expected[locale === "pt-BR" ? "pt-BR" : "en-GB"]);
  }
  for (const locale of locales.slice(2)) assert.equal(canonicalLocale.isTouchLineLocaleComplete(locale), false);
  for (const locale of [undefined, null, "invalid", "pt", "constructor", "ar-SA"]) assert.equal(c.getTouchlineSiteAccessibilityCopy(locale).skipToMainContent, expected["en-GB"]);
});

test("real layout and skip anchor preserve request authority, public lang/dir, isolation, activity and audio gates", async () => {
  for (const locale of [...locales, null, "invalid"]) for (const isolated of [false, true]) for (const source of ["direct", "mirror"]) {
    const f = fixture(), html = await f.render(locale, isolated, source);
    const resolved = locale === "pt-BR" ? "pt-BR" : "en-GB";
    assert.ok(html.includes(`<html lang="${resolved}" dir="ltr" data-scroll-behavior="smooth">`));
    assert.match(html, /href="#touchline-main-content"/); assert.ok(html.includes(`>${expected[resolved]}</a>`));
    assert.match(html, /id="touchline-main-content"[^>]*tabindex="-1"/);
    assert.match(html, /class="skip sr-only fixed left-4 top-4/);
    assert.match(html, /<main data-child="preserved">Child &lt;&amp;&gt;<\/main>/);
    assert.equal(f.seen.headerCalls, 1); assert.deepEqual(f.seen.resolver, [locale]);
    assert.deepEqual(f.seen.keys, [rootLocale.TOUCHLINE_LOGIN_PRESENTATION_LOCALE_HEADER, rootLocale.TOUCHLINE_PRESENTATION_LOCALE_HEADER, TOUCHLINE_ISOLATED_PREVIEW_HEADER]);
    assert.deepEqual(f.seen.sync, isolated ? [] : [resolved]);
    assert.equal(f.seen.activity, !isolated && source === "direct" ? 1 : 0);
    assert.deepEqual(f.seen.audio, [!isolated]);
  }
});

test("isolated draft seam renders all eight real catalogue labels and forwards full resolved locale", async () => {
  const c = await copyModule();
  for (const locale of locales) {
    const seen: unknown[] = [];
    const f = fixture({ loginLocale: locale, copy: { ...c, getTouchlineSiteAccessibilityCopy(value, enabled) { seen.push(value); assert.equal(enabled, true); return c.getTouchlineSiteAccessibilityCopy(value, enabled); } } });
    const html = await f.render("en-GB", false, "direct");
    assert.ok(html.includes(`>${expected[locale]}</a>`)); assert.deepEqual(seen, [locale]);
  }
  const f = fixture({ futureLocale: "ar-SA", copy: { ...c, getTouchlineSiteAccessibilityCopy: () => ({ ...c.getTouchlineSiteAccessibilityCopy("en-GB"), skipToMainContent: "Skip <&> \"sentinel\"" }) } });
  assert.match(await f.render("pt-BR", true, "mirror"), />Skip &lt;&amp;&gt; &quot;sentinel&quot;<\/a>/);
});

test("exported root uses trusted runtime release for all eight locales and forwards the same client policy", async () => {
  for (const releaseFlag of [undefined, "false", "true"]) for (const locale of locales) {
    const f = fixture({ releaseFlag });
    const html = await f.render(locale, false, "direct");
    const effective = releaseFlag === "true" || locale === "pt-BR" ? locale : "en-GB";
    assert.ok(html.includes(`<html lang="${effective}" dir="ltr"`));
    assert.ok(html.includes(`>${expected[effective]}</a>`));
    assert.deepEqual(f.seen.sync, [effective]);
    assert.deepEqual(f.seen.release, [releaseFlag === "true"]);
    assert.equal(f.seen.activity, 1);
    assert.deepEqual(f.seen.audio, [true]);
  }
});

test("the actual async layout forwards its resolved locale to the real skip-anchor binding", async () => {
  const seen: unknown[] = [];
  const f = fixture({ futureLocale: "ar-SA", copy: { getTouchlineSiteAccessibilityCopy(value) {
    seen.push(value); return { ...accessibilityCopy.getTouchlineSiteAccessibilityCopy("en-GB"), skipToMainContent: "Distinct skip sentinel" };
  } } });
  const html = await f.render("pt-BR", true, "mirror");
  assert.deepEqual(seen, ["ar-SA"]);
  assert.match(html, />Distinct skip sentinel<\/a>/);
});

const orientationKeys = ["orientationEyebrow", "orientationTitle", "orientationDescription", "orientationHint"] as const;
const orientationExpected = {
  "en-GB": ["Give the game the whole screen", "Rotate to landscape", "TouchLine is played in landscape on mobile. Turn your device to continue where you left off.", "Your page and squad stay exactly as they are"],
  "pt-BR": ["O jogo merece a tela inteira", "Gire para o modo horizontal", "No celular, a TouchLine é jogada deitada. Gire o aparelho para continuar de onde parou.", "Sua página e seu time estão preservados"],
  "es-ES": ["Dale al juego toda la pantalla", "Gira al modo horizontal", "En el móvil, TouchLine se juega en horizontal. Gira el dispositivo para continuar donde lo dejaste.", "Tu página y tu equipo se mantienen tal como están"],
  "it-IT": ["Dai al gioco tutto lo schermo", "Ruota in modalità orizzontale", "Su mobile, TouchLine si gioca in orizzontale. Ruota il dispositivo per continuare da dove eri rimasto.", "La tua pagina e la tua squadra restano esattamente come sono"],
  "fr-FR": ["Offrez tout l’écran au jeu", "Passez en mode paysage", "Sur mobile, TouchLine se joue en mode paysage. Tournez votre appareil pour reprendre là où vous en étiez.", "Votre page et votre équipe restent exactement telles quelles"],
  "ar-SA": ["امنح اللعبة الشاشة كاملة", "أدر الجهاز إلى الوضع الأفقي", "تُلعَب TouchLine بالوضع الأفقي على الهاتف. أدر جهازك للمتابعة من حيث توقفت.", "تبقى صفحتك وتشكيلتك كما هما تمامًا"],
  "tr-TR": ["Oyuna tüm ekranı ayır", "Yatay moda döndür", "TouchLine mobilde yatay modda oynanır. Kaldığın yerden devam etmek için cihazını döndür.", "Sayfan ve kadron olduğu gibi korunur"],
  "de-DE": ["Gib dem Spiel den ganzen Bildschirm", "Ins Querformat drehen", "Auf dem Handy wird TouchLine im Querformat gespielt. Drehe dein Gerät, um dort weiterzumachen, wo du aufgehört hast.", "Deine Seite und dein Kader bleiben genau so erhalten"],
} as const;

test("orientation consumer forwards the complete resolved locale to all four real bindings", async () => {
  const seen: unknown[] = [];
  const orientation = Object.fromEntries(orientationKeys.map(key => [key, `${key} <&> \"sentinel\"`]));
  const f = fixture({ futureLocale: "ar-SA", orientationCopy: { getTouchlineSiteAccessibilityCopy(locale) {
    seen.push(locale); return { ...accessibilityCopy.getTouchlineSiteAccessibilityCopy("en-GB"), ...orientation };
  } } });
  const html = await f.render("pt-BR", true, "mirror");
  assert.deepEqual(seen, ["ar-SA"]);
  for (const key of orientationKeys) assert.ok(html.includes(`${key} &lt;&amp;&gt; &quot;sentinel&quot;`), key);
  assert.match(html, /aria-labelledby="touchline-rotate-title" aria-describedby="touchline-rotate-description"/);
  assert.match(html, /id="touchline-rotate-title"/); assert.match(html, /id="touchline-rotate-description"/);
  assert.match(html, /<main data-child="preserved">Child &lt;&amp;&gt;<\/main>/);
  assert.match(html, />TOUCHLINE<\/p>/);
  assert.equal(f.seen.activity, 0); assert.deepEqual(f.seen.audio, [false]);
});

test("orientation catalogues preserve 32 literal messages, all five keys and six public gates", async () => {
  const c = await copyModule();
  for (const locale of locales) {
    const raw = c.TOUCHLINE_SITE_ACCESSIBILITY_CATALOGUES[locale];
    assert.deepEqual(Object.keys(raw), ["skipToMainContent", ...orientationKeys]);
    assert.deepEqual(orientationKeys.map(key => raw[key]), orientationExpected[locale]);
    const publicCopy = c.getTouchlineSiteAccessibilityCopy(locale);
    assert.deepEqual(orientationKeys.map(key => publicCopy[key]), orientationExpected[locale === "pt-BR" ? "pt-BR" : "en-GB"]);
    for (const isolated of [true, false]) {
      const html = await fixture().render(locale, isolated, "direct");
      for (const message of orientationExpected[locale === "pt-BR" ? "pt-BR" : "en-GB"]) assert.ok(html.includes(message));
    }
  }
});

test("isolated orientation drafts use real catalogues without activating public locales", async () => {
  const c = await copyModule();
  for (const locale of locales) {
    const seen: unknown[] = [];
    const html = await fixture({ loginLocale: locale, orientationCopy: { getTouchlineSiteAccessibilityCopy(value, enabled) { seen.push(value); assert.equal(enabled, true); return c.getTouchlineSiteAccessibilityCopy(value, enabled); } } }).render("en-GB", false, "direct");
    assert.deepEqual(seen, [locale]);
    for (const message of orientationExpected[locale]) assert.ok(html.includes(message));
  }
  for (const locale of locales.slice(2)) assert.equal(canonicalLocale.isTouchLineLocaleComplete(locale), false);
});

test("orientation source delta leaves refs, effect, controller, markup and classes byte-identical", () => {
  const restored = boundarySource
    .replace("  draftLocalesEnabled = false,\n", "").replace("  draftLocalesEnabled?: boolean;\n", "")
    .replace("getTouchlineSiteAccessibilityCopy(locale, draftLocalesEnabled)", "getTouchlineSiteAccessibilityCopy(locale)")
    .replace('import { getTouchlineSiteAccessibilityCopy } from "@/lib/touchlineArena/site-accessibility-i18n";\n', "")
    .replace('const copy = getTouchlineSiteAccessibilityCopy(locale);', 'const portuguese = locale === "pt-BR";')
    .replace('{copy.orientationEyebrow}', '{portuguese ? "O jogo merece a tela inteira" : "Give the game the whole screen"}')
    .replace('{copy.orientationTitle}', '{portuguese ? "Gire para o modo horizontal" : "Rotate to landscape"}')
    .replace('{copy.orientationDescription}', '{portuguese\n            ? "No celular, a TouchLine é jogada deitada. Gire o aparelho para continuar de onde parou."\n            : "TouchLine is played in landscape on mobile. Turn your device to continue where you left off."}')
    .replace('{copy.orientationHint}', '{portuguese ? "Sua página e seu time estão preservados" : "Your page and squad stay exactly as they are"}');
  assert.equal(createHash("sha256").update(restored).digest("hex"), "b58ed435c281ebd1cf9236c962f60e3d8906216c7cca2cf59e09d78886095b6e");
});

test("headers remain awaited; rejection does not fabricate a locale or mount client leaves", async () => {
  let release!: (value: { get: (key: string) => string | null }) => void;
  const pending = new Promise<{ get: (key: string) => string | null }>(resolve => { release = resolve; });
  const f = fixture({ header: pending }); const work = f.render(null, false, "direct");
  await Promise.resolve(); assert.equal(f.seen.resolver.length, 0); assert.equal(f.seen.audio.length, 0);
  release({ get: key => key === rootLocale.TOUCHLINE_PRESENTATION_LOCALE_HEADER ? "pt-BR" : null });
  assert.match(await work, /Pular para o conteúdo principal/);
  const g = fixture({ header: Promise.reject(Error("headers unavailable")) });
  await assert.rejects(g.render(null, false, "direct"), /headers unavailable/);
  assert.equal(g.seen.resolver.length, 0); assert.equal(g.seen.audio.length, 0);
});

test("the complete layout baseline differs only by the admitted import and label binding", () => {
  assert.match(source, /const skipLabel = getTouchlineSiteAccessibilityCopy\(locale, allowDraftPresentation\)\.skipToMainContent;/);
  // Reverse only the coordinated, false-default presentation seam before the
  // existing localization reversal. Keep the original whole-layout oracle so
  // unrelated media, landmarks, providers and isolation changes still fail.
  const coordinatedWrapper = 'export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {\n  return renderRootLayout({ children }, isTouchLineSiteLocalesEnabled());\n}\n\nasync function renderRootLayout({ children }: Readonly<{ children: React.ReactNode }>, draftLocalesEnabled = false) {';
  assert.ok(source.includes(coordinatedWrapper));
  const preCoordinated = source
    .replace('import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";\n', '')
    .replace('import { SiteLocaleReleaseProvider } from "@/components/touchline/SiteLocaleReleaseContext";\n', '')
    .replace('        <SiteLocaleReleaseProvider enabled={draftLocalesEnabled}>\n', '')
    .replace('        </SiteLocaleReleaseProvider>\n', '')
    .replace(coordinatedWrapper, 'export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {')
    .replace('resolveTouchLinePresentationLocale(requestHeaders.get(TOUCHLINE_PRESENTATION_LOCALE_HEADER), draftLocalesEnabled)', 'resolveTouchLinePresentationLocale(requestHeaders.get(TOUCHLINE_PRESENTATION_LOCALE_HEADER))')
    .replace('  const allowDraftPresentation = draftLocalesEnabled || Boolean(loginLocale);', '  const draftLocalesEnabled = false;\n  const allowDraftPresentation = draftLocalesEnabled || Boolean(loginLocale);')
    .replace('dir={draftLocalesEnabled ? "ltr" : touchlineDocumentDirection(locale)}', 'dir={touchlineDocumentDirection(locale)}')
    .replace('<DocumentLocaleSync initialLocale={locale} draftLocalesEnabled={draftLocalesEnabled} />', '<DocumentLocaleSync initialLocale={locale} />');
  const restored = preCoordinated.replace('import { getTouchlineSiteAccessibilityCopy } from "@/lib/touchlineArena/site-accessibility-i18n";\n', "")
    .replace('import { normalizeTouchLineLoginLocale } from "@/lib/touchlineArena/auth-i18n";\n', "")
    .replace("  TOUCHLINE_LOGIN_PRESENTATION_LOCALE_HEADER,\n", "")
    .replace('  const loginLocale = requestHeaders.get(TOUCHLINE_LOGIN_PRESENTATION_LOCALE_HEADER);\n  const locale = loginLocale\n    ? normalizeTouchLineLoginLocale(loginLocale)\n    : resolveTouchLinePresentationLocale(requestHeaders.get(TOUCHLINE_PRESENTATION_LOCALE_HEADER));', '  const locale = resolveTouchLinePresentationLocale(\n    requestHeaders.get(TOUCHLINE_PRESENTATION_LOCALE_HEADER),\n  );')
    .replace("  const draftLocalesEnabled = false;\n  const allowDraftPresentation = draftLocalesEnabled || Boolean(loginLocale);\n", "")
    .replace(" draftLocalesEnabled={allowDraftPresentation}", "")
    .replace("getTouchlineSiteAccessibilityCopy(locale, allowDraftPresentation)", "getTouchlineSiteAccessibilityCopy(locale)")
    .replace('const skipLabel = getTouchlineSiteAccessibilityCopy(locale).skipToMainContent;', 'const skipLabel = locale === "pt-BR" ? "Pular para o conteúdo principal" : "Skip to main content";');
  assert.equal(createHash("sha256").update(restored).digest("hex"), "60fac7f90a25c1ae45d71f5dcb914191d20fc88516490cbd3df85b24beb8ce71");
});
