import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import * as acquisition from "../lib/touchlineFantasy/club-acquisition.ts";
import * as authority from "../lib/touchlineFantasy/club-command-authority.ts";
import * as budget from "../lib/touchlineFantasy/club-initial-budget.ts";
import * as release from "../lib/touchlineFantasy/club-release.ts";
import * as bootstrap from "../lib/touchlineFantasy/club-collection-bootstrap.ts";
import type { useClubCollection } from "../components/touchline/fantasy/useClubCollection.ts";
import * as domain from "../lib/touchlineFantasy/domain.ts";
import { clubStarterSelections } from "../lib/touchlineFantasy/club-allocation.ts";
import { previewPlannedClubAllocation } from "../lib/touchlineFantasy/collection-slot-plan.ts";
import { canChooseGuidedSlot, nextGuidedChoice } from "../lib/touchlineFantasy/next-guided-choice.ts";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY as formations } from "../lib/touchlineArena/formation-geometry.ts";
import { findTouchLineClub } from "../lib/touchlineArena/demo-data.ts";
import { isTouchlineFantasyMarketClubAllowed as canBrowseMarketClub, resolveTouchlineFantasyMarketAccess } from "../lib/touchlineFantasy/market-plan-policy.ts";
import { getTouchlineFantasyMarketWorkflowCopy } from "../lib/touchlineFantasy/market-workflow-i18n.ts";
import { getClubCollectionBudgetCopy } from "../lib/touchlineFantasy/market-budget-i18n.ts";
import { getTouchlineFantasyMarketPlanLockCopy } from "../lib/touchlineFantasy/market-access-i18n.ts";
import { touchlineMarketPositionBucket } from "../lib/touchlineArena/position-eligibility.ts";
import { clubPrimaryPositionIndex } from "../lib/touchlineFantasy/club-primary-position-index.ts";
import { primaryPositionFitsTacticalSlot } from "../lib/touchlineFantasy/club-primary-position-policy.ts";

const accountId = "30000000-0000-4000-8000-000000000001";
const initial: acquisition.ClubAcquisitionState = {
  revision: 0, seasonId: "30000000-0000-4000-8000-000000000003", plan: "standard", balanceEur: 495_000_000,
  coach: { id: "coach", tier: "ruby-red", valueEur: 5_000_000 }, players: [], receipts: [],
};
type Reply = { response: { ok: boolean; status: number }; payload: Record<string, unknown> };
type Request = { path: string; options: RequestInit; resolve: (reply: Reply) => void; reject: (error: Error) => void };
type Effect = { deps: unknown[]; cleanup?: void | (() => void) };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const reply = (request: Request, state = initial, owner = accountId) => request.resolve({
  response: { ok: true, status: 200 }, payload: { ok: true, state, accountId: owner, seasonId: state.seasonId, releaseAvailable: true },
});

// Real hook, with only React scheduling/context and HTTP transport replaced.
// Deferred transport allows headers/results to arrive in deliberately hostile order.
function hookFixture() {
  const slots: unknown[] = [], effects: (() => void)[] = [], requests: Request[] = [];
  const snapshots: (acquisition.ClubAcquisitionState | null)[] = [];
  let cursor = 0;
  const changed = (a: unknown[] | undefined, b: unknown[]) => !a || a.length !== b.length || a.some((v, i) => v !== b[i]);
  const react = {
    useState(initialValue: unknown) {
      const i = cursor++; if (!(i in slots)) slots[i] = typeof initialValue === "function" ? initialValue() : initialValue;
      return [slots[i], (value: unknown) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
    },
    useRef(initialValue: unknown) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initialValue }); },
    useCallback(fn: unknown, deps: unknown[]) {
      const i = cursor++, prior = slots[i] as { deps: unknown[]; fn: unknown } | undefined;
      if (changed(prior?.deps, deps)) slots[i] = { deps, fn };
      return (slots[i] as { fn: unknown }).fn;
    },
    useEffect(fn: () => void | (() => void), deps: unknown[]) {
      const i = cursor++, prior = slots[i] as Effect | undefined;
      if (changed(prior?.deps, deps)) {
        const next: Effect = { deps }; slots[i] = next;
        effects.push(() => { prior?.cleanup?.(); next.cleanup = fn(); });
      }
    },
  };
  const context = { publish: () => {}, publishInitialBudget: () => {}, publishVerificationStatus: () => {} };
  const exports = {} as { useClubCollection: typeof useClubCollection };
  const source = ts.transpileModule(readFileSync(new URL("../components/touchline/fantasy/useClubCollection.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { exports, AbortController, crypto: { randomUUID }, require: (name: string) => {
    if (name === "react") return react;
    if (name.includes("club-acquisition")) return acquisition;
    if (name.includes("club-command-authority")) return authority;
    if (name.includes("club-initial-budget")) return budget;
    if (name.includes("club-release")) return release;
    if (name.includes("club-collection-bootstrap")) return bootstrap;
    if (name.includes("ClubCollectionContext")) return { useConfirmedClubCollection: () => context };
    if (name.includes("club-collection-request")) {
      const requestClubCollection = (path: string, options: RequestInit) => new Promise<Reply>((resolve, reject) => requests.push({ path, options, resolve, reject }));
      return { requestClubCollection, readClubCollection: (signal: AbortSignal) => requestClubCollection("/api/touchline-fantasy/collection", { method: "GET", signal }) };
    }
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  const onSnapshot = (state: acquisition.ClubAcquisitionState | null) => snapshots.push(state);
  return { requests, snapshots, render: () => {
    cursor = 0;
    const hook = exports.useClubCollection(true, "en-GB", { expectedAccountId: accountId, expectedSeasonId: initial.seasonId }, onSnapshot);
    while (effects.length) effects.shift()!();
    return hook;
  } };
}

test("background revalidation keeps confirmed readiness while pending; explicit reload blocks", async () => {
  const h = hookFixture(); h.render(); reply(h.requests[0]); await tick();
  let hook = h.render(); assert.equal(hook.ready, true); assert.equal(hook.releaseAvailable, true);
  hook.revalidate(); h.render(); hook = h.render();
  assert.equal(h.requests.length, 2); assert.equal(h.requests[1].options.method, "GET");
  assert.equal(hook.ready, true); assert.equal(hook.releaseAvailable, true);
  reply(h.requests[1]); await tick(); hook = h.render();
  assert.equal(hook.ready, true); assert.equal(hook.error, null);
  assert.equal(h.snapshots.length, 1, "same confirmed revision must not repeat the snapshot listener or reset UI intent");
  hook.reload(); h.render(); assert.equal(h.render().ready, false);
  assert.equal(h.requests.filter(request => request.options.method === "POST").length, 0);
});

test("failed or differently bound background reads preserve display but revoke mutation authority", async () => {
  for (const outcome of ["network", "unauthorized", "account", "season"] as const) {
    const h = hookFixture(); h.render(); reply(h.requests[0]); await tick();
    h.render().revalidate(); h.render();
    if (outcome === "network") h.requests[1].reject(new Error("read unavailable"));
    else if (outcome === "unauthorized") h.requests[1].resolve({ response: { ok: false, status: 401 }, payload: { ok: false, error: "CLUB_AUTH_REQUIRED" } });
    else reply(h.requests[1], outcome === "season" ? { ...initial, seasonId: "30000000-0000-4000-8000-000000000009" } : initial,
      outcome === "account" ? "30000000-0000-4000-8000-000000000009" : accountId);
    await tick(); const hook = h.render();
    assert.equal(hook.ready, false, outcome); assert.ok(hook.error, outcome);
    assert.deepEqual(hook.state, initial);
    assert.equal(await hook.purchase("player", { area: "outside", slot: 0 }), false);
    assert.equal(await hook.allocate({ action: "formation", formationCode: "4-3-3" }), false);
    assert.equal(h.requests.length, 2, "read failure must not issue any mutation");
  }
});

test("a background GET finishing after a purchase cannot restore an older snapshot", async () => {
  const h = hookFixture(); h.render(); reply(h.requests[0]); await tick();
  h.render().revalidate(); h.render();
  const buying = h.render().purchase("player", { area: "outside", slot: 0 });
  assert.equal(h.requests.length, 3);
  const command = JSON.parse(String(h.requests[2].options.body));
  const next = acquisition.acquireClubPlayer(initial, command, { marketOpen: true, allowedClubIds: null,
    offer: { playerId: "player", clubId: "club", position: "GK", valueEur: 10_000_000, published: true } }).state;
  reply(h.requests[2], next); assert.equal(await buying, true); h.render();
  reply(h.requests[1]); await tick(); const hook = h.render();
  assert.deepEqual(hook.state, next); assert.deepEqual(h.snapshots.at(-1), next);
  assert.equal(h.requests.filter(request => request.options.method === "POST").length, 1);
});

test("revalidation and renders never automatically repeat an uncertain mutation", async () => {
  for (const action of ["purchase", "allocation"] as const) {
    const h = hookFixture(); h.render(); reply(h.requests[0]); await tick();
    const hook = h.render();
    const operation = action === "purchase" ? hook.purchase("player", { area: "outside", slot: 0 })
      : hook.allocate({ action: "formation", formationCode: "4-3-3" });
    h.requests[1].reject(new Error("timeout after possible commit")); assert.equal(await operation, false);
    assert.equal(h.render().hasPending, true);
    h.render().revalidate(); h.render();
    if (h.requests[2]) { assert.equal(h.requests[2].options.method, "GET"); reply(h.requests[2]); await tick(); }
    h.render(); h.render();
    assert.equal(h.requests.filter(request => request.options.method === "POST").length, 1);
    assert.equal(h.render().hasPending, true, "an unchanged GET is not a receipt for the pending command");
  }
});

const clientText = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const clientAst = ts.createSourceFile("FantasyGameweekClient.tsx", clientText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map<string, string>();
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node.getText(clientAst));
  ts.forEachChild(node, visit);
}
visit(clientAst);
type Mutation = { kind: "purchase" | "allocation"; resolve: (ok: boolean) => void };
type SourceApi = {
  addPlayer: (card: Record<string, unknown>) => Promise<boolean>;
  removePlayer: (id: string) => Promise<void>;
  allocatePlanned: (command: { action: "move"; playerId: string; area: "outside"; slot: number }) => Promise<boolean>;
  applyCollectionSnapshot: (state: acquisition.ClubAcquisitionState, open?: boolean) => void;
  applyIncomingRound: (state: Record<string, unknown>) => void;
  setPlayerClubTeamId: (id: string) => void;
};

// Execute the real consumer functions, not a replica of their post-await logic.
// Domain validators are real; only scheduling, setters and network mutations are boundaries.
function clientFixture(owned = false) {
  const geometry = formations["4-3-3"], policy = resolveTouchlineFantasyMarketAccess("vip");
  const playerId = "30000000-0000-4000-8000-000000000010";
  const card = { id: playerId, canonicalPlayerId: playerId, name: "Test keeper", clubName: "Arsenal", position: "Goalkeeper", primaryPositionDetail: "Goalkeeper" };
  const state: acquisition.ClubAcquisitionState = { ...initial, formationCode: "4-3-3", players: owned
    ? [{ playerId, clubId: "club", position: "GK", primaryDetail: "Goalkeeper", valueEur: 10_000_000, area: "outside", slot: 0 }] : [] };
  const mutations: Mutation[] = [], calls: [string, unknown][] = [];
  const collection = { state, ready: true, busy: false, hasPending: false,
    getConfirmedState: (): acquisition.ClubAcquisitionState => collection.state,
    purchase: () => new Promise<boolean>(resolve => mutations.push({ kind: "purchase", resolve })),
    allocate: () => new Promise<boolean>(resolve => mutations.push({ kind: "allocation", resolve })),
    reload: () => calls.push(["reload", null]), revalidate: () => calls.push(["revalidate", null]),
  };
  const snapshot = { config: { maxPlayersPerClub: 11 }, formationRegistry: formations, marketAccess: policy };
  const primaryDetails = clubPrimaryPositionIndex([card, { id: "other-defender", primaryPositionDetail: "Centre Back" }]);
  const intentEpoch = { current: 0 };
  const context: Record<string, unknown> = {
    getClubCollectionBudgetCopy,
    getTouchlineFantasyMarketPlanLockCopy, touchlineMarketPositionBucket,
    marketPlanLockCopy: getTouchlineFantasyMarketPlanLockCopy("en-GB"),
    ...domain, canChooseGuidedSlot, nextGuidedChoice, clubStarterSelections, previewPlannedClubAllocation,
    primaryDetails, primaryPositionFitsTacticalSlot,
    findTouchLineClub, canBrowseMarketClub, initialSnapshot: snapshot, snapshot, marketPolicy: policy,
    collectionEnabled: true, collectionSlotsEditable: true, collection, marketPage: true,
    editable: true, saving: false, marketOpen: true, geometry, formationCode: "4-3-3", selectedCoachId: "coach", selections: [],
    activeSlot: geometry.slots.find(slot => slot.id === "GK"), activeSlotId: "GK",
    eligiblePlayers: [{ playerId, clubId: "club", positionBucket: "goalkeeper", marketValueEur: 10_000_000 }],
    marketBudgetEur: 500_000_000, locale: "en-GB", draftLocalesEnabled: false,
    workflowCopy: getTouchlineFantasyMarketWorkflowCopy("en-GB"),
    clubSelectionVersion: intentEpoch, visualIntentEpoch: intentEpoch,
    activeGameweek: { id: "round", state: "MARKET_OPEN" },
    playerClubTeamId: "19", visibleStep: "players", browsePosition: null, query: "",
    collectionMarketPlayer: null, squadSwap: null,
  };
  for (const [setter, key] of Object.entries({ setSelections: "selections", setFormationCode: "formationCode",
    setSelectedCoachId: "selectedCoachId", setVisibleStep: "visibleStep", setActiveSlotId: "activeSlotId",
    setCollectionMarketPlayer: "collectionMarketPlayer", setSquadSwap: "squadSwap",
    setBrowsePosition: "browsePosition", setFeedback: "feedback", setLive: "live", applyPlayerClubTeamId: "playerClubTeamId" })) {
    context[setter] = (value: unknown) => {
      context[key] = typeof value === "function" ? value(context[key]) : value;
      calls.push([setter, context[key]]);
    };
  }
  const names = ["addPlayer", "removePlayer", "applyCollectionSnapshot", "applyIncomingRound", "allocatePlanned", "setPlayerClubTeamId", "marketSlotAccepts", "slotAccepts", "canonicalRosterRole"];
  for (const name of names) assert.ok(declarations.has(name), `Real source function ${name} is required`);
  const script = ts.transpileModule(`(() => { ${names.map(name => declarations.get(name)).join("\n")} return { ${names.join(",")} }; })()`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const api: SourceApi = runInNewContext(script, context);
  return { api, context, collection, mutations, calls, card, playerId, geometry };
}

test("late purchase/allocation completion never overwrites a newer authoritative XI or newer browse intent", async () => {
  for (const owned of [false, true]) {
    const h = clientFixture(owned);
    const operation = h.api.addPlayer(h.card);
    assert.equal(h.mutations.length, 1);
    assert.equal(h.mutations[0].kind, owned ? "allocation" : "purchase");
    // Another deliberate club choice occurs while the command is pending.
    h.api.setPlayerClubTeamId("18");
    h.context.activeSlotId = "RCB"; h.context.browsePosition = "centre-back";
    h.context.visibleStep = "review";
    const newer: acquisition.ClubAcquisitionState = { ...h.collection.state, revision: 3,
      players: [{ playerId: h.playerId, clubId: "club", position: "GK", primaryDetail: "Goalkeeper", valueEur: 10_000_000, area: "starters", slot: h.geometry.slots.findIndex(slot => slot.id === "GK") },
        { playerId: "other-defender", clubId: "club", position: "CB", primaryDetail: "Centre Back", valueEur: 10_000_000, area: "starters", slot: h.geometry.slots.findIndex(slot => slot.id === "RCB") }] };
    h.collection.state = newer;
    h.api.applyCollectionSnapshot(newer);
    assert.equal((h.context.selections as unknown[]).length, 2, "the real snapshot mapper must accept both canonical primary positions");
    const afterSnapshot = JSON.stringify(h.context.selections);
    h.calls.length = 0; h.mutations[0].resolve(true);
    assert.equal(await operation, true);
    assert.equal(JSON.stringify(h.context.selections), afterSnapshot, "captured pre-request next must not overwrite server snapshot");
    assert.equal(h.context.playerClubTeamId, "18");
    assert.equal(h.context.activeSlotId, "RCB");
    assert.equal(h.context.browsePosition, "centre-back");
    assert.equal(h.context.visibleStep, "review");
    assert.equal(h.calls.some(([name]) => name === "setSelections"), false);
    assert.equal(h.mutations.length, 1);
  }
});

test("an unchanged open QA poll revalidates without triggering blocking reload or rewriting the owned XI", () => {
  const h = clientFixture();
  h.api.applyCollectionSnapshot(h.collection.state);
  h.calls.length = 0;
  const priorSelections = [{ playerId: "local-draft", slotId: "GK" }];
  h.context.selections = priorSelections; h.context.visibleStep = "review";
  h.api.applyIncomingRound({ qaClubMarketOpen: true, activeGameweek: { id: "round", state: "MARKET_OPEN" }, selections: [] });
  assert.equal(h.calls.some(([name]) => name === "reload"), false);
  assert.equal(h.calls.filter(([name]) => name === "revalidate").length, 1);
  assert.equal(h.context.selections, priorSelections);
  assert.equal(h.context.visibleStep, "review");
  assert.equal(h.mutations.length, 0);
});

test("without newer intent the next guided choice derives from the confirmed snapshot, never captured draft", async () => {
  const h = clientFixture();
  const operation = h.api.addPlayer(h.card);
  assert.equal(h.mutations.length, 1);
  const confirmed: acquisition.ClubAcquisitionState = { ...h.collection.state, revision: 2, players: [
    { playerId: h.playerId, clubId: "club", position: "GK", primaryDetail: "Goalkeeper", valueEur: 10_000_000, area: "starters", slot: 0 },
    { playerId: "other-defender", clubId: "club", position: "CB", primaryDetail: "Centre Back", valueEur: 10_000_000, area: "starters", slot: 2 },
  ] };
  h.collection.state = confirmed; h.api.applyCollectionSnapshot(confirmed);
  const before = JSON.stringify(h.context.selections);
  assert.equal((h.context.selections as unknown[]).length, 2);
  h.mutations[0].resolve(true); assert.equal(await operation, true);
  assert.equal(JSON.stringify(h.context.selections), before);
  assert.equal(h.context.activeSlotId, "LCB", "confirmed RCB is already occupied; stale captured next would select it again");
  assert.equal(h.mutations.length, 1);
});

function eightStarterFixture() {
  const h = clientFixture();
  const starters = [["GK", "Goalkeeper"], ["RB", "Right Back"], ["CB", "Centre Back"], ["CB", "Centre Back"],
    ["LB", "Left Back"], ["MID", "Central Midfield"], ["MID", "Central Midfield"], ["MID", "Central Midfield"]] as const;
  const bench = [["GK", "Goalkeeper"], ["CB", "Centre Back"], ["RB", "Right Back"], ["LB", "Left Back"],
    ["DM", "Defensive Midfield"], ["MID", "Central Midfield"], ["RW", "Right Wing"], ["LW", "Left Wing"], ["CF", "Centre Forward"]] as const;
  const players: acquisition.ClubOwnedPlayer[] = [
    ...starters.map(([position, primaryDetail], slot) => ({ playerId: `starter-${slot}`, clubId: "club", position, primaryDetail, valueEur: 1_000_000, area: "starters" as const, slot })),
    ...bench.map(([position, primaryDetail], slot) => ({ playerId: `bench-${slot}`, clubId: "club", position, primaryDetail, valueEur: 1_000_000, area: "reserves" as const, slot })),
  ];
  const confirmed = { ...h.collection.state, revision: 17, balanceEur: 478_000_000, players };
  h.collection.state = confirmed;
  const details = clubPrimaryPositionIndex(players.map(player => ({ id: player.playerId, primaryPositionDetail: player.primaryDetail })));
  h.context.primaryDetails = details;
  return { ...h, confirmed, details };
}

test("first read while closed is applied once when the market opens at the same collection revision", () => {
  const h = eightStarterFixture();
  const before = structuredClone(h.confirmed);
  h.context.marketOpen = false;
  h.api.applyCollectionSnapshot(h.confirmed);
  assert.equal((h.context.selections as unknown[]).length, 0);
  assert.equal((h.context.visualIntentEpoch as { appliedCollection?: unknown }).appliedCollection, undefined);
  const openPoll = { qaClubMarketOpen: true, activeGameweek: { id: "round", state: "MARKET_OPEN" }, selections: [] };
  h.api.applyIncomingRound(openPoll);
  assert.equal((h.context.selections as unknown[]).length, 8, "opening must apply the previously skipped confirmed XI");
  assert.equal((h.context.visualIntentEpoch as { appliedCollection?: unknown }).appliedCollection, h.confirmed);
  assert.equal(h.collection.state.players.filter(player => player.area === "reserves").length, 9);
  assert.deepEqual(h.collection.state, before, "no ownership, bench allocation or money mutation");
  const selections = h.context.selections;
  h.context.visibleStep = "review"; h.calls.length = 0;
  h.api.applyIncomingRound(openPoll);
  assert.equal(h.context.selections, selections, "ordinary applied poll does not rewrite the XI");
  assert.equal(h.context.visibleStep, "review");
  assert.equal(h.calls.some(([name]) => name === "setSelections" || name === "reload"), false);
  assert.equal(h.calls.filter(([name]) => name === "revalidate").length, 1);
  assert.equal(h.mutations.length, 0);
});

test("failed primary-position mapping stays unapplied and can recover on the same-revision open poll", () => {
  const h = eightStarterFixture();
  h.context.primaryDetails = clubPrimaryPositionIndex([]);
  h.api.applyCollectionSnapshot(h.confirmed);
  assert.equal((h.context.selections as unknown[]).length, 0);
  assert.ok(h.context.feedback);
  assert.equal((h.context.visualIntentEpoch as { appliedCollection?: unknown }).appliedCollection, undefined,
    "a failed mapping must never consume the one-time application marker");
  h.context.primaryDetails = h.details;
  h.api.applyIncomingRound({ qaClubMarketOpen: true, activeGameweek: { id: "round", state: "MARKET_OPEN" }, selections: [] });
  assert.equal((h.context.selections as unknown[]).length, 8);
  assert.equal((h.context.visualIntentEpoch as { appliedCollection?: unknown }).appliedCollection, h.confirmed);
  assert.equal(h.collection.state.players.filter(player => player.area === "reserves").length, 9);
  assert.equal(h.mutations.length, 0);
});

test("a closed round invalidates the applied marker and reopening restores the same owned snapshot once", () => {
  const h = eightStarterFixture();
  const before = structuredClone(h.confirmed);
  h.api.applyCollectionSnapshot(h.confirmed);
  assert.equal((h.context.selections as unknown[]).length, 8);
  const lockedSelections = [{ playerId: "locked-round-player", slotId: "GK" }];
  h.api.applyIncomingRound({ qaClubMarketOpen: false, activeGameweek: { id: "round", state: "LOCKED" },
    userGameweek: { selectedCoachId: "locked-coach", formationCode: "4-4-2" }, selections: lockedSelections });
  assert.equal(JSON.stringify(h.context.selections), JSON.stringify(lockedSelections));
  assert.equal(h.context.selectedCoachId, "locked-coach");
  assert.equal((h.context.visualIntentEpoch as { appliedCollection?: unknown }).appliedCollection, undefined);
  assert.equal(h.collection.state, h.confirmed, "closing only switches the displayed round, not the collection");
  const openPoll = { qaClubMarketOpen: true, activeGameweek: { id: "round", state: "MARKET_OPEN" }, selections: [] };
  h.calls.length = 0;
  h.api.applyIncomingRound(openPoll);
  assert.equal((h.context.selections as unknown[]).length, 8);
  assert.equal(h.context.selectedCoachId, "coach");
  assert.equal(h.context.formationCode, "4-3-3");
  assert.equal((h.context.visualIntentEpoch as { appliedCollection?: unknown }).appliedCollection, h.confirmed);
  const restoredSelections = h.context.selections;
  h.context.visibleStep = "review";
  h.api.applyIncomingRound(openPoll);
  assert.equal(h.context.selections, restoredSelections);
  assert.equal(h.context.visibleStep, "review");
  assert.equal(h.calls.filter(([name]) => name === "setSelections").length, 1);
  assert.equal(h.calls.filter(([name]) => name === "revalidate").length, 2);
  assert.equal(h.calls.some(([name]) => name === "reload"), false);
  assert.equal(h.collection.state.players.filter(player => player.area === "reserves").length, 9);
  assert.deepEqual(h.collection.state, before);
  assert.equal(h.mutations.length, 0);
});

test("projection recovery clears only its matching localized error and preserves unrelated feedback", () => {
  for (const locale of ["pt-BR", "en-GB"]) {
    for (const newerFeedback of [false, true]) {
      const h = eightStarterFixture();
      h.context.locale = locale;
      h.context.primaryDetails = clubPrimaryPositionIndex([]);
      h.api.applyCollectionSnapshot(h.confirmed);
      assert.equal(h.context.feedback, locale === "pt-BR"
        ? "Não foi possível confirmar a formação salva." : "Unable to verify the saved formation.");
      if (newerFeedback) h.context.feedback = "A newer action needs your attention.";
      h.context.primaryDetails = h.details;
      h.api.applyIncomingRound({ qaClubMarketOpen: true, activeGameweek: { id: "round", state: "MARKET_OPEN" }, selections: [] });
      assert.equal((h.context.selections as unknown[]).length, 8);
      assert.equal(h.context.feedback, newerFeedback ? "A newer action needs your attention." : null);
      assert.equal(h.mutations.length, 0);
    }
  }
});

test("a missing published formation is not a confirmed empty club and remains retryable", () => {
  const h = eightStarterFixture();
  const snapshot = h.context.snapshot as Record<string, unknown>;
  h.context.snapshot = { ...snapshot, formationRegistry: {} };
  const priorDraft = [{ playerId: "previously-displayed", slotId: "GK" }];
  h.context.selections = priorDraft;
  h.api.applyCollectionSnapshot(h.confirmed);
  assert.equal(h.context.selections, priorDraft, "missing geometry cannot erase a displayed squad");
  assert.equal((h.context.visualIntentEpoch as { appliedCollection?: unknown }).appliedCollection, undefined);
  assert.ok(h.context.feedback);
  h.context.snapshot = snapshot;
  h.api.applyIncomingRound({ qaClubMarketOpen: true, activeGameweek: { id: "round", state: "MARKET_OPEN" }, selections: [] });
  assert.equal((h.context.selections as unknown[]).length, 8);
  assert.equal((h.context.visualIntentEpoch as { appliedCollection?: unknown }).appliedCollection, h.confirmed);
  assert.equal(h.mutations.length, 0);
});

test("collection removal opens outside-only confirmation without allocating or changing the squad", async () => {
  const h = clientFixture(true);
  h.collection.state = { ...h.collection.state, players: h.collection.state.players.map(player => ({ ...player, area: "starters", slot: 0 })) };
  h.context.selections = [{ playerId: h.playerId, slotId: "GK" }];
  const before = JSON.stringify({ state: h.collection.state, selections: h.context.selections });
  await h.api.removePlayer(h.playerId);
  assert.equal(JSON.stringify(h.context.squadSwap), JSON.stringify({ playerId: h.playerId, outsideOnly: true }));
  assert.equal(h.mutations.length, 0);
  assert.equal(JSON.stringify({ state: h.collection.state, selections: h.context.selections }), before);
  assert.deepEqual(h.calls.map(([name]) => name), ["setSquadSwap"]);
  for (const gate of ["editable", "saving", "collectionSlotsEditable"] as const) {
    const blocked = clientFixture(true);
    blocked.context[gate] = gate === "saving";
    await blocked.api.removePlayer(blocked.playerId);
    assert.equal(blocked.context.squadSwap, null);
    assert.deepEqual(blocked.calls, []);
    assert.equal(blocked.mutations.length, 0);
  }
});

test("late planned allocation preserves newer intent and uses only the authoritative squad snapshot", async () => {
  const h = clientFixture(true);
  h.collection.state = { ...h.collection.state, players: h.collection.state.players.map(player => ({ ...player, area: "starters", slot: 0 })) };
  h.context.selections = [{ playerId: h.playerId, slotId: "GK" }];
  // Explicit confirmed action boundary; opening the removal dialog never allocates.
  const operation = h.api.allocatePlanned({ action: "move", playerId: h.playerId, area: "outside", slot: 0 });
  assert.equal(h.mutations.length, 1); assert.equal(h.mutations[0].kind, "allocation");
  h.api.setPlayerClubTeamId("18");
  h.context.activeSlotId = "RCB"; h.context.visibleStep = "review";
  const confirmed: acquisition.ClubAcquisitionState = { ...h.collection.state, revision: 2, players: [
    { ...h.collection.state.players[0], area: "outside", slot: 0 },
    { playerId: "other-defender", clubId: "club", position: "CB", primaryDetail: "Centre Back", valueEur: 10_000_000, area: "starters", slot: 2 },
  ] };
  h.collection.state = confirmed; h.api.applyCollectionSnapshot(confirmed);
  assert.equal((h.context.selections as unknown[]).length, 1);
  const before = JSON.stringify(h.context.selections); h.calls.length = 0;
  h.mutations[0].resolve(true); await operation;
  assert.equal(JSON.stringify(h.context.selections), before);
  assert.equal(h.context.activeSlotId, "RCB"); assert.equal(h.context.visibleStep, "review");
  assert.equal(h.context.playerClubTeamId, "18");
  assert.equal(h.calls.some(([name]) => name === "setSelections"), false);
  assert.equal(h.mutations.length, 1);
});
