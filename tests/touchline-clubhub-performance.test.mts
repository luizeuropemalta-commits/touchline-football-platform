import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import {
  getTouchlineClubTrophyAssets,
  TOUCHLINE_CLUB_TROPHY_MANIFEST,
} from "../lib/touchlineArena/club-trophy-manifest.ts";

const clubsPage = readFileSync(new URL("../app/touchline-clubs/page.tsx", import.meta.url), "utf8");
const clubPage = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/football-data/premier-squad/route.ts", import.meta.url), "utf8");
const reader = readFileSync(new URL("../lib/football-data/public-premier-squad-server.ts", import.meta.url), "utf8");
const pending = readFileSync(new URL("../components/touchline/ClubHubNavigationPending.tsx", import.meta.url), "utf8");
const cardLink = readFileSync(new URL("../components/touchline/ClubHubCardLink.tsx", import.meta.url), "utf8");
const fullPageLoadingBoundary = new URL("../app/touchline-clubs/[club]/loading.tsx", import.meta.url);
const trophyCarousel = readFileSync(new URL("../components/touchline/ClubTrophyCarousel.tsx", import.meta.url), "utf8");

function publicPath(assetUrl: string) {
  return path.join(process.cwd(), "public", decodeURIComponent(assetUrl));
}

test("Club selection keeps feedback local and streams meaningful destination content", () => {
  assert.match(clubsPage, /<ClubHubCardLink/);
  assert.match(cardLink, /<Link/);
  assert.match(cardLink, /prefetch={false}/);
  assert.match(cardLink, /onClick={handleClick}/);
  assert.match(cardLink, /event\.button !== 0/);
  assert.match(cardLink, /event\.metaKey/);
  assert.match(cardLink, /hasAttribute\("download"\)/);
  assert.match(cardLink, /target !== "_self"/);
  assert.match(cardLink, /window\.addEventListener\("pageshow", resetPending\)/);
  assert.match(cardLink, /pendingState\.pathname === pathname/);
  assert.match(cardLink, /PENDING_FAILSAFE_MS/);
  assert.match(cardLink, /PENDING_SETTLE_GRACE_MS/);
  assert.match(cardLink, /onPendingSettled=\{schedulePendingReset\}/);
  assert.doesNotMatch(cardLink, /useRouter|router\.push|preventDefault/);
  assert.match(pending, /useLinkStatus\(\)/);
  assert.match(pending, /const active = forcePending \|\| pending/);
  assert.match(pending, /data-pending=\{active \? "true" : "false"\}/);
  assert.match(pending, /aria-live="polite"/);
  assert.match(pending, /aria-busy=\{active\}/);
  assert.match(pending, /onPendingSettled\?\.\(\)/);
  assert.doesNotMatch(pending, /useRouter|router\.push|preventDefault/);
  assert.equal(existsSync(fullPageLoadingBoundary), false);
  assert.match(clubPage, /<Suspense fallback=\{<ClubHubDeferredSection size="lineup"/);
  assert.match(clubPage, /club-hub-deferred-lineup/);
  assert.match(clubPage, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(clubPage, /ClubHubLoading|loading\.module\.css/);
});

test("ClubHub starts independent loaders together and begins season points as soon as the squad resolves", () => {
  assert.match(clubPage, /const squadLoadPromise = traceClubHubLoader/);
  assert.match(clubPage, /const matchSnapshotPromise = traceClubHubLoader/);
  assert.match(clubPage, /const formationGeometryPromise = traceClubHubLoader/);
  assert.match(clubPage, /const seasonPointsPromise = squadLoadPromise\.then/);
  assert.match(clubPage, /Promise\.all\(\[\s*squadLoadPromise,\s*matchSnapshotPromise,\s*formationGeometryPromise,\s*seasonPointsPromise,/s);
  assert.match(clubPage, /const presentationPromise = loadClubHubPresentation/);
  assert.match(clubPage, /const viewerAccessPromise = loadClubHubViewerAccess/);
  assert.match(clubPage, /const tablePromise = traceClubHubLoader/);
});

test("ClubHub and the public endpoint consume one server-only persisted squad reader", () => {
  assert.match(reader, /^import "server-only";/);
  assert.match(clubPage, /readPublicPremierSquad\(club\.teamId\)/);
  assert.doesNotMatch(clubPage, /fetchTouchlineInternalJson|\/api\/football-data\/premier-squad/);
  assert.match(route, /readPublicPremierSquad\(url\.searchParams\.get\("teamId"\)\)/);
  assert.match(route, /NextResponse\.json\(result\.body/);
  assert.match(reader, /readPersistedSquadSnapshot\(teamId\)/);
  assert.doesNotMatch(reader, /NextResponse|new Response|cookies\(|headers\(|fetch\s*\(|createFootballDataProvider/);
});

test("Route and Server Component preserve the same canonical payload contract", () => {
  assert.match(reader, /export type PublicPremierSquadPayload = ReturnType<typeof squadPayload>/);
  assert.match(reader, /rosterPlayers: sortedPlayers/);
  assert.match(reader, /players,/);
  assert.match(reader, /pendingPlayers,/);
  assert.match(reader, /canonicalProjectionState: projection\.state/);
  assert.match(clubPage, /payload\.rosterPlayers \?\? payload\.players/);
  assert.doesNotMatch(route, /squadPayload|mapPersistedSquadPlayer|projectSquadForPublic/);
});

test("every tracked trophy has one bounded WebP and AVIF derivative with PNG fallback", async () => {
  let assetCount = 0;
  let maximumBytes = 0;
  for (const [clubSlug, files] of Object.entries(TOUCHLINE_CLUB_TROPHY_MANIFEST)) {
    const honours = getTouchlineClubTrophyAssets({ shortCode: "UNKNOWN", clubSlug });
    assert.equal(honours.length, files.length);
    for (const honour of honours) {
      assert.ok(existsSync(publicPath(honour.imageUrl)), honour.imageUrl);
      for (const sourceUrl of [honour.imageSources.avif, honour.imageSources.webp]) {
        const filePath = publicPath(sourceUrl);
        assert.ok(existsSync(filePath), sourceUrl);
        const bytes = statSync(filePath).size;
        maximumBytes = Math.max(maximumBytes, bytes);
        assert.ok(bytes < 100_000, `${sourceUrl} is ${bytes} bytes`);
        const metadata = await sharp(filePath).metadata();
        assert.ok((metadata.width ?? 0) <= 256 && (metadata.height ?? 0) <= 256, sourceUrl);
        assetCount += 1;
      }
    }
  }

  assert.equal(assetCount, 242);
  assert.ok(maximumBytes < 100_000);
  assert.match(trophyCarousel, /<picture>/);
  assert.match(trophyCarousel, /type="image\/avif"/);
  assert.match(trophyCarousel, /type="image\/webp"/);
  assert.match(trophyCarousel, /loading="lazy"/);
  assert.match(trophyCarousel, /decoding="async"/);
  assert.match(trophyCarousel, /onError=\{\(\) => setUseOriginal\(true\)\}/);
});

test("each ClubHub first trophy page stays under the 400 KB critical image budget", () => {
  for (const clubSlug of Object.keys(TOUCHLINE_CLUB_TROPHY_MANIFEST)) {
    const firstPage = getTouchlineClubTrophyAssets({ shortCode: "UNKNOWN", clubSlug }).slice(0, 6);
    const bytes = firstPage.reduce((total, honour) => total + statSync(publicPath(honour.imageSources.avif)).size, 0);
    assert.ok(bytes < 400_000, `${clubSlug} first page is ${bytes} bytes`);
  }
});
