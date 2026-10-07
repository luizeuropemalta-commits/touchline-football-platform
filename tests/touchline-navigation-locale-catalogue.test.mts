import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as navigation from "../lib/touchlineArena/global-navigation.ts";
import * as rootLocale from "../lib/touchlineArena/root-locale.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import { TOUCHLINE_APPROVED_LOCALES, isTouchLineLocaleComplete, type TouchLineLocale } from "../lib/touchlineArena/i18n.ts";

const require = createRequire(import.meta.url);
const catalogueUrl = new URL("../lib/touchlineArena/navigation-i18n.ts", import.meta.url);
const keys = ["ariaLabel", "backToArena", "clubHub", "allClubs", "live", "rankings", "fantasy", "myClub", "more", "currentClub", "opening"] as const;
type Copy = Record<(typeof keys)[number], string>;
type CatalogueModule = {
  TOUCHLINE_NAVIGATION_CATALOGUES: Record<TouchLineLocale, Copy>;
  getTouchlineNavigationCopy: (locale?: string | null) => Copy;
};

const english: Copy = {
  ariaLabel: "TouchLine navigation", backToArena: "Club Owner", clubHub: "ClubHub", allClubs: "All clubs",
  live: "Live", rankings: "Rankings", fantasy: "Fantasy", myClub: "My Club", more: "More", currentClub: "Current club", opening: "Opening",
};
const portuguese: Copy = {
  ariaLabel: "Navegação TouchLine", backToArena: "Club Owner", clubHub: "ClubHub", allClubs: "Todos os clubes",
  live: "Ao vivo", rankings: "Rankings", fantasy: "Fantasy", myClub: "Meu Clube", more: "Mais", currentClub: "Clube atual", opening: "Abrindo",
};
const unpublishedDrafts = {
  "es-ES": {
    ariaLabel: "Navegación de TouchLine", backToArena: "Club Owner", clubHub: "ClubHub", allClubs: "Todos los clubes",
    live: "En directo", rankings: "Clasificaciones", fantasy: "Fantasy", myClub: "Mi club", more: "Más", currentClub: "Club actual", opening: "Abriendo",
  },
  "it-IT": {
    ariaLabel: "Navigazione TouchLine", backToArena: "Club Owner", clubHub: "ClubHub", allClubs: "Tutti i club",
    live: "In diretta", rankings: "Classifiche", fantasy: "Fantasy", myClub: "Il mio club", more: "Altro", currentClub: "Club attuale", opening: "Apertura in corso",
  },
  "fr-FR": {
    ariaLabel: "Navigation TouchLine", backToArena: "Club Owner", clubHub: "ClubHub", allClubs: "Tous les clubs",
    live: "En direct", rankings: "Classements", fantasy: "Fantasy", myClub: "Mon club", more: "Plus", currentClub: "Club actuel", opening: "Ouverture en cours",
  },
  "ar-SA": {
    ariaLabel: "التنقل في TouchLine", backToArena: "Club Owner", clubHub: "ClubHub", allClubs: "جميع الأندية",
    live: "مباشر", rankings: "الترتيبات", fantasy: "Fantasy", myClub: "ناديي", more: "المزيد", currentClub: "النادي الحالي", opening: "جارٍ الفتح",
  },
  "tr-TR": {
    ariaLabel: "TouchLine gezinme menüsü", backToArena: "Club Owner", clubHub: "ClubHub", allClubs: "Tüm kulüpler",
    live: "Canlı", rankings: "Sıralamalar", fantasy: "Fantasy", myClub: "Kulübüm", more: "Daha fazla", currentClub: "Geçerli kulüp", opening: "Açılıyor",
  },
  "de-DE": {
    ariaLabel: "TouchLine-Navigation", backToArena: "Club Owner", clubHub: "ClubHub", allClubs: "Alle Vereine",
    live: "Live", rankings: "Ranglisten", fantasy: "Fantasy", myClub: "Mein Verein", more: "Mehr", currentClub: "Aktueller Verein", opening: "Wird geöffnet",
  },
} satisfies Partial<Record<TouchLineLocale, Copy>>;

async function loadCatalogue(): Promise<CatalogueModule> {
  // A missing module is the intended first RED, rather than a conditional skip.
  return await import(catalogueUrl.href) as CatalogueModule;
}

function compile(relativePath: string) {
  return ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}

const navigationCode = compile("../components/touchline/TouchlineGlobalNavigation.tsx");
const labelCode = compile("../components/touchline/TouchlineNavigationLabel.tsx");

function renderNavigation(locale: string, options: { pending?: boolean; club?: string; dictionary?: Copy } = {}) {
  const jsxRuntime: unknown = require("react/jsx-runtime");
  const nextLink = {
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement("a", { href, ...rest }, children),
    useLinkStatus: () => ({ pending: options.pending ?? false }),
  };
  const labelExports: { default?: React.ComponentType<{ label: string; pendingLabel: string }> } = {};
  runInNewContext(labelCode, { exports: labelExports, require(name: string) {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "next/link") return nextLink;
    throw new Error(`Unexpected label import: ${name}`);
  } });
  const icon = () => null;
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": jsxRuntime,
    "next/link": nextLink,
    "./TouchlineNavigationLabel": labelExports,
    "@/components/auth-ambient-audio": { AuthAmbientAudio: () => null },
    "lucide-react": { Activity: icon, BarChart3: icon, Goal: icon, MoreHorizontal: icon, Shield: icon, UserRound: icon },
    "@/lib/touchlineArena/global-navigation": navigation,
    "@/lib/touchlineArena/root-locale": rootLocale,
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    "./TouchlineGlobalNavigation.module.css": { default: {} },
    "@/lib/touchlineArena/navigation-i18n": { getTouchlineNavigationCopy: (requested?: string | null) =>
      options.dictionary ?? (rootLocale.resolveTouchLinePresentationLocale(requested) === "pt-BR" ? portuguese : english) },
  };
  const exports: { default?: React.ComponentType<{
    locale: string; currentRoute: string; surface: string;
    trustedContext?: { club: { teamId: string; slug: string; name: string } };
  }> } = {};
  runInNewContext(navigationCode, { exports, require(name: string) {
    assert.ok(name in modules, `Unexpected navigation dependency: ${name}`);
    return modules[name];
  } });
  assert.ok(exports.default);
  return renderToStaticMarkup(React.createElement(exports.default, {
    locale, currentRoute: "live", surface: "public",
    ...(options.club ? { trustedContext: { club: { teamId: "synthetic-club", slug: "synthetic-club", name: options.club } } } : {}),
  }));
}

test("current English navigation preserves visible labels, current state and canonical destinations", () => {
  const html = renderNavigation("en-GB");
  assert.match(html, /aria-label="TouchLine navigation"/);
  for (const label of ["Club Owner", "ClubHub", "Live", "Rankings", "More"]) assert.ok(html.includes(`>${label}<`), label);
  for (const path of ["/clubowner?lang=en-GB", "/touchline-clubs?lang=en-GB", "/live?lang=en-GB", "/rankings?lang=en-GB"]) {
    assert.ok(html.includes(`href="${path}"`), path);
  }
  assert.match(html, /aria-current="page" data-touchline-navigation-key="live"/);
  assert.doesNotMatch(html, /club-owner\/me/);
});

test("current Portuguese navigation preserves the original copy and trusted club name", () => {
  const html = renderNavigation("pt-BR", { club: "Bodø/Glimt" });
  assert.match(html, /aria-label="Navegação TouchLine"/);
  assert.match(html, /aria-label="Clube atual: Bodø\/Glimt"/);
  for (const label of ["Club Owner", "Todos os clubes", "Ao vivo", "Rankings", "Mais", "Bodø/Glimt"]) {
    assert.ok(html.includes(`>${label}<`), label);
  }
  assert.ok(html.includes('href="/touchline-clubs?lang=pt-BR"'));
  assert.doesNotMatch(html, /synthetic-club\?lang/);
});

test("existing pending feedback remains per-link and translated EN/PT", () => {
  for (const [locale, pending] of [["en-GB", "Opening…"], ["pt-BR", "Abrindo…"]] as const) {
    const html = renderNavigation(locale, { pending: true });
    assert.ok(html.includes(`>${pending}<`));
    assert.match(html, /aria-live="polite" aria-atomic="true" aria-busy="true"/);
  }
});

test("the actual component reads the extracted catalogue rather than keeping a second inline dictionary", () => {
  const html = renderNavigation("en-GB", { dictionary: { ...english, ariaLabel: "Catalogue seam probe", more: "Catalogue overflow probe" } });
  assert.match(html, /aria-label="Catalogue seam probe"/);
  assert.ok(html.includes(">Catalogue overflow probe<"));
});

test("new navigation catalogue preserves existing EN/PT copy and uses the owner-approved Club Owner destination label", async () => {
  const catalogue = await loadCatalogue();
  assert.deepEqual(catalogue.TOUCHLINE_NAVIGATION_CATALOGUES["en-GB"], english);
  assert.deepEqual(catalogue.TOUCHLINE_NAVIGATION_CATALOGUES["pt-BR"], portuguese);
  assert.deepEqual(catalogue.getTouchlineNavigationCopy("en-GB"), english);
  assert.deepEqual(catalogue.getTouchlineNavigationCopy("pt-BR"), portuguese);
});

test("all eight approved navigation catalogues have exactly the eleven shared keys and brand names", async () => {
  const { TOUCHLINE_NAVIGATION_CATALOGUES: catalogues } = await loadCatalogue();
  assert.deepEqual(Object.keys(catalogues).sort(), TOUCHLINE_APPROVED_LOCALES.map((locale) => locale.code).sort());
  for (const { code } of TOUCHLINE_APPROVED_LOCALES) {
    const copy = catalogues[code];
    assert.deepEqual(Object.keys(copy).sort(), [...keys].sort(), code);
    for (const key of keys) {
      assert.equal(typeof copy[key], "string", `${code}.${key}`);
      assert.ok(copy[key].trim(), `${code}.${key}`);
      assert.doesNotMatch(copy[key], /\bTODO\b|\bFIXME\b/, `${code}.${key}`);
    }
    assert.equal(copy.clubHub, "ClubHub");
    assert.equal(copy.fantasy, "Fantasy");
    assert.match(copy.ariaLabel, /TouchLine/);
  }
});

test("Arabic navigation contains Arabic labels for actions and accessible context", async () => {
  const { TOUCHLINE_NAVIGATION_CATALOGUES: catalogues } = await loadCatalogue();
  const arabic = catalogues["ar-SA"];
  assert.equal(arabic.backToArena, "Club Owner");
  assert.equal(arabic.more, "المزيد");
  assert.equal(arabic.currentClub, "النادي الحالي");
  assert.equal(arabic.opening, "جارٍ الفتح");
  for (const key of ["ariaLabel", "allClubs", "live", "rankings", "myClub"] as const) assert.match(arabic[key], /[\u0600-\u06ff]/);
});

test("Italian and French pending link labels use progressive feedback wording", async () => {
  const { TOUCHLINE_NAVIGATION_CATALOGUES: catalogues } = await loadCatalogue();
  assert.equal(catalogues["it-IT"].opening, "Apertura in corso");
  assert.equal(catalogues["fr-FR"].opening, "Ouverture en cours");
});

test("all eleven literal labels remain authored for each unpublished navigation draft without opening its gate", async () => {
  const { TOUCHLINE_NAVIGATION_CATALOGUES: catalogues, getTouchlineNavigationCopy } = await loadCatalogue();

  for (const [locale, expected] of Object.entries(unpublishedDrafts) as Array<[keyof typeof unpublishedDrafts, Copy]>) {
    assert.deepEqual(catalogues[locale], expected, locale);
    assert.deepEqual(getTouchlineNavigationCopy(locale), english, `${locale} remains unpublished`);
    assert.equal(rootLocale.resolveTouchLinePresentationLocale(locale), "en-GB");
    assert.equal(isTouchLineLocaleComplete(locale), false);
  }
});

test("unpublished catalogues never activate the public navigation getter or links", async () => {
  const { getTouchlineNavigationCopy } = await loadCatalogue();
  for (const locale of ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE", "invalid", ""]) {
    assert.deepEqual(getTouchlineNavigationCopy(locale), english, locale);
    assert.equal(rootLocale.resolveTouchLinePresentationLocale(locale), "en-GB");
    assert.equal(isTouchLineLocaleComplete(locale), false);
    const html = renderNavigation(locale);
    assert.match(html, /aria-label="TouchLine navigation"/);
    assert.ok(html.includes('href="/clubowner?lang=en-GB"'));
    assert.doesNotMatch(html, /dir="rtl"/);
  }
  assert.deepEqual(getTouchlineNavigationCopy(undefined), english);
  assert.deepEqual(getTouchlineNavigationCopy(null), english);
});
