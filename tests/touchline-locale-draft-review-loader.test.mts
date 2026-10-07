import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { createTouchLineLocaleReviewTemplate, isTouchLineLocaleReviewReady } from "../lib/touchlineArena/locale-catalog-review-contract.ts";
import { loadTouchLineDraftReviewCatalogue } from "../lib/touchlineArena/locale-catalogues/draft-review-loader.ts";

const DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const NAMESPACES = ["core", "auth", "rankings"] as const;
const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));

function draftModuleLoads(namespace?: (typeof NAMESPACES)[number]) {
  const tempDirectory = mkdtempSync(join(tmpdir(), "touchline-draft-loader-"));
  const logPath = join(tempDirectory, "loads.log");
  const hookPath = join(tempDirectory, "record-draft-loads.mjs");
  const loaderUrl = pathToFileURL(join(PROJECT_ROOT, "lib/touchlineArena/locale-catalogues/draft-review-loader.ts")).href;
  writeFileSync(hookPath, `
    import { appendFileSync } from "node:fs";
    const logPath = process.env.TOUCHLINE_DRAFT_LOADER_LOG;
    export async function load(url, context, nextLoad) {
      const path = new URL(url).pathname;
      if (/(?:core|auth|rankings)-drafts\\.ts$/.test(path)) appendFileSync(logPath, path + "\\n");
      return nextLoad(url, context);
    }
  `);

  try {
    const script = namespace
      ? `const { loadTouchLineDraftReviewCatalogue } = await import(${JSON.stringify(loaderUrl)}); await loadTouchLineDraftReviewCatalogue("es-ES", ${JSON.stringify(namespace)});`
      : `await import(${JSON.stringify(loaderUrl)});`;
    const child = spawnSync(process.execPath, [
      "--experimental-strip-types",
      "--experimental-loader",
      pathToFileURL(hookPath).href,
      "--input-type=module",
      "--eval",
      script,
    ], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      env: { ...process.env, TOUCHLINE_DRAFT_LOADER_LOG: logPath },
    });
    assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
    if (!existsSync(logPath)) return [];
    return readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map((path) => path.split("/").at(-1));
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

test("the review loader remains runtime-lazy in an isolated process", () => {
  assert.deepEqual(draftModuleLoads(), []);
  assert.deepEqual(draftModuleLoads("core"), ["core-drafts.ts"]);
  assert.deepEqual(new Set(draftModuleLoads("auth")), new Set(["auth-drafts.ts", "core-drafts.ts"]));
  assert.deepEqual(draftModuleLoads("rankings"), ["rankings-drafts.ts"]);
});

for (const locale of DRAFT_LOCALES) {
  for (const namespace of NAMESPACES) {
    test(`${locale} ${namespace} is an available private draft envelope`, async () => {
      const result = await loadTouchLineDraftReviewCatalogue(locale, namespace);
      assert.equal(result.available, true);
      if (!result.available) return;

      assert.equal(result.publicationState, "draft");
      assert.equal(result.locale, locale);
      assert.equal(result.namespace, namespace);
      assert.ok(result.catalogue && typeof result.catalogue === "object");
    });
  }
}

test("the loader never falls back for complete, malformed, prototype-like, or unknown inputs", async () => {
  for (const [locale, namespace, reason] of [
    ["en-GB", "core", "unsupported-draft-locale"],
    ["pt-BR", "auth", "unsupported-draft-locale"],
    ["ES-es", "rankings", "unsupported-draft-locale"],
    [undefined, "rankings", "unsupported-draft-locale"],
    [[], "core", "unsupported-draft-locale"],
    ["__proto__", "core", "unsupported-draft-locale"],
    ["es-ES", "market", "unsupported-namespace"],
    ["es-ES", "constructor", "unsupported-namespace"],
    ["es-ES", undefined, "unsupported-namespace"],
  ] as const) {
    const result = await loadTouchLineDraftReviewCatalogue(locale, namespace);
    assert.deepEqual(result, { available: false, reason });
  }
});

test("every namespace preserves language-specific authored copy without publishing a locale", async () => {
  const expected = {
    "es-ES": ["Idioma", "Inicio de TouchLine", "Clasificaciones de TouchLine"],
    "it-IT": ["Lingua", "Home TouchLine", "Classifiche TouchLine"],
    "fr-FR": ["Langue", "Accueil TouchLine", "Classements TouchLine"],
    "ar-SA": ["اللغة", "الرئيسية في TouchLine", "الترتيبات في TouchLine"],
    "tr-TR": ["Dil", "TouchLine ana sayfa", "TouchLine Sıralamaları"],
    "de-DE": ["Sprache", "TouchLine-Startseite", "TouchLine-Ranglisten"],
  } as const;

  for (const [locale, [coreMarker, authMarker, rankingsMarker]] of Object.entries(expected)) {
    const core = await loadTouchLineDraftReviewCatalogue(locale, "core");
    const auth = await loadTouchLineDraftReviewCatalogue(locale, "auth");
    const rankings = await loadTouchLineDraftReviewCatalogue(locale, "rankings");
    assert.equal(core.available, true);
    assert.equal(auth.available, true);
    assert.equal(rankings.available, true);
    if (!core.available || !auth.available || !rankings.available) continue;

    assert.equal((core.catalogue as { language: string }).language, coreMarker);
    assert.equal((auth.catalogue as { layout: { arenaHome: string } }).layout.arenaHome, authMarker);
    assert.equal((rankings.catalogue as { tablesTitle: string }).tablesTitle, rankingsMarker);
    if (locale === "ar-SA") {
      assert.match((core.catalogue as { contractTerminationWarning: string }).contractTerminationWarning, /[\u0600-\u06ff]/);
      assert.match((auth.catalogue as { form: { terms: string } }).form.terms, /[\u0600-\u06ff]/);
      assert.match((rankings.catalogue as { rankingDescription: string }).rankingDescription, /[\u0600-\u06ff]/);
    }
    assert.equal(isTouchLineLocaleComplete(locale), false);
    assert.equal(isTouchLineLocaleReviewReady(createTouchLineLocaleReviewTemplate(locale)), false);
  }
});
