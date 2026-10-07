import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatTouchlineLocalKickoff } from "../lib/touchlineArena/local-kickoff.ts";
import { getTouchlineClubHubFixtureCopy } from "../lib/touchlineArena/club-hub-fixture-i18n.ts";
import { getTouchlineOfficialLeagueTableCopy } from "../lib/touchlineArena/official-league-table-i18n.ts";
import { getTouchlineClubHubShareCopy } from "../lib/touchlineArena/club-hub-share-i18n.ts";
import { getTouchlineClubHubLikeCopy } from "../lib/touchlineArena/club-hub-like-i18n.ts";

const component = readFileSync(new URL("../components/touchline/club-hub/ClubHubPremiumPrototype.tsx", import.meta.url), "utf8");
const nextFixture = readFileSync(new URL("../components/touchline/club-hub/ClubHubNextFixtureCard.tsx", import.meta.url), "utf8");
const leagueTable = readFileSync(new URL("../components/touchline/TouchlineOfficialLeagueTable.tsx", import.meta.url), "utf8");
const leagueTableStyles = readFileSync(new URL("../components/touchline/TouchlineOfficialLeagueTable.module.css", import.meta.url), "utf8");
const styles = readFileSync(new URL("../components/touchline/club-hub/ClubHubPremiumPrototype.module.css", import.meta.url), "utf8");
const shareButton = readFileSync(new URL("../components/touchline/club-hub/ClubHubShareButton.tsx", import.meta.url), "utf8");
const nativeShare = readFileSync(new URL("../lib/touchlineArena/social-native-share.ts", import.meta.url), "utf8");
const likeButton = readFileSync(new URL("../components/touchline/club-hub/ClubHubLikeButton.tsx", import.meta.url), "utf8");
const gameweekCard = readFileSync(new URL("../components/touchline/fantasy/TouchlineGameweekCard.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/visual-qa/clubhub-premium-redesign/page.tsx", import.meta.url), "utf8");
const snapshot = readFileSync(new URL("../app/visual-qa/clubhub-premium-redesign/qa-canonical-snapshot.json", import.meta.url), "utf8");

test("ClubHub redesign is isolated behind a local visual-QA route", () => {
  assert.match(page, /ClubHubPremiumPrototype/);
  assert.match(page, /index: false, follow: false/);
  assert.match(page, /TOUCHLINE_CLUBHUB_VISUAL_QA_LIVE_READ/);
  assert.match(page, /liveReadsEnabled \? loadTouchlineOfficialLeagueTable\(\) : Promise\.resolve\(null\)/);
});

test("ClubHub redesign gives the canonical timeline the primary content position", () => {
  assert.match(component, /The \{clubDisplayName\} feed/);
  assert.match(component, /Newest verified publication first/);
  assert.match(component, /Internal surfaces first/);
  assert.match(component, /Instagram and Facebook follow only after their separate gate/);
  assert.match(component, /Central TouchLine/);
  assert.match(component, /Instagram/);
  assert.match(component, /Facebook/);
  assert.match(component, /ClubOwner/);
  assert.match(component, /\{clubDisplayName\} ClubHub/);
  assert.match(component, /All ClubOwners/);
  assert.match(component, /TouchLine Social/);
});

test("every ClubHub post exposes like and native sharing without controlling automatic delivery", () => {
  assert.equal((component.match(/<ClubHubShareButton/g) ?? []).length, 3);
  assert.equal((component.match(/<ClubHubLikeButton/g) ?? []).length, 3);
  assert.match(component, /feed\.items\.map/);
  assert.match(component, /aria-label="Post actions"/);
  assert.match(shareButton, /shareTouchlinePost/);
  assert.match(nativeShare, /navigator\.share/);
  assert.match(nativeShare, /navigator\.clipboard\.writeText/);
  assert.match(nativeShare, /`\$\{input\.text\}\\n\\n\$\{input\.pageUrl\}`/);
  assert.match(nativeShare, /files: \[image\]/);
  assert.match(nativeShare, /navigator\.canShare\(filePayload\)/);
  assert.match(shareButton, /getTouchlineClubHubShareCopy\(locale\)/);
  assert.match(shareButton, /copy\.unavailable/);
  assert.match(shareButton, /copy\.idle/);
  assert.equal(getTouchlineClubHubShareCopy("en-GB").unavailable, "Sharing unavailable");
  assert.equal(getTouchlineClubHubShareCopy("en-GB").idle, "Share post");
  assert.match(likeButton, /aria-pressed=\{liked\}/);
  assert.match(likeButton, /getTouchlineClubHubLikeCopy\(locale\)/);
  assert.match(likeButton, /aria-label=\{liked \? copy\.unlike : copy\.like\}/);
  assert.equal(getTouchlineClubHubLikeCopy("en-GB").unlike, "Unlike post");
  assert.equal(getTouchlineClubHubLikeCopy("en-GB").like, "Like post");
  assert.doesNotMatch(component, /Open discussion preview/);
});

test("one local FULL_TIME artifact proves exact two-club fan-out without duplication", () => {
  assert.match(page, /readTouchlineFullTimeVisualQaPreview/);
  assert.match(page, /requestedClub === "chelsea"/);
  assert.match(component, /data-clubhub-preview="full-time"/);
  assert.match(component, /data-fanout-targets/);
  assert.match(component, /SAME CANONICAL POST/);
  assert.match(component, /fullTimePost\.draft\.home\.name\} ClubHub/);
  assert.match(component, /fullTimePost\.draft\.away\.name\} ClubHub/);
  assert.match(page, /NOT A FOOTBALL CLAIM/);
  assert.match(page, /Positions may change as the remaining Gameweek fixtures are completed/);
});

test("next fixture keeps club names and the score clean without duplicating the league table", () => {
  assert.match(component, /homePosition=\{nextFixture\.homePosition\}/);
  assert.match(component, /awayPosition=\{nextFixture\.awayPosition\}/);
  assert.match(nextFixture, /showPositions = false/);
  assert.doesNotMatch(nextFixture, /positionLabel/);
  assert.match(nextFixture, /clubhub-next-fixture-post/);
  assert.match(nextFixture, /height=\{64\}/);
  assert.match(nextFixture, /rail\.state !== "finished"/);
  assert.doesNotMatch(nextFixture, /Verified result/);
  assert.doesNotMatch(component, /leagueTable=\{table\}/);
  assert.doesNotMatch(nextFixture, /Scrollable Premier League table/);
  assert.doesNotMatch(nextFixture, /leagueTable\.rows\.map/);
});

test("status rail uses verified coach and club-leading card instead of duplicating latest post", () => {
  assert.match(component, /Current verified coach/);
  assert.match(component, /Club-leading TouchLine card/);
  assert.match(component, /clubLeader\.totalRating\.toFixed\(2\)/);
  assert.match(component, /TouchlineCoachCardZoom/);
  assert.match(component, /TouchlineGameweekCard card=\{clubLeader\.card\}/);
  assert.match(gameweekCard, /const useLiveCompactAsset = resolvedDisplayWidth <= 119/);
  assert.match(gameweekCard, /optimizeForLiveCompact=\{useLiveCompactAsset\}/);
  assert.match(gameweekCard, /Public profile links use TouchLine presentation identity only/);
  assert.doesNotMatch(gameweekCard, /touchlinePlayerProfileHref\(exact/);
  assert.match(component, /data-clubhub-card-spotlight="coach"/);
  assert.match(component, /data-clubhub-card-spotlight="club-leader"/);
  assert.match(page, /touchlineLiveCoachForTeam\(club\.teamId\)/);
  assert.match(page, /createTouchlineArenaCoachSlot\(canonicalCoach\.coach, null, coachClassification\.tierKey\)/);
  assert.match(page, /canonicalCoach\.coach\.displayName === qaSnapshot\.coach\.name/);
  assert.match(page, /previewLeader && selectedLeader[\s\S]*previewLeader\.card\.canonicalPlayerId === selectedLeader\.canonicalPlayerId/);
  assert.doesNotMatch(component, /<span>Latest club post<\/span>/);
  assert.match(snapshot, /"name": "Mikel Arteta"/);
  assert.match(snapshot, /"name": "Bukayo Saka"/);
  assert.match(snapshot, /"totalRating": 15\.5/);
});

test("ClubHub keeps provider IDs and decorative crest wrappers out of public presentation", () => {
  assert.match(component, /publicProfileSlug\(clubCoach\.card\.coach\.displayName\)/);
  assert.doesNotMatch(component, /touchline-coaches\/\$\{encodeURIComponent\(clubCoach\.card\.coach\.providerId\)/);
  assert.match(component, /className=\{styles\.crestVisual\}/);
  assert.doesNotMatch(styles, /clubhubTrace|conic-gradient\(from var\(--clubhub-trace\)/);
  assert.doesNotMatch(styles, /\.crestVisual\s*\{[^}]*border(?:-radius)?\s*:/s);
  assert.doesNotMatch(styles, /\.crestVisual\s*\{[^}]*background\s*:/s);
});

test("the Arsenal preview is data-driven as the reusable model for every ClubHub", () => {
  assert.match(component, /club\.heroImageUrl/);
  assert.match(component, /club\.logoUrl/);
  assert.match(component, /club\.teamId/);
  assert.match(component, /club\.name/);
  assert.match(component, /clubDisplayName/);
  assert.match(page, /club=\{\{/);
  assert.doesNotMatch(component, /const CLUB_LOGO/);
  assert.doesNotMatch(component, /const STADIUM/);
  assert.doesNotMatch(component, /teamId === "19"/);
});

test("ClubHub prototype fails closed instead of inventing football facts", () => {
  assert.match(component, /homeTeam=\{nextFixture\.homeTeam\}/);
  assert.match(component, /awayTeam=\{nextFixture\.awayTeam\}/);
  assert.match(nextFixture, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  assert.equal(getTouchlineClubHubFixtureCopy("en-GB").localTime, "Your local time");
  assert.equal(getTouchlineClubHubFixtureCopy("pt-BR").localTime, "Seu horário local");
  assert.match(nextFixture, /const copy = getTouchlineClubHubFixtureCopy\(locale, draftLocalesEnabled\)/);
  assert.match(nextFixture, /\$\{copy\.localTime\} · \$\{localKickoff\.zoneName\}/);
  assert.match(nextFixture, /homeTeam\.logoUrl/);
  assert.match(nextFixture, /awayTeam\.logoUrl/);
  assert.equal(getTouchlineClubHubFixtureCopy("en-GB").venuePending, "Venue under verification");
  assert.equal(getTouchlineClubHubFixtureCopy("pt-BR").venuePending, "Estádio em verificação");
  assert.match(nextFixture, /venueName \?\? copy\.venuePending/);
  assert.match(nextFixture, /data-state=\{venueName \? "verified" : "pending"\}/);
  assert.match(page, /x-vercel-ip-timezone/);
  assert.match(page, /nextFixture=\{\{ \.\.\.qaSnapshot\.nextFixture, homePosition: arsenalPosition, awayPosition: chelseaPosition \}\}/);
  assert.match(component, /<TouchlineOfficialLeagueTable/);
  assert.equal(getTouchlineOfficialLeagueTableCopy("en-GB").unavailableTitle, "Official standings are temporarily unavailable.");
  assert.equal(getTouchlineOfficialLeagueTableCopy("pt-BR").unavailableTitle, "A tabela oficial está temporariamente indisponível.");
  assert.match(leagueTable, /title: dictionary\.unavailableTitle/);
  assert.equal(getTouchlineOfficialLeagueTableCopy("en-GB").unavailableDescription, "No league position is shown until TouchLine can verify the canonical result set again.");
  assert.equal(getTouchlineOfficialLeagueTableCopy("pt-BR").unavailableDescription, "Nenhuma posição é exibida até a TouchLine verificar novamente o conjunto canônico de resultados.");
  assert.match(leagueTable, /description: dictionary\.unavailableDescription/);
  assert.match(component, /No draft, simulated result or unverified message is substituted/);
  assert.doesNotMatch(component, /SportMonks|API\/provider|provider wording/i);
});

test("next fixture kick-off follows the visitor time zone", () => {
  const startsAt = "2026-09-06T15:30:00+00:00";
  assert.equal(formatTouchlineLocalKickoff(startsAt, "Europe/Malta")?.time, "17:30");
  assert.equal(formatTouchlineLocalKickoff(startsAt, "Europe/Malta")?.date, "6 Sep");
  assert.equal(formatTouchlineLocalKickoff(startsAt, "Europe/Malta", "pt-BR")?.date, "6 set");
  assert.equal(formatTouchlineLocalKickoff(startsAt, "America/Sao_Paulo")?.time, "12:30");
  assert.equal(formatTouchlineLocalKickoff("not-a-date", "America/Sao_Paulo"), null);
});

test("every ClubHub keeps the same compact official table and squad modules", () => {
  assert.match(component, /Permanent TouchLine module/);
  assert.match(component, /<TouchlineOfficialLeagueTable/);
  assert.match(component, /variant="profile"/);
  assert.match(component, /currentTeamId=\{club\.teamId\}/);
  assert.equal(getTouchlineOfficialLeagueTableCopy("en-GB").title, "Official League Table");
  assert.equal(getTouchlineOfficialLeagueTableCopy("pt-BR").title, "Tabela Oficial da Liga");
  assert.match(leagueTable, /getTouchlineOfficialLeagueTableCopy\(locale, draftLocalesEnabled\)/);
  assert.match(leagueTable, /\{dictionary\.title\}/);
  assert.equal(getTouchlineOfficialLeagueTableCopy("en-GB").scrollLabel, "Scrollable league table, 20 clubs");
  assert.equal(getTouchlineOfficialLeagueTableCopy("pt-BR").scrollLabel, "Tabela rolável da liga, 20 clubes");
  assert.match(leagueTable, /const scrollLabel = dictionary\.scrollLabel/);
  assert.match(leagueTableStyles, /\.profile \.tableWrap\s*\{[\s\S]*?max-height:[\s\S]*?overflow-y: auto/);
  assert.match(component, /Official squad/);
  assert.match(component, /Goalkeepers/);
  assert.match(component, /Defenders/);
  assert.match(component, /Midfielders/);
  assert.match(component, /Forwards/);
  assert.match(component, /Awaiting canonical squad/);
  assert.match(page, /loadTouchlineOfficialLeagueTable/);
  assert.match(page, /readPublicPremierSquad/);
  assert.match(page, /readTouchlineClubSocialFeed/);
  assert.match(page, /qa-canonical-snapshot\.json/);
  assert.match(component, /QA READ-ONLY SNAPSHOT/);
  assert.match(component, /Last verified/);
});

test("the compact table is the first module directly below the ClubHub navigation", () => {
  const navigationEnd = component.indexOf("</header>");
  const tableStart = component.indexOf("<TouchlineOfficialLeagueTable", navigationEnd);
  const statusStart = component.indexOf("<section className={styles.statusRail}", navigationEnd);
  const timelineStart = component.indexOf("<section className={styles.timeline}", navigationEnd);

  assert.ok(navigationEnd >= 0 && tableStart > navigationEnd);
  assert.ok(tableStart < statusStart && tableStart < timelineStart);
  assert.equal((component.match(/<TouchlineOfficialLeagueTable/g) ?? []).length, 1);
});

test("the live feed stays light without deleting its audit history", () => {
  assert.match(component, /Fourteen-day active window/);
  assert.match(component, /at most twelve verified posts/);
  assert.match(component, /audit tombstone/);
  assert.match(component, /View earlier verified posts/);
  assert.match(page, /limit: 12/);
  assert.match(page, /feedCursor/);
  assert.doesNotMatch(component, /delete older publications/i);
});

test("ClubHub redesign preserves keyboard, mobile and reduced-motion contracts", () => {
  assert.match(component, /aria-label="ClubHub sections"/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width: 460px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
