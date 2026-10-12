import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getTouchlineFantasyMarketAccessCopy } from "../lib/touchlineFantasy/market-access-i18n.ts";
import { getTouchlineFantasyMarketWorkflowCopy } from "../lib/touchlineFantasy/market-workflow-i18n.ts";

const client = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/fantasy/fantasy.module.css", import.meta.url), "utf8");
const socialStyles = readFileSync(new URL("../components/touchline/social/TouchlineSocial.module.css", import.meta.url), "utf8");
const gameweekCard = readFileSync(new URL("../components/touchline/fantasy/TouchlineGameweekCard.tsx", import.meta.url), "utf8");

test("Arena preserves the football field proportion instead of stretching to the screen", () => {
  const rule = styles.match(/\.myClubCommand\.arenaOverlay\[data-fantasy-context="market"\] \.myClubPitchViewport \.myClubTacticalPitch\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /aspect-ratio:\s*105\s*\/\s*68/);
  assert.match(rule, /height:\s*auto/);
  assert.doesNotMatch(rule, /(?:^|;)\s*height:\s*100%/);
});

test("Arena removes the decorative frame and background and reserves coach space without another box", () => {
  assert.match(styles, /\.myClubCommand\.arenaOverlay\[data-fantasy-context="market"\] \.myClubTacticalPitch \{ border: 0; border-radius: 0; box-shadow: none; background: transparent !important; overflow: visible; \}/);
  assert.match(styles, /\.myClubCommand\.arenaOverlay\[data-fantasy-context="market"\] \.myClubTacticalPitch::after \{ content: none; display: none; \}/);
  assert.match(styles, /100dvh - 150px/);
  assert.match(styles, /\.arenaOverlay \.myClubPitchViewport \{[^}]*padding-top: 60px/);
  assert.match(styles, /\.arenaOverlay \.myClubSquad \{[^}]*border: 1px solid #a3c94b/);
  assert.doesNotMatch(client, /styles\.arenaTechnicalArea/);
});

test("Arena measures the pitch rather than the coach when sizing players", () => {
  assert.ok(client.includes('querySelector<HTMLElement>(`.${styles.myClubTacticalPitch}`)'));
  assert.doesNotMatch(client, /pitchViewportRef\.current\?\.firstElementChild/);
});

test("Market preserves its ClubOwner photo, name, market power and points", () => {
  const market = readFileSync(new URL("../app/clubowner/page.tsx", import.meta.url), "utf8");
  const header = readFileSync(new URL("../components/touchline/ClubOwnerMarketHeader.tsx", import.meta.url), "utf8");
  const start = client.indexOf('data-market-owner-metrics="true"');
  const end = client.indexOf('</dl>', start);
  assert.ok(start >= 0 && end > start, "Live account metrics remain above the XI");
  const area = client.slice(start, end);

  assert.match(market, /resolveTouchlineClubOwnerPageIdentity\(user, undefined, avatarContext\?\.avatarUrl\)/);
  assert.match(market, /<ClubOwnerMarketHeader owner=\{clubOwner\?\.isAuthenticatedClubOwner \? clubOwner : null\}/);
  assert.match(market, /remainingMarketPower=\{remainingMarketPower\} realUnlimited=\{realUnlimited\}/);
  assert.match(market, /Math\.max\(0, marketAccess\.budgetEur - \(snapshot\.userGameweek\?\.totalMarketValueEur \?\? 0\)\)/);
  assert.match(header, /<Image src=\{owner\?\.avatarUrl \|\| "\/icons\/touchline-512\.png"\}/);
  assert.match(header, /owner\?\.name/);
  assert.match(header, /copy\.marketPower/);
  assert.doesNotMatch(client, /data-market-club-owner-area/);
  assert.doesNotMatch(area, /marketMetricsCopy\.remainingBudget/);
  assert.match(area, /\(live\?\.gameweekScore \?\? snapshot\.gameweekScore\)\.toFixed\(2\)/);
  assert.match(area, /\(live\?\.seasonScore \?\? snapshot\.seasonScore\)\.toFixed\(2\)/);
  assert.equal((area.match(/href=\{`\/rankings\?lang=/g) ?? []).length, 2);
});

test("Market cards fit their real container without changing pitch or zoom scale", () => {
  assert.match(client, /displayWidth=\{126\} fitContainer/);
  assert.match(gameweekCard, /fitContainer = false/);
  assert.match(gameweekCard, /staticRenderScale=\{fitContainer \? undefined : resolvedDisplayWidth \/ 430\}/);
  assert.match(gameweekCard, /staticRenderScale=\{390 \/ 430\}/);
  assert.match(client, /compact displayWidth=\{pitchCardWidth\} replacementAction=/);
  assert.match(styles, /\.myClubMarketResults article\{height:100%;grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(styles, /\.myClubCardRows article\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test("My Club renders a pitch-first command centre instead of the Gameweek wizard", () => {
  assert.match(client, /if \(embedded\) \{/);
  assert.match(client, /className=\{styles\.myClubCommand\}/);
  assert.match(client, /<ArenaView expanded=\{arenaOpen\}/);
  assert.match(client, /className=\{styles\.myClubMarket\}/);
  assert.equal(getTouchlineFantasyMarketAccessCopy("en-GB").lineupWindow, "LINEUP WINDOW");
  assert.match(client, /const marketAccessCopy = getTouchlineFantasyMarketAccessCopy\(locale, draftLocalesEnabled\)/);
  assert.match(client, /<span>\{marketAccessCopy\.lineupWindow\}<\/span>/);
  assert.match(client, /<MarketWindowClock gameweeks=\{gameweeks\} locale=\{locale\} draftLocalesEnabled=\{draftLocalesEnabled\} \/>/);
  assert.match(client, /replaceTouchlineFantasyPlayerAtSlot/);
  assert.ok(client.indexOf("if (embedded) {") < client.indexOf('className={styles.shell}'));
});

test("My Club opens the tactical field by default and keeps eligibility contextual", () => {
  assert.match(client, /useState<"squad" \| "tactical">\("tactical"\)/);
  assert.deepEqual([getTouchlineFantasyMarketWorkflowCopy("en-GB").viewTactical, getTouchlineFantasyMarketWorkflowCopy("pt-BR").viewTactical], ["View tactical layout", "Ver visão tática"]);
  assert.deepEqual([getTouchlineFantasyMarketWorkflowCopy("en-GB").arenaMode, getTouchlineFantasyMarketWorkflowCopy("pt-BR").arenaMode], ["Arena mode", "Modo Arena"]);
  assert.match(client, /arenaOpen \? workflowCopy\.closeArena : workflowCopy\.arenaMode/);
  assert.deepEqual([getTouchlineFantasyMarketWorkflowCopy("en-GB").pitchAria, getTouchlineFantasyMarketWorkflowCopy("pt-BR").pitchAria], ["Interactive tactical field", "Campo tático interativo"]);
  assert.match(client, /<TouchlinePitchSurface className=\{styles\.myClubTacticalPitch\} ariaLabel=\{workflowCopy\.pitchAria\}/);
  assert.match(client, /const openTacticalSelector = \(slotId: string\)/);
  assert.match(client, /setSquadView\("tactical"\)/);
  assert.match(client, /onClick=\{\(\) => openTacticalSelector\(slot\.id\)\}/);
  assert.match(client, /<TouchlinePitchSurface className=\{styles\.myClubTacticalPitch\}/);
  const embedded = client.slice(client.indexOf("if (embedded) {"), client.indexOf('className={styles.shell}'));
  assert.match(embedded, /<CompactClubSelector selectedTeamId=\{selectedPlayerClub\?\.teamId/);
  assert.match(embedded, /id="my-club-player-selection"/);
  assert.match(embedded, /scrollToLineupSection\("my-club-player-selection"\)/);
  assert.match(embedded, /scrollToLineupSection\("my-club-xi-pitch"\)/);
  // The requested non-overlap rule now sizes the artwork from actual pitch
  // dimensions. Geometry/label envelopes are exercised in market-browser tests.
  assert.match(embedded, /width: Math\.max\(44, pitchCardWidth\)/);
  assert.match(embedded, /"--touchline-card-static-scale": pitchCardWidth \/ 430/);
  assert.match(embedded, /className=\{styles\.myClubTacticalSlot\}/);
  assert.match(embedded, /data-pitch-edge=\{slot\.x >= 75 \? "end" : undefined\}/);
  assert.match(embedded, /<TouchlineGameweekCard card=\{card\} locale=\{locale\} draftLocalesEnabled=\{draftLocalesEnabled\} compact displayWidth=\{pitchCardWidth\} replacementAction=/);
  assert.doesNotMatch(embedded, /data-slot-action/);
  assert.match(embedded, /removalAction=\{selection \? \{ label: `\$\{workflowCopy\.remove\} · \$\{card\.name\}`/);
  assert.match(embedded, /className=\{styles\.emptyPosition\}[^\n]*onClick=\{\(\) => openTacticalSelector\(slot\.id\)\}/);
  assert.match(embedded, /selectMyClubPlayer\(card\)/);
  assert.doesNotMatch(embedded, /browseCards\.slice\(0, 10\)/);
  assert.match(embedded, /data-my-club-setup="coach"/);
  assert.match(embedded, /data-my-club-setup="formation"/);
  assert.deepEqual([getTouchlineFantasyMarketWorkflowCopy("en-GB").chooseYourCoach, getTouchlineFantasyMarketWorkflowCopy("pt-BR").chooseYourCoach], ["Choose your coach", "Escolha seu treinador"]);
  assert.match(embedded, /<h2>\{workflowCopy\.chooseYourCoach\}<\/h2>/);
  assert.deepEqual([getTouchlineFantasyMarketWorkflowCopy("en-GB").chooseFormation, getTouchlineFantasyMarketWorkflowCopy("pt-BR").chooseFormation], ["Choose formation", "Escolha a formação"]);
  assert.match(embedded, /<h2>\{workflowCopy\.chooseFormation\}<\/h2>/);
  assert.match(embedded, /browseCards\.map\(\(card\)/);
  assert.match(embedded, /<small>\{localizedPositionLabel\(card\.position, locale, draftLocalesEnabled\)\}<\/small><em>\{card\.clubName\}<\/em>/);
  assert.match(styles, /\.myClubCardRows\{display:grid/);
  assert.match(styles, /\.myClubCard\{display:block/);
  assert.match(styles, /\.myClubMarket\{display:grid/);
  assert.match(styles, /\.myClubMarketResults\{grid-template-columns:repeat\(2/);
  assert.match(styles, /\.myClubCommandGrid\{display:grid/);
  assert.doesNotMatch(styles, /data-touchline-pitch-boundary-run=true/);
  // Pitch players use the same visible perimeter animation as the coach.
  // Visibility/reduced-motion controls remain in the shared card system.
  assert.doesNotMatch(styles, /\.myClubTacticalPitch \[data-touchline-card-neon-trace(?:-run|-base)?=true\]/);
  assert.match(styles, /\.myClubTacticalSlot>span\{width:96px\}/);
  assert.match(styles, /@media\(max-width:1180px\)\{[\s\S]*?--touchline-card-static-scale:\.181395/);
  assert.match(styles, /\.myClubTacticalSlot\[data-pitch-edge=end\]>button\{right:calc\(50% \+ 43px\);left:auto\}/);
  assert.match(styles, /data-slot-action=replace\]::after\{content:"↻"\}/);
  assert.match(styles, /\.myClubMarket \.myClubSearch\{grid-column:1\/-1;width:min\(100%,620px\);justify-self:center\}/);
  assert.match(styles, /\.myClubMarket \.clubSelector\{align-content:start;grid-column:1\/-1;grid-template-columns:repeat\(10/);
  assert.match(styles, /\.myClubMarketResults\{grid-column:1\/-1;grid-template-columns:repeat\(5/);
  assert.match(styles, /\.myClubMarketResults article strong\{overflow:hidden;max-width:100%;color:#f7fff2/);
  assert.match(styles, /@media\(max-width:700px\).*?\.myClubCardRows\{grid-template-columns:repeat\(2/m);
});

test("My Club keeps the Arena cover visible while protecting owner identity readability", () => {
  assert.match(socialStyles, /clubowner-arena-neon-cover\.png/);
  assert.match(socialStyles, /\.commandHeader \.socialIdentity::before\s*\{\s*content:""; position:absolute; z-index:0/);
  assert.match(socialStyles, /radial-gradient\(ellipse at 22% 70%,rgba\(0,4,5,\.96\)/);
  assert.match(socialStyles, /width:min\(63%,900px\)/);
  assert.match(socialStyles, /\.commandHeader \.socialIdentity > \* \{ position:relative; z-index:1; \}/);
  assert.match(socialStyles, /\.commandHeader \.socialName h1 \{ text-shadow:/);
});
