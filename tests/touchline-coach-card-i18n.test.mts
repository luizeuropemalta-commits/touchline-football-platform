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
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { createTouchlineArenaCoachSlot } from "../lib/touchlineArena/coach-card.ts";
import { TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT } from "../lib/touchlineArena/coach-card-layout.ts";
import type { TouchlineCoach } from "../lib/football-data/types.ts";

type CopyModule = typeof import("../lib/touchlineArena/coach-card-i18n.ts");
const root = fileURLToPath(new URL("../", import.meta.url));
const nativeRequire = createRequire(import.meta.url);
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const baseline = {
  "en-GB": { awaitingCoach: "Awaiting coach", coachPending: "Coach pending", coachCardAria: "{coachName} TouchLine coach card", nationality: "Nationality", currentClub: "Current club", firstTeamManager: "First-team manager", home: "Home", homeFixtureAria: "Home fixture", away: "Away", awayFixtureAria: "Away fixture", result: "Result", cards: "Cards" },
  "pt-BR": { awaitingCoach: "Aguardando treinador", coachPending: "Treinador pendente", coachCardAria: "Card de treinador TouchLine de {coachName}", nationality: "Nacionalidade", currentClub: "Clube atual", firstTeamManager: "Treinador principal", home: "Casa", homeFixtureAria: "Partida em casa", away: "Fora", awayFixtureAria: "Partida fora de casa", result: "Resultado", cards: "Cartões" },
};
const draftLiterals = {
  "es-ES": { awaitingCoach: "Esperando entrenador", coachPending: "Entrenador pendiente", coachCardAria: "Tarjeta de entrenador TouchLine de {coachName}", nationality: "Nacionalidad", currentClub: "Club actual", firstTeamManager: "Entrenador del primer equipo", home: "Local", homeFixtureAria: "Partido como local", away: "Visitante", awayFixtureAria: "Partido como visitante", result: "Resultado", cards: "Tarjetas" },
  "it-IT": { awaitingCoach: "In attesa dell’allenatore", coachPending: "Allenatore in attesa", coachCardAria: "Carta allenatore TouchLine di {coachName}", nationality: "Nazionalità", currentClub: "Club attuale", firstTeamManager: "Allenatore della prima squadra", home: "Casa", homeFixtureAria: "Partita in casa", away: "Trasferta", awayFixtureAria: "Partita in trasferta", result: "Risultato", cards: "Cartellini" },
  "fr-FR": { awaitingCoach: "En attente de l’entraîneur", coachPending: "Entraîneur en attente", coachCardAria: "Carte d’entraîneur TouchLine de {coachName}", nationality: "Nationalité", currentClub: "Club actuel", firstTeamManager: "Entraîneur de l’équipe première", home: "Domicile", homeFixtureAria: "Match à domicile", away: "Extérieur", awayFixtureAria: "Match à l’extérieur", result: "Résultat", cards: "Cartons" },
  "ar-SA": { awaitingCoach: "في انتظار المدرب", coachPending: "المدرب قيد الانتظار", coachCardAria: "بطاقة مدرب TouchLine لـ {coachName}", nationality: "الجنسية", currentClub: "النادي الحالي", firstTeamManager: "مدرب الفريق الأول", home: "على أرضه", homeFixtureAria: "مباراة على أرضه", away: "خارج أرضه", awayFixtureAria: "مباراة خارج أرضه", result: "النتيجة", cards: "البطاقات" },
  "tr-TR": { awaitingCoach: "Teknik direktör bekleniyor", coachPending: "Teknik direktör bekleniyor", coachCardAria: "{coachName} TouchLine teknik direktör kartı", nationality: "Uyruk", currentClub: "Mevcut kulüp", firstTeamManager: "A takım teknik direktörü", home: "İç saha", homeFixtureAria: "İç saha maçı", away: "Deplasman", awayFixtureAria: "Deplasman maçı", result: "Sonuç", cards: "Kartlar" },
  "de-DE": { awaitingCoach: "Trainer ausstehend", coachPending: "Trainer ausstehend", coachCardAria: "TouchLine-Trainerkarte von {coachName}", nationality: "Nationalität", currentClub: "Aktueller Verein", firstTeamManager: "Trainer der ersten Mannschaft", home: "Heim", homeFixtureAria: "Heimspiel", away: "Auswärts", awayFixtureAria: "Auswärtsspiel", result: "Ergebnis", cards: "Karten" },
} as const;
const coach: TouchlineCoach = { id: "sportmonks:coach:1", providerId: "1", provider: "sportmonks", name: "Coach <&> $&", displayName: "Coach <&> $&", teamId: "42", source: { provider: "sportmonks", providerId: "1", raw: { id: 1 } } };
const slot = createTouchlineArenaCoachSlot(coach, 1);

// Full real component, React hooks/JSX and pure collaborators. The leadership
// context is an external boundary; SSR deliberately does not run browser effects.
function fixture(copy?: Partial<CopyModule>) {
  const cache = new Map<string, unknown>();
  const replacements: Record<string, unknown> = {
    "./TouchlineCardLeadershipProvider": { useTouchlineCardLeadershipAuthority: () => null },
    ...(copy ? { "@/lib/touchlineArena/coach-card-i18n": copy } : {}),
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
    const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    runInNewContext(source, { exports, require: (name: string) => load(name, file), URL, URLSearchParams, Intl });
    return exports;
  }
  const Card = (load("@/components/touchline/cards/TouchlineCoachCard", path.join(root, "test.ts")) as { default: React.ComponentType<Record<string, unknown>> }).default;
  return (locale: string | undefined, props: object = {}) => renderToStaticMarkup(React.createElement(Card, {
    coach, slot, clubName: "Canonical Club & Co", clubLogoUrl: "/canonical-crest.png", countryCode3: "ENG", locale, ...props,
  }));
}

test("real coach card corrects three Portuguese ARIA and keeps the English baseline and canonical names", () => {
  const render = fixture();
  const home = render("pt-BR", { fixtureContext: "home" }), away = render("pt-BR", { fixtureContext: "away" });
  assert.ok(home.includes('aria-label="Card de treinador TouchLine de Coach &lt;&amp;&gt; $&amp;"'));
  assert.ok(home.includes('aria-label="Partida em casa"')); assert.ok(away.includes('aria-label="Partida fora de casa"'));
  assert.ok(!home.includes('aria-label="Partida fora de casa"')); assert.ok(!away.includes('aria-label="Partida em casa"'));
  assert.doesNotMatch(home + away, /Home fixture|Away fixture|TouchLine coach card/);
  const en = render("en-GB", { fixtureContext: "home" });
  assert.ok(en.includes('aria-label="Coach &lt;&amp;&gt; $&amp; TouchLine coach card"'));
  assert.ok(en.includes('aria-label="Home fixture"')); assert.ok(render("en-GB", { fixtureContext: "away" }).includes('aria-label="Away fixture"'));
  assert.match(home, /Canonical Club &amp; Co/); assert.match(home, /<b>ENG<\/b>/); assert.match(home, />TL PTS</);
});

test("all twelve catalogue bindings reach real markup and receive the entire caller locale", () => {
  const seen: unknown[] = [];
  const copy = Object.fromEntries(Object.entries(baseline["en-GB"]).map(([key, value]) => [key, `${key}_SENTINEL${value.includes("{coachName}") ? " {coachName}" : ""}`]));
  const render = fixture({ getTouchlineCoachCardCopy: (locale) => { seen.push(locale); return copy as ReturnType<CopyModule["getTouchlineCoachCardCopy"]>; } });
  const html = [render("ar-SA", { fixtureContext: "home", coach: null }), render("es-ES", { fixtureContext: "away" })].join("\n");
  assert.deepEqual(seen, ["ar-SA", "es-ES"]);
  for (const key of Object.keys(copy)) assert.ok(html.includes(`${key}_SENTINEL`), key);
  assert.match(html, /Coach &lt;&amp;&gt; \$&amp;/);
});

test("catalogues preserve approved EN/PT, twelve keys, names placeholder and six closed draft gates", async () => {
  const copyModule = await import("../lib/touchlineArena/coach-card-i18n.ts");
  assert.deepEqual(Object.keys(copyModule.TOUCHLINE_COACH_CARD_CATALOGUES), locales);
  assert.deepEqual(copyModule.TOUCHLINE_COACH_CARD_DRAFT_LOCALES, locales.slice(2));
  assert.equal(copyModule.TOUCHLINE_COACH_CARD_DRAFT_STATUS, "draft");
  for (const locale of ["en-GB", "pt-BR"] as const) assert.deepEqual(copyModule.TOUCHLINE_COACH_CARD_CATALOGUES[locale], baseline[locale]);
  for (const locale of locales) {
    const copy = copyModule.TOUCHLINE_COACH_CARD_CATALOGUES[locale];
    assert.equal(Object.keys(copy).length, 12);
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(baseline["en-GB"]).sort());
    assert.ok(Object.values(copy).every((value) => value.trim().length > 0));
    assert.equal(copy.coachCardAria.split("{coachName}").length, 2);
    assert.match(copy.coachCardAria, /TouchLine/);
  }
  for (const locale of locales.slice(2)) assert.equal(isTouchLineLocaleComplete(locale), false);
  for (const locale of [...locales.slice(2), "invalid", "pt", null, undefined]) assert.equal(copyModule.getTouchlineCoachCardCopy(locale), copyModule.TOUCHLINE_COACH_CARD_CATALOGUES["en-GB"]);
});

test("six draft catalogues retain all twelve approved literal bindings", async () => {
  const copyModule = await import("../lib/touchlineArena/coach-card-i18n.ts");
  for (const [locale, expected] of Object.entries(draftLiterals)) {
    assert.deepEqual(copyModule.TOUCHLINE_COACH_CARD_CATALOGUES[locale as keyof typeof copyModule.TOUCHLINE_COACH_CARD_CATALOGUES], expected, locale);
  }
});

test("public runtime copy stays gated and missing coach identity remains explicitly unavailable", async () => {
  const copyModule = await import("../lib/touchlineArena/coach-card-i18n.ts");
  const render = fixture();
  for (const locale of locales) {
    const copy = locale === "pt-BR" ? baseline["pt-BR"] : baseline["en-GB"];
    const html = render(locale, { coach: null });
    for (const key of ["awaitingCoach", "coachPending", "nationality", "currentClub", "firstTeamManager", "result", "cards"] as const) assert.ok(html.includes(copy[key]), `${locale}/${key}`);
    assert.doesNotMatch(html, /aria-label="(?:Home fixture|Away fixture|Partida em casa|Partida fora de casa)"/);
    assert.equal(copyModule.getTouchlineCoachCardCopy(locale).awaitingCoach, copy.awaitingCoach);
  }
  assert.ok(render(undefined, { coach: null }).includes("Aguardando treinador"));
});

test("points, partial discipline, artwork, layout overrides and editor boundary stay independent of copy", () => {
  const render = fixture();
  const override = { ...TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT, nameSize: 9.125 };
  for (const locale of ["en-GB", "pt-BR"]) {
    const html = render(locale, { publishedTouchlinePoints: 0, discipline: { yellowCards: 0 }, layoutOverride: override, className: "caller-class", forceNeonActive: true, displayMode: "compact" });
    assert.match(html, /<small>TL PTS<\/small><strong>0<\/strong>/);
    assert.match(html, /data-coach-discipline-source="canonical"/); assert.match(html, /<strong>0 \/ —<\/strong>/);
    assert.match(html, /--coach-name-size:9.125cqw/); assert.match(html, /caller-class/);
    assert.match(html, /data-neon-active="true"/); assert.match(html, /data-coach-card-display="compact"/);
    assert.match(html, /\/touchlineArena\/cards\/templates\/zoom\/coaches\/07_golddiamond_coach.webp\?v=2026-07-28-1/);
    assert.doesNotMatch(html, /data-coach-layer=/);
    const unavailable = render(locale, { slot: createTouchlineArenaCoachSlot(), discipline: { yellowCards: -1, redCards: Number.NaN } });
    assert.match(unavailable, /<small>TL PTS<\/small><strong>—<\/strong>/);
    assert.match(unavailable, /data-coach-discipline-source="unavailable"/);
    const crowned = render(locale, { showLeadershipCrown: true });
    assert.match(crowned, /data-touchline-coach-leader-crown="true"/);
    assert.doesNotMatch(render(locale, { showLeadershipCrown: true, editable: true }), /data-touchline-coach-leader-crown="true"/);
    const editor = render(locale, { editable: true, editableLayers: ["nationality"] });
    assert.match(editor, /data-coach-layer="Nacionalidade"/); assert.doesNotMatch(editor, /data-coach-layer="Escudo do clube"/);
  }
});
