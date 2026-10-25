import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("FantasyGameweekClient.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let projection: ts.FunctionDeclaration | undefined;
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "applyCollectionSnapshot") projection = node;
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(projection, "exercise the production projection rather than duplicating it");
const compiled = ts.transpileModule(`${projection.getText(file)}\napplyCollectionSnapshot`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness() {
  const shape = { formationCode: "4-3-3" };
  const players = [{ playerId: "retained-player", slot: "GK" }];
  const writes: { coach?: string | null; formation?: string | null; selections?: unknown; step?: string } = {};
  const visualIntentEpoch: { appliedCollection?: unknown } = {};
  let projected: unknown;
  const apply = runInNewContext(compiled, {
    collectionEnabled: true, marketOpen: true,
    locale: "pt-BR", draftLocalesEnabled: false,
    snapshot: { formationRegistry: { "4-3-3": shape } },
    primaryDetails: {}, formationCode: "4-3-3", selectedCoachId: "old-coach",
    visualIntentEpoch,
    getClubCollectionBudgetCopy: () => ({ savedFormationUnverified: "unverified" }),
    setSelectedCoachId: (id: string | null) => { writes.coach = id; },
    setFormationCode: (id: string | null) => { writes.formation = id; },
    setSelections: (value: unknown) => { writes.selections = value; },
    setVisibleStep: (value: string) => { writes.step = value; },
    setFeedback: () => {},
    clubStarterSelections: (state: unknown, geometry: unknown) => {
      assert.equal(geometry, shape); projected = state; return players;
    },
  }) as (state: unknown, open?: boolean) => void;
  return { apply, writes, players, visualIntentEpoch, projected: () => projected };
}

test("explicit coach vacancy clears only the selected coach and preserves the canonical XI projection", () => {
  const h = harness();
  const state = { coach: null, formationCode: "4-3-3", balanceEur: 90, players: h.players, receipts: [] };
  const before = JSON.stringify(state);
  h.apply(state);
  assert.equal(h.writes.coach, null);
  assert.equal(h.writes.formation, "4-3-3");
  assert.equal(h.writes.selections, h.players);
  assert.equal(h.projected(), state);
  assert.equal(h.visualIntentEpoch.appliedCollection, state);
  assert.equal(JSON.stringify(state), before, "projection cannot alter wallet or contracts");
});

test("owned coach still projects, while closed rounds and absent collections leave their snapshot untouched", () => {
  const h = harness();
  const state = { coach: { id: "owned-coach" }, formationCode: "4-3-3" };
  h.apply(state);
  assert.equal(h.writes.coach, "owned-coach");
  const closed = harness();
  closed.apply({ ...state, coach: null }, false);
  closed.apply(null);
  assert.deepEqual(closed.writes, {});
  assert.equal(closed.projected(), undefined);
});
