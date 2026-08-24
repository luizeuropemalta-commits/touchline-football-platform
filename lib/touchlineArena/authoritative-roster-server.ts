import type { SupabaseClient } from "@supabase/supabase-js";

import {
  inferArenaRole,
  makeArenaShortName,
  normalizeOfficialShirtNumber,
} from "../football-data/arena-lineup.ts";
import type { TouchlinePublicEditorialCardPresentation } from "./editorial-card-profile.ts";
import {
  hasTouchlineCountryFlag,
  normalizeTouchlineCountryCode3,
  touchlineCountryCode3FromName,
} from "./country-flags.ts";
import type { ClubOwnerSquadCard } from "./demo-data.ts";
import { touchlineArenaTierForKey } from "./card-rules.ts";
import {
  projectTouchlineCardStatsByPosition,
  type TouchlineCardStats,
} from "./position-aware-card-stats.ts";

type DatabaseRecord = Record<string, unknown>;

export type AuthoritativeRosterRows = {
  contracts: DatabaseRecord[];
  inventories: DatabaseRecord[];
  players: DatabaseRecord[];
  clubs: DatabaseRecord[];
  squadMembers: DatabaseRecord[];
  playerSeasonStatistics?: DatabaseRecord[];
  playerFixtureStatistics?: DatabaseRecord[];
  /** Immutable V3 fallback while the seasonal `is_current` marker changes. */
  publishedV3TotalRatings?: ReadonlyMap<string, number>;
};

export type AuthoritativeRosterSnapshot = {
  source: "supabase";
  ownedContractCount: number;
  activeContractCount: number;
  representedClubCount: number;
  inventoryIds: string[];
  cards: ClubOwnerSquadCard[];
};

export type AuthoritativeRosterErrorCode =
  | "TL_ROSTER_INVALID_USER"
  | "TL_ROSTER_CONTRACTS_UNAVAILABLE"
  | "TL_ROSTER_INVENTORY_UNAVAILABLE"
  | "TL_ROSTER_PLAYERS_UNAVAILABLE"
  | "TL_ROSTER_CLUBS_UNAVAILABLE"
  | "TL_ROSTER_SQUAD_UNAVAILABLE"
  | "TL_ROSTER_READ_TIMEOUT"
  | "TL_ROSTER_DATA_INCOMPLETE";

export type AuthoritativeRosterReadResult =
  | { ok: true; snapshot: AuthoritativeRosterSnapshot }
  | { ok: false; error: AuthoritativeRosterErrorCode };

export type LineupInventoryOwnershipValidation = {
  ok: boolean;
  inventoryIds: string[];
  missingInventoryIndexes: number[];
  foreignInventoryIds: string[];
  duplicateInventoryIds: string[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): DatabaseRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as DatabaseRecord
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asUuid(value: unknown) {
  const candidate = asString(value)?.toLowerCase() ?? null;
  return candidate && UUID_PATTERN.test(candidate) ? candidate : null;
}

function asFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function countryCodeForPlayer(player: DatabaseRecord) {
  const fromName = touchlineCountryCode3FromName(asString(player.nationality));
  if (fromName && hasTouchlineCountryFlag(fromName)) return fromName;

  const fromStoredCode = normalizeTouchlineCountryCode3(asString(player.country_id));
  return hasTouchlineCountryFlag(fromStoredCode) ? fromStoredCode : "N/A";
}

function totalRatingFor(seasonStatistic?: DatabaseRecord | null) {
  return asFiniteNumber(asRecord(seasonStatistic?.summary_payload)?.totalRating);
}

function verifiedSeasonStats(row: DatabaseRecord | null | undefined, position: string) {
  const summary = asRecord(row?.summary_payload);
  if (!summary) return undefined;
  const positionStatistics = asRecord(row?.position_statistics_payload);
  const value = (...keys: string[]) => {
    for (const key of keys) {
      const numeric = asFiniteNumber(summary[key]) ?? asFiniteNumber(positionStatistics?.[key]);
      if (numeric !== null) return numeric;
    }
    return null;
  };
  const yellow = value("yellowCards", "yellow-cards", "yellowcards");
  const red = value("redCards", "red-cards", "redcards");
  const entries = [
    ["goals", value("goals")],
    ["assists", value("assists")],
    ["cleanSheets", value("cleanSheets", "clean-sheets", "cleansheets")],
    ["saves", value("saves")],
    ["goalsConceded", value("goalsConceded", "goalkeeper-goals-conceded", "goals-conceded")],
    ["defense", value("def-score")],
    ["shotsOnTarget", value("shots-on-target")],
    ["shotsOffTarget", value("shots-off-target")],
    ["defensiveActionsTotal", value("defensive-actions-total")],
    ["penaltySaves", value("penalty-saves")],
    ["penaltiesMissed", value("penalties-missed")],
    ["ownGoals", value("own-goals")],
    ["yellowCards", yellow],
    ["redCards", red],
    ["cards", yellow === null || red === null ? null : yellow + red],
  ].filter((entry): entry is [string, number] => typeof entry[1] === "number");
  return projectTouchlineCardStatsByPosition({
    position,
    statistics: entries.length ? Object.fromEntries(entries) as TouchlineCardStats : undefined,
  });
}

function verifiedMatchStats(row: DatabaseRecord | null | undefined, position: string) {
  const statistics = asRecord(row?.statistics_payload);
  if (!statistics) return undefined;
  const value = (...keys: string[]) => {
    for (const key of keys) {
      const numeric = asFiniteNumber(statistics[key]);
      if (numeric !== null) return numeric;
    }
    return null;
  };
  const yellow = value("yellow-cards", "yellowcards");
  const red = value("red-cards", "redcards");
  const entries = [
    ["goals", value("goals")],
    ["assists", value("assists")],
    ["cleanSheets", value("clean-sheets", "cleansheets")],
    ["saves", value("saves")],
    ["goalsConceded", value("goalkeeper-goals-conceded", "goals-conceded")],
    ["defense", value("def-score")],
    ["shotsOnTarget", value("shots-on-target")],
    ["shotsOffTarget", value("shots-off-target")],
    ["defensiveActionsTotal", value("defensive-actions-total")],
    ["penaltySaves", value("penalty-saves")],
    ["penaltiesMissed", value("penalties-missed")],
    ["ownGoals", value("own-goals")],
    ["yellowCards", yellow],
    ["redCards", red],
    ["cards", yellow === null || red === null ? null : yellow + red],
  ].filter((entry): entry is [string, number] => typeof entry[1] === "number");
  const rating = asFiniteNumber(row?.rating) ?? value("rating");
  const statisticsWithRating = {
    ...Object.fromEntries(entries),
    rating,
  } as TouchlineCardStats;
  return projectTouchlineCardStatsByPosition({ position, statistics: statisticsWithRating });
}

function preferredSquadMember(
  squadMembers: DatabaseRecord[],
  playerId: string,
  clubId: string | null,
) {
  const candidates = squadMembers.filter((member) => (
    asUuid(member.player_id) === playerId
    && asString(member.status) === "active"
  ));
  return candidates.find((member) => clubId && asUuid(member.club_id) === clubId)
    ?? candidates[0]
    ?? null;
}

/**
 * Converts normalized database rows into the one canonical card shape used by
 * the Arena. It deliberately rejects partial active-contract data: returning a
 * shorter roster would make an owned card appear to have disappeared.
 */
export function mapAuthoritativeRosterRows(
  rows: AuthoritativeRosterRows,
  publishedCards: ReadonlyMap<string, TouchlinePublicEditorialCardPresentation> = new Map(),
): AuthoritativeRosterReadResult {
  const allRows = [
    ...rows.contracts,
    ...rows.inventories,
    ...rows.players,
    ...rows.clubs,
    ...rows.squadMembers,
  ];
  if (allRows.some((row) => !asRecord(row))) {
    return { ok: false, error: "TL_ROSTER_DATA_INCOMPLETE" };
  }

  const inventoriesById = new Map(
    rows.inventories.flatMap((inventory) => {
      const id = asUuid(inventory.id);
      return id ? [[id, inventory] as const] : [];
    }),
  );
  const playersById = new Map(
    rows.players.flatMap((player) => {
      const id = asUuid(player.id);
      return id ? [[id, player] as const] : [];
    }),
  );
  const clubsById = new Map(
    rows.clubs.flatMap((club) => {
      const id = asUuid(club.id);
      return id ? [[id, club] as const] : [];
    }),
  );

  const cards: ClubOwnerSquadCard[] = [];
  const inventoryIds: string[] = [];
  const representedClubIds = new Set<string>();
  const seasonStatisticByPlayerId = new Map((rows.playerSeasonStatistics ?? []).flatMap((row) => {
    const playerId = asUuid(row.football_player_id);
    return playerId ? [[playerId, row] as const] : [];
  }));
  const fixtureStatisticByPlayerId = new Map<string, DatabaseRecord>();
  for (const row of rows.playerFixtureStatistics ?? []) {
    const playerId = asUuid(row.football_player_id);
    if (playerId && !fixtureStatisticByPlayerId.has(playerId)) fixtureStatisticByPlayerId.set(playerId, row);
  }

  for (const contract of rows.contracts) {
    if (asString(contract.status) !== "active") {
      return { ok: false, error: "TL_ROSTER_DATA_INCOMPLETE" };
    }

    const inventoryId = asUuid(contract.card_id);
    const inventory = inventoryId ? inventoriesById.get(inventoryId) : null;
    const playerId = inventory ? asUuid(inventory.player_id) : null;
    const player = playerId ? playersById.get(playerId) : null;
    if (!inventoryId || !inventory || !playerId || !player) {
      return { ok: false, error: "TL_ROSTER_DATA_INCOMPLETE" };
    }

    const inventoryClubId = asUuid(inventory.club_id);
    const clubId = inventoryClubId ?? asUuid(player.current_club_id);
    if (inventoryClubId) representedClubIds.add(inventoryClubId);
    const club = clubId ? clubsById.get(clubId) : null;
    const squadMember = preferredSquadMember(rows.squadMembers, playerId, clubId);
    const name = asString(player.display_name)
      ?? asString(player.name)
      ?? asString(inventory.player_name);
    const clubName = asString(club?.name)
      ?? asString(inventory.club_name)
      ?? "Club pending";
    if (!name) return { ok: false, error: "TL_ROSTER_DATA_INCOMPLETE" };

    const position = asString(squadMember?.position)
      ?? asString(player.position)
      ?? "Player";
    const editorialCard = publishedCards.get(playerId) ?? null;
    // A public game card still requires editorial publication. The private
    // ClubOwner roster is narrower: an active contract may retain its frozen
    // purchase tier so the owner's saved XI never loses its card artwork while
    // editorial review is pending. This does not provide a price or publish
    // the card to any public/commercial surface.
    const contractedTier = touchlineArenaTierForKey(asString(contract.purchase_tier));
    const contractedPriceVersion = asString(contract.purchase_price_table_version);
    if (!editorialCard && !contractedTier) {
      return { ok: false, error: "TL_ROSTER_DATA_INCOMPLETE" };
    }

    const seasonStats = verifiedSeasonStats(seasonStatisticByPlayerId.get(playerId), position);
    const matchStats = verifiedMatchStats(fixtureStatisticByPlayerId.get(playerId), position);
    // The public ranking is already the audited V3 publication. Its rating is
    // authoritative when the season aggregate is temporarily outside the
    // current-season marker, never a local recalculation or V2 fallback.
    const seasonTotalRating = totalRatingFor(seasonStatisticByPlayerId.get(playerId))
      ?? asFiniteNumber(rows.publishedV3TotalRatings?.get(playerId));
    const matchRating = asFiniteNumber(fixtureStatisticByPlayerId.get(playerId)?.rating);
    cards.push({
      id: playerId,
      canonicalPlayerId: playerId,
      name,
      shortName: makeArenaShortName(name),
      role: inferArenaRole(position),
      position,
      clubName,
      shirtNumber: normalizeOfficialShirtNumber(squadMember?.jersey_number),
      countryCode3: countryCodeForPlayer(player),
      // The authoritative roster is a card/contract read, not a valuation
      // feed. Legacy fields stay inert for DTO compatibility; the shared card
      // component ignores them in favour of the manual editorial profile or
      // the frozen active-contract terms below.
      marketValue: "",
      marketValueSource: "unavailable",
      cardTier: editorialCard?.tierKey ?? contractedTier!.key,
      ...(editorialCard ? {} : {
        cardPriceVersion: contractedPriceVersion ?? undefined,
        cardPriceAuthority: "active-contract" as const,
      }),
      inventoryId,
      // Legacy V2/V3 scoring data deliberately does not cross this player UI
      // read model. The fields remain inert only for the persisted DTO shape.
      touchlinePoints: 0,
      seasonTouchlinePoints: null,
      ...(seasonTotalRating === null ? {} : { seasonTotalRating }),
      ...(matchRating === null ? {} : { matchRating }),
      ...(seasonStats ? { seasonStats } : {}),
      ...(matchStats ? { matchStats } : {}),
      editorialCard,
    });
    inventoryIds.push(inventoryId);
  }

  if (new Set(inventoryIds).size !== inventoryIds.length) {
    return { ok: false, error: "TL_ROSTER_DATA_INCOMPLETE" };
  }

  return {
    ok: true,
    snapshot: {
      source: "supabase",
      ownedContractCount: rows.contracts.length,
      activeContractCount: cards.length,
      representedClubCount: representedClubIds.size,
      inventoryIds,
      cards,
    },
  };
}

function dataRows(value: unknown) {
  if (!Array.isArray(value)) return null;
  const rows = value.map(asRecord);
  return rows.every((row): row is DatabaseRecord => Boolean(row)) ? rows : null;
}

/**
 * Reads the roster strictly from active contracts. The caller must supply the
 * authenticated user's UUID; no client persistence is consulted.
 */
export async function readAuthoritativeTouchlineRoster(
  admin: SupabaseClient,
  userId: string,
): Promise<AuthoritativeRosterReadResult> {
  const requestedUserId = asUuid(userId);
  if (!requestedUserId) return { ok: false, error: "TL_ROSTER_INVALID_USER" };

  const contractsResponse = await admin
    .from("touchline_card_contracts")
    .select(
      "id,card_id,status,purchase_tier,purchase_price_table_version,contracted_at,metadata",
    )
    .eq("user_id", requestedUserId)
    .eq("status", "active")
    .order("contracted_at", { ascending: true });
  if (contractsResponse.error) {
    return { ok: false, error: "TL_ROSTER_CONTRACTS_UNAVAILABLE" };
  }

  const contracts = dataRows(contractsResponse.data);
  if (!contracts) {
    return { ok: false, error: "TL_ROSTER_DATA_INCOMPLETE" };
  }
  if (!contracts.length) {
    return {
      ok: true,
      snapshot: {
        source: "supabase",
        ownedContractCount: 0,
        activeContractCount: 0,
        representedClubCount: 0,
        inventoryIds: [],
        cards: [],
      },
    };
  }

  const inventoryIds = contracts
    .map((contract) => asUuid(contract.card_id))
    .filter((id): id is string => Boolean(id));
  if (inventoryIds.length !== contracts.length) {
    return { ok: false, error: "TL_ROSTER_DATA_INCOMPLETE" };
  }

  const inventoryResponse = await admin
    .from("touchline_card_inventory")
    .select(
      "id,player_id,club_id,player_name,club_name,competition_tier,price_table_version,metadata",
    )
    .in("id", inventoryIds);
  if (inventoryResponse.error) {
    return { ok: false, error: "TL_ROSTER_INVENTORY_UNAVAILABLE" };
  }
  const inventories = dataRows(inventoryResponse.data);
  if (!inventories || inventories.length !== inventoryIds.length) {
    return { ok: false, error: "TL_ROSTER_DATA_INCOMPLETE" };
  }

  const playerIds = inventories
    .map((inventory) => asUuid(inventory.player_id))
    .filter((id): id is string => Boolean(id));
  if (playerIds.length !== inventories.length) {
    return { ok: false, error: "TL_ROSTER_DATA_INCOMPLETE" };
  }

  const playersResponse = await admin
    .from("football_players")
    .select(
      "id,provider_player_id,current_club_id,name,display_name,nationality,country_id,position",
    )
    .in("id", playerIds);
  if (playersResponse.error) {
    return { ok: false, error: "TL_ROSTER_PLAYERS_UNAVAILABLE" };
  }
  const players = dataRows(playersResponse.data);
  if (!players || players.length !== playerIds.length) {
    return { ok: false, error: "TL_ROSTER_DATA_INCOMPLETE" };
  }

  const clubIds = [...new Set([
    ...inventories.map((inventory) => asUuid(inventory.club_id)),
    ...players.map((player) => asUuid(player.current_club_id)),
  ].filter((id): id is string => Boolean(id)))];

  const [clubsResponse, squadResponse, currentSeasonResponse, activeRanking] = await Promise.all([
    clubIds.length
      ? admin
        .from("football_clubs")
        .select("id,provider_team_id,name,short_code")
        .in("id", clubIds)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("football_squad_members")
      .select("player_id,club_id,jersey_number,position,status,source_updated_at")
      .in("player_id", playerIds)
      .eq("status", "active")
      .order("source_updated_at", { ascending: false }),
    admin
      .from("football_seasons")
      .select("id,football_competitions!inner(provider_competition_id)")
      .eq("provider", "sportmonks")
      .eq("is_current", true)
      .eq("football_competitions.provider_competition_id", "8")
      .maybeSingle(),
    import("./card-ranking-server.ts").then(({ loadTouchLineActiveRanking }) => loadTouchLineActiveRanking()),
  ]);
  if (clubsResponse.error) {
    return { ok: false, error: "TL_ROSTER_CLUBS_UNAVAILABLE" };
  }
  if (squadResponse.error) {
    return { ok: false, error: "TL_ROSTER_SQUAD_UNAVAILABLE" };
  }

  const clubs = dataRows(clubsResponse.data);
  const squadMembers = dataRows(squadResponse.data);
  if (!clubs || !squadMembers) {
    return { ok: false, error: "TL_ROSTER_DATA_INCOMPLETE" };
  }

  const currentSeasonId = asUuid(currentSeasonResponse.data?.id);
  const publishedV3TotalRatings = new Map(
    activeRanking.phase === "ranked" && activeRanking.scoringVersion === "player_scoring_v3"
      ? activeRanking.players.flatMap((player) => {
        const playerId = asUuid(player.playerId);
        const totalRating = player.totalRating;
        return playerId && typeof totalRating === "number" && Number.isFinite(totalRating)
          ? [[playerId, totalRating] as const]
          : [];
      })
      : [],
  );
  const [seasonStatisticsResponse, fixtureStatisticsResponse] = await Promise.all([
    currentSeasonId
      ? admin.from("football_player_season_statistics")
        .select("football_player_id,summary_payload,position_statistics_payload,source_synced_at")
        .eq("season_id", currentSeasonId)
        .eq("scoring_version", "player_scoring_v3")
        .in("football_player_id", playerIds)
      : Promise.resolve({ data: [], error: null }),
    currentSeasonId
      ? admin.from("touchline_player_fixture_score_settlements")
        .select("football_player_id,rating,statistics_payload,source_synced_at,football_fixtures!inner(starts_at)")
        .eq("season_id", currentSeasonId)
        .eq("scoring_version", "player_scoring_v3")
        .in("football_player_id", playerIds)
        .order("starts_at", { referencedTable: "football_fixtures", ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (seasonStatisticsResponse.error || fixtureStatisticsResponse.error) {
    return { ok: false, error: "TL_ROSTER_DATA_INCOMPLETE" };
  }

  const { loadTouchlinePublishedCardPresentations } = await import("./card-publication-read-model.ts");
  const publishedCards = await loadTouchlinePublishedCardPresentations({
    playerIds,
  });

  return mapAuthoritativeRosterRows({
    contracts,
    inventories,
    players,
    clubs,
    squadMembers,
    playerSeasonStatistics: dataRows(seasonStatisticsResponse.data) ?? [],
    playerFixtureStatistics: dataRows(fixtureStatisticsResponse.data) ?? [],
    publishedV3TotalRatings,
  }, publishedCards);
}

function lineupInventoryId(value: unknown) {
  const card = asRecord(value);
  if (!card) return null;
  return asUuid(card.inventoryId)
    ?? asUuid(asRecord(card.card)?.inventoryId);
}

/**
 * Strict reusable guard for future Arena-state writes. A lineup entry without
 * inventoryId is incomplete, and an inventoryId outside the active-contract
 * set is foreign. Duplicate cards are rejected as well.
 */
export function validateLineupInventoryOwnership(
  lineup: unknown,
  activeInventoryIds: Iterable<string>,
): LineupInventoryOwnershipValidation {
  const entries = Array.isArray(lineup) ? lineup : [];
  const active = new Set(
    [...activeInventoryIds]
      .map((id) => asUuid(id))
      .filter((id): id is string => Boolean(id)),
  );
  const inventoryIds: string[] = [];
  const missingInventoryIndexes: number[] = [];
  const foreignInventoryIds = new Set<string>();
  const duplicateInventoryIds = new Set<string>();
  const seen = new Set<string>();

  entries.forEach((entry, index) => {
    const inventoryId = lineupInventoryId(entry);
    if (!inventoryId) {
      missingInventoryIndexes.push(index);
      return;
    }
    inventoryIds.push(inventoryId);
    if (!active.has(inventoryId)) foreignInventoryIds.add(inventoryId);
    if (seen.has(inventoryId)) duplicateInventoryIds.add(inventoryId);
    seen.add(inventoryId);
  });

  return {
    ok:
      Array.isArray(lineup)
      && missingInventoryIndexes.length === 0
      && foreignInventoryIds.size === 0
      && duplicateInventoryIds.size === 0,
    inventoryIds,
    missingInventoryIndexes,
    foreignInventoryIds: [...foreignInventoryIds],
    duplicateInventoryIds: [...duplicateInventoryIds],
  };
}
