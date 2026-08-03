import assert from "node:assert/strict";
import test from "node:test";
import {
  mapSportmonksTransfer,
  sortSportmonksTransfersNewestFirst,
} from "../lib/football-data/sportmonks-transfers.ts";

test("maps an official SportMonks transfer without exposing raw payload", () => {
  const transfer = mapSportmonksTransfer({
    id: 901,
    player_id: 12,
    from_team_id: 34,
    to_team_id: 56,
    date: "2024-07-01",
    amount: "25.5",
    player: { id: 12, display_name: "Verified Player" },
    fromteam: { id: 34, name: "Origin FC" },
    toteam: { data: { id: 56, name: "Destination FC" } },
    type: { id: 1, name: "Transfer" },
  });

  assert.deepEqual(transfer, {
    id: "sportmonks:901",
    providerId: "901",
    provider: "sportmonks",
    playerId: "12",
    playerName: "Verified Player",
    fromTeamId: "34",
    fromTeamName: "Origin FC",
    toTeamId: "56",
    toTeamName: "Destination FC",
    date: "2024-07-01",
    type: "Transfer",
    amount: 25.5,
    currency: undefined,
    source: { provider: "sportmonks", providerId: "901" },
  });
  assert.equal("raw" in (transfer?.source ?? {}), false);
});

test("ignores transfer records without an official id", () => {
  assert.equal(mapSportmonksTransfer({ player_id: 12 }), null);
});

test("orders official transfers by date even when the provider response is mixed", () => {
  const transfers = [
    mapSportmonksTransfer({ id: 1, date: "2015-07-01" }),
    mapSportmonksTransfer({ id: 2, date: "2025-09-01" }),
    mapSportmonksTransfer({ id: 3, date: "2021-07-01" }),
  ].filter((transfer): transfer is NonNullable<typeof transfer> => Boolean(transfer));

  assert.deepEqual(
    sortSportmonksTransfersNewestFirst(transfers).map((transfer) => transfer.providerId),
    ["2", "3", "1"],
  );
});
