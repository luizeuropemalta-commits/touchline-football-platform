import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import {
  getTouchlineAuthLeaguePickerCopy,
  TOUCHLINE_AUTH_LEAGUE_PICKER_CATALOGUES,
  TOUCHLINE_AUTH_LEAGUE_PICKER_DRAFT_LOCALES,
  TOUCHLINE_AUTH_LEAGUE_PICKER_DRAFT_STATUS,
} from "../lib/touchlineArena/auth-league-picker-i18n.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const expected = {
  "en-GB": { summary: "Choose league", availability: "League supported in this version. Other leagues are not available yet.", navigationAria: "Available leagues" },
  "pt-BR": { summary: "Escolher liga", availability: "Liga disponível nesta versão. Outras ligas ainda não estão disponíveis.", navigationAria: "Ligas disponíveis" },
  "es-ES": { summary: "Elegir liga", availability: "Liga disponible en esta versión. Las demás ligas aún no están disponibles.", navigationAria: "Ligas disponibles" },
  "it-IT": { summary: "Scegli una lega", availability: "Questa lega è disponibile in questa versione. Le altre leghe non sono ancora disponibili.", navigationAria: "Leghe disponibili" },
  "fr-FR": { summary: "Choisir une ligue", availability: "Ligue disponible dans cette version. Les autres ligues ne sont pas encore disponibles.", navigationAria: "Ligues disponibles" },
  "ar-SA": { summary: "اختر دوريًا", availability: "الدوري متاح في هذا الإصدار. لا تتوفر دوريات أخرى بعد.", navigationAria: "الدوريات المتاحة" },
  "tr-TR": { summary: "Lig seç", availability: "Bu sürümde yalnızca bu lig sunuluyor. Diğer ligler henüz mevcut değil.", navigationAria: "Kullanılabilir ligler" },
  "de-DE": { summary: "Liga auswählen", availability: "Diese Liga ist in dieser Version verfügbar. Andere Ligen sind noch nicht verfügbar.", navigationAria: "Verfügbare Ligen" },
} as const;

test("league picker catalogue retains the exact eight authored rows while drafts stay incomplete", () => {
  assert.deepEqual(TOUCHLINE_AUTH_LEAGUE_PICKER_CATALOGUES, expected);
  assert.deepEqual(TOUCHLINE_AUTH_LEAGUE_PICKER_DRAFT_LOCALES, locales.slice(2));
  assert.equal(TOUCHLINE_AUTH_LEAGUE_PICKER_DRAFT_STATUS, "draft");
  for (const locale of locales.slice(2)) {
    assert.equal(isTouchLineLocaleComplete(locale), false);
    assert.deepEqual(getTouchlineAuthLeaguePickerCopy(locale), expected["en-GB"]);
    assert.deepEqual(getTouchlineAuthLeaguePickerCopy(locale, true), expected[locale]);
  }
  assert.deepEqual(getTouchlineAuthLeaguePickerCopy("pt-BR"), expected["pt-BR"]);
  assert.deepEqual(getTouchlineAuthLeaguePickerCopy("invalid"), expected["en-GB"]);
});

function renderPicker(locale: string, allowDraftLocales = false) {
  const source = readFileSync(new URL("../components/auth-league-picker.tsx", import.meta.url), "utf8");
  const exports: Record<string, unknown> = {};
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(output, {
    exports,
    require(name: string) {
      if (name === "react/jsx-runtime") return jsx;
      if (name === "next/link") return { default: ({ href, children }: { href: string; children: unknown }) => jsx.jsx("a", { href, children }) };
      if (name === "lucide-react") return { Globe2: () => null };
      if (name === "@/lib/touchlineArena/league-entry") return {
        TOUCHLINE_AVAILABLE_LEAGUES: [{ key: "touchline-england", name: "TouchLine England 2026/27" }],
        touchlineLeagueEntryHref: (key: string, inputLocale: string) => key === "touchline-england" ? `/clubowner?lang=${inputLocale}` : null,
      };
      if (name === "@/lib/touchlineArena/auth-league-picker-i18n") return { getTouchlineAuthLeaguePickerCopy };
      if (name === "./touchline/TouchlineGlobalNavigation.module.css") return { default: { link: "link" } };
      return assert.fail(`Unexpected dependency: ${name}`);
    },
  });
  const Component = exports.AuthLeaguePicker as (props: { locale: string; allowDraftLocales?: boolean }) => Parameters<typeof renderToStaticMarkup>[0];
  return renderToStaticMarkup(Component({ locale, allowDraftLocales }));
}

test("picker keeps the global EN/PT gate but the login-only draft seam renders each exact translated label", () => {
  for (const locale of locales) {
    const real = renderPicker(locale);
    const effective = locale === "pt-BR" ? "pt-BR" : "en-GB";
    for (const value of Object.values(expected[effective])) assert.ok(real.includes(value));
    assert.ok(real.includes("TouchLine England 2026/27"));
    assert.doesNotMatch(real, /fetch\(|localStorage|document\.cookie|supabase/);

    const loginDraft = renderPicker(locale, true);
    for (const value of Object.values(expected[locale])) assert.ok(loginDraft.includes(value));
    assert.ok(loginDraft.includes("TouchLine England 2026/27"));
  }
});
