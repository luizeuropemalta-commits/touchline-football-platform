import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../lib/touchlineArena/card-publication-read-model.ts", import.meta.url),
  "utf8",
);
const squadRoute = readFileSync(
  new URL("../lib/football-data/public-premier-squad-server.ts", import.meta.url),
  "utf8",
);

test("the shared read model exposes only a published, current canonical card classification", () => {
  assert.match(source, /^import "server-only";/m);
  assert.match(source, /touchline_card_publications/);
  assert.match(source, /\.eq\("publication_status", "published"\)/);
  assert.match(source, /football_player_market_values/);
  assert.match(source, /football_squad_members/);
  assert.match(source, /text\(membership\.status\) !== "active"/);
  assert.match(source, /text\(value\.status\) !== "verified"/);
  assert.match(source, /text\(value\.confidence\) !== "verified"/);
  assert.match(source, /calculated_nominal_price_gbp/);
  assert.match(source, /currency: "GBP"/);
  assert.doesNotMatch(source, /calculated_price_tc/);
  assert.match(source, /unstable_noStore/);
  assert.doesNotMatch(source, /unstable_cache|revalidateTag/);
  assert.doesNotMatch(source, /fetch\s*\(|\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(/);
});

test("the shared publication policy chunks large canonical player sets before querying PostgREST", () => {
  assert.match(source, /const PLAYER_ID_QUERY_CHUNK_SIZE = 150/);
  assert.match(source, /readPublishedTouchlineCardsChunk/);
  assert.match(source, /Promise\.all\(chunks\.map/);
  assert.match(source, /chunkResults\.some\(\(result\) => result === null\)/);
});

test("the public Premier League roster asks the single publication policy instead of a local card catalogue", () => {
  assert.match(squadRoute, /loadTouchlinePublishedCardPresentations/);
  assert.doesNotMatch(squadRoute, /editorial-card-catalog|findTouchlineEditorialCardPresentation/);
});
