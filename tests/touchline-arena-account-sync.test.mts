import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import type { ArenaLineupPlayer } from "../lib/football-data/arena-lineup.ts";
import {
  canPersistArenaAccountState,
  mergeArenaLineupInventoryFromRoster,
  reconcileArenaLineupWithAuthoritativeRoster,
  resolveArenaAccountSync,
} from "../lib/touchlineArena/arena-account-sync.ts";
import { CLUB_OWNER_SQUAD_CARDS } from "../lib/touchlineArena/demo-data.ts";

const anonymousPrincipal = { kind: "anonymous", sessionId: "browser-session-a" } as const;
const INVENTORY_ID = "123e4567-e89b-42d3-a456-426614174000";
const EXISTING_INVENTORY_ID = "123e4567-e89b-42d3-a456-426614174001";
const ALISSON_CARD = CLUB_OWNER_SQUAD_CARDS.find((card) => card.id === "alisson")!;

function fieldPlayer(overrides: Partial<ArenaLineupPlayer> = {}): ArenaLineupPlayer {
  return {
    id: "field-legacy-alisson",
    name: "Alisson Becker",
    shortName: "Alisson",
    role: "goalkeeper",
    x: 50,
    y: 39,
    heightVh: 11,
    card: {
      templateUrl: "/card.png",
      playerName: "Alisson Becker",
      clubName: "Liverpool",
      position: "GK",
      countryCode3: "BRA",
      inventoryId: null,
    },
    ...overrides,
  };
}

describe("TouchLine Arena account bootstrap", () => {
  it("keeps pending, demo and anonymous persistence away from the account PUT", () => {
    assert.equal(canPersistArenaAccountState(null, "pending"), false);
    assert.equal(canPersistArenaAccountState(anonymousPrincipal, "anonymous"), false);
    assert.equal(canPersistArenaAccountState({ kind: "demo", demoId: "arena-lineup" }, "demo"), false);

    const demo = resolveArenaAccountSync({
      isDemoRequest: true,
      anonymousPrincipal,
      response: null,
    });
    assert.equal(demo.status, "demo");
    assert.equal(demo.principal.kind, "demo");

    const anonymous = resolveArenaAccountSync({
      isDemoRequest: false,
      anonymousPrincipal,
      response: { ok: false, status: 401, payload: { ok: false } },
    });
    assert.equal(anonymous.status, "anonymous");
    assert.deepEqual(anonymous.principal, anonymousPrincipal);
  });

  it("allows remote persistence only after a successful authenticated 200 response", () => {
    const ready = resolveArenaAccountSync({
      isDemoRequest: false,
      anonymousPrincipal,
      response: {
        ok: true,
        status: 200,
        payload: {
          ok: true,
          userId: " user-123 ",
          state: { formation_key: "4-3-3" },
        },
      },
    });

    assert.equal(ready.status, "ready");
    assert.deepEqual(ready.principal, { kind: "authenticated", userId: "user-123" });
    assert.deepEqual(ready.remoteState, { formation_key: "4-3-3" });
    assert.equal(canPersistArenaAccountState(ready.principal, ready.status), true);
  });

  it("keeps 500 or 503 responses with a userId authenticated but unavailable", () => {
    for (const status of [500, 503]) {
      const unavailable = resolveArenaAccountSync({
        isDemoRequest: false,
        anonymousPrincipal,
        response: {
          ok: false,
          status,
          payload: { ok: false, userId: "user-123" },
        },
      });

      assert.equal(unavailable.status, "unavailable");
      assert.deepEqual(unavailable.principal, { kind: "authenticated", userId: "user-123" });
      assert.equal(unavailable.remoteState, null);
      assert.equal(canPersistArenaAccountState(unavailable.principal, unavailable.status), false);
    }
  });

  it("does not promote a non-200 or malformed successful response to ready", () => {
    const created = resolveArenaAccountSync({
      isDemoRequest: false,
      anonymousPrincipal,
      response: {
        ok: true,
        status: 201,
        payload: { ok: true, userId: "user-123", state: { formation_key: "4-3-3" } },
      },
    });
    assert.equal(created.status, "unavailable");
    assert.equal(canPersistArenaAccountState(created.principal, created.status), false);

    const missingIdentity = resolveArenaAccountSync({
      isDemoRequest: false,
      anonymousPrincipal,
      response: { ok: true, status: 200, payload: { ok: true } },
    });
    assert.equal(missingIdentity.status, "unavailable");
    assert.deepEqual(missingIdentity.principal, anonymousPrincipal);
  });

  it("uses the isolated anonymous cache as visual-only when identity fetch fails", () => {
    const unavailable = resolveArenaAccountSync({
      isDemoRequest: false,
      anonymousPrincipal,
      response: null,
    });

    assert.equal(unavailable.status, "unavailable");
    assert.deepEqual(unavailable.principal, anonymousPrincipal);
    assert.equal(canPersistArenaAccountState(unavailable.principal, unavailable.status), false);
  });
});

describe("TouchLine Arena legacy inventory reconciliation", () => {
  it("merges a persisted inventory UUID into a legacy field player before roster rewrite", () => {
    const roster = [{ ...ALISSON_CARD, inventoryId: INVENTORY_ID }];
    const players = [fieldPlayer()];
    const merged = mergeArenaLineupInventoryFromRoster(players, roster);

    assert.notEqual(merged, players);
    assert.equal(merged[0].card?.inventoryId, INVENTORY_ID);
    assert.equal(merged[0].x, players[0].x);
    assert.equal(merged[0].card?.templateUrl, players[0].card?.templateUrl);
    assert.equal(players[0].card?.inventoryId, null);
  });

  it("never overwrites an existing field inventory UUID", () => {
    const player = fieldPlayer({
      card: { ...fieldPlayer().card!, inventoryId: EXISTING_INVENTORY_ID },
    });
    const players = [player];
    const merged = mergeArenaLineupInventoryFromRoster(players, [
      { ...ALISSON_CARD, inventoryId: INVENTORY_ID },
    ]);

    assert.equal(merged, players);
    assert.equal(merged[0].card?.inventoryId, EXISTING_INVENTORY_ID);
  });

  it("does not merge a same-name card from another club or a malformed inventory id", () => {
    const otherClub = [{
      ...ALISSON_CARD,
      clubName: "Manchester City",
      inventoryId: INVENTORY_ID,
    }];
    assert.equal(
      mergeArenaLineupInventoryFromRoster([fieldPlayer()], otherClub)[0].card?.inventoryId,
      null,
    );

    const malformed = [{ ...ALISSON_CARD, inventoryId: "not-a-uuid" }];
    assert.equal(
      mergeArenaLineupInventoryFromRoster([fieldPlayer()], malformed)[0].card?.inventoryId,
      null,
    );
  });

  it("keeps only cards backed by active authoritative inventory contracts", () => {
    const owned = fieldPlayer();
    const released = fieldPlayer({
      id: "field-released-player",
      name: "Released Player",
      shortName: "Released",
      card: {
        ...fieldPlayer().card!,
        playerName: "Released Player",
        inventoryId: EXISTING_INVENTORY_ID,
      },
    });
    const roster = [{ ...ALISSON_CARD, inventoryId: INVENTORY_ID }];

    const reconciled = reconcileArenaLineupWithAuthoritativeRoster(
      [owned, released],
      roster,
    );

    assert.equal(reconciled.length, 1);
    assert.equal(reconciled[0].name, "Alisson Becker");
    assert.equal(reconciled[0].card?.inventoryId, INVENTORY_ID);
  });
});

it("wires the account sync gate before the Arena remote PUT", async () => {
  const source = await readFile(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");
  const remotePutIndex = source.indexOf('method: "PUT"');
  assert.ok(remotePutIndex > 0);
  const effectStart = source.lastIndexOf("useEffect(() => {", remotePutIndex);
  const effect = source.slice(effectStart, remotePutIndex + 80);

  assert.match(effect, /!hasLoadedClubOwnerRoster/);
  assert.match(effect, /canPersistArenaAccountState\(arenaPersistencePrincipal, arenaAccountSyncStatus\)/);
  assert.match(effect, /arenaRosterSyncStatus !== "ready"/);
  assert.ok(effect.indexOf("canPersistArenaAccountState") < effect.indexOf('method: "PUT"'));
  assert.match(source, /data-account-sync-status=\{arenaAccountSyncStatus\}/);
  assert.match(source, /data-roster-sync-status=\{arenaRosterSyncStatus\}/);
  assert.match(source, /fetch\("\/api\/touchline-arena\/roster", \{ cache: "no-store" \}\)/);
  assert.match(source, /reconcileArenaLineupWithAuthoritativeRoster\(players, roster\)/);
});

it("bootstraps account identity through the bounded authoritative server route", async () => {
  const source = await readFile(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /hasTouchlineBrowserSession/);
  assert.doesNotMatch(source, /supabase\.auth\.getSession\(\)/);
  const bootstrapStart = source.indexOf("if (!isDemoRequest) {");
  const bootstrapEnd = source.indexOf("if (cancelled) return;", bootstrapStart);
  const bootstrap = source.slice(bootstrapStart, bootstrapEnd);
  assert.match(bootstrap, /touchlineJsonRequest</);
  assert.match(bootstrap, /"\/api\/touchline-arena\/state"/);
  assert.match(bootstrap, /\{ cache: "no-store", timeoutMs: 8_000 \}/);
  assert.match(source, /setHasLoadedOwnerCoach\(true\)/);
});

it("bootstraps an authenticated wallet from the authoritative inventory snapshot", async () => {
  const source = await readFile(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");
  const bootstrapStart = source.indexOf('arenaAccountSyncStatus !== "ready"');
  const bootstrapEnd = source.indexOf("useEffect(() => {", bootstrapStart + 20);
  const bootstrapEffect = source.slice(bootstrapStart, bootstrapEnd);

  assert.match(source, /const \[marketWalletBalanceTc, setMarketWalletBalanceTc\] = useState\(0\)/);
  assert.match(bootstrapEffect, /arenaPersistencePrincipal\?\.kind !== "authenticated"/);
  assert.match(bootstrapEffect, /\/api\/touchline-arena\/market\/inventory\?teamId=/);
  assert.match(bootstrapEffect, /setMarketWalletBalanceTc\(inventorySnapshot\.walletBalanceTc\)/);
});
