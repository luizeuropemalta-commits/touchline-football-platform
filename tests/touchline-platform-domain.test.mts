import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  toTouchlineRealFootballPlayer,
  toTouchlineRealFootballTransfer,
} from "../lib/football-data/platform-domain.ts";
import { createTouchlinePlatformModuleContext } from "../lib/touchlinePlatform/module-context.ts";

test("real-football contracts preserve canonical and external identity without game state", () => {
  const player = toTouchlineRealFootballPlayer({
    id: "football-player-1",
    provider: "sportmonks",
    providerId: "123",
    name: "Ada Player",
    displayName: "Ada Player",
    currentTeamId: "club-1",
    currentTeamName: "North Club",
    marketValue: 10_000_000,
    marketValueCurrency: "EUR",
    contractUntil: "2028-06-30",
    source: { provider: "sportmonks", providerId: "123" },
  });
  assert.deepEqual(player, {
    id: "football-player-1",
    externalId: { provider: "sportmonks", providerId: "123" },
    name: "Ada Player",
    displayName: "Ada Player",
    position: null,
    currentClubId: "club-1",
    currentClubName: "North Club",
    nationality: null,
    photoUrl: null,
    marketValue: 10_000_000,
    marketValueCurrency: "EUR",
    realContractUntil: "2028-06-30",
  });
  assert.deepEqual(toTouchlineRealFootballTransfer({
    id: "transfer-1",
    provider: "sportmonks",
    providerId: "transfer-123",
    playerId: "123",
    fromTeamId: "club-1",
    toTeamId: "club-2",
    amount: 5000000,
    currency: "EUR",
    source: { provider: "sportmonks", providerId: "transfer-123" },
  }), {
    id: "transfer-1",
    externalId: { provider: "sportmonks", providerId: "transfer-123" },
    playerId: "123",
    fromClubId: "club-1",
    toClubId: "club-2",
    occurredOn: null,
    type: null,
    amount: 5000000,
    currency: "EUR",
  });
});

test("module context keeps the same global user, profile and session", () => {
  const principal = { userId: "user-1", profileId: "profile-1", sessionId: "session-1" };
  const game = createTouchlinePlatformModuleContext({ principal, activeModule: "game" });
  const agent = createTouchlinePlatformModuleContext({ principal, activeModule: "agent" });
  assert.equal(game.principal, principal);
  assert.equal(agent.principal, principal);
  assert.equal(agent.activeModule, "agent");
});

test("platform contracts do not import game-only modules or create separate identity", () => {
  const domainSource = readFileSync(new URL("../lib/football-data/platform-domain.ts", import.meta.url), "utf8");
  const contextSource = readFileSync(new URL("../lib/touchlinePlatform/module-context.ts", import.meta.url), "utf8");
  assert.doesNotMatch(domainSource, /touchlineArena|wallet|touch credits|tier|border|fantasy points|clubowner/i);
  assert.doesNotMatch(contextSource, /createClient|signIn|signUp|touchlineArena|wallet|touch credits/i);
  assert.match(contextSource, /One principal is shared across every current or future TouchLine module/);
});
