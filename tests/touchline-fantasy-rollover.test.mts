import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

// Execute the snapshot's real lifecycle up to the independent catalogue reads.
// Persistence is the boundary fake: preparing a round copies only locked XI,
// just as the deployed SQL contract does, and never replaces an existing draft.
const source = stripTypeScriptTypes(readFileSync(new URL("../lib/touchlineFantasy/server.ts", import.meta.url), "utf8"));
const start = source.indexOf("export async function loadTouchlineFantasySnapshot");
const end = source.indexOf("  const [catalogue, coaches, userGameweekResponse, rankings]", start);
const lifecycleSource = source.slice(start, end).replace("export ", "")
  + "return { gameweeks, activeGameweek }; }\nloadTouchlineFantasySnapshot;";
const helperSource = stripTypeScriptTypes(readFileSync(new URL("../lib/touchlineFantasy/gameweek-lifecycle.ts", import.meta.url), "utf8"))
  .replace(/^import[^;]*;\s*$/gm, "").replace(/^export /gm, "");
const reconcileTouchlineFantasyGameweeks = runInNewContext(`${helperSource}\nreconcileTouchlineFantasyGameweeks;`);

function scenario(options: { failure?: string; existingDraft?: boolean; olderLocked?: boolean; entitlement?: boolean; refreshFailure?: boolean; rejectedReconciliation?: boolean; pendingStatistics?: boolean; olderUnsettled?: boolean } = {}) {
  const calls: string[] = [];
  const xi = Array.from({ length: 11 }, (_, i) => `player-${i + 1}`);
  const existingXi = ["user-edited-draft"];
  const rounds = [
    { id: "older", gameweek_number: 3, state: options.olderUnsettled ? "FINAL" : "SETTLED" },
    { id: "previous", gameweek_number: 4, state: "FINAL" },
    { id: "next", gameweek_number: 5, state: "MARKET_OPEN" },
  ];
  const locked = new Map<string, string[]>(options.olderLocked ? [["older", ["older-player"]]] : []);
  let draft: string[] | undefined = options.existingDraft ? existingXi : undefined;
  let coach: string | null = null;
  const admin = {
    async rpc(name: string, args?: { p_gameweek_id: string }) {
      calls.push(`${name}:${args?.p_gameweek_id ?? ""}`);
      if (options.failure === name) return { data: null, error: { code: "40001", message: "private-details" } };
      if (name === "touchline_fantasy_reconcile_gameweek") {
        if (options.rejectedReconciliation) return { data: { ok: false }, error: null };
        assert.equal(args?.p_gameweek_id, "previous");
        locked.set("previous", [...xi]);
        if (!options.pendingStatistics) rounds[1].state = "SETTLED";
        return { data: { ok: true, pendingStatistics: options.pendingStatistics }, error: null };
      }
      if (name === "touchline_fantasy_prepare_user_gameweek" && draft === undefined) {
        draft = [...(locked.get("previous") ?? locked.get("older") ?? [])];
        coach = locked.has("previous") ? "confirmed-coach" : null;
      }
      return { data: null, error: null };
    },
    from(table: string) {
      const query = {
        select() { return query; }, eq() { return query; },
        async order() { return options.refreshFailure && locked.has("previous")
          ? { data: null, error: { message: "private-details" } }
          : { data: structuredClone(rounds), error: null }; },
        async maybeSingle() {
          return { data: table === "touchline_fantasy_configs"
            ? { season_id: "season" }
            : { status: options.entitlement === false ? "inactive" : "active" }, error: null };
        },
      };
      return query;
    },
  };
  const context = {
    reconcileTouchlineFantasyGameweeks,
    createAdminClient: () => admin,
    readTouchlineFormationGeometryRegistry: async () => ({}),
    rows: (value: unknown) => value,
    text: (value: unknown) => typeof value === "string" ? value : null,
    parseGameweek: (row: { id: string; gameweek_number: number; state: string }) => ({ id: row.id, number: row.gameweek_number, state: row.state }),
  };
  const run = runInNewContext(lifecycleSource, context) as (user: { id: string }) => Promise<unknown>;
  return { run: () => run({ id: "manager" }), calls, xi, existingXi, get draft() { return draft; }, get coach() { return coach; } };
}

test("rollover locks the confirmed previous XI before preparing the newly opened round", async () => {
  const s = scenario(); await s.run();
  assert.deepEqual(s.draft, s.xi);
  assert.equal(s.coach, "confirmed-coach");
  assert.ok(s.calls.indexOf("touchline_fantasy_reconcile_gameweek:previous") < s.calls.indexOf("touchline_fantasy_prepare_user_gameweek:next"));
});

test("rollover cannot silently carry an older locked XI over the latest confirmed XI", async () => {
  const s = scenario({ olderLocked: true }); await s.run();
  assert.deepEqual(s.draft, s.xi);
});

test("refreshing after rollover preserves an already edited draft", async () => {
  const s = scenario({ existingDraft: true }); await s.run(); await s.run();
  assert.deepEqual(s.draft, s.existingXi);
  assert.equal(s.calls.filter((call) => call === "touchline_fantasy_reconcile_gameweek:previous").length, 2);
});

test("a customer snapshot reconciles only its immediate predecessor, not historical backlog", async () => {
  const s = scenario({ olderUnsettled: true }); await s.run();
  assert.deepEqual(s.draft, s.xi);
  assert.equal(s.calls.some((call) => call === "touchline_fantasy_reconcile_gameweek:older"), false);
});

test("pending scoring does not discard a safely locked XI during rollover", async () => {
  const s = scenario({ pendingStatistics: true }); await s.run();
  assert.deepEqual(s.draft, s.xi);
  assert.equal(s.coach, "confirmed-coach");
});

for (const failure of ["touchline_fantasy_sync_gameweeks", "touchline_fantasy_reconcile_gameweek"]) {
  test(`rollover fails closed before draft preparation when ${failure} fails`, async () => {
    const s = scenario({ failure });
    assert.equal(await s.run(), null);
    assert.equal(s.draft, undefined);
    assert.equal(s.calls.some((call) => call.startsWith("touchline_fantasy_prepare_user_gameweek")), false);
  });
}

test("an inactive entitlement never prepares a new draft", async () => {
  const s = scenario({ entitlement: false }); await s.run();
  assert.equal(s.draft, undefined);
});

for (const options of [{ refreshFailure: true }, { rejectedReconciliation: true }]) {
  test(`rollover cannot prepare without verified reconciliation and refreshed state: ${JSON.stringify(options)}`, async () => {
    const s = scenario(options);
    assert.equal(await s.run(), null);
    assert.equal(s.draft, undefined);
    assert.equal(s.calls.some((call) => call.startsWith("touchline_fantasy_prepare_user_gameweek")), false);
  });
}

test("pending reconciliation touches only closed, unsettled rounds and stops on failure", async () => {
  const calls: string[] = [];
  const gameweeks = ["SETTLED", "FINAL", "LIVE", "LOCKED", "MARKET_OPEN", "UPCOMING"].map((state) => ({ id: state, state }));
  const admin = { async rpc(name: string, args: { p_gameweek_id: string }) {
    assert.equal(name, "touchline_fantasy_reconcile_gameweek");
    calls.push(args.p_gameweek_id);
    return { data: { ok: true }, error: args.p_gameweek_id === "LIVE" ? { code: "40001", message: "private-details" } : null };
  } };
  const result = await reconcileTouchlineFantasyGameweeks(admin, gameweeks);
  assert.deepEqual(calls, ["FINAL", "LIVE"]);
  assert.equal(result.reconciled, 1);
  assert.equal(result.error, "40001");
  assert.doesNotMatch(JSON.stringify(result), /private-details/);
});

for (const response of [null, { ok: false }, {}, { ok: "true" }]) {
  test(`reconciliation requires an affirmative database result: ${JSON.stringify(response)}`, async () => {
    const result = await reconcileTouchlineFantasyGameweeks({ rpc: async () => ({ data: response, error: null }) }, [{ id: "previous", state: "FINAL" }]);
    assert.equal(result.error, "not-confirmed");
    assert.equal(result.reconciled, 0);
  });
}

test("transport failure is sanitized and cannot be reported as reconciliation success", async () => {
  const result = await reconcileTouchlineFantasyGameweeks({ rpc: async () => { throw new Error("private-details"); } }, [{ id: "previous", state: "FINAL" }]);
  assert.equal(result.error, "unavailable");
  assert.equal(result.reconciled, 0);
});
