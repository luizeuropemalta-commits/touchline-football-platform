import { after, NextResponse } from "next/server";
import {
  inferArenaRole,
  makeArenaShortName,
} from "@/lib/football-data/arena-lineup";
import { createFootballDataProvider } from "@/lib/football-data/provider-factory";
import {
  persistSquadSnapshot,
  readPersistedSquadSnapshot,
  type PersistedSquadPlayer,
} from "@/lib/football-data/squad-snapshot-store";
import type { TouchlineSquadMember } from "@/lib/football-data/types";
import { resolveOfficialShirtNumber } from "@/lib/football-data/official-shirt-numbers";
import {
  TOUCHLINE_CARD_PRICE_TABLE_VERSION,
  parseMarketValueEur,
  touchlineArenaCompetitionTierForCard,
  type TouchlineCardTierKey,
} from "@/lib/touchlineArena/card-rules";
import { publicFootballDataFailure } from "@/lib/football-data/public-error";
import {
  hasTouchlineCountryFlag,
  normalizeTouchlineCountryCode3,
  touchlineCountryCode3FromName,
  touchlineCountryFlagUrl,
} from "@/lib/touchlineArena/country-flags";
import { TOUCHLINE_ENGLAND_CLUBS } from "@/lib/touchlineArena/demo-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RawRecord = Record<string, unknown>;
const LIVE_REFRESH_SNAPSHOT_WAIT_MS = 500;

async function readSnapshotForLiveRefresh(
  snapshot: Promise<Awaited<ReturnType<typeof readPersistedSquadSnapshot>>>,
) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      snapshot.catch(() => null),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), LIVE_REFRESH_SNAPSHOT_WAIT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function asRecord(value: unknown): RawRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawRecord) : null;
}

function unwrapRecord(value: unknown): RawRecord | null {
  const record = asRecord(value);
  if (!record) return null;
  return asRecord(record.data) ?? record;
}

function marketValueCandidateFromRaw(raw: unknown): unknown {
  const record = asRecord(raw);
  if (!record) return null;

  const directKeys = [
    "market_value_eur",
    "market_value",
    "marketValue",
    "marketValueEur",
    "transfer_value",
    "transferValue",
    "value_eur",
  ];

  for (const key of directKeys) {
    if (record[key] !== null && record[key] !== undefined && record[key] !== "") return record[key];
  }

  const metadata = record.metadata;
  if (Array.isArray(metadata)) {
    for (const item of metadata) {
      const meta = asRecord(item);
      if (!meta) continue;
      const label = String(meta.name ?? meta.key ?? meta.type ?? "").toLowerCase();
      if (!label.includes("market") && !label.includes("value")) continue;
      const value = meta.value ?? meta.data ?? meta.amount;
      if (value !== null && value !== undefined && value !== "") return value;
    }
  }

  const player = asRecord(record.player);
  if (player) return marketValueCandidateFromRaw(player);

  return null;
}

function shirtNumberCandidateFromRaw(raw: unknown): unknown {
  const record = asRecord(raw);
  if (!record) return null;

  const directKeys = [
    "jersey_number",
    "jerseyNumber",
    "shirt_number",
    "shirtNumber",
    "squad_number",
    "squadNumber",
    "number",
  ];

  for (const key of directKeys) {
    const value = record[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }

  const player = asRecord(record.player);
  if (player) {
    const playerValue = shirtNumberCandidateFromRaw(player);
    if (playerValue !== null && playerValue !== undefined && playerValue !== "") return playerValue;
  }

  const details = asRecord(record.details);
  if (details) {
    const detailsValue = shirtNumberCandidateFromRaw(details);
    if (detailsValue !== null && detailsValue !== undefined && detailsValue !== "") return detailsValue;
  }

  return null;
}

function stringCandidate(record: RawRecord | null, keys: string[]) {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function countryRecordFromRaw(raw: unknown): RawRecord | null {
  const record = asRecord(raw);
  if (!record) return null;
  return unwrapRecord(record.nationality) ?? unwrapRecord(record.country) ?? countryRecordFromRaw(record.player);
}

function countryCode3(name?: string | null, code?: string | null) {
  const normalizedCode = normalizeTouchlineCountryCode3(code);
  if (hasTouchlineCountryFlag(normalizedCode)) return normalizedCode;

  const codeFromName = touchlineCountryCode3FromName(name);
  if (codeFromName) return codeFromName;

  return normalizedCode !== "N/A" ? normalizedCode : "N/A";
}

function countryCodeCandidateFromRaw(raw: unknown) {
  const country = countryRecordFromRaw(raw);
  return stringCandidate(country, ["iso3", "fifa_name", "code", "iso2"]);
}

function countryNameCandidateFromRaw(raw: unknown) {
  const country = countryRecordFromRaw(raw);
  return stringCandidate(country, ["name", "display_name"]);
}

function formatMarketValue(value: unknown) {
  const marketValue = parseMarketValueEur(typeof value === "number" || typeof value === "string" ? value : null);
  if (!marketValue) return null;
  return `€${Math.round(marketValue / 1_000_000)}M`;
}

function mapSquadMember(
  member: TouchlineSquadMember,
  clubTeamId: string,
  clubName: string,
  clubShortCode: string,
  clubLogoUrl: string | null,
  cachedPlayer?: PersistedSquadPlayer,
) {
  const player = member.player;
  const playerName = player.displayName || player.name;
  const position = member.position || player.position || null;
  const rawMarketValue = player.marketValue ?? marketValueCandidateFromRaw(member.raw) ?? marketValueCandidateFromRaw(player.source.raw);
  const role = inferArenaRole(position ?? undefined);
  const rawShirtNumber = member.jerseyNumber ?? shirtNumberCandidateFromRaw(member.raw) ?? shirtNumberCandidateFromRaw(player.source.raw);
  const officialShirtNumber = resolveOfficialShirtNumber({
    providerId: player.providerId,
    clubTeamId,
    providerValues: [rawShirtNumber],
    cachedValues: [cachedPlayer?.jerseyNumber],
    cachedVerifiedAt: cachedPlayer?.sourceUpdatedAt,
  });
  const nationality = player.nationality ?? countryNameCandidateFromRaw(member.raw) ?? countryNameCandidateFromRaw(player.source.raw) ?? null;
  const countryCode = countryCode3(
    nationality,
    countryCodeCandidateFromRaw(member.raw) ?? countryCodeCandidateFromRaw(player.source.raw),
  );
  const flagUrl = touchlineCountryFlagUrl(countryCode);
  const marketValue = formatMarketValue(rawMarketValue);
  const cardTier: TouchlineCardTierKey = touchlineArenaCompetitionTierForCard().key;

  return {
    id: player.providerId,
    providerId: player.providerId,
    name: playerName,
    shortName: makeArenaShortName(playerName),
    role,
    position,
    shirtNumber: officialShirtNumber.shirtNumber,
    shirtNumberSource: officialShirtNumber.source,
    shirtNumberVerifiedAt: officialShirtNumber.verifiedAt,
    shirtNumberSourceUrl: officialShirtNumber.sourceUrl,
    cardEligibility: officialShirtNumber.shirtNumber ? "eligible" : "awaiting-shirt-number",
    clubTeamId,
    clubName,
    clubShortCode,
    clubLogoUrl,
    marketValue,
    marketValueSource: marketValue ? "provider" : "unavailable",
    cardTier,
    cardPriceVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION,
    countryCode3: countryCode,
    flagUrl,
    nationality,
    source: "sportmonks_squad",
  };
}

function mapPersistedSquadPlayer(
  player: PersistedSquadPlayer,
  clubTeamId: string,
  clubName: string,
  clubShortCode: string,
  clubLogoUrl: string | null,
) {
  const officialShirtNumber = resolveOfficialShirtNumber({
    providerId: player.providerId,
    clubTeamId,
    cachedValues: [player.jerseyNumber],
    cachedVerifiedAt: player.sourceUpdatedAt,
  });
  const role = inferArenaRole(player.position ?? undefined);
  const countryCode = countryCode3(player.nationality, null);
  const flagUrl = touchlineCountryFlagUrl(countryCode);
  const marketValue = formatMarketValue(player.marketValue);
  const cardTier: TouchlineCardTierKey = touchlineArenaCompetitionTierForCard().key;

  return {
    id: player.providerId,
    providerId: player.providerId,
    name: player.displayName || player.name,
    shortName: makeArenaShortName(player.displayName || player.name),
    role,
    position: player.position,
    shirtNumber: officialShirtNumber.shirtNumber,
    shirtNumberSource: officialShirtNumber.source,
    shirtNumberVerifiedAt: officialShirtNumber.verifiedAt,
    shirtNumberSourceUrl: officialShirtNumber.sourceUrl,
    cardEligibility: officialShirtNumber.shirtNumber ? "eligible" : "awaiting-shirt-number",
    clubTeamId,
    clubName,
    clubShortCode,
    clubLogoUrl,
    marketValue,
    marketValueSource: marketValue ? "verified-cache" : "unavailable",
    cardTier,
    cardPriceVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION,
    countryCode3: countryCode,
    flagUrl,
    nationality: player.nationality,
    source: "touchline_database",
  };
}

function roleSortWeight(role: ReturnType<typeof inferArenaRole>) {
  if (role === "goalkeeper") return 0;
  if (role === "defender") return 1;
  if (role === "midfielder") return 2;
  return 3;
}

function squadPayload(
  mappedPlayers: Array<ReturnType<typeof mapSquadMember>>,
  metadata: {
    teamId: string;
    clubName: string;
    clubShortCode: string;
    fetchedAt: string;
    cached: boolean;
    databaseSource: "live-provider" | "fresh-snapshot" | "outage-fallback";
    databaseStored?: boolean;
    degraded?: boolean;
  },
) {
  const sortedPlayers = mappedPlayers
    .filter((player) => Boolean(player.name))
    .sort((a, b) => roleSortWeight(a.role) - roleSortWeight(b.role) || a.name.localeCompare(b.name));
  const players = sortedPlayers.filter((player) => player.cardEligibility === "eligible");
  const pendingPlayers = sortedPlayers
    .filter((player) => player.cardEligibility === "awaiting-shirt-number")
    .map((player) => ({
      id: player.id,
      providerId: player.providerId,
      name: player.name,
      position: player.position,
      reason: "awaiting-shirt-number" as const,
    }));

  return {
    ok: true as const,
    teamId: metadata.teamId,
    team: {
      providerId: metadata.teamId,
      name: metadata.clubName,
      shortCode: metadata.clubShortCode,
    },
    players,
    pendingPlayers,
    dataQuality: {
      totalPlayers: sortedPlayers.length,
      cardEligiblePlayers: players.length,
      awaitingShirtNumberPlayers: pendingPlayers.length,
    },
    status: pendingPlayers.length
      ? `${players.length} TouchLine England players · ${pendingPlayers.length} awaiting official shirt number`
      : `${players.length} TouchLine England players`,
    fetchedAt: metadata.fetchedAt,
    cached: metadata.cached,
    databaseSource: metadata.databaseSource,
    databaseStored: metadata.databaseStored ?? metadata.databaseSource !== "live-provider",
    degraded: metadata.degraded ?? false,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const teamId = url.searchParams.get("teamId")?.trim();
  const preferSnapshot = url.searchParams.get("preferSnapshot") === "1";
  const backgroundRefresh = url.searchParams.get("refresh") === "1";

  if (!teamId || !/^[0-9]{1,20}$/.test(teamId)) {
    return NextResponse.json({ ok: false, error: "A valid numeric teamId is required." }, { status: 400 });
  }

  const registeredClub = TOUCHLINE_ENGLAND_CLUBS.find((club) => club.teamId === teamId);
  if (!registeredClub) {
    return NextResponse.json({ ok: false, error: "teamId is not registered in TouchLine England." }, { status: 404 });
  }

  const clubName = registeredClub.name;
  const clubShortCode = registeredClub.shortCode;
  const clubLogoUrl = registeredClub.logoUrl ?? null;

  const persistedSnapshotPromise = readPersistedSquadSnapshot(teamId);
  let persistedSnapshot = backgroundRefresh
    ? await readSnapshotForLiveRefresh(persistedSnapshotPromise)
    : await persistedSnapshotPromise;
  const cachedPlayersByProviderId = new Map(
    persistedSnapshot?.players.map((player) => [player.providerId, player] as const) ?? [],
  );

  if (preferSnapshot && persistedSnapshot?.players.length) {
    return NextResponse.json(squadPayload(
      persistedSnapshot.players.map((player) => mapPersistedSquadPlayer(
        player,
        teamId,
        clubName,
        clubShortCode,
        clubLogoUrl,
      )),
      {
        teamId,
        clubName,
        clubShortCode,
        fetchedAt: persistedSnapshot.capturedAt,
        cached: true,
        databaseSource: persistedSnapshot.fresh ? "fresh-snapshot" : "outage-fallback",
        degraded: !persistedSnapshot.fresh,
      },
    ), {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=86400" },
    });
  }

  if (preferSnapshot) {
    return NextResponse.json(
      {
        ok: false,
        error: "No coherent local squad snapshot is available.",
        status: "snapshot-miss",
      },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (persistedSnapshot?.fresh) {
    return NextResponse.json(squadPayload(
      persistedSnapshot.players.map((player) => mapPersistedSquadPlayer(
        player,
        teamId,
        clubName,
        clubShortCode,
        clubLogoUrl,
      )),
      {
        teamId,
        clubName,
        clubShortCode,
        fetchedAt: persistedSnapshot.capturedAt,
        cached: true,
        databaseSource: "fresh-snapshot",
      },
    ));
  }

  const provider = createFootballDataProvider();
  const squad = await provider.getSquad(teamId);

	if (!squad.ok) {
    if (!persistedSnapshot && backgroundRefresh) {
      persistedSnapshot = await readSnapshotForLiveRefresh(persistedSnapshotPromise);
    }
    if (persistedSnapshot?.players.length) {
      return NextResponse.json(squadPayload(
        persistedSnapshot.players.map((player) => mapPersistedSquadPlayer(
          player,
          teamId,
          clubName,
          clubShortCode,
          clubLogoUrl,
        )),
        {
          teamId,
          clubName,
          clubShortCode,
          fetchedAt: persistedSnapshot.capturedAt,
          cached: true,
          databaseSource: "outage-fallback",
          degraded: true,
        },
      ));
    }

    return NextResponse.json(
      {
        ...publicFootballDataFailure(squad.error.code),
        status: "TouchLine England unavailable",
      },
      { status: squad.error.code === "not_configured" ? 503 : 502 },
    );
  }

  const mappedPlayers = squad.data
    .map((member) => mapSquadMember(
      member,
      teamId,
      clubName,
      clubShortCode,
      clubLogoUrl,
      cachedPlayersByProviderId.get(member.player.providerId),
    ));

  const snapshotPlayers = mappedPlayers.map((player) => ({
    providerId: player.providerId,
    name: player.name,
    nationality: player.nationality,
    position: player.position,
    shirtNumber: player.shirtNumber,
    marketValue: parseMarketValueEur(player.marketValue),
  }));
  const snapshotClub = { teamId, clubName, clubShortCode, clubLogoUrl };
  const persistence = backgroundRefresh
    ? { stored: false, reason: "background-refresh" }
    : await persistSquadSnapshot(snapshotClub, snapshotPlayers);

  if (backgroundRefresh) {
    after(async () => {
      await persistSquadSnapshot(snapshotClub, snapshotPlayers);
    });
  }

  return NextResponse.json(squadPayload(mappedPlayers, {
    teamId,
    clubName,
    clubShortCode,
    fetchedAt: squad.fetchedAt,
    cached: squad.cached ?? false,
    databaseSource: "live-provider",
    databaseStored: persistence.stored,
  }));
}
