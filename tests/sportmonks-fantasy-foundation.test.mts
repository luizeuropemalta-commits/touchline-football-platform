import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildArenaPlayersFromFantasyLineup } from "../lib/football-data/arena-lineup.ts";
import { sanitizeFantasyFixtureFeedForClient } from "../lib/football-data/fantasy-sanitize.ts";
import type { TouchlineFantasyFixtureFeed, TouchlineFantasyLineupMember } from "../lib/football-data/types.ts";

function lineupPlayer(index: number, name: string, positionName: string): TouchlineFantasyLineupMember {
  return {
    id: `lineup-${index}`,
    providerId: `lineup-${index}`,
    provider: "sportmonks",
    fixtureId: "fixture-1",
    playerId: String(1000 + index),
    playerName: name,
    position: positionName,
    isStarter: true,
    raw: {
      image_path: "https://cdn.sportmonks.com/official-player.png",
    },
  };
}

describe("SportMonks fantasy foundation", () => {
  it("builds exactly 11 editable arena players from a SportMonks lineup", () => {
    const arenaPlayers = buildArenaPlayersFromFantasyLineup([
      lineupPlayer(1, "Aaron Ramsdale", "Goalkeeper"),
      lineupPlayer(2, "Trent Alexander-Arnold", "Defender"),
      lineupPlayer(3, "Ibrahima Konate", "Defender"),
      lineupPlayer(4, "Gabriel Magalhaes", "Defender"),
      lineupPlayer(5, "William Saliba", "Defender"),
      lineupPlayer(6, "Declan Rice", "Midfielder"),
      lineupPlayer(7, "Martin Odegaard", "Midfielder"),
      lineupPlayer(8, "Son Heung-min", "Forward"),
      lineupPlayer(9, "Mohamed Salah", "Forward"),
      lineupPlayer(10, "Bukayo Saka", "Forward"),
      lineupPlayer(11, "Unknown Licensed Later", "Forward"),
      lineupPlayer(12, "Bench Player", "Forward"),
    ]);

    assert.equal(arenaPlayers.length, 11);
    assert.equal(arenaPlayers[0].role, "goalkeeper");
    assert.equal(arenaPlayers[0].shortName, "Ramsdale");
    assert.ok(arenaPlayers.find((player) => player.name === "Mohamed Salah")?.asset?.includes("mohamed-salah"));
    assert.equal(arenaPlayers.find((player) => player.name === "Unknown Licensed Later")?.asset, undefined);
  });

  it("removes raw payloads and official media URLs before data reaches the frontend", () => {
    const feed: TouchlineFantasyFixtureFeed = {
      fixture: {
        id: "fixture-1",
        providerId: "fixture-1",
        provider: "sportmonks",
        name: "Home vs Away",
        homeTeam: {
          id: "team-1",
          providerId: "team-1",
          provider: "sportmonks",
          name: "Home",
          logoUrl: "https://cdn.sportmonks.com/official-logo.png",
          source: {
            provider: "sportmonks",
            providerId: "team-1",
            raw: { image_path: "https://cdn.sportmonks.com/official-logo.png" },
          },
        },
        source: {
          provider: "sportmonks",
          providerId: "fixture-1",
          raw: { token: "must-not-leak" },
        },
      },
      lineups: [lineupPlayer(1, "Aaron Ramsdale", "Goalkeeper")],
      formations: [
        {
          id: "formation-1",
          providerId: "formation-1",
          provider: "sportmonks",
          fixtureId: "fixture-1",
          formation: "4-3-3",
          raw: { protected: true },
        },
      ],
      sidelined: [
        {
          id: "sideline-1",
          providerId: "sideline-1",
          provider: "sportmonks",
          fixtureId: "fixture-1",
          playerName: "Unavailable Player",
          reason: "Injury",
          raw: { protected: true },
        },
      ],
      events: [
        {
          id: "event-1",
          providerId: "event-1",
          provider: "sportmonks",
          fixtureId: "fixture-1",
          playerName: "Scorer",
          type: "goal",
          raw: { protected: true },
        },
      ],
      fetchedAt: new Date(0).toISOString(),
      mediaPolicy: {
        officialMediaExposed: false,
        note: "Touchline uses own visual assets.",
      },
    };

    const sanitized = sanitizeFantasyFixtureFeedForClient(feed);
    const serialized = JSON.stringify(sanitized);

    assert.equal(sanitized.fixture.homeTeam?.logoUrl, undefined);
    assert.equal(sanitized.fixture.source.raw, undefined);
    assert.equal(sanitized.lineups[0].raw, undefined);
    assert.equal(sanitized.formations[0].raw, undefined);
    assert.equal(sanitized.sidelined[0].raw, undefined);
    assert.equal(sanitized.events[0].raw, undefined);
    assert.equal(serialized.includes("cdn.sportmonks.com"), false);
    assert.equal(serialized.includes("must-not-leak"), false);
  });
});
