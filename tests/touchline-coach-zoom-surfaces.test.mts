import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("coach cards open the canonical zoom before the full profile on category, tables, and snapshot surfaces", () => {
  const category = source("components/touchline/TouchlineCoachCategoryShowcase.tsx");
  const tables = source("app/touchline-tables/touchline-tables-client.tsx");
  const snapshot = source("components/touchline/fantasy/TouchlineGameweekTeamSnapshot.tsx");

  for (const surface of [category, tables, snapshot]) {
    assert.match(surface, /TouchlineCoachCardZoom/);
    assert.match(surface, /profileHref=/);
  }

  assert.doesNotMatch(category, /<Link className=\{styles\.cardLink\} href=\{coachHref\}/);
  assert.doesNotMatch(tables, /<Link[\s\S]*?className=\{styles\.(?:gameweekCoachCardLink|topCoachCardLink)\}/);
  assert.match(snapshot, /competition=\{coach!\.competition\}/);
});

test("the card layout editor no longer accepts the removed share action", () => {
  const route = source("app/api/touchline-arena/card-layout-master/route.ts");
  const layout = JSON.parse(source("public/touchlineArena/card-layouts/master-shirt-back-layout.json"));

  assert.doesNotMatch(route, /"shareAction"/);
  assert.equal(layout.layout.shareAction, undefined);
});

test("coach zoom preserves canonical unknown discipline and optional published presentation", () => {
  const zoom = source("components/touchline/cards/TouchlineCoachCardZoom.tsx");
  const card = source("components/touchline/cards/TouchlineCoachCard.tsx");

  assert.match(zoom, /publishedTouchlinePoints=\{publishedTouchlinePoints\}/);
  assert.match(zoom, /showLeadershipCrown=\{showLeadershipCrown\}/);
  assert.match(card, /yellowCards === null && redCards === null[\s\S]*?\? "—"/);
  assert.match(card, /data-coach-discipline-source=\{yellowCards === null && redCards === null \? "unavailable" : "canonical"\}/);
});
