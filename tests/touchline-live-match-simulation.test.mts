import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const pitchSurfaceSource = readFileSync(
  new URL("../components/touchline/pitch/TouchlinePitchSurface.module.css", import.meta.url),
  "utf8",
);
const eliteCardSource = readFileSync(
  new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url),
  "utf8",
);
const coachCardSource = readFileSync(
  new URL("../components/touchline/cards/TouchlineCoachCard.tsx", import.meta.url),
  "utf8",
);
const livePageSource = readFileSync(
  new URL("../app/live/page.tsx", import.meta.url),
  "utf8",
);
const rankingClientSource = readFileSync(
  new URL("../lib/touchlineArena/card-ranking-client.ts", import.meta.url),
  "utf8",
);
const premierSquadReaderSource = readFileSync(
  new URL("../lib/football-data/public-premier-squad-server.ts", import.meta.url),
  "utf8",
);
const globalCssSource = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("persisted squad reads and shared compact cards retain identity and paint boundaries", () => {
  assert.match(premierSquadReaderSource, /readPersistedSquadSnapshot\(teamId\)/);
  assert.doesNotMatch(premierSquadReaderSource, /createFootballDataProvider|persistSquadSnapshot|preferSnapshot/);
  assert.match(eliteCardSource, /data-touchline-card-frame="true"/);
  assert.match(eliteCardSource, /data-club-crest-visual-scale/);
  assert.doesNotMatch(eliteCardSource, /data-card-sleeve-guard="official-tier-frame"/);
  assert.match(eliteCardSource, /data-live-card-compact-detail="true"/);
  assert.doesNotMatch(globalCssSource, /\[data-card-live-scale-mode=[^\]]+\] \[data-live-card-compact-detail="true"\][\s\S]*?display: none !important/);
  assert.doesNotMatch(eliteCardSource, /touchlineCardForegroundFrameUrl/);
  assert.match(eliteCardSource, /touchlineCardMetricText/);
  assert.match(eliteCardSource, /player\.totalRating === undefined/);
  assert.match(eliteCardSource, /const preseasonMissingValue = "—"/);
  assert.match(eliteCardSource, /return text \|\| "—"/);
  assert.match(eliteCardSource, /const \[useWebKitCompactPaintScale, setUseWebKitCompactPaintScale\] = useState\(false\)/);
  assert.match(eliteCardSource, /const isWebKitEngine =[\s\S]*?AppleWebKit[\s\S]*?Chrome\|Chromium\|Edg\|OPR\|SamsungBrowser/);
  assert.match(eliteCardSource, /useWebKitCompactPaintScale \? "atomic-transform" : "atomic-layout"/);
  assert.match(eliteCardSource, /zoom: hasStaticRenderScale[\s\S]*?optimizeForLiveCompact && !useWebKitCompactPaintScale[\s\S]*?\? scale/);
  assert.match(eliteCardSource, /hasStaticRenderScale[\s\S]*?`scale\(var\(--touchline-card-static-scale, \$\{scale\}\)\)`/);
  assert.match(eliteCardSource, /useWebKitCompactPaintScale \? `scale\(\$\{scale\}\)` : "none"/);
  assert.match(globalCssSource, /\[data-card-live-scale-mode="atomic-layout"\][\s\S]*?-webkit-text-size-adjust: none/);
  assert.doesNotMatch(globalCssSource, /@supports \(zoom: 1\)[\s\S]*?transform: none !important/);
});

test("shared card assets and ranking subscriptions retain bounded presentation contracts", () => {
  assert.match(eliteCardSource, /LIVE_COMPACT_CLUB_TEMPLATE_ROOT/);
  assert.match(eliteCardSource, /touchlineLiveCompactFrameUrl\(versionedCardTemplateUrl\)/);
  assert.match(eliteCardSource, /if \(!unversionedUrl\.startsWith\(clubTemplateRoot\)\) return unversionedUrl/);
  // Ranking leadership is shared state, not a per-card warm-up. Live cards may
  // subscribe so the leading card can receive the crown, while static callers
  // opt out through the same prop.
  assert.match(eliteCardSource, /useTouchlineActiveRanking\(!leadershipAuthority && subscribeToRanking\)/);
  assert.match(rankingClientSource, /subscribeToUpdates \? subscribe : subscribeWithoutUpdates/);
  assert.match(coachCardSource, /templates\/live-compact\/coaches/);
  assert.match(coachCardSource, /templates\/zoom\/coaches/);
  assert.match(
    rankingClientSource,
    /subscribeToUpdates \? getActiveRankingSnapshot : getPreseasonRankingSnapshot/,
  );
  assert.match(livePageSource, /initialLocale=\{initialLocale\}/);
  assert.match(livePageSource, /readPublicCompetitionFixtures\(\{ includeHistorical: true, limit: 240 \}\)[\s\S]*?selectTouchlineMatchCentreSchedule\(fixtures, initialNow\)/);
});

test("Premier squad responses carry the canonical team identity used by Live", () => {
  assert.match(premierSquadReaderSource, /clubTeamId,/);
  assert.match(premierSquadReaderSource, /teamId: metadata\.teamId/);
  assert.match(premierSquadReaderSource, /providerId: metadata\.teamId/);
  assert.match(premierSquadReaderSource, /teamId is not registered in TouchLine England/);
});

test("shared pitch retains its approved runtime image", () => {
  assert.match(pitchSurfaceSource, /official-live-pitch-960\.webp/);
});
