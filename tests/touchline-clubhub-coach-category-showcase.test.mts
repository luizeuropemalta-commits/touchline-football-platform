import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import * as icons from "lucide-react";
import ts from "typescript";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as clubs from "../lib/touchlineArena/demo-data.ts";
import * as workflow from "../lib/touchlineFantasy/market-workflow-i18n.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import * as menuCopy from "../lib/touchlineArena/account-locale-menu-i18n.ts";
import * as intent from "../lib/touchlineArena/presentation-locale-intent.ts";
import * as storage from "../lib/touchlineArena/browser-storage.ts";

import { TOUCHLINE_COACH_TIER_GALLERY } from "../lib/touchlineArena/coach-tier-gallery.ts";

// Real server policy in an isolated environment; never inherit the host flag.
const releaseEnv: Record<string, string | undefined> = {};
const releasePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: releasePolicy, process: { env: releaseEnv } });


const component = readFileSync(
  new URL("../components/touchline/TouchlineCoachCategoryShowcase.tsx", import.meta.url),
  "utf8",
);
const componentStyles = readFileSync(
  new URL("../components/touchline/TouchlineCoachCategoryShowcase.module.css", import.meta.url),
  "utf8",
);
const page = readFileSync(new URL("../app/touchline-clubs/page.tsx", import.meta.url), "utf8");
const directoryLoad = () => import("../lib/touchlineArena/club-hub-directory-i18n.ts");

test("ClubHub exposes the seven canonical player and coach borders with real representative boundaries", () => {
  assert.equal(TOUCHLINE_COACH_TIER_GALLERY.length, 7);
  assert.equal(new Set(TOUCHLINE_COACH_TIER_GALLERY.map((item) => item.tierKey)).size, 7);

  for (const item of TOUCHLINE_COACH_TIER_GALLERY) {
    assert.match(item.compactArtUrl, /^\/touchlineArena\/cards\/templates\/live-compact\/coaches\/.+\.webp$/);
    assert.equal(
      existsSync(new URL(`../public${item.compactArtUrl}`, import.meta.url)),
      true,
      `missing local coach category asset for ${item.tierKey}`,
    );
  }

  assert.match(component, /alt=""/);
  assert.equal((component.match(/<ul className=\{styles\.grid\}/g) ?? []).length, 2);
  assert.match(component, /selectTouchlinePlayerTierRepresentatives\(playerCards\)/);
  assert.match(component, /selectTouchlineCoachTierRepresentatives\(\)/);
  assert.match(component, /TouchlineEliteExactCard/);
  assert.match(component, /TouchlineCoachCard/);
  assert.match(component, /assetLoading="eager"/);
  assert.match(component, /frameLoading="eager"/);
  assert.match(componentStyles, /data-coach-card-inner="true"/);
  assert.match(componentStyles, /data-touchline-card-frame="true"/);
  assert.match(component, /dictionary\.representativePendingDescription/);
  assert.doesNotMatch(component, /TOUCHLINE_DEMO_COACH|competition-card-offer|retailPrice|touchCredit|\bfetch\(/);
});

// The page function returns its real tree; only the actual menu subtree is
// SSR-rendered. Async football children and effects are deliberately not run.
function compileMenuBoundary(source: string, modules: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: (name: string) => {
      if (name === "@/lib/touchlineArena/site-locales-release") return releasePolicy;
    assert.ok(Object.hasOwn(modules, name), `Unexpected boundary ${name}`); return modules[name];
  }, fetch: () => assert.fail("No requests during page/menu SSR") });
  return exports;
}
function childElements(element: React.ReactElement<Record<string, unknown>>) {
  return React.Children.toArray(element.props.children as React.ReactNode)
    .filter((node): node is React.ReactElement<Record<string, unknown>> => React.isValidElement(node));
}

function realBrandHeader(menu: Record<string, unknown>) {
  const css = { default: new Proxy({}, { get: (_, key) => String(key) }) };
  const switcher = compileMenuBoundary(readFileSync(new URL("../components/auth-language-switcher.tsx", import.meta.url), "utf8"), {
    "react/jsx-runtime": jsx, "lucide-react": icons,
    "@/components/touchline/AccountLocaleMenu": menu,
    "@/lib/touchlineArena/i18n": i18n,
    "@/lib/touchlineArena/browser-storage": storage,
    "@/lib/touchlineArena/presentation-locale-intent": intent,
  });
  const controls = compileMenuBoundary(readFileSync(new URL("../components/touchline/TouchlinePageControls.tsx", import.meta.url), "utf8"), {
    "react/jsx-runtime": jsx, "@/components/auth-language-switcher": switcher,
    "@/components/auth-ambient-audio": { AuthAmbientAudio: () => null },
    "./TouchlinePageControls.module.css": css,
    "next/navigation": { usePathname: () => "/touchline-clubs" },
    "@/lib/touchlineArena/auth-i18n": { normalizeTouchLineAuthLocale: i18n.normalizeTouchLineLocale },
    "./SiteLocaleReleaseContext": { useSiteLocaleRelease: () => false },
  });
  return compileMenuBoundary(readFileSync(new URL("../components/touchline/TouchlineBrandHeader.tsx", import.meta.url), "utf8"), {
    "react/jsx-runtime": jsx, "@/components/logo": { Logo: () => null },
    "./TouchlinePageControls": controls, "./TouchlineBrandHeader.module.css": css,
  });
}

test("the public ClubHub keeps language selection at the top and player borders before coach borders without the league table", async () => {
  const forbid = () => assert.fail("Menu SSR must not start auth, lifecycle or football reads");
  const menuSource = readFileSync(new URL("../components/touchline/AccountLocaleMenu.tsx", import.meta.url), "utf8");
  const menu = compileMenuBoundary(menuSource, {
    react: React, "react/jsx-runtime": jsx, "lucide-react": icons,
    "next/navigation": { useRouter: () => ({ refresh: forbid }) },
    "@/lib/supabase/client": { createClient: forbid },
    "@/lib/touchlineArena/account-locale-browser": { startAccountLocaleBrowser: forbid },
    "@/lib/touchlineArena/i18n": i18n,
    "@/lib/touchlineArena/account-locale-menu-i18n": menuCopy,
    "@/lib/touchlineArena/presentation-locale-intent": intent,
  });
  const brand = realBrandHeader(menu);
  const contexts = [{ mode: "account", accountId: "11111111-1111-4111-8111-111111111111" }, { mode: "unavailable" }];
  for (const context of contexts) for (const lang of ["en-GB", "pt-BR", "ar-SA", ""]) {
    let contextLoads = 0;
    const modules: Record<string, unknown> = {
      react: React, "react/jsx-runtime": jsx,
      "@/components/touchline/TouchlineBrandHeader": brand,
      "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
      "@/lib/touchlineArena/account-locale-context-server": { loadAccountLocaleContext: async () => { contextLoads++; return context; } },
      "@/lib/touchlineArena/coach-ranking-server": { loadTouchLineCoachRanking: forbid },
      "@/lib/touchlineArena/ranked-card-catalog-server": { loadTouchlinePublishedCardShowcaseCatalog: forbid },
      "@/lib/touchlineArena/demo-data": clubs,
      "@/lib/touchlineArena/i18n": i18n,
      "@/lib/touchlineArena/club-hub-directory-i18n": await directoryLoad(),
      "@/lib/touchlineFantasy/market-workflow-i18n": workflow,
      "./touchline-clubs.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
    };
    for (const name of ["TouchlineGlobalNavigation", "TouchlineCoachCategoryShowcase", "TouchlineLivePresentationRefresh", "ClubHubCrestTrace", "TouchlineClubPerimeterTrace", "ClubHubCardLink"]) modules[`@/components/touchline/${name}`] = { default: forbid };
    const compiled = compileMenuBoundary(page, modules);
    const tree = await (compiled.default as (props: { searchParams: Promise<{ lang: string }> }) => Promise<React.ReactElement<Record<string, unknown>>>)({ searchParams: Promise.resolve({ lang }) });
    assert.equal(contextLoads, 1);
    const rootChildren = childElements(tree), header = rootChildren[0], sections = childElements(rootChildren[1]), topbar = sections[0];
    assert.equal(tree.type, "main"); assert.equal(header.type, brand.default);
    assert.equal(topbar.type, "div"); assert.equal(topbar.props.className, "topbar");
    assert.equal(sections[1].props.className, "hero", "language controls precede hero content");
    const actual = header, effective = lang === "pt-BR" ? "pt-BR" : "en-GB";
    assert.equal(actual.props.accountLocaleContext, context, "pass the authoritative object without synthesizing a guest");
    assert.equal(actual.props.locale, effective);
    const html = renderToStaticMarkup(actual);
    assert.equal((html.match(/<select\b/g) ?? []).length, 1);
    assert.match(html, /<select[^>]*disabled=""/);
    assert.ok(html.includes("🇬🇧 English")); assert.ok(html.includes("🇧🇷 Português"));
    const choices = [...html.matchAll(/<option ([^>]+)>/g)].map(match => match[1]);
    assert.equal(choices.length, 2);
    for (const [index, locale] of ["pt-BR", "en-GB"].entries()) {
      assert.ok(choices[index].includes(`value="${locale}"`));
      assert.equal(choices[index].includes('selected=""'), locale === effective);
    }
  }
  assert.match(page, /loadTouchlinePublishedCardShowcaseCatalog\(\)/);
  assert.match(page, /loadTouchLineCoachRanking\(\)/);
  assert.match(page, /<TouchlineCoachCategoryShowcase draftLocalesEnabled=\{draftLocalesEnabled\} locale=\{locale\} playerCards=\{publishedPlayerCards\} coachRanking=\{coachRanking\} \/>/);
  assert.doesNotMatch(page, /TouchlineOfficialLeagueTable|loadTouchlineOfficialLeagueTable|official-league-table/);

  const playerSection = component.indexOf("touchline-player-border-title");
  const coachSection = component.indexOf("touchline-coach-border-title");
  assert.ok(playerSection >= 0);
  assert.ok(coachSection > playerSection);
});

const directoryLocales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const directoryExpected = {
  "en-GB": { intro: "Open each team’s official ClubHub, review real club information and follow TouchLine cards without landing inside one specific club by default.", open: "Open ClubHub", clubs: "20 clubs", hint: "Premium club selection", openingClub: "Opening ClubHub", loadingCards: "Loading cards…" },
  "pt-BR": { intro: "Entre no ClubHub oficial de cada equipe, veja informações reais do clube e acompanhe os cards TouchLine sem cair direto em uma página específica.", open: "Abrir ClubHub", clubs: "20 clubes", hint: "Seleção premium de clubes", openingClub: "Abrindo ClubHub", loadingCards: "Carregando cards…" },
  "es-ES": { intro: "Entra en el ClubHub oficial de cada equipo, consulta información real del club y sigue las tarjetas TouchLine sin llegar directamente a un club específico.", open: "Abrir ClubHub", clubs: "20 clubes", hint: "Selección premium de clubes", openingClub: "Abriendo ClubHub", loadingCards: "Cargando tarjetas…" },
  "it-IT": { intro: "Entra nel ClubHub ufficiale di ogni squadra, consulta le informazioni reali sul club e segui le carte TouchLine senza accedere direttamente a un club specifico.", open: "Apri ClubHub", clubs: "20 club", hint: "Selezione premium dei club", openingClub: "Apertura di ClubHub", loadingCards: "Caricamento delle carte…" },
  "fr-FR": { intro: "Accédez au ClubHub officiel de chaque équipe, consultez les informations réelles du club et suivez les cartes TouchLine sans arriver directement sur un club en particulier.", open: "Ouvrir ClubHub", clubs: "20 clubs", hint: "Sélection premium de clubs", openingClub: "Ouverture de ClubHub", loadingCards: "Chargement des cartes…" },
  "ar-SA": { intro: "ادخل إلى ClubHub الرسمي لكل فريق، واطّلع على معلومات النادي الفعلية وتابع بطاقات TouchLine، دون الانتقال مباشرة إلى نادٍ محدد.", open: "فتح ClubHub", clubs: "20 ناديًا", hint: "مجموعة مميزة من الأندية", openingClub: "جارٍ فتح ClubHub", loadingCards: "جارٍ تحميل البطاقات…" },
  "tr-TR": { intro: "Doğrudan belirli bir kulübe gitmeden her takımın resmî ClubHub sayfasını açın, kulübün gerçek bilgilerini inceleyin ve TouchLine kartlarını takip edin.", open: "ClubHub sayfasını aç", clubs: "20 kulüp", hint: "Özenle seçilmiş kulüpler", openingClub: "ClubHub açılıyor", loadingCards: "Kartlar yükleniyor…" },
  "de-DE": { intro: "Öffne den offiziellen ClubHub jedes Teams, sieh dir echte Vereinsinformationen an und verfolge die TouchLine-Karten, ohne direkt bei einem bestimmten Verein zu landen.", open: "ClubHub öffnen", clubs: "20 Vereine", hint: "Premium-Vereinsauswahl", openingClub: "ClubHub wird geöffnet", loadingCards: "Karten werden geladen…" },
} as const;
const directoryTitles = ["Choose a club", "Escolha um clube", "Elige un club", "Scegli un club", "Choisissez un club", "اختر ناديًا", "Bir kulüp seç", "Wähle einen Verein"];
type DirectoryLocale = typeof directoryLocales[number];
type DirectoryCopy = Record<keyof typeof directoryExpected["en-GB"], string>;
const escapeText = (value: string) => renderToStaticMarkup(React.createElement(React.Fragment, null, value));

test("directory catalogue keeps six exact messages, protected names and six closed draft gates", async () => {
  const mod = await directoryLoad();
  assert.deepEqual(Object.keys(mod.TOUCHLINE_CLUB_HUB_DIRECTORY_CATALOGUES), directoryLocales);
  assert.deepEqual(mod.TOUCHLINE_CLUB_HUB_DIRECTORY_DRAFT_LOCALES, directoryLocales.slice(2));
  assert.equal(mod.TOUCHLINE_CLUB_HUB_DIRECTORY_DRAFT_STATUS, "draft");
  for (const locale of directoryLocales) {
    const copy = mod.TOUCHLINE_CLUB_HUB_DIRECTORY_CATALOGUES[locale];
    assert.deepEqual(copy, directoryExpected[locale]);
    assert.equal(Object.keys(copy).length, 6); assert.ok(!("language" in copy));
    assert.match(copy.intro, /ClubHub/); assert.match(copy.intro, /TouchLine/);
    assert.match(copy.open, /ClubHub/); assert.match(copy.openingClub, /ClubHub/); assert.match(copy.clubs, /^20 /);
    assert.deepEqual(mod.getTouchlineClubHubDirectoryCopy(locale), directoryExpected[locale === "pt-BR" ? "pt-BR" : "en-GB"]);
    if (locale !== "en-GB" && locale !== "pt-BR") assert.equal(i18n.isTouchLineLocaleComplete(locale), false);
  }
  for (const locale of [undefined, null, "", "pt", "constructor", "__proto__"]) assert.deepEqual(mod.getTouchlineClubHubDirectoryCopy(locale), directoryExpected["en-GB"]);
});

async function directoryView({ lang, future = false, sentinel = false, context = { mode: "guest" }, malicious = false }: {
  lang: unknown; future?: boolean; sentinel?: boolean; context?: object; malicious?: boolean;
}) {
  // Run the real async page; only auth/data/network and leaf components are doubles.
  // Resolve its existing async showcase separately, without asking SSR to run RSC.
  const requests: unknown[] = [], workflowRequests: unknown[] = [], loaders: string[] = [];
  let contextLoads = 0;
  const effective = future && directoryLocales.includes(lang as DirectoryLocale) ? lang as DirectoryLocale : i18n.normalizeTouchLineLocale(lang as string);
  const mod = sentinel ? null : await directoryLoad();
  const catalogue = mod ? compileMenuBoundary(readFileSync(new URL("../lib/touchlineArena/club-hub-directory-i18n.ts", import.meta.url), "utf8"), {
    "./catalogue-locale.ts": catalogueLocale,
  }) : null;
  const ClubLink = (props: Record<string, unknown>) => React.createElement("a", { href: props.href as string, className: props.className as string, style: props.style as React.CSSProperties }, props.children as React.ReactNode);
  const Leaf = () => React.createElement("span");
  const registry = clubs.TOUCHLINE_ENGLAND_CLUBS_BY_RANK.map((club, index) => malicious && index === 0 ? { ...club, name: '<img src=x onerror="unsafe"> & Club', logoUrl: "" } : club);
  const modules: Record<string, unknown> = {
    react: React, "react/jsx-runtime": jsx,
    "@/components/touchline/TouchlineBrandHeader": { default: Leaf },
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    "@/lib/touchlineArena/account-locale-context-server": { loadAccountLocaleContext: async () => { contextLoads++; return context; } },
    "@/lib/touchlineArena/coach-ranking-server": { loadTouchLineCoachRanking: async () => { loaders.push("coach"); return { snapshotId: "unchanged-snapshot" }; } },
    "@/lib/touchlineArena/ranked-card-catalog-server": { loadTouchlinePublishedCardShowcaseCatalog: async () => { loaders.push("cards"); return []; } },
    "@/lib/touchlineArena/demo-data": { ...clubs, TOUCHLINE_ENGLAND_CLUBS_BY_RANK: registry },
    "@/lib/touchlineArena/i18n": i18n,
    "@/lib/touchlineArena/club-hub-directory-i18n": { getTouchlineClubHubDirectoryCopy: (value: string, enabled = false) => {
      assert.equal(enabled, future);
      requests.push(value); return sentinel ? Object.fromEntries(Object.keys(directoryExpected["en-GB"]).map(key => [key, `${value}:${key}`]))
        : (catalogue!.getTouchlineClubHubDirectoryCopy as (locale: string, flag: boolean) => DirectoryCopy)(value, enabled);
    } },
    "@/lib/touchlineFantasy/market-workflow-i18n": { getTouchlineFantasyMarketWorkflowCopy: (value: DirectoryLocale, enabled = false) => {
      assert.equal(enabled, future);
      workflowRequests.push(value); return sentinel ? { chooseClub: `${value}:chooseClub` }
        : workflow.getTouchlineFantasyMarketWorkflowCopy(value, enabled);
    } },
    "./touchline-clubs.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
    "@/components/touchline/ClubHubCardLink": { default: ClubLink },
  };
  for (const name of ["TouchlineGlobalNavigation", "TouchlineCoachCategoryShowcase", "TouchlineLivePresentationRefresh", "ClubHubCrestTrace", "TouchlineClubPerimeterTrace"]) modules[`@/components/touchline/${name}`] = { default: Leaf };
  const compiled = compileMenuBoundary(`${page}\nexport { renderTouchlineClubsPage as testRender };`, modules);
  const tree = await (compiled.testRender as (props: { searchParams: Promise<{ lang: unknown }> }, enabled: boolean) => Promise<React.ReactElement<Record<string, unknown>>>)({ searchParams: Promise.resolve({ lang }) }, future);
  const shell = childElements(tree), brandHeader = shell[0], content = shell[1];
  const children = childElements(content), topbar = childElements(children[0]), grid = childElements(children[2]);
  const suspense = children[3], showcase = childElements(suspense)[0];
  const html = renderToStaticMarkup(React.cloneElement(tree, {}, brandHeader, React.cloneElement(content, {}, children.map((child, index) => index === 3 ? React.createElement(React.Fragment, { key: index }, child.props.fallback as React.ReactNode) : React.cloneElement(child, { key: index })))));
  return { html, tree, brandHeader, topbar, grid, suspense, showcase, contextLoads, context, requests, workflowRequests, loaders, effective, registry };
}

test("directory actual page binds every copy key and shared title to full-locale sentinels", async () => {
  for (const lang of directoryLocales) {
    const view = await directoryView({ lang, future: true, sentinel: true });
    assert.deepEqual(view.requests, [lang]); assert.deepEqual(view.workflowRequests, [lang]);
    for (const key of ["intro", "open", "clubs", "hint", "loadingCards", "chooseClub"]) assert.ok(view.html.includes(`${lang}:${key}`), `${lang}:${key}`);
    assert.equal(view.grid[0].props.pendingLabel, `${lang}:openingClub: ${view.registry[0].name}`);
    assert.ok(view.html.includes("TouchLine England")); assert.ok(view.html.includes("TouchLine Verified"));
  }
});

test("directory real hero grid footer and suspense fallback preserve EN/PT and eight isolated draft presentations", async () => {
  for (const future of [false, true]) for (const lang of directoryLocales) {
    const view = await directoryView({ lang, future }), copy = directoryExpected[view.effective];
    for (const key of ["intro", "open", "clubs", "hint", "loadingCards"] as const) assert.ok(view.html.includes(escapeText(copy[key])), `${lang}:${key}`);
    assert.ok(view.html.includes(`<h1>${escapeText(directoryTitles[directoryLocales.indexOf(view.effective)])}</h1>`));
    assert.ok(view.html.includes(`aria-label="${escapeText(copy.hint)}"`));
    assert.equal(renderToStaticMarkup(view.suspense.props.fallback as React.ReactNode), `<p role="status">${escapeText(copy.loadingCards)}</p>`);
    assert.equal(view.grid.length, 20); assert.equal(view.contextLoads, 1); assert.deepEqual(view.loaders, []);
    view.grid.forEach((card, index) => {
      const club = view.registry[index];
      assert.equal(card.key, `.$${club.teamId}`);
      assert.equal(card.props.href, `/touchline-clubs/${club.slug}?lang=${encodeURIComponent(view.effective)}`);
      assert.equal(card.props.pendingLabel, `${copy.openingClub}: ${club.name}`);
      assert.deepEqual(JSON.parse(JSON.stringify(card.props.style)), { "--club-accent": club.accent, "--club-secondary": club.secondaryAccent });
      const crest = childElements(card)[2]; assert.equal(crest.props.loading, index < 6 ? "eager" : "lazy");
      assert.ok(view.html.includes(escapeText(club.name))); assert.ok(view.html.includes(escapeText(club.shortCode)));
    });
    assert.equal(view.topbar[0].props.locale, view.effective); assert.equal(view.brandHeader.props.locale, view.effective);
    assert.equal(view.topbar[0].props.showAudioControl, false);
    assert.equal(view.showcase.props.locale, view.effective);
  }
});

test("directory keeps captured account context, query fallback and independent showcase loaders", async () => {
  for (const context of [{ mode: "guest" }, { mode: "demo" }, { mode: "unavailable" }, { mode: "account", accountId: "11111111-1111-4111-8111-111111111111" }]) {
    const view = await directoryView({ lang: "pt-BR", context });
    assert.equal(view.contextLoads, 1); assert.equal(view.brandHeader.props.accountLocaleContext, context);
    const result = await (view.showcase.type as (props: object) => Promise<React.ReactElement<Record<string, unknown>>>)(view.showcase.props);
    assert.deepEqual(view.loaders, ["cards", "coach"]);
    const leaves = childElements(result); assert.equal(leaves[0].props.initialCoachRankingSnapshotId, "unchanged-snapshot");
    assert.equal(leaves[1].props.locale, "pt-BR"); assert.deepEqual(leaves[1].props.playerCards, []);
    assert.deepEqual(leaves[1].props.coachRanking, { snapshotId: "unchanged-snapshot" });
  }
  for (const lang of [undefined, null, "", "unknown", ["pt-BR", "en-GB"]]) {
    const view = await directoryView({ lang }); assert.equal(view.effective, "en-GB");
    assert.ok(view.grid.every(card => (card.props.href as string).endsWith("?lang=en-GB")));
  }
});

test("directory pending label reaches real pending JSX and official names remain escaped", async () => {
  for (const lang of directoryLocales) {
    const view = await directoryView({ lang, future: true, malicious: true });
    const label = view.grid[0].props.pendingLabel;
    assert.equal(label, `${directoryExpected[lang].openingClub}: <img src=x onerror="unsafe"> & Club`);
    assert.ok(view.html.includes('&lt;img src=x onerror=&quot;unsafe&quot;&gt; &amp; Club')); assert.ok(!view.html.includes('<img src=x'));
    const compiled = compileMenuBoundary(readFileSync(new URL("../components/touchline/ClubHubNavigationPending.tsx", import.meta.url), "utf8"), {
      react: React, "react/jsx-runtime": jsx, "next/link": { useLinkStatus: () => ({ pending: true }) },
      "./ClubHubNavigationPending.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
    });
    const Pending = compiled.default as React.ComponentType<{ label: string }>;
    const html = renderToStaticMarkup(React.createElement(Pending, { label: label as string }));
    assert.ok(html.includes(escapeText(label as string))); assert.ok(html.includes('aria-live="polite"')); assert.ok(html.includes('role="status"'));
    assert.ok(html.includes('aria-busy="true"')); assert.ok(!html.includes('<img src=x'));
  }
});

test("real exported wrapper uses server policy OFF/ON without accepting forged query activation", async () => {
  const text = readFileSync(new URL("../app/touchline-clubs/page.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("page.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wrapper = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node)
    && Boolean(node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)));
  assert.ok(wrapper?.body);
  const call = wrapper.body.statements.find(ts.isReturnStatement)?.expression;
  assert.ok(call && ts.isCallExpression(call));
  assert.equal(call.arguments[1]?.getText(tree), 'isTouchLineSiteLocalesEnabled("/touchline-clubs")');
  const exported: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(wrapper.getText(tree), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: exported, ...releasePolicy, [call.expression.getText(tree)]: (props: unknown, enabled: boolean) => ({ props, enabled }),
  });
  const invoke = exported.default as (props: unknown) => Promise<{ props: unknown; enabled: boolean }>;
  try {
    for (const flag of [undefined, "false", "TRUE", "true"]) {
      if (flag === undefined) delete releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED;
      else releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED = flag;
      for (const lang of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
        const props = { searchParams: Promise.resolve({ lang, siteLocalesEnabled: true, draftLocalesEnabled: true, TOUCHLINE_SITE_LOCALES_ENABLED: "true" }) };
        const result = await invoke(props);
        assert.equal(result.props, props, "original route props are forwarded unchanged");
        assert.equal(result.enabled, flag === "true", lang);
      }
    }
  } finally { delete releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED; }
});
