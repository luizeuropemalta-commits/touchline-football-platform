import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { chromium } from "@playwright/test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { isClubHubSquadPreviewWindow } from "../lib/touchlineArena/club-lineup.ts";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES } from "../lib/touchlineFantasy/market-workflow-i18n.ts";

const load = () => import("../lib/touchlineArena/club-hub-lineup-i18n.ts");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const baseline = {
  "en-GB": {
    confirmedTitle: "Line-up confirmed", previewTitle: "Squad Preview", unconfirmedTitle: "Line-up not yet confirmed",
    matchdayEyebrow: "Matchday line-up", previewNotice: "This preview can change until the official TouchLine line-up is confirmed.",
    lastXiTitle: "Last line-up", lastXiNotice: "Latest completed match recorded in TouchLine; newer games may be missing. Not the confirmed next line-up.", lastXiDateLabel: "Recorded match date:",
    illustrativeNotice: "Illustrative squad arrangement, not a prediction of the starting XI. Await the official team sheet for the match shown.",
    matchupAria: "Match-up", matchupEyebrow: "MATCH-UP", awaitingConfirmation: "Awaiting confirmation",
    pitchAriaSuffix: "line-up pitch", emptyLineup: "No published TouchLine cards in this line-up.", positionLeadersAria: "Club leaders by position",
  },
  "pt-BR": {
    confirmedTitle: "Escalação confirmada", previewTitle: "Prévia do elenco", unconfirmedTitle: "Escalação ainda não confirmada",
    matchdayEyebrow: "Escalação da partida", previewNotice: "A prévia pode mudar até a escalação oficial TouchLine ser confirmada.",
    lastXiTitle: "Última escalação", lastXiNotice: "Última partida concluída registrada no TouchLine; jogos mais recentes podem faltar. Não confirma a próxima escalação.", lastXiDateLabel: "Data da partida registrada:",
    illustrativeNotice: "Distribuição ilustrativa do elenco, não uma previsão de titulares. Aguarde a escalação oficial da partida indicada.",
    matchupAria: "Confronto da partida", matchupEyebrow: "CONFRONTO", awaitingConfirmation: "Aguardando confirmação",
    pitchAriaSuffix: "campo de escalação", emptyLineup: "Nenhum card TouchLine publicado nesta escalação.", positionLeadersAria: "Líderes do clube por posição",
  },
};

test("exact fifteen keys across eight catalogues preserve EN/PT and protected TouchLine/XI", async () => {
  const mod = await load();
  assert.deepEqual(Object.keys(mod.TOUCHLINE_CLUB_HUB_LINEUP_CATALOGUES), locales);
  for (const locale of locales) {
    const copy = mod.TOUCHLINE_CLUB_HUB_LINEUP_CATALOGUES[locale];
    assert.deepEqual(Object.keys(copy), Object.keys(baseline["en-GB"]));
    for (const value of Object.values(copy)) { assert.equal(typeof value, "string"); assert.ok(value.trim()); assert.doesNotMatch(value, /TODO|FIXME|\{[^}]+\}/); }
    assert.match(copy.previewNotice, /TouchLine/); assert.match(copy.emptyLineup, /TouchLine/);
    assert.match(copy.lastXiNotice, /TouchLine/, `${locale}: historical XI must name the limited data source`);
    if (locale !== "en-GB" && locale !== "pt-BR") assert.notEqual(copy.illustrativeNotice, baseline["en-GB"].illustrativeNotice);
  }
  for (const locale of ["en-GB", "pt-BR"] as const) assert.deepEqual(mod.getTouchlineClubHubLineupCopy(locale), baseline[locale]);
  assert.match(mod.TOUCHLINE_CLUB_HUB_LINEUP_CATALOGUES["ar-SA"].confirmedTitle, /[\u0600-\u06ff]/);
});

test("six catalogues remain gated drafts; unknown/prototype inputs never publish a draft", async () => {
  const mod = await load();
  assert.deepEqual(mod.TOUCHLINE_CLUB_HUB_LINEUP_DRAFT_LOCALES, locales.slice(2));
  assert.equal(mod.TOUCHLINE_CLUB_HUB_LINEUP_DRAFT_STATUS, "draft");
  for (const locale of [...locales.slice(2), "constructor", "__proto__", "unknown", "", null, undefined]) {
    assert.equal(mod.getTouchlineClubHubLineupCopy(locale), mod.TOUCHLINE_CLUB_HUB_LINEUP_CATALOGUES["en-GB"]);
  }
  for (const locale of locales.slice(2)) assert.equal(isTouchLineLocaleComplete(locale), false);
});

type Copy = Record<keyof typeof baseline["en-GB"], string>;
async function consumer(getCopy: (locale: string) => Copy, formationCopy?: (locale: string) => { formation: string }) {
  const root = resolve(import.meta.dirname, ".."), source = readFileSync(resolve(root, "components/touchline/ClubHubOfficialLineup.tsx"), "utf8");
  const modules: Record<string, unknown> = {};
  for (const match of source.matchAll(/from "(@\/lib\/[^\"]+)"/g)) {
    const name = match[1]; modules[name] = await import(pathToFileURL(resolve(root, `${name.slice(2)}.ts`)).href);
  }
  modules["@/lib/touchlineArena/club-hub-lineup-i18n"] = { getTouchlineClubHubLineupCopy: getCopy };
  if (formationCopy) modules["@/lib/touchlineFantasy/market-workflow-i18n"] = { getTouchlineFantasyMarketWorkflowCopy: formationCopy };
  modules["@/lib/touchlineArena/club-lineup"] = { isClubHubSquadPreviewWindow: (input: Parameters<typeof isClubHubSquadPreviewWindow>[0]) =>
    isClubHubSquadPreviewWindow({ ...input, now: Date.parse("2026-11-01T12:00:00Z") }) };
  const captures: { kind: string; props: Record<string, unknown> }[] = [];
  const leaf = (kind: string) => function CapturedLeaf(props: Record<string, unknown>) {
    captures.push({ kind, props });
    if (kind === "TouchlineEliteExactCard") return React.createElement("a", { href: props.playerProfileHref as string, "data-card": "true" });
    if (kind === "ClubHubLiveFixtureScore") return React.createElement("span", { "data-score": "true" }, "2–1");
    if (kind === "ClubHubLocalKickoff") return React.createElement("span", { "data-kickoff": "true" }, props.fallback as string);
    return React.createElement("div", { "aria-label": (props.ariaLabel as string) || undefined }, props.children as React.ReactNode);
  };
  // Run the actual named wrappers/context, keeping only the original visual
  // leaf markers. Preview seed identity and every captured card prop remain real.
  const seasonScope: Record<string, unknown> = {};
  const seasonResolver = await import("../lib/touchlineArena/player-season-presentation.ts");
  runInNewContext(ts.transpileModule(readFileSync(resolve(root, "components/touchline/cards/TouchlinePlayerSeasonScope.tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText, { exports: seasonScope, React, require: (name: string) => {
    if (name === "react") return React;
    if (name === "./TouchlineCardLeadershipProvider") return { useTouchlineCardLeadershipAuthority: () => null };
    if (name === "./TouchlineEliteExactCard") return { default: leaf("TouchlineEliteExactCard") };
    if (name === "./TouchlineCardZoom") return { default: leaf("TouchlineCardZoom") };
    assert.equal(name, "@/lib/touchlineArena/player-season-presentation"); return seasonResolver;
  } });
  const exports: { default?: React.ComponentType<Record<string, unknown>> } = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText,
    { exports, React, require: (name: string) => {
      if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name === "@/components/touchline/cards/TouchlinePlayerSeasonScope") return seasonScope;
      if (name.startsWith("@/components/")) return { default: leaf(name.split("/").at(-1)!) };
      assert.ok(name in modules, `Unexpected import ${name}`); return modules[name];
    } });
  assert.ok(exports.default);
  const players = Array.from({ length: 11 }, (_, index) => ({ x: index === 0 ? 5 : 15 + index * 7, y: 10 + index * 7,
    card: { id: String(index + 1), name: `Official Name ${index} <&>`, shortName: `P${index}`, position: index ? "defender" : "goalkeeper", role: index ? "defender" : "goalkeeper",
      clubName: "Arsenal FC", shirtNumber: index + 1, countryCode3: "ENG", marketValue: "Pending", marketValueSource: "unavailable", touchlinePoints: 0 } }));
  return { captures, players, source, render(locale: string, options: { confirmed?: boolean; officialPitch?: boolean; lastXi?: boolean; unknownFormation?: boolean; recordedPitch?: boolean; recordedXiWithoutCards?: boolean; lastXiStartsAt?: string | null; draftLocalesEnabled?: boolean; kickoff?: string | null; fixtureStatus?: string; empty?: boolean; noMatchup?: boolean; noLeaders?: boolean } = {}) {
    captures.length = 0;
    const input = { clubName: "Club <&>", locale, draftLocalesEnabled: options.draftLocalesEnabled ?? false, staticVisualQa: true, lastCompletedXiStartsAt: options.lastXiStartsAt, labels: { nationality: "N", points: "P", totalPoints: "TP", cardPrice: "CP" },
      lineup: { status: options.confirmed ? "confirmed" : "preview", previewBasis: options.lastXi ? "last-completed-xi" : "illustrative", formation: "4-3-3", officialFormation: options.confirmed && options.unknownFormation ? null : undefined, recordedFormation: !options.confirmed && options.unknownFormation ? null : undefined, players: options.empty ? [] : players,
        officialPitch: options.officialPitch ? { formation: "4-3-3", players: players.map((slot, index) => ({ ...slot, playerId: slot.card.id, playerName: `Official Player ${index}`, jerseyNumber: index + 1, card: index === 0 ? null : slot.card })) } : undefined,
        recordedPitch: options.recordedPitch ? { formation: "4-2-3-1", players: players.map((slot, index) => ({ ...slot, playerId: slot.card.id, playerName: `Historical Player ${index}`, jerseyNumber: index + 1, card: index === 0 ? null : slot.card })) } : undefined },
      recordedXiWithoutCards: options.recordedXiWithoutCards ? Array.from({ length: 11 }, (_, index) => ({ playerId: `provider-${index + 1}`, playerName: `Recorded Player ${index + 1}`, jerseyNumber: index + 1 })) : null,
      leaderCards: options.noLeaders ? null : React.createElement("strong", { "data-leader": "true" }, "Verified Leader"),
      matchup: options.noMatchup ? null : { fixtureId: "fixture-unchanged", initialFixture: { status: options.fixtureStatus ?? "NS" },
        home: { shortCode: "ARS" }, away: { shortCode: "CHE" }, status: "canonical-status", startsAt: "canonical-kickoff", startsAtIso: options.kickoff ?? "2026-11-02T12:00:00Z" } };
    const before = JSON.stringify(input);
    const html = renderToStaticMarkup(React.createElement(exports.default!, input));
    assert.equal(JSON.stringify(input), before);
    return html;
  } };
}

test("unknown historical formation never presents fallback geometry as a recorded fact in eight locales", async () => {
  const mod = await load(), view = await consumer(mod.getTouchlineClubHubLineupCopy);
  for (const locale of locales) {
    for (const recordedPitch of [false, true]) {
      const html = view.render(locale, { lastXi: true, recordedPitch, unknownFormation: true, draftLocalesEnabled: true });
      const copy = mod.getTouchlineClubHubLineupCopy(locale, true);
      assert.ok(html.includes(copy.awaitingConfirmation), `${locale}/${recordedPitch}`);
      assert.doesNotMatch(html, /4-3-3|4-2-3-1/);
      const known = view.render(locale, { lastXi: true, recordedPitch, draftLocalesEnabled: true });
      assert.ok(known.includes(recordedPitch ? "4-2-3-1" : "4-3-3"));
    }
  }
});

test("unknown official formation keeps confirmed identities but never displays fallback formation in eight locales", async () => {
  const mod = await load(), view = await consumer(mod.getTouchlineClubHubLineupCopy);
  for (const locale of locales) {
    for (const officialPitch of [false, true]) {
      const html = view.render(locale, { confirmed: true, officialPitch, unknownFormation: true, draftLocalesEnabled: true });
      const copy = mod.getTouchlineClubHubLineupCopy(locale, true);
      assert.ok(html.includes(copy.confirmedTitle));
      assert.ok(html.includes(copy.awaitingConfirmation));
      assert.doesNotMatch(html, /4-3-3|4-2-3-1/);
      assert.equal((html.match(/class="playerCaption"/g) ?? []).length, 11);
      assert.ok(view.render(locale, { confirmed: true, officialPitch, draftLocalesEnabled: true }).includes("4-3-3"));
    }
  }
});

test("official missing-card identity wins over historical slots and preserves confirmed heading in eight locales", async () => {
  const mod = await load(), view = await consumer(mod.getTouchlineClubHubLineupCopy);
  for (const locale of locales) {
    const html = view.render(locale, { confirmed: true, officialPitch: true, recordedPitch: true, recordedXiWithoutCards: true, draftLocalesEnabled: true });
    assert.equal((html.match(/class="playerCaption"/g) ?? []).length, 11);
    assert.equal((html.match(/class="identityPlaceholder"/g) ?? []).length, 1);
    assert.equal((html.match(/data-card="true"/g) ?? []).length, 10);
    assert.ok(html.includes("Official Player 0"));
    assert.ok(html.includes(mod.getTouchlineClubHubLineupCopy(locale, true).confirmedTitle));
    assert.doesNotMatch(html, /Historical Player|recordedXiArchive|<time/);
  }
});

test("historical pitch replaces the duplicated list with eleven identities and ten published cards", async () => {
  const mod = await load(), view = await consumer(mod.getTouchlineClubHubLineupCopy);
  for (const locale of locales) {
    const html = view.render(locale, { recordedPitch: true, recordedXiWithoutCards: true, lastXiStartsAt: "2026-09-20T12:00:00Z", draftLocalesEnabled: true });
    assert.equal((html.match(/class="playerCaption"/g) ?? []).length, 11);
    assert.equal((html.match(/class="identityPlaceholder"/g) ?? []).length, 1);
    assert.equal((html.match(/data-card="true"/g) ?? []).length, 10);
    assert.doesNotMatch(html, /recordedXiArchive/);
    assert.ok(html.includes("Historical Player 0"));
    assert.ok(html.includes("4-2-3-1"));
    assert.ok(html.includes('<time dateTime="2026-09-20T12:00:00Z">'));
    const confirmed = view.render(locale, { confirmed: true, recordedPitch: true });
    assert.doesNotMatch(confirmed, /Historical Player|identityPlaceholder/);
    assert.equal((confirmed.match(/data-card="true"/g) ?? []).length, 11);
  }
});

test("legacy archived XI names remain separate when no historical pitch DTO is supplied", async () => {
  const mod = await load(), view = await consumer(mod.getTouchlineClubHubLineupCopy);
  for (const locale of locales) {
    const html = view.render(locale, { recordedXiWithoutCards: true, lastXiStartsAt: "2026-09-20T12:00:00Z", draftLocalesEnabled: true });
    assert.match(html, /<aside[^>]*><div><h3>/);
    assert.ok(html.includes(mod.TOUCHLINE_CLUB_HUB_LINEUP_CATALOGUES[locale].lastXiNotice.replaceAll("'", "&#x27;")));
    assert.equal((html.match(/Recorded Player \d+/g) ?? []).length, 11);
    assert.ok(html.includes("<time dateTime="));
    const confirmed = view.render(locale, { confirmed: true, recordedXiWithoutCards: true, draftLocalesEnabled: true });
    assert.doesNotMatch(confirmed, /Recorded Player \d+/);
  }
});

test("archived XI stays legible and contained on phone and desktop, including Arabic", async () => {
  const mod = await load(), view = await consumer(mod.getTouchlineClubHubLineupCopy);
  const css = readFileSync(resolve(import.meta.dirname, "../components/touchline/ClubHubOfficialLineup.module.css"), "utf8");
  const browser = await chromium.launch({ headless: true });
  try {
    for (const locale of ["pt-BR", "ar-SA"] as const) {
      for (const width of [390, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
        const html = view.render(locale, { recordedXiWithoutCards: true, lastXiStartsAt: "2026-09-20T12:00:00Z", draftLocalesEnabled: true });
        const longNameHtml = html.replace("Recorded Player 10", "Konstantinos Tzolakis");
        await page.setContent(`<html dir="${locale === "ar-SA" ? "rtl" : "ltr"}"><head><style>*{box-sizing:border-box}body{margin:0;background:#050b09;color:white;padding:12px}${css}</style></head><body>${longNameHtml}</body></html>`);
        const archive = page.getByRole("complementary", { name: mod.TOUCHLINE_CLUB_HUB_LINEUP_CATALOGUES[locale].lastXiTitle });
        assert.equal(await archive.locator("li").count(), 11);
        const measurements = await archive.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const items = [...element.querySelectorAll("li")].map((item) => item.getBoundingClientRect());
          return { left: box.left, right: box.right, width: box.width,
            itemOverflow: items.some((item) => item.left < box.left - 1 || item.right > box.right + 1),
            clippedText: [...element.querySelectorAll("li")].some((item) => item.scrollWidth > item.clientWidth + 1),
            splitNumbers: [...element.querySelectorAll("li span:first-child[aria-hidden]")].some((number) => {
              const range = document.createRange(); range.selectNodeContents(number);
              return range.getClientRects().length > 1;
            }),
            documentWidth: document.documentElement.scrollWidth };
        });
        assert.ok(measurements.left >= -1 && measurements.right <= width + 1, `${locale}/${width}: archive outside viewport ${JSON.stringify(measurements)}`);
        assert.equal(measurements.itemOverflow, false, `${locale}/${width}: player chip escaped archive`);
        assert.equal(measurements.clippedText, false, `${locale}/${width}: player text clipped`);
        assert.equal(measurements.splitNumbers, false, `${locale}/${width}: jersey number split across lines`);
        if (process.env.TOUCHLINE_VISUAL_CAPTURE) await archive.screenshot({ path: `${process.env.TOUCHLINE_VISUAL_CAPTURE}-${locale}-${width}.png` });
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});

test("real SSR preserves EN/PT confirmed, T−24 preview, waiting, terminal and empty/ARIA text", async () => {
  const mod = await load(), view = await consumer(mod.getTouchlineClubHubLineupCopy);
  for (const locale of ["en-GB", "pt-BR"] as const) {
    const copy = baseline[locale];
    const scenarios = [
      { options: { confirmed: true }, title: copy.confirmedTitle, notice: null },
      { options: {}, title: copy.previewTitle, notice: copy.previewNotice },
      { options: { lastXi: true }, title: copy.lastXiTitle, notice: copy.lastXiNotice },
      { options: { kickoff: "2026-11-02T12:00:00.001Z" }, title: copy.unconfirmedTitle, notice: copy.illustrativeNotice },
      { options: { fixtureStatus: "FT" }, title: copy.unconfirmedTitle, notice: copy.illustrativeNotice },
      { options: { kickoff: "invalid" }, title: copy.unconfirmedTitle, notice: copy.illustrativeNotice },
    ];
    for (const { options, title, notice } of scenarios) {
      const html = view.render(locale, options); assert.ok(html.includes(`<h2>${title}</h2>`));
      assert.ok(html.includes(`aria-label="Club &lt;&amp;&gt; ${title}"`));
      if (notice) assert.ok(html.includes(notice.replaceAll("'", "&#x27;"))); else assert.doesNotMatch(html, /<p>/);
      assert.ok(html.includes(`aria-label="${copy.matchupAria}"`)); assert.ok(html.includes(copy.matchupEyebrow));
      assert.ok(html.includes(`aria-label="Club &lt;&amp;&gt; ${copy.pitchAriaSuffix}"`));
      assert.ok(html.includes(`aria-label="${copy.positionLeadersAria}"`));
      assert.ok(html.includes(TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES[locale].formation));
    }
    const empty = view.render(locale, { empty: true, noMatchup: true, noLeaders: true });
    assert.ok(empty.includes(copy.emptyLineup)); assert.doesNotMatch(empty, /data-card|data-score|data-leader/);
  }
});

test("recorded XI shows the stored match date, never a date for confirmed or illustrative XI", async () => {
  const mod = await load(), view = await consumer(mod.getTouchlineClubHubLineupCopy);
  for (const locale of locales) {
    const copy = mod.getTouchlineClubHubLineupCopy(locale, true);
    const html = view.render(locale, { lastXi: true, draftLocalesEnabled: true, lastXiStartsAt: "2026-09-20T16:30:00Z" });
    assert.match(html, /<time dateTime="2026-09-20T16:30:00Z">/);
    assert.ok(html.includes(copy.lastXiDateLabel.replaceAll("'", "&#x27;")), locale);
    assert.doesNotMatch(view.render(locale, { confirmed: true, lastXiStartsAt: "2026-09-20T16:30:00Z" }), /<time/);
    assert.doesNotMatch(view.render(locale, { lastXiStartsAt: "2026-09-20T16:30:00Z" }), /<time/);
    assert.doesNotMatch(view.render(locale, { lastXi: true, lastXiStartsAt: "invalid" }), /<time/);
  }
});

test("all twelve real consumer bindings and shared formation use full locale, including gated review probes", async () => {
  const mod = await load(); const calls: string[] = [], formationCalls: string[] = [];
  const sentinel = Object.fromEntries(Object.keys(baseline["en-GB"]).map(key => [key, `copy:${key}`])) as Copy;
  const view = await consumer(locale => { calls.push(locale); return sentinel; }, locale => { formationCalls.push(locale); return { formation: "shared:formation" }; });
  for (const locale of locales) {
    const html = [view.render(locale, { confirmed: true }), view.render(locale), view.render(locale, { lastXi: true, lastXiStartsAt: "2026-09-20T16:30:00Z" }), view.render(locale, { kickoff: "invalid", empty: true })].join("");
    for (const text of Object.values(sentinel)) assert.ok(html.includes(text), text);
    assert.ok(html.includes("shared:formation"));
  }
  assert.deepEqual(calls, locales.flatMap(locale => [locale, locale, locale, locale])); assert.deepEqual(formationCalls, calls);
  for (const locale of locales) {
    const draftView = await consumer(() => mod.TOUCHLINE_CLUB_HUB_LINEUP_CATALOGUES[locale], () => TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES[locale]);
    const html = draftView.render(locale, { confirmed: true });
    assert.ok(html.includes(mod.TOUCHLINE_CLUB_HUB_LINEUP_CATALOGUES[locale].confirmedTitle));
  }
});

test("real SSR keeps eleven coordinates, identities, links, leaders, card modes and score boundary intact", async () => {
  const mod = await load(), view = await consumer(mod.getTouchlineClubHubLineupCopy);
  for (const locale of ["en-GB", "pt-BR"] as const) {
    const html = view.render(locale, { confirmed: true });
    assert.equal((html.match(/<article /g) ?? []).length, 11);
    for (const player of view.players) assert.ok(html.includes(`--lineup-x:${player.x}%;--lineup-y:${player.y}%`));
    assert.ok(html.includes("4-3-3")); assert.ok(html.includes("ARS")); assert.ok(html.includes("CHE")); assert.ok(html.replace(/<[^>]*>/g, "").includes("canonical-status · canonical-kickoff"));
    const kickoff = view.captures.find(item => item.kind === "ClubHubLocalKickoff")!;
    assert.equal(kickoff.props.locale, locale); assert.equal(kickoff.props.fallback, "canonical-kickoff");
    assert.ok(html.includes("Verified Leader"));
    const cards = view.captures.filter(item => item.kind === "TouchlineEliteExactCard"); assert.equal(cards.length, 11);
    for (const { props } of cards) { assert.equal(props.subscribeToRanking, false); assert.equal(props.enableInteractiveNeon, false); assert.equal(props.rankingMode, "preview"); assert.ok(String(props.playerProfileHref).includes(`lang=${locale}`)); }
    const zooms = view.captures.filter(item => item.kind === "TouchlineCardZoom"); assert.equal(zooms.length, 11);
    for (let index = 0; index < 11; index++) { assert.ok(String(zooms[index].props.ariaLabel).includes(view.players[index].card.name)); assert.equal(zooms[index].props.contractHref, undefined); }
    const score = view.captures.find(item => item.kind === "ClubHubLiveFixtureScore")!;
    assert.equal(score.props.fixtureId, "fixture-unchanged"); assert.equal(score.props.locale, locale);
  }
});
