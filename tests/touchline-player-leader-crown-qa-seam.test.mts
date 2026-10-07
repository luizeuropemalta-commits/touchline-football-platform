import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { parseTouchlineActiveRankingState, touchlinePlayerCrownEligibility } from "../lib/touchlineArena/card-ranking-live.ts";
import { allowsInheritedCardLeadership } from "../lib/touchlineArena/card-leadership-authority.ts";

const cardSource = readFileSync(new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url), "utf8");
function resolve(pathname: string | null, payload: unknown, editable = false) {
  const ast = ts.createSourceFile("card.tsx", cardSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "resolveExplicitQaPlayerRanking");
  assert.ok(fn, "real card must expose its narrow QA ranking resolver");
  const exports: Record<string, (...args: unknown[]) => unknown> = {};
  runInNewContext(ts.transpileModule(fn.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, parseTouchlineActiveRankingState });
  return exports.resolveExplicitQaPlayerRanking(pathname, payload, editable) as ReturnType<typeof parseTouchlineActiveRankingState>;
}
function payload(status: "unique-leader" | "tied") {
  const source = readFileSync(new URL("./browser/touchline-player-leader-crown.spec.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("spec.ts", source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "activeRankingPayload");
  assert.ok(fn);
  const context = { priceTableVersion: "2026-07-premier-v1", snapshotId: "visual-player-leader-snapshot", result: null as unknown, status };
  runInNewContext(ts.transpileModule(fn.getText(ast), {}).outputText + ";result=activeRankingPayload(status)", context);
  return context.result as Record<string, unknown>;
}

test("explicit QA authority requires exact fixture path and non-editable real published payload", () => {
  const unique = payload("unique-leader");
  for (const path of [null, "/market", "/arena", "/admin", "/visual-qa", "/visual-qa/player-leader-crown/child", "/visual-qa/player-leader-crown/"]) {
    assert.equal(resolve(path, unique), null, String(path));
  }
  assert.equal(resolve("/visual-qa/player-leader-crown", unique, true), null);
  assert.equal(allowsInheritedCardLeadership("/visual-qa/player-leader-crown"), false);
  for (const invalid of [undefined, null, true, {}, { ...unique, priceTableVersion: "bad" }, { ...unique, snapshotId: "" }]) {
    assert.equal(resolve("/visual-qa/player-leader-crown", invalid), null);
  }
});

test("real parser and eligibility accept unique, reject tie and mismatched decision scope", () => {
  const path = "/visual-qa/player-leader-crown";
  const eligible = (value: unknown) => touchlinePlayerCrownEligibility({ state: resolve(path, value), playerId: "visual-player-leader" });
  assert.equal(eligible(payload("unique-leader")), true);
  assert.equal(eligible(payload("tied")), false);
  assert.equal(eligible({ ...payload("unique-leader"), leadershipDecision: { status: "unique-leader", scope: { rankingId: "wrong", snapshotId: "wrong" }, leader: { subjectType: "player", subjectId: "visual-player-leader" } } }), false);
});

test("card retains inherited guard and default fallback while fixture opts in explicitly", () => {
  assert.match(cardSource, /useTouchlineActiveRanking\(!leadershipAuthority && subscribeToRanking\)/);
  assert.match(cardSource, /leadershipAuthority \? leadershipAuthority.playerRanking : fallbackRanking/);
  assert.match(cardSource, /explicitQaPlayerRanking\?: unknown/);
  assert.match(cardSource, /resolveExplicitQaPlayerRanking\(awardPath, explicitQaPlayerRanking, isEditable\)/);
});
