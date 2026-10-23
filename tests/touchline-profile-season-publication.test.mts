import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { TOUCHLINE_PRESEASON_RANKING_STATE } from "../lib/touchlineArena/card-ranking-live.ts";
import { buildTouchlineCardLeadershipValue } from "../lib/touchlineArena/card-leadership-authority.ts";
import { projectClubPositionLeaders } from "../lib/touchlineArena/club-position-leaders.ts";
import type { TouchlineCardLeadershipAuthority } from "../lib/touchlineArena/card-leadership-authority.ts";
import { getTouchLineRankingsCopy } from "../lib/touchlineArena/rankings-i18n.ts";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const id = "10000000-0000-4000-8000-000000000001";
const id2 = "10000000-0000-4000-8000-000000000002";
const playerRanking = (totalRating: number | null, rank = 1) => ({ ...TOUCHLINE_PRESEASON_RANKING_STATE,
  phase: "ranked" as const, snapshotId: `snap-${totalRating}`, seasonId: "season", scoringVersion: "player_scoring_v4" as const,
  players: [{ playerId: id, providerPlayerId: "123", totalRating, positionGroup: "striker" as const, positionRank: rank,
    groupSize: 1, minutesPlayed: 90, appearances: 1, tierKey: "radiant-gold" as const, priceTc: 999 }],
});

// Actual React contexts and render derivation. Visual leafs are markers; this
// proves projection/wiring, not browser geometry or open-dialog lifecycle.
function fixture() {
  let authority: TouchlineCardLeadershipAuthority | null = null;
  const cache = new Map<string, unknown>();
  const h = React.createElement;
  const mocks: Record<string, unknown> = {
    "./TouchlineCardLeadershipProvider": { useTouchlineCardLeadershipAuthority: () => authority },
    "./cards/TouchlineCardLeadershipProvider": { useTouchlineCardLeadershipAuthority: () => authority },
    "@/components/touchline/cards/TouchlineCardLeadershipProvider": { useTouchlineCardLeadershipAuthority: () => authority },
    "@/components/touchline/cards/TouchlineEliteExactCard": { __esModule: true, default: () => null },
    "@/components/touchline/cards/TouchlineCardZoom": { __esModule: true, default: () => null },
    "@/components/touchline/cards/TouchlineCoachCardZoom": { __esModule: true, default: () => null },
    "./TouchlineEliteExactCard": { __esModule: true, default: ({ player, className }: { player: { totalRating: number | null }; className: string }) => h("i", { "data-card": className, "data-rating": player.totalRating ?? "missing" }) },
    "./TouchlineCardZoom": { __esModule: true, default: ({ children, expandedContent, details }: { children: React.ReactNode; expandedContent: React.ReactNode; details: { fields: { kind: string; value: string }[] } }) => h("section", { "data-zoom-total": details.fields.find(f => f.kind === "rating-total")?.value }, children, expandedContent, h("em", { "data-history": details.fields.find(f => f.kind === "history")?.value })) },
    "./social/TouchlineSocial": { TouchlineSocialFeed: ({ posts, highlights }: { posts: { id: string; badge: string; metrics: { value: string }[] }[]; highlights: { value: string }[] }) => h("section", {}, ...posts.map(p => h("div", { key: p.id, "data-post": p.id, "data-badge": p.badge, "data-metric": p.metrics[0].value })), h("b", { "data-highlight": highlights[0].value })) },
  };
  function load(spec: string, parent: string): unknown {
    if (mocks[spec]) return mocks[spec];
    if (!spec.startsWith(".") && !spec.startsWith("@/")) return require(spec);
    const base = spec.startsWith("@/") ? path.join(root, spec.slice(2)) : path.resolve(path.dirname(parent), spec);
    if (base.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    const file = [base, `${base}.ts`, `${base}.tsx`].find(existsSync)!;
    assert.ok(file, base);
    if (file.endsWith(".ts")) return require(file);
    if (cache.has(file)) return cache.get(file);
    const exports: Record<string, unknown> = {}; cache.set(file, exports);
    const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    runInNewContext(code, { exports, require: (s: string) => load(s, file), console, process: { env: {} } });
    return exports;
  }
  const base = path.join(root, "fixture.ts");
  const scope = load("@/components/touchline/cards/TouchlinePlayerSeasonScope", base) as typeof import("../components/touchline/cards/TouchlinePlayerSeasonScope.tsx");
  const Feed = (load("@/components/touchline/TouchlinePlayerSeasonFeed", base) as typeof import("../components/touchline/TouchlinePlayerSeasonFeed.tsx")).default;
  const Coach = load("@/components/touchline/TouchlineCoachProfilePublication", base) as typeof import("../components/touchline/TouchlineCoachProfilePublication.tsx");
  const player = { name: "Player", totalRating: 42, canonicalPlayerId: id };
  const details = { title: "Player", fields: [{ kind: "rating-total", value: "42" }, { kind: "history", value: "prior fixture 7.2" }] };
  const posts = [{ id: "current-card", kind: "official", title: "Official", body: "", meta: "", badge: "42 pts", metrics: [{ label: "Total", value: "42" }] }, { id: "historic", kind: "simulation", title: "Old", body: "", meta: "", badge: "38 pts", metrics: [{ label: "Total", value: "38" }] }];
  const original = JSON.stringify({ player, details, posts });
  return {
    setAuthority(value: TouchlineCardLeadershipAuthority | null) { authority = value; },
    renderPlayer(enabled = true, expectedSeasonId = "season", playerId: string | null = id) {
      const { TouchlinePlayerSeasonScope: Scope, TouchlineSeasonExactCard: Card, TouchlineSeasonCardZoom: Zoom, TouchlineSeasonValue: Value, TouchlineSeasonStat: Stat } = scope;
      const html = renderToStaticMarkup(h(Scope, { playerId, providerPlayerId: "123", seasonId: "season", enabled },
        h(Card, { player, className: "hero" } as never),
        h(Zoom, { ariaLabel: "Zoom", details, expandedContent: h(Card, { player, className: "expanded" } as never) } as never, h(Card, { player, className: "small" } as never)),
        h("span", { "data-slot": "total" }, h(Value, {}, "42")),
        h("span", { "data-slot": "rank" }, h(Value, { field: "positionRank" }, "#1")),
        h("span", { "data-slot": "group" }, h(Value, { field: "positionGroup", groupLabels: { striker: "Attacker" } }, "Attacker")),
        h("span", { "data-slot": "season" }, h(Value, { expectedSeasonId }, "42")),
        h("span", { "data-slot": "previous-season" }, "123"),
        h(Stat, { label: "Current total", seed: null, expectedSeasonId, unavailable: "—", availableClassName: "available", unavailableClassName: "unavailable" }),
        h(Feed, { posts, highlights: [{ label: "Total", value: "42" }], entityId: "player", accent: "lime", ratingPostId: "current-card", ratingHighlightIndex: 0, ratingBadgeSuffix: "pts", unavailable: "—" } as never)));
      assert.equal(JSON.stringify({ player, details, posts }), original); return html;
    },
    renderCoach() {
      return renderToStaticMarkup(h(Coach.TouchlineCoachProfilePublication, { coachProviderId: "42", seed: null, seasonLabel: "Season" },
        h("div", { "data-slot": "rank" }, h(Coach.TouchlineCoachProfileValue, { field: "rank" })),
        h("div", { "data-slot": "matches" }, h(Coach.TouchlineCoachProfileValue, { field: "matches" })),
        h(Coach.TouchlineCoachProfilePerformance, { locale: "en-GB" }),
        h(Coach.TouchlineCoachProfileCampaign, { locale: "en-GB" })));
    },
    renderCoachTable(seed: import("../lib/touchlineArena/coach-ranking-server").TouchLineCoachRankingState) {
      const Tables = load("@/app/rankings/touchline-tables-client", base) as typeof import("../app/rankings/touchline-tables-client.tsx");
      return renderToStaticMarkup(h(Tables.TouchlineCoachRankingTable, { coachRanking: seed, copy: getTouchLineRankingsCopy("en-GB"), locale: "en-GB" }));
    },
  };
}

test("player profile hero, small/expanded card, zoom, feed, current total and rank use one publication", () => {
  const view = fixture();
  for (const [total, rank] of [[50, 1], [41, 2], [0, 3], [null, 4], [50, 1]] as const) {
    view.setAuthority(buildTouchlineCardLeadershipValue(playerRanking(total, rank), null));
    const html = view.renderPlayer();
    for (const name of ["hero", "small", "expanded"]) assert.ok(html.includes(`data-card="${name}" data-rating="${total ?? "missing"}"`));
    assert.ok(html.includes(`data-zoom-total="${total ?? "—"}"`));
    assert.ok(html.includes(`data-highlight="${total ?? "—"}"`));
    assert.ok(html.includes(`data-badge="${total ?? "—"} pts" data-metric="${total ?? "—"}"`));
    for (const name of ["total", "season"]) assert.ok(html.includes(`data-slot="${name}">${total ?? "—"}</span>`));
    assert.ok(html.includes(`data-slot="rank">#${rank}</span>`));
    assert.match(html, /data-slot="previous-season">123/);
    assert.match(html, /data-post="historic" data-badge="38 pts" data-metric="38"/);
    assert.match(html, /data-history="prior fixture 7.2"/);
  }
});

test("profile seed/preview remain pinned; withdrawal is unavailable and season mismatch does not borrow a total", () => {
  const view = fixture();
  assert.match(view.renderPlayer(), /data-slot="total">42/);
  view.setAuthority(buildTouchlineCardLeadershipValue(playerRanking(50), null));
  const unresolved = view.renderPlayer(true, "season", null);
  assert.match(unresolved, /data-card="hero" data-rating="42"/);
  assert.match(unresolved, /data-zoom-total="42"/);
  assert.match(unresolved, /data-highlight="42"/);
  assert.match(view.renderPlayer(), /class="available"><small>Current total<\/small><strong>50/);
  assert.match(view.renderPlayer(false), /data-slot="total">42/);
  assert.match(view.renderPlayer(true, "old-season"), /data-slot="season">—/);
  view.setAuthority(buildTouchlineCardLeadershipValue(TOUCHLINE_PRESEASON_RANKING_STATE, null));
  assert.match(view.renderPlayer(), /data-slot="total">—/);
  assert.match(view.renderPlayer(), /data-slot="rank">—/);
  assert.match(view.renderPlayer(), /class="unavailable"><small>Current total<\/small><strong>—/);
});

test("coach profile rank, matches, performance and home/away campaign change as one accepted record", () => {
  const view = fixture();
  for (const [points, wins, draws, losses] of [[3, 1, 0, 0], [1, 0, 1, 0], [-2, 0, 0, 1], [0, 0, 0, 0]]) {
    const home = { wins, draws, losses, touchlinePoints: points }, away = { wins: 0, draws: 0, losses: 0, touchlinePoints: 0 };
    const coaches = { phase: "ranked" as const, snapshotId: `coach-${points}`, seasonId: "season", scoringVersion: "coach_scoring_v2" as const, fixtureIds: [], generatedAt: null,
      rows: [{ rank: 1, coachProviderId: "42", coachName: "Coach", clubName: "Club", touchlinePoints: points, wins, draws, losses, awayWins: 0, home, away }] };
    view.setAuthority(buildTouchlineCardLeadershipValue(playerRanking(50), coaches));
    const html = view.renderCoach();
    assert.match(html, /data-slot="rank">#1/);
    assert.ok(html.includes(`data-slot="matches">${wins + draws + losses}</div>`));
    assert.ok(html.includes(`class="totalValue">${points}<small>`));
    assert.ok(html.includes(`data-coach-competition-snapshot="coach-${points}"`));
  }
  view.setAuthority(buildTouchlineCardLeadershipValue(TOUCHLINE_PRESEASON_RANKING_STATE, null));
  const html = view.renderCoach();
  assert.match(html, /data-slot="rank">—/); assert.match(html, /data-coach-performance-source="unavailable"/);
  assert.doesNotMatch(html, /class="coach-profile-campaign"/);
});

test("coach table reselects the top seven from the whole publication, including an eighth-place newcomer and withdrawal", () => {
  const view = fixture();
  const record = { wins: 0, draws: 0, losses: 0, touchlinePoints: 0 };
  const rows = Array.from({ length: 8 }, (_, index) => ({ rank: index + 1, coachProviderId: String(index + 1), coachName: `Coach ${index}`,
    clubName: "Arsenal", touchlinePoints: 100 - index, wins: 0, draws: 0, losses: 0, awayWins: 0,
    home: { ...record, touchlinePoints: 100 - index }, away: record }));
  const seed = { phase: "ranked" as const, snapshotId: "coach-a", seasonId: "season", scoringVersion: "coach_scoring_v2" as const, fixtureIds: [], generatedAt: null, rows };
  for (const order of [rows, [rows[7], ...rows.slice(0, 7)], rows]) {
    const current = { ...seed, snapshotId: `coach-${order[0].coachName}`, rows: order.map((row, index) => ({ ...row, rank: index + 1, touchlinePoints: 100 - index, home: { ...record, touchlinePoints: 100 - index } })) };
    view.setAuthority(buildTouchlineCardLeadershipValue(playerRanking(50), current));
    const html = view.renderCoachTable(seed);
    assert.equal((html.match(/data-coach-rank=/g) ?? []).length, 7);
    assert.ok(html.indexOf(`<strong>${order[0].coachName}</strong>`) < html.indexOf(`<strong>${order[1].coachName}</strong>`));
    assert.ok(!html.includes(`<strong>${order[7].coachName}</strong>`));
  }
  view.setAuthority(buildTouchlineCardLeadershipValue(TOUCHLINE_PRESEASON_RANKING_STATE, null));
  assert.doesNotMatch(view.renderCoachTable(seed), /data-coach-rank=/);
});

test("club leaders move name, rank and card together with canonical tie breaks; memberships stay pinned", () => {
  const first = { id, canonicalPlayerId: id, providerPlayerId: "123", name: "A", seasonTotalRating: 42 };
  const second = { ...first, id: id2, canonicalPlayerId: id2, providerPlayerId: "456", name: "B" };
  const seed = playerRanking(50); const row = seed.players[0];
  for (const [firstTotal, secondTotal, winner] of [[50, 40, "A"], [39, 40, "B"], [40, 40, "A"]] as const) {
    const current = { ...seed, players: [{ ...row, totalRating: firstTotal }, { ...row, playerId: id2, providerPlayerId: "456", totalRating: secondTotal, positionRank: 2 }] };
    const view = projectClubPositionLeaders([first, second] as never, current).find(g => g.key === "attacker")!.leader!;
    assert.equal(view.card.name, winner); assert.equal(view.card.seasonTotalRating, winner === "A" ? firstTotal : secondTotal);
    assert.equal(view.card.publishedRanking.snapshotId, current.snapshotId);
  }
  assert.ok(projectClubPositionLeaders([first, second] as never, TOUCHLINE_PRESEASON_RANKING_STATE).every(g => !g.leader));
  assert.ok(projectClubPositionLeaders([{ ...first, providerPlayerId: "wrong" }] as never, seed).every(g => !g.leader));
});
