import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as localeModule from "../lib/touchlineArena/i18n.ts";
import * as matchCentre from "../lib/touchlineArena/match-centre.ts";
import * as matchCopy from "../lib/touchlineArena/match-centre-i18n.ts";
import * as kickoff from "../lib/touchlineArena/local-kickoff.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const componentSource = read("components/touchline/club-hub/ClubHubNextFixtureCard.tsx");
const railSource = read("lib/touchlineArena/club-hub-fixture-rail.ts");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const keys = ["nextMatch", "matchUpdate", "localTime", "verifiedScore", "stadium", "venuePending", "previewLink", "crestAlt"] as const;
const literal = {
  "en-GB": ["NEXT MATCH", "MATCH UPDATE", "Your local time", "Verified score", "STADIUM", "Venue under verification", "View next-match post preview", "{name} crest"],
  "pt-BR": ["PRÓXIMO JOGO", "ATUALIZAÇÃO DA PARTIDA", "Seu horário local", "Placar verificado", "ESTÁDIO", "Estádio em verificação", "Ver prévia da arte da partida", "Escudo de {name}"],
  "es-ES": ["PRÓXIMO PARTIDO", "ACTUALIZACIÓN DEL PARTIDO", "Tu hora local", "Marcador verificado", "ESTADIO", "Estadio en verificación", "Ver vista previa de la publicación del próximo partido", "Escudo de {name}"],
  "it-IT": ["PROSSIMA PARTITA", "AGGIORNAMENTO DELLA PARTITA", "Il tuo orario locale", "Risultato verificato", "STADIO", "Stadio in fase di verifica", "Visualizza l’anteprima del post della prossima partita", "Stemma di {name}"],
  "fr-FR": ["PROCHAIN MATCH", "MISE À JOUR DU MATCH", "Votre heure locale", "Score vérifié", "STADE", "Stade en cours de vérification", "Voir l’aperçu de la publication du prochain match", "Écusson de {name}"],
  "ar-SA": ["المباراة القادمة", "تحديث المباراة", "توقيتك المحلي", "نتيجة متحقق منها", "الملعب", "الملعب قيد التحقق", "عرض معاينة منشور المباراة القادمة", "شعار {name}"],
  "tr-TR": ["SONRAKİ MAÇ", "MAÇ GÜNCELLEMESİ", "Yerel saatiniz", "Doğrulanmış skor", "STADYUM", "Stadyum doğrulanıyor", "Sonraki maç gönderisinin ön izlemesini gör", "{name} arması"],
  "de-DE": ["NÄCHSTES SPIEL", "SPIELAKTUALISIERUNG", "Deine Ortszeit", "Bestätigter Spielstand", "STADION", "Stadion wird überprüft", "Beitragsvorschau für das nächste Spiel ansehen", "Wappen von {name}"],
} as const;
type Copy = Record<typeof keys[number] | "live" | "finished", string>;
type Catalogue = typeof import("../lib/touchlineArena/club-hub-fixture-i18n.ts");
const load = () => import("../lib/touchlineArena/club-hub-fixture-i18n.ts");
const now = Date.parse("2026-09-06T16:00:00Z");
class FixedDate extends Date { static now() { return now; } }
function evaluate<T>(source: string, modules: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.React } }).outputText,
    { exports, React, Date: FixedDate, ...globals, require: (name: string) => { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; } });
  return exports as T;
}
function rail(getCopy: (locale?: string | null, enabled?: boolean) => Copy) {
  return evaluate<typeof import("../lib/touchlineArena/club-hub-fixture-rail.ts")>(railSource, {
    "./match-centre.ts": matchCentre, "./club-hub-fixture-i18n.ts": { getTouchlineClubHubFixtureCopy: getCopy },
  });
}
function draftCatalogue() {
  return evaluate<Catalogue>(read("lib/touchlineArena/club-hub-fixture-i18n.ts"), {
    "./i18n.ts": localeModule,
    "./catalogue-locale.ts": catalogueLocale,
    "./match-centre-i18n.ts": matchCopy,
  });
}
const defaults = {
  homeTeam: { teamId: "official-home", name: "Official $& <Home>", shortCode: "HOM", logoUrl: "/home.svg" },
  awayTeam: { teamId: "official-away", name: "Official $& <Away>", shortCode: "AWY", logoUrl: "/away.svg" },
  homePosition: 0, awayPosition: null, initialTimeZone: "Europe/Malta", roundName: "Official round $& <9>", startsAt: "2026-09-06T15:30:00Z", previewHref: null,
};
const escape = (value: string) => renderToStaticMarkup(React.createElement("span", null, value)).slice(6, -7);
function consumer(getCopy: (locale?: string | null, enabled?: boolean) => Copy, browserZone?: string, unknownRail = false) {
  const actualRail = rail(getCopy), images: Record<string, unknown>[] = [], effects: (() => undefined | (() => void))[] = [];
  const timers: { callback: () => void; ms: number }[] = [], cleared: number[] = [];
  let refreshes = 0;
  const icon = () => React.createElement("svg", { "aria-hidden": true });
  const component = evaluate<{ default: (props: Record<string, unknown>) => React.ReactElement | null }>(componentSource, {
    "react": { ...React, useMemo: (fn: () => unknown) => fn(), useEffect: (fn: () => undefined | (() => void)) => effects.push(fn), useSyncExternalStore: (_subscribe: unknown, readBrowser: () => string, readServer: () => string) => browserZone ? readBrowser() : readServer() },
    "next/navigation": { useRouter: () => ({ refresh: () => { refreshes++; } }) },
    "next/image": { default: (props: Record<string, unknown>) => { images.push(props); return React.createElement("img", props); } },
    "next/link": { default: (props: Record<string, unknown>) => React.createElement("a", props, props.children as React.ReactNode) },
    "lucide-react": { CalendarDays: icon, MapPin: icon },
    "@/lib/touchlineArena/local-kickoff": kickoff,
    "@/lib/touchlineArena/match-centre": matchCentre,
    "@/lib/touchlineArena/club-hub-fixture-rail": unknownRail ? { ...actualRail, resolveClubHubFixtureRail: () => ({ state: "unknown", heading: "UNKNOWN_BOUNDARY", score: null, liveMinute: null }) } : actualRail,
    "@/lib/touchlineArena/club-hub-fixture-i18n": { getTouchlineClubHubFixtureCopy: getCopy },
    "./ClubHubPremiumPrototype.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
  }, {
    Intl: { DateTimeFormat: function () { return { resolvedOptions: () => ({ timeZone: browserZone }) }; } },
    window: { setTimeout: (callback: () => void, ms: number) => { timers.push({ callback, ms }); return 7; }, clearTimeout: (id: number) => cleared.push(id) },
  }).default;
  return { images, effects, timers, cleared, refreshes: () => refreshes, render(props: Record<string, unknown> = {}) {
    images.length = 0; effects.length = 0;
    const input = { ...defaults, ...props }, before = JSON.stringify(input);
    const html = renderToStaticMarkup(component(input)); assert.equal(JSON.stringify(input), before); return html;
  } };
}

test("fixture consumer and actual rail forward full locale to visible copy without language inference", () => {
  const seen: unknown[] = [];
  const copy = Object.fromEntries([...keys, "live", "finished"].map(key => [key, `SENTINEL_${key}_{name} <&>`])) as Copy;
  const f = consumer(locale => { seen.push(locale); return copy; });
  const html = f.render({ locale: "ar-SA", variant: "hero", previewHref: "/preview?x=$&y=2", startsAt: "2026-09-07T15:30:00Z" });
  assert.deepEqual(seen, ["ar-SA", "ar-SA"]);
  for (const key of ["nextMatch", "localTime", "stadium", "venuePending", "previewLink"]) assert.ok(html.includes(`SENTINEL_${key}_`), key);
  assert.equal(f.images[0].alt, copy.crestAlt.replace("{name}", () => defaults.homeTeam.name));
  assert.equal(f.images[1].alt, copy.crestAlt.replace("{name}", () => defaults.awayTeam.name));
  assert.match(html, /&lt;&amp;&gt;/);
  assert.equal(rail(() => copy).resolveClubHubFixtureRail({}, "ar-SA", now).heading, copy.matchUpdate);
  const unknown = consumer(() => copy, undefined, true).render({ locale: "ar-SA" });
  assert.ok(unknown.includes(escape(copy.verifiedScore)), "existing unknown score wording remains unchanged at the presentation boundary");
});

test("eight fixture literals preserve EN/PT, crest correction and exact live/final catalogue reuse behind six gates", async () => {
  const mod = await load();
  assert.deepEqual(Object.keys(mod.TOUCHLINE_CLUB_HUB_FIXTURE_CATALOGUES), locales);
  assert.deepEqual(mod.TOUCHLINE_CLUB_HUB_FIXTURE_DRAFT_LOCALES, locales.slice(2));
  assert.equal(mod.TOUCHLINE_CLUB_HUB_FIXTURE_DRAFT_STATUS, "draft");
  for (const locale of locales) {
    const raw = mod.TOUCHLINE_CLUB_HUB_FIXTURE_CATALOGUES[locale];
    assert.deepEqual(Object.keys(raw), keys); assert.deepEqual(keys.map(key => raw[key]), literal[locale]);
    const copy = mod.getTouchlineClubHubFixtureCopy(locale), resolved = locale === "pt-BR" ? "pt-BR" : "en-GB";
    assert.deepEqual(keys.map(key => copy[key]), literal[resolved]);
    assert.equal(copy.live, matchCopy.getTouchlineMatchCentreCopy(locale).liveNow);
    assert.equal(copy.finished, matchCopy.getTouchlineMatchCentreCopy(locale).completed);
  }
  for (const locale of [null, undefined, "pt", "constructor", "unknown"]) assert.equal(mod.getTouchlineClubHubFixtureCopy(locale).nextMatch, "NEXT MATCH");
  const requested: unknown[] = [];
  const sentinel = evaluate<Catalogue>(read("lib/touchlineArena/club-hub-fixture-i18n.ts"), {
    "./catalogue-locale.ts": { resolveTouchlineCatalogueLocale: (locale?: string | null, enabled = false) => { requested.push(locale); return catalogueLocale.resolveTouchlineCatalogueLocale(locale, enabled); } },
    "./match-centre-i18n.ts": { getTouchlineMatchCentreCopy: (locale: unknown) => { requested.push(locale); return { liveNow: "REUSED_LIVE", completed: "REUSED_FINAL" }; } },
  });
  assert.equal(sentinel.getTouchlineClubHubFixtureCopy("ar-SA", true).live, "REUSED_LIVE");
  assert.deepEqual(requested, ["ar-SA", "ar-SA"]);
  for (const locale of locales.slice(2)) assert.equal(localeModule.isTouchLineLocaleComplete(locale), false);
});

test("real card and rail render all eight isolated drafts while preserving state, zero score/minute, null and official identity", () => {
  const mod = draftCatalogue();
  for (const locale of locales) {
    const requested: unknown[] = [], copy = mod.getTouchlineClubHubFixtureCopy(locale, true);
    const f = consumer((value, enabled) => { requested.push(value); return mod.getTouchlineClubHubFixtureCopy(value, enabled); });
    for (const state of ["upcoming", "live", "finished"] as const) for (const variant of ["rail", "hero"]) for (const venueName of [null, "Official $& <Stadium>", ""]) {
      requested.length = 0;
      const status = state === "live" ? "LIVE" : state === "finished" ? "Full Time" : "Scheduled";
      const html = f.render({ locale, draftLocalesEnabled: true, status, homeScore: 0, awayScore: 0, liveMinute: 0, variant, venueName, venueImageUrl: "/venue.jpg" });
      assert.deepEqual(requested, [locale, locale]);
      assert.ok(html.includes(`data-state="${state}"`));
      assert.ok(html.includes(escape((state === "live" ? copy.live : state === "finished" ? copy.finished : copy.nextMatch) + ` · ${defaults.roundName}`)));
      assert.ok(html.includes(escape(defaults.homeTeam.name))); assert.ok(html.includes(escape(defaults.awayTeam.name)));
      assert.ok(html.includes(state === "upcoming" ? ">VS</em>" : '>0–0</em>'));
      assert.equal(f.images[0].src, defaults.homeTeam.logoUrl); assert.equal(f.images[0].height, 64); assert.equal(f.images[0].width, 64);
      assert.equal(f.images[0].alt, copy.crestAlt.replace("{name}", () => defaults.homeTeam.name));
      assert.equal(f.images[1].alt, copy.crestAlt.replace("{name}", () => defaults.awayTeam.name));
      assert.equal(f.images[2].alt, ""); assert.equal(f.images[2]["aria-hidden"], "true");
      assert.equal(f.images[2].height, variant === "hero" ? 112 : 96); assert.equal(f.images[2].width, variant === "hero" ? 112 : 96);
      assert.doesNotMatch(html, /<a\b/, "public previewHref=null never renders a preview anchor");
      if (state === "finished") assert.ok(!html.includes("<time"));
      else { assert.ok(html.includes(`dateTime="${defaults.startsAt}"`)); assert.ok(html.includes(escape(state === "live" ? copy.verifiedScore : copy.localTime))); }
      if (state === "live") assert.ok(html.includes(">0&#x27;</time>"));
      if (venueName === null) assert.ok(html.includes(escape(copy.venuePending)));
      else { assert.ok(!html.includes(escape(copy.venuePending))); if (venueName) assert.ok(html.includes(escape(venueName))); }
      assert.ok(html.includes(`class="nextFixtureVenue" data-state="${venueName ? "verified" : "pending"}"`));
      if (variant === "hero") assert.ok(html.includes(`<small>${escape(copy.stadium)}</small>`));
    }
    const actualRail = rail(mod.getTouchlineClubHubFixtureCopy);
    assert.equal(actualRail.resolveClubHubFixtureRail({}, locale, now, true).heading, copy.matchUpdate);
    assert.equal(f.render({ locale, startsAt: "not-a-date" }), "");
    for (const value of [undefined, -1, Number.NaN, 1.5]) {
      const result = actualRail.resolveClubHubFixtureRail({ startsAt: defaults.startsAt, status: "LIVE", homeScore: value, awayScore: 0, liveMinute: value }, locale, now);
      assert.equal(result.score, null); assert.equal(result.liveMinute, null);
    }
    const preview = f.render({ locale, draftLocalesEnabled: true, previewHref: undefined, showPositions: true });
    assert.ok(preview.includes('href="/visual-qa/clubhub-next-fixture-post"')); assert.ok(preview.includes(escape(copy.previewLink))); assert.ok(preview.includes("<small>0</small>"));
  }
});

test("public card keeps gates and existing server/browser timezone plus refresh effect without network", async () => {
  const mod = await load();
  for (const locale of locales) {
    const copy = mod.getTouchlineClubHubFixtureCopy(locale), f = consumer(mod.getTouchlineClubHubFixtureCopy);
    const html = f.render({ locale });
    assert.ok(html.includes(escape(copy.localTime)));
    assert.ok(html.includes(locale === "pt-BR" ? "6 set · 17:30" : "6 Sep · 17:30"));
    const browser = consumer(mod.getTouchlineClubHubFixtureCopy, "America/Sao_Paulo");
    assert.ok(browser.render({ locale }).includes("12:30"));
    const invalidZone = consumer(mod.getTouchlineClubHubFixtureCopy, "Not/AZone");
    assert.ok(invalidZone.render({ locale }).includes("15:30"));
  }
  const f = consumer(mod.getTouchlineClubHubFixtureCopy);
  f.render({ status: "LIVE" }); assert.equal(f.timers.length, 0); assert.equal(f.refreshes(), 0);
  const cleanup = f.effects[0](); assert.equal(f.timers[0].ms, 10_000); f.timers[0].callback(); assert.equal(f.refreshes(), 1);
  cleanup?.(); assert.deepEqual(f.cleared, [7]);
  const finished = consumer(mod.getTouchlineClubHubFixtureCopy); finished.render({ status: "Full Time" });
  assert.equal(finished.effects[0](), undefined); assert.equal(finished.timers.length, 0);
  const page = read("app/touchline-clubs/[club]/page.tsx");
  const callers = [...page.matchAll(/<ClubHubNextFixtureCard\b[\s\S]*?\n\s*\/>/g)];
  assert.equal(callers.length, 2); for (const [caller] of callers) assert.match(caller, /previewHref=\{null\}/);
});

test("rail algorithm and component behavior remain byte-identical outside admitted copy bindings", () => {
  function undoOnce(input: string, added: string, previous: string) {
    assert.equal(input.split(added).length - 1, 1, `exact authorized delta: ${added}`);
    return input.replace(added, () => previous);
  }
  // Invert only the later opt-in signature/binding changes, then apply the
  // original copy-only inverse below. The historical digests stay unchanged.
  let railBaseline = undoOnce(railSource, '  draftLocalesEnabled = false,\n', '');
  railBaseline = undoOnce(railBaseline, 'getTouchlineClubHubFixtureCopy(locale, draftLocalesEnabled)', 'getTouchlineClubHubFixtureCopy(locale)');
  const railRestored = railBaseline.replace('import { getTouchlineClubHubFixtureCopy } from "./club-hub-fixture-i18n.ts";\n', "")
    .replace('const copy = getTouchlineClubHubFixtureCopy(locale);', 'const portuguese = locale === "pt-BR";')
    .replace('heading: copy.live', 'heading: portuguese ? "AO VIVO" : "LIVE"')
    .replace('heading: copy.finished', 'heading: portuguese ? "ENCERRADO" : "FULL TIME"')
    .replace('heading: copy.nextMatch', 'heading: portuguese ? "PRÓXIMO JOGO" : "NEXT MATCH"')
    .replace('heading: copy.matchUpdate', 'heading: portuguese ? "ATUALIZAÇÃO DA PARTIDA" : "MATCH UPDATE"');
  assert.equal(createHash("sha256").update(railRestored).digest("hex"), "bfafa9422d353c0ecc219570067440065ee2521529d51f50e96202937f2f8991");
  let componentBaseline = componentSource;
  for (const [added, previous] of [
    ['  draftLocalesEnabled?: boolean;\n', ''],
    ['  draftLocalesEnabled = false,\n', ''],
    ['getTouchlineClubHubFixtureCopy(locale, draftLocalesEnabled)', 'getTouchlineClubHubFixtureCopy(locale)'],
    ['formatTouchlineLocalKickoff(startsAt, timeZone, locale, draftLocalesEnabled)', 'formatTouchlineLocalKickoff(startsAt, timeZone, locale)'],
    ['[locale, startsAt, timeZone, draftLocalesEnabled]', '[locale, startsAt, timeZone]'],
    ['resolveClubHubFixtureRail({ startsAt, status, homeScore, awayScore, liveMinute }, locale, undefined, draftLocalesEnabled)', 'resolveClubHubFixtureRail({ startsAt, status, homeScore, awayScore, liveMinute }, locale)'],
    ['[awayScore, homeScore, liveMinute, locale, startsAt, status, draftLocalesEnabled]', '[awayScore, homeScore, liveMinute, locale, startsAt, status]'],
  ]) componentBaseline = undoOnce(componentBaseline, added, previous);
  const restored = componentBaseline.replace('import { getTouchlineClubHubFixtureCopy } from "@/lib/touchlineArena/club-hub-fixture-i18n";\n', "")
    .replace('const copy = getTouchlineClubHubFixtureCopy(locale);', 'const portuguese = locale === "pt-BR";')
    .replace('copy.crestAlt.replace("{name}", () => homeTeam.name)', '`${homeTeam.name} crest`')
    .replace('copy.crestAlt.replace("{name}", () => awayTeam.name)', '`${awayTeam.name} crest`')
    .replace('${copy.localTime}', '${portuguese ? "Seu horário local" : "Your local time"}')
    .replace(': copy.verifiedScore', ': (portuguese ? "Placar verificado" : "Verified score")')
    .replace('{copy.stadium}', '{portuguese ? "ESTÁDIO" : "STADIUM"}')
    .replace('venueName ?? copy.venuePending', 'venueName ?? (portuguese ? "Estádio em verificação" : "Venue under verification")')
    .replace('{copy.previewLink}', '{portuguese ? "Ver prévia da arte da partida" : "View next-match post preview"}');
  assert.equal(createHash("sha256").update(restored).digest("hex"), "7e364cc7a4aab3bd06e7eb89b08ef1f8375fb4b09b4e8a43b5e85b0e60b0f80d");
});
