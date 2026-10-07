import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { createTouchlineArenaCoachSlot } from "../lib/touchlineArena/coach-card.ts";
import type { TouchlineCoach } from "../lib/football-data/types.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const nativeRequire = createRequire(import.meta.url);
const player = {
  id: "fixture", sportmonksPlayerId: "123", canonicalPlayerId: "canonical-player", overall: 9, shirtNumber: 9,
  role: "ST", position: "ST", countryCode3: "ENG", name: "Player <&> $&", clubName: "Manchester City", leagueName: "Canonical League",
  marketValue: null, updatedAt: "2026-10-03", age: 26, height: "190", foot: "Left", contract: "Canonical", nationality: "England",
  totalRating: 0, seasonStats: { goals: 0, assists: 3, defense: 2, saves: 0, cleanSheets: 0, yellowCards: 0, redCards: 1 },
  editorialCard: { tierKey: "radiant-gold", marketValueEur: 1000000, marketValueState: "verified", cardPrice: { amountMinor: 1500, currency: "GBP" }, lastReviewedAt: "2026-10-03" },
};
const coach: TouchlineCoach = {
  id: "sportmonks:coach:1", providerId: "1", provider: "sportmonks", name: "Coach <&> $&", displayName: "Coach <&> $&",
  teamId: "42", source: { provider: "sportmonks", providerId: "1", raw: { id: 1 } },
};
const slot = createTouchlineArenaCoachSlot(coach, 1);

// Same SSR/VM seam as the existing card integration suites. Only route,
// network-ranking hooks and the external leadership context are replaced.
// All catalogue getters and locale resolution run their actual implementation.
function fixtures() {
  const cache = new Map<string, unknown>();
  const replacements: Record<string, unknown> = {
    "next/navigation": { usePathname: () => "/fantasy" },
    "@/lib/touchlineArena/card-ranking-client": { useTouchlineActiveRanking: () => null },
    "./TouchlineCardLeadershipProvider": { useTouchlineCardLeadershipAuthority: () => null },
    "@/lib/touchlineArena/golden-boot-client": { useTouchlineGoldenBootPlayers: () => ["canonical-player"] },
  };
  function load(specifier: string, parent: string): unknown {
    if (Object.hasOwn(replacements, specifier)) return replacements[specifier];
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return nativeRequire(specifier);
    const base = specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(parent), specifier);
    if (base.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    const file = [base, `${base}.ts`, `${base}.tsx`].find((candidate) => existsSync(candidate));
    assert.ok(file, `module not found: ${base}`);
    if (file.endsWith(".json")) return JSON.parse(readFileSync(file, "utf8"));
    if (file.endsWith(".ts")) return nativeRequire(file);
    if (cache.has(file)) return cache.get(file);
    const exports: Record<string, unknown> = {};
    cache.set(file, exports);
    const compiled = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    runInNewContext(compiled, { exports, require: (name: string) => load(name, file), URL, URLSearchParams, Intl, console, process: { env: {} } });
    return exports;
  }
  const PlayerCard = (load("@/components/touchline/cards/TouchlineEliteExactCard", path.join(root, "test.ts")) as { TouchlineEliteExactCard: React.ComponentType<Record<string, unknown>> }).TouchlineEliteExactCard;
  const CoachCard = (load("@/components/touchline/cards/TouchlineCoachCard", path.join(root, "test.ts")) as { default: React.ComponentType<Record<string, unknown>> }).default;
  return {
    player: (locale: string, enabled: boolean, changes: object = {}) => renderToStaticMarkup(React.createElement(PlayerCard, {
      player: { ...player, ...changes }, staticRenderScale: 1, runtimeLocaleOverride: locale,
      draftLocalesEnabled: enabled, showCardActions: true, playerProfileHref: "/touchline-players/123?lang=en-GB",
    })),
    coach: (locale: string, enabled: boolean, overrides: object = {}) => renderToStaticMarkup(React.createElement(CoachCard, {
      coach, slot, clubName: "Canonical Club & Co", clubLogoUrl: "/canonical-crest.png", countryCode3: "ENG",
      locale, draftLocalesEnabled: enabled, fixtureContext: "home", publishedTouchlinePoints: 0,
      discipline: { yellowCards: 0, redCards: 1 }, ...overrides,
    })),
  };
}

const expected = [
  { locale: "pt-BR", club: "Clube atual", playerAria: "Card TouchLine de Player &lt;&amp;&gt; $&amp;, nota total 0", coachAria: "Card de treinador TouchLine de Coach &lt;&amp;&gt; $&amp;", homeAria: "Partida em casa", pendingCoach: "Aguardando treinador" },
  { locale: "fr-FR", club: "Club actuel", playerAria: "Carte TouchLine de Player &lt;&amp;&gt; $&amp;, note totale 0", coachAria: "Carte d’entraîneur TouchLine de Coach &lt;&amp;&gt; $&amp;", homeAria: "Match à domicile", pendingCoach: "En attente de l’entraîneur" },
  { locale: "ar-SA", club: "النادي الحالي", playerAria: "بطاقة TouchLine للاعب Player &lt;&amp;&gt; $&amp;، التقييم الإجمالي 0", coachAria: "بطاقة مدرب TouchLine لـ Coach &lt;&amp;&gt; $&amp;", homeAria: "مباراة على أرضه", pendingCoach: "في انتظار المدرب" },
] as const;

test("real player template receives draft opt-in, translates text and ARIA, and preserves football facts", () => {
  const render = fixtures();
  for (const copy of expected) {
    const html = render.player(copy.locale, true);
    assert.ok(html.includes(copy.club), copy.locale);
    assert.ok(html.includes(`aria-label="${copy.playerAria}"`), copy.locale);
    assert.match(html, /data-total-rating="0"/);
    assert.match(html, /data-card-tier="radiant-gold"/);
    assert.ok(html.includes("Manchester City"));
    assert.ok(html.includes("ENG"));
    for (const code of ["GOL", "AST", "DEF"]) assert.ok(html.includes(`aria-label="${code}"`));
    assert.equal(render.player(copy.locale, true, { editorialCard: null }), "", "locale must not open publication gate");
    const publicHtml = render.player(copy.locale, false);
    assert.ok(publicHtml.includes(`aria-label="${copy.locale === "pt-BR" ? expected[0].playerAria : "Player &lt;&amp;&gt; $&amp; TouchLine card, total rating 0"}"`));
  }
});

test("real coach template receives draft opt-in, including pending identity and home fixture ARIA", () => {
  const render = fixtures();
  for (const copy of expected) {
    const html = render.coach(copy.locale, true);
    assert.ok(html.includes(copy.club), copy.locale);
    assert.ok(html.includes(`aria-label="${copy.coachAria}"`), copy.locale);
    assert.ok(html.includes(`aria-label="${copy.homeAria}"`), copy.locale);
    assert.ok(html.includes("Canonical Club &amp; Co"));
    assert.ok(html.includes("<b>ENG</b>"));
    assert.ok(html.includes("<small>TL PTS</small><strong>0</strong>"));
    assert.ok(html.includes("<strong>0 / 1</strong>"));
    assert.ok(render.coach(copy.locale, true, { coach: null }).includes(copy.pendingCoach));
    const publicHtml = render.coach(copy.locale, false);
    assert.ok(publicHtml.includes(`aria-label="${copy.locale === "pt-BR" ? expected[0].coachAria : "Coach &lt;&amp;&gt; $&amp; TouchLine coach card"}"`));
  }
});
