import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { getTouchlineClubHubDirectoryCopy } from "../lib/touchlineArena/club-hub-directory-i18n.ts";
import { getTouchlineClubHubProfileCopy, touchlineClubHubText, getTouchlineClubHubCoachPanelCopy } from "../lib/touchlineArena/club-hub-profile-i18n.ts";
import { getTouchlineClubHubSectionNavigationCopy } from "../lib/touchlineArena/club-hub-section-navigation-i18n.ts";
import { getTouchlineClubHubRosterCopy } from "../lib/touchlineArena/club-hub-roster-i18n.ts";
import { getTouchlineClubHubLineupCopy } from "../lib/touchlineArena/club-hub-lineup-i18n.ts";
import { getTouchlineClubHubShowcaseCopy } from "../lib/touchlineArena/club-hub-showcase-i18n.ts";
import { getTouchlineClubHubFixtureCopy } from "../lib/touchlineArena/club-hub-fixture-i18n.ts";
import { getTouchlineOfficialLeagueTableCopy } from "../lib/touchlineArena/official-league-table-i18n.ts";
import { getTouchlinePublicErrorCopy } from "../lib/touchlineArena/public-error-i18n.ts";
import { formatTouchlineLocalKickoff } from "../lib/touchlineArena/local-kickoff.ts";
import { resolveClubHubFixtureRail, clubHubFixtureRailRefreshMs } from "../lib/touchlineArena/club-hub-fixture-rail.ts";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { resolveTouchlineClubMatchPreviewTeam } from "../lib/touchlineArena/club-match-preview.ts";
import { TOUCHLINE_ENGLAND_CLUBS } from "../lib/touchlineArena/demo-data.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
test("all ClubHub catalogue defaults stay gated while eight explicit selections reach authored copy", () => {
  const getters = [getTouchlineClubHubDirectoryCopy, getTouchlineClubHubProfileCopy, getTouchlineClubHubSectionNavigationCopy,
    getTouchlineClubHubRosterCopy, getTouchlineClubHubLineupCopy, getTouchlineClubHubShowcaseCopy,
    getTouchlineClubHubFixtureCopy, getTouchlineOfficialLeagueTableCopy, getTouchlinePublicErrorCopy];
  for (const getter of getters) {
    for (const locale of locales) {
      assert.deepEqual(getter(locale), getter(locale === "pt-BR" ? "pt-BR" : "en-GB"));
      const actual = getter(locale, true);
      assert.deepEqual(Object.keys(actual).sort(), Object.keys(getter("en-GB")).sort());
      assert.ok(JSON.stringify(actual).length > 30);
      if (locale !== "en-GB") assert.notDeepEqual(actual, getter("en-GB", true));
    }
  }
  for (const locale of locales.slice(2)) assert.equal(isTouchLineLocaleComplete(locale), false);
  assert.equal(getTouchlineClubHubFixtureCopy("ar-SA", true).live, "مباشر");
  assert.equal(touchlineClubHubText("fr-FR", "opponentToBeConfirmed", true), "Adversaire à confirmer");
  for (const locale of locales) assert.ok(getTouchlineClubHubCoachPanelCopy(locale, true).description.includes("TouchLine Points"));
});

test("unknown opponent draft fallback never borrows crest or changes factual identity", () => {
  const club = TOUCHLINE_ENGLAND_CLUBS[0];
  const absent = resolveTouchlineClubMatchPreviewTeam(undefined, club, "fr-FR", true);
  assert.equal(absent.name, "Adversaire à confirmer"); assert.equal(absent.logoUrl, undefined);
  assert.equal(resolveTouchlineClubMatchPreviewTeam(undefined, club, "fr-FR").name, resolveTouchlineClubMatchPreviewTeam(undefined, club, "en-GB").name);
  const team = { providerId: "unknown-provider", name: "Official $& <club>", shortCode: "OFF" };
  for (const locale of locales) {
    const result = resolveTouchlineClubMatchPreviewTeam(team, club, locale, true);
    assert.equal(result.name, team.name); assert.equal(result.shortCode, team.shortCode); assert.equal(result.logoUrl, undefined);
  }
});

test("local kickoff retains EN/PT exact dates, Gregorian DST and bounded rail semantics under draft opt-in", () => {
  const input = { startsAt: "2026-10-25T01:30:00Z", status: "FT", homeScore: 2, awayScore: 1 };
  const before = JSON.stringify(input);
  assert.equal(formatTouchlineLocalKickoff(input.startsAt, "Europe/Malta", "en-GB")?.date, "25 Oct");
  assert.equal(formatTouchlineLocalKickoff(input.startsAt, "Europe/Malta", "pt-BR")?.date, "25 out");
  for (const locale of locales) {
    const kickoff = formatTouchlineLocalKickoff(input.startsAt, "Europe/Malta", locale, true)!;
    assert.equal(kickoff.timeZone, "Europe/Malta");
    assert.equal(kickoff.time, new Intl.DateTimeFormat(locale, { calendar: "gregory", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Malta" }).format(new Date(input.startsAt)));
    const rail = resolveClubHubFixtureRail(input, locale, Date.parse("2026-10-25T04:00:00Z"), true);
    assert.equal(rail.state, "finished"); assert.equal(rail.score, "2–1"); assert.equal(rail.liveMinute, null);
    assert.equal(rail.heading, getTouchlineClubHubFixtureCopy(locale, true).finished);
    assert.equal(clubHubFixtureRailRefreshMs(rail, input.startsAt), null);
  }
  assert.equal(JSON.stringify(input), before);
  assert.equal(formatTouchlineLocalKickoff("bad", "Europe/Malta", "ar-SA", true), null);
  assert.deepEqual(formatTouchlineLocalKickoff(input.startsAt, "Europe/Malta", "ar-SA"), formatTouchlineLocalKickoff(input.startsAt, "Europe/Malta", "en-GB"));
});

test("every ClubHub card/zoom/child boundary receives explicit flag and exact-card locale", () => {
  const files = ["app/touchline-clubs/page.tsx", "app/touchline-clubs/[club]/page.tsx",
    ...["TouchlineCoachCategoryShowcase", "ClubHubCanonicalCoachPanel", "ClubHubMatchdayTechnicalArea", "ClubHubOfficialLineup", "ClubHubOutsideMatchRoster", "ClubHubSquadGrid", "ClubHubLiveFixtureScore", "TouchlineOfficialLeagueTable", "club-hub/ClubHubNextFixtureCard", "club-hub/ClubHubSectionNavigation"].map(name => `components/touchline/${name}.tsx`)];
  const targets = new Set(["TouchlineEliteExactCard", "TouchlineCardZoom", "TouchlineCoachCardZoom", "TouchlineGameweekCard", "TouchlineBrandHeader", "TouchlineGlobalNavigation", "ClubShowcase", "TouchlineCoachCategoryShowcase", "ClubHubBrandHeader", "ClubHubLineupSection", "ClubHubTechnicalSections", "ClubHubOfficialLeagueSection", "ClubHubHeroNextMatch", "ClubHubHomeStadiumIdentity", "ClubHubOfficialLineup", "ClubHubMatchdayTechnicalArea", "ClubHubCanonicalCoachPanel", "ClubHubOutsideMatchRoster", "ClubHubSquadGrid", "ClubHubLiveFixtureScore", "TouchlineOfficialLeagueTable", "ClubHubNextFixtureCard", "ClubHubSectionNavigation"]);
  let checked = 0;
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node: ts.Node) {
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && targets.has(node.tagName.getText(ast))) {
        const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
        assert.equal(attributes.find(attr => attr.name.getText(ast) === "draftLocalesEnabled")?.initializer?.getText(ast), "{draftLocalesEnabled}", `${file}:${node.tagName.getText(ast)}`);
        if (node.tagName.getText(ast) === "TouchlineEliteExactCard") assert.ok(attributes.some(attr => attr.name.getText(ast) === "runtimeLocaleOverride"));
        checked++;
      }
      node.forEachChild(visit);
    }
    visit(ast);
    if (file.startsWith("app/")) {
      assert.match(source, /<main dir="ltr"/);
      const route = file === "app/touchline-clubs/page.tsx" ? "/touchline-clubs" : "/touchline-clubs/[club]";
      assert.ok(source.includes(`isTouchLineSiteLocalesEnabled("${route}")`), "public wrapper reads its server-owned route policy");
      assert.match(source, /return render(?:TouchlineClubs|ClubHub)Page\(props, isTouchLineSiteLocalesEnabled\(/);
    }
  }
  assert.ok(checked >= 30);
});
