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

type CopyModule = typeof import("../lib/touchlineArena/exact-card-i18n.ts");
const root = fileURLToPath(new URL("../", import.meta.url));
const nativeRequire = createRequire(import.meta.url);
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const baseline = {
  "en-GB": { nationality: "Nat", totalRating: "Total rating", marketValue: "Market value", currentClub: "Current Club", yellowRedCards: "Yellow and red cards", yellowCard: "Yellow card", redCard: "Red card", yellowCards: "Yellow cards", redCards: "Red cards", profileAction: "Profile", provisionalValue: "Provisional value", position: "POSITION", pending: "PENDING", publicationPending: "Card publication pending", reviewRequired: "Card review required", goldenBootLabel: "Golden Boot — league top scorer", leagueStats: "TouchLine England League Stats", cardAria: "{playerName} TouchLine card", ratingAria: ", total rating {rating}", clubAria: "Open {clubName} ClubHub" },
  "pt-BR": { nationality: "País", totalRating: "Nota total", marketValue: "Valor de mercado", currentClub: "Clube atual", yellowRedCards: "Cartões amarelo e vermelho", yellowCard: "Cartão amarelo", redCard: "Cartão vermelho", yellowCards: "Cartões amarelos", redCards: "Cartões vermelhos", profileAction: "Perfil", provisionalValue: "Valor provisório", position: "POSIÇÃO", pending: "PENDENTE", publicationPending: "Publicação do card pendente", reviewRequired: "Card requer revisão", goldenBootLabel: "Bota de Ouro — artilheiro da liga", leagueStats: "Estatísticas da TouchLine England League", cardAria: "Card TouchLine de {playerName}", ratingAria: ", nota total {rating}", clubAria: "Abrir ClubHub de {clubName}" },
};
const player = {
  id: "fixture", sportmonksPlayerId: "123", canonicalPlayerId: "canonical-player", overall: 9, shirtNumber: 9,
  role: "ST", position: "ST", countryCode3: "ENG", name: "Player <&> $&", clubName: "Manchester City", leagueName: "Canonical League",
  marketValue: null, updatedAt: "2026-10-03", age: 26, height: "190", foot: "Left", contract: "Canonical", nationality: "England",
  totalRating: 0, seasonStats: { goals: 0, assists: 3, defense: 2, saves: 0, cleanSheets: 0, yellowCards: 0, redCards: 1 },
  editorialCard: { tierKey: "radiant-gold", marketValueEur: 1000000, marketValueState: "verified", cardPrice: { amountMinor: 1500, currency: "GBP" }, lastReviewedAt: "2026-10-03" },
};

// Real component, hooks, JSX and pure collaborators. Only browser/network
// ranking hooks and route context are replaced; SSR does not run effects.
function fixture(copy?: Partial<CopyModule>) {
  const cache = new Map<string, unknown>();
  const replacements: Record<string, unknown> = {
    "next/navigation": { usePathname: () => "/fantasy" },
    "@/lib/touchlineArena/card-ranking-client": { useTouchlineActiveRanking: () => null },
    "./TouchlineCardLeadershipProvider": { useTouchlineCardLeadershipAuthority: () => null },
    "@/lib/touchlineArena/golden-boot-client": { useTouchlineGoldenBootPlayers: () => ["canonical-player"] },
    ...(copy ? { "@/lib/touchlineArena/exact-card-i18n": copy } : {}),
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
  const Card = (load("@/components/touchline/cards/TouchlineEliteExactCard", path.join(root, "test.ts")) as { TouchlineEliteExactCard: React.ComponentType<Record<string, unknown>> }).TouchlineEliteExactCard;
  return (locale: string | null, changes: object = {}, props: object = {}) => renderToStaticMarkup(React.createElement(Card, {
    player: { ...player, ...changes }, staticRenderScale: 1, runtimeLocaleOverride: locale, showCardActions: true,
    playerProfileHref: "/touchline-players/123?lang=en-GB", ...props,
  }));
}

test("real ExactCard corrects Portuguese ARIA and keeps zero ratings, names and ClubHub", () => {
  const render = fixture();
  const pt = render("pt-BR");
  assert.ok(pt.includes('aria-label="Card TouchLine de Player &lt;&amp;&gt; $&amp;, nota total 0"'));
  assert.ok(pt.includes('aria-label="Abrir ClubHub de Manchester City"'));
  assert.match(pt, /data-total-rating="0"/);
  const en = render("en-GB");
  assert.ok(en.includes('aria-label="Player &lt;&amp;&gt; $&amp; TouchLine card, total rating 0"'));
  assert.ok(en.includes('aria-label="Open Manchester City ClubHub"'));
  assert.doesNotMatch(en + pt, /Club Hub/);
});

test("all twenty copy bindings reach real markup across public presentation states", () => {
  const seen: unknown[] = [];
  const copy = Object.fromEntries(Object.entries(baseline["en-GB"]).map(([key, value]) => [key, `${key}_SENTINEL ${value.match(/\{[^}]+\}/)?.[0] ?? ""}`]));
  const render = fixture({ getTouchlineExactCardCopy: (locale) => { seen.push(locale); return copy as ReturnType<CopyModule["getTouchlineExactCardCopy"]>; } });
  const result = [render("pt-BR"), render("pt-BR", { editorialCard: { ...player.editorialCard, marketValueEur: undefined, marketValueState: "provisional" } }),
    render("pt-BR", { editorialCard: null, cardReview: { state: "REVIEW_REQUIRED" } }),
    render("pt-BR", { editorialCard: null, cardReview: { state: "COMPLETE" } }, { showUnpublishedIdentity: true })].join("\n");
  for (const key of Object.keys(copy)) assert.ok(result.includes(`${key}_SENTINEL`), key);
  assert.deepEqual(seen, ["pt-BR", "pt-BR", "pt-BR", "pt-BR"]);
});

test("catalogues have twenty keys, exact approved EN/PT, protected brands and closed draft gates", async () => {
  const copyModule = await import("../lib/touchlineArena/exact-card-i18n.ts");
  assert.deepEqual(Object.keys(copyModule.TOUCHLINE_EXACT_CARD_CATALOGUES), locales);
  assert.equal(copyModule.TOUCHLINE_EXACT_CARD_DRAFT_STATUS, "draft");
  assert.deepEqual(copyModule.TOUCHLINE_EXACT_CARD_DRAFT_LOCALES, locales.slice(2));
  for (const locale of ["en-GB", "pt-BR"] as const) assert.deepEqual(copyModule.TOUCHLINE_EXACT_CARD_CATALOGUES[locale], baseline[locale]);
  for (const locale of locales) {
    const copy = copyModule.TOUCHLINE_EXACT_CARD_CATALOGUES[locale];
    assert.equal(Object.keys(copy).length, 20);
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(baseline["en-GB"]).sort());
    assert.ok(Object.values(copy).every((text) => text.trim().length > 0));
    assert.match(copy.leagueStats, /TouchLine England League/);
    assert.match(copy.cardAria, /TouchLine/); assert.match(copy.clubAria, /ClubHub/);
    assert.equal(copy.cardAria.split("{playerName}").length, 2);
    assert.equal(copy.ratingAria.split("{rating}").length, 2);
    assert.equal(copy.clubAria.split("{clubName}").length, 2);
  }
  for (const locale of [...locales.slice(2), "bad", "pt", null, undefined]) assert.equal(copyModule.getTouchlineExactCardCopy(locale), copyModule.TOUCHLINE_EXACT_CARD_CATALOGUES["en-GB"]);
});

test("real catalogues preserve copy overrides, missing data, publication guards and tactical stat codes", async () => {
  await import("../lib/touchlineArena/exact-card-i18n.ts");
  const render = fixture();
  for (const locale of ["en-GB", "pt-BR"] as const) {
    const copy = baseline[locale], markup = render(locale);
    for (const key of ["nationality", "totalRating", "marketValue", "currentClub", "yellowRedCards", "yellowCard", "redCard", "yellowCards", "redCards", "profileAction", "leagueStats", "goldenBootLabel"] as const) assert.ok(markup.includes(copy[key]), key);
    assert.match(markup, /data-card-tier="radiant-gold"/);
    for (const code of ["GOL", "AST", "DEF"]) assert.ok(markup.includes(`aria-label="${code}"`), code);
    const keeper = render(locale, { position: "GK", role: "GK" });
    for (const code of ["SAVES", "CS"]) assert.ok(keeper.includes(`aria-label="${code}"`), code);
    assert.equal(render(locale, { editorialCard: null }), "");
    const pending = render(locale, { editorialCard: null, totalRating: null, cardReview: { state: "COMPLETE" } }, { showUnpublishedIdentity: true });
    assert.ok(pending.includes(copy.publicationPending)); assert.ok(pending.includes(copy.position));
    assert.doesNotMatch(pending, /data-total-rating=/);
    assert.ok(!pending.includes(copy.ratingAria.split("{rating}")[0]));
    const review = render(locale, { editorialCard: null, cardReview: { state: "REVIEW_REQUIRED" } });
    assert.ok(review.includes(copy.reviewRequired)); assert.ok(review.includes(copy.pending));
    const override = render(locale, {}, { labels: { profileAction: "OVERRIDE Profile", nationality: "OVERRIDE Nation", marketValue: "OVERRIDE Value", totalRating: "OVERRIDE Rating" } });
    for (const label of ["OVERRIDE Profile", "OVERRIDE Nation", "OVERRIDE Value", "OVERRIDE Rating"]) assert.ok(override.includes(label));
    assert.ok(override.includes(copy.currentClub));
  }
});

test("runtime drafts remain English while explicit locale is forwarded whole to the copy seam", async () => {
  const copyModule = await import("../lib/touchlineArena/exact-card-i18n.ts"), render = fixture();
  for (const locale of locales.slice(2)) {
    const markup = render(locale);
    assert.ok(markup.includes(baseline["en-GB"].leagueStats));
    const forwarded: unknown[] = [];
    const draftRender = fixture({ getTouchlineExactCardCopy: (value) => { forwarded.push(value); return copyModule.TOUCHLINE_EXACT_CARD_CATALOGUES[locale]; } });
    const draft = draftRender(locale);
    assert.deepEqual(forwarded, [locale]); assert.ok(draft.includes(copyModule.TOUCHLINE_EXACT_CARD_CATALOGUES[locale].leagueStats));
  }
  assert.ok(render(null, {}, { playerProfileHref: "/touchline-players/123?lang=pt-BR" }).includes(baseline["pt-BR"].leagueStats));
  assert.ok(render("en-GB", {}, { playerProfileHref: "/touchline-players/123?lang=pt-BR" }).includes(baseline["en-GB"].leagueStats));
});
