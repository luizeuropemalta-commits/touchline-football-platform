#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const TOUCHLINE_QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";
export const TOUCHLINE_QA_FIXTURE_VERSION = "touchline-representative-qa-v1";
export const TOUCHLINE_QA_EXISTING_LIVERPOOL_CARDS = 29;

const TIER_KEYS = new Set([
  "ruby-red",
  "sapphire-blue",
  "amethyst-purple",
  "radiant-gold",
  "emerald-green",
  "clear-diamond",
  "diamond-gold",
]);

type CanonicalRoster = {
  schemaVersion: string;
  source: { sourceRevision: string };
  competitions: Array<Record<string, unknown>>;
  clubs: Array<Record<string, unknown>>;
  players: Array<Record<string, unknown>>;
  memberships: Array<Record<string, unknown>>;
};

type PublicationManifest = {
  schemaVersion: string;
  manifestFingerprintSha256: string;
  rows: Array<Record<string, unknown>>;
};

type ProviderSnapshot = {
  schemaVersion: string;
  clubs: Array<{
    providerTeamId: string | number;
    members: Array<{
      providerPlayerId: string | number;
      jerseyNumber: number | null;
      position: string | null;
    }>;
  }>;
};

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, stableValue((value as Record<string, unknown>)[key])]),
  );
}

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stableValue(value)), "utf8").digest("hex");
}

function deterministicUuid(namespace: string) {
  const hex = createHash("sha256").update(namespace, "utf8").digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function requiredText(value: unknown, code: string) {
  const text = String(value ?? "").trim();
  invariant(text.length > 0, code);
  return text;
}

function numericId(value: unknown, code: string) {
  const text = requiredText(value, code);
  invariant(/^\d+$/.test(text), code);
  return text;
}

function asUuid(value: unknown, code: string) {
  const text = requiredText(value, code);
  invariant(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text), code);
  return text;
}

function publicationPriceForTier(tier: string) {
  const prices: Record<string, number> = {
    "ruby-red": 0,
    "sapphire-blue": 1,
    "amethyst-purple": 2,
    "radiant-gold": 4,
    "emerald-green": 7,
    "clear-diamond": 10,
    "diamond-gold": 15,
  };
  return prices[tier];
}

export function assertTouchlineQaProjectRef(projectRef: string) {
  invariant(projectRef === TOUCHLINE_QA_PROJECT_REF, "TL_QA_REPRESENTATIVE_PACKAGE_TARGET_FORBIDDEN");
}

export function buildTouchlineRepresentativeQaPackage(input: {
  projectRef: string;
  roster: CanonicalRoster;
  publication: PublicationManifest;
  providerSnapshot: ProviderSnapshot;
}) {
  assertTouchlineQaProjectRef(input.projectRef);
  const { roster, publication, providerSnapshot } = input;
  invariant(roster.schemaVersion === "touchline-canonical-roster-export-v1", "TL_QA_REPRESENTATIVE_ROSTER_SCHEMA_INVALID");
  invariant(publication.schemaVersion === "touchline-owner-approved-card-publication-manifest-v1", "TL_QA_REPRESENTATIVE_PUBLICATION_SCHEMA_INVALID");
  invariant(providerSnapshot.schemaVersion.length > 0, "TL_QA_REPRESENTATIVE_PROVIDER_SCHEMA_INVALID");
  invariant(roster.competitions.length === 1, "TL_QA_REPRESENTATIVE_COMPETITION_COUNT_INVALID");
  invariant(roster.clubs.length === 20, "TL_QA_REPRESENTATIVE_CLUB_COUNT_INVALID");
  invariant(roster.players.length === 588, "TL_QA_REPRESENTATIVE_PLAYER_COUNT_INVALID");
  invariant(roster.memberships.length === 588, "TL_QA_REPRESENTATIVE_MEMBERSHIP_COUNT_INVALID");
  invariant(publication.rows.length === 533, "TL_QA_REPRESENTATIVE_PUBLICATION_COUNT_INVALID");

  const competition = roster.competitions[0]!;
  const competitionId = asUuid(competition.id, "TL_QA_REPRESENTATIVE_COMPETITION_ID_INVALID");
  invariant(competition.provider === "sportmonks" && String(competition.provider_competition_id) === "8", "TL_QA_REPRESENTATIVE_COMPETITION_INVALID");

  const clubsById = new Map<string, Record<string, unknown>>();
  const clubsByProviderId = new Map<string, Record<string, unknown>>();
  for (const club of roster.clubs) {
    const id = asUuid(club.id, "TL_QA_REPRESENTATIVE_CLUB_ID_INVALID");
    const providerTeamId = numericId(club.provider_team_id, "TL_QA_REPRESENTATIVE_PROVIDER_TEAM_INVALID");
    invariant(club.provider === "sportmonks" && club.competition_id === competitionId, "TL_QA_REPRESENTATIVE_CLUB_SCOPE_INVALID");
    invariant(!clubsById.has(id) && !clubsByProviderId.has(providerTeamId), "TL_QA_REPRESENTATIVE_CLUB_DUPLICATE");
    clubsById.set(id, club);
    clubsByProviderId.set(providerTeamId, club);
  }

  const providerMembers = new Map<string, { jerseyNumber: number | null; position: string | null }>();
  for (const club of providerSnapshot.clubs) {
    const providerTeamId = numericId(club.providerTeamId, "TL_QA_REPRESENTATIVE_SNAPSHOT_TEAM_INVALID");
    for (const member of club.members) {
      const providerPlayerId = numericId(member.providerPlayerId, "TL_QA_REPRESENTATIVE_SNAPSHOT_PLAYER_INVALID");
      const key = `${providerTeamId}:${providerPlayerId}`;
      invariant(!providerMembers.has(key), "TL_QA_REPRESENTATIVE_SNAPSHOT_DUPLICATE");
      providerMembers.set(key, {
        jerseyNumber: Number.isInteger(member.jerseyNumber) && Number(member.jerseyNumber) > 0 ? Number(member.jerseyNumber) : null,
        position: ["Goalkeeper", "Defender", "Midfielder", "Attacker"].includes(String(member.position)) ? String(member.position) : null,
      });
    }
  }

  const playersById = new Map<string, Record<string, unknown>>();
  const players = roster.players.map((player) => {
    const id = asUuid(player.id, "TL_QA_REPRESENTATIVE_PLAYER_ID_INVALID");
    const clubId = asUuid(player.current_club_id, "TL_QA_REPRESENTATIVE_PLAYER_CLUB_INVALID");
    const club = clubsById.get(clubId);
    invariant(club, "TL_QA_REPRESENTATIVE_PLAYER_CLUB_MISSING");
    const providerPlayerId = numericId(player.provider_player_id, "TL_QA_REPRESENTATIVE_PROVIDER_PLAYER_INVALID");
    const providerTeamId = String(club.provider_team_id);
    const provider = providerMembers.get(`${providerTeamId}:${providerPlayerId}`);
    invariant(provider, "TL_QA_REPRESENTATIVE_PROVIDER_MEMBER_MISSING");
    invariant(!playersById.has(id), "TL_QA_REPRESENTATIVE_PLAYER_DUPLICATE");
    playersById.set(id, player);
    return Object.freeze({
      id,
      provider: "sportmonks" as const,
      providerPlayerId,
      currentClubId: clubId,
      name: requiredText(player.name, "TL_QA_REPRESENTATIVE_PLAYER_NAME_INVALID"),
      displayName: requiredText(player.display_name, "TL_QA_REPRESENTATIVE_PLAYER_DISPLAY_NAME_INVALID"),
      position: provider.position,
      sourceUpdatedAt: requiredText(player.source_updated_at, "TL_QA_REPRESENTATIVE_PLAYER_REVISION_INVALID"),
    });
  });

  const membershipsById = new Map<string, Record<string, unknown>>();
  const memberships = roster.memberships.map((membership) => {
    const id = asUuid(membership.id, "TL_QA_REPRESENTATIVE_MEMBERSHIP_ID_INVALID");
    const clubId = asUuid(membership.club_id, "TL_QA_REPRESENTATIVE_MEMBERSHIP_CLUB_INVALID");
    const playerId = asUuid(membership.player_id, "TL_QA_REPRESENTATIVE_MEMBERSHIP_PLAYER_INVALID");
    const club = clubsById.get(clubId);
    const player = playersById.get(playerId);
    invariant(club && player && player.current_club_id === clubId, "TL_QA_REPRESENTATIVE_MEMBERSHIP_IDENTITY_INVALID");
    const provider = providerMembers.get(`${club.provider_team_id}:${player.provider_player_id}`);
    invariant(provider, "TL_QA_REPRESENTATIVE_MEMBERSHIP_PROVIDER_MISSING");
    invariant(membership.provider === "sportmonks" && membership.competition_id === competitionId && membership.status === "active", "TL_QA_REPRESENTATIVE_MEMBERSHIP_SCOPE_INVALID");
    invariant(!membershipsById.has(id), "TL_QA_REPRESENTATIVE_MEMBERSHIP_DUPLICATE");
    membershipsById.set(id, membership);
    return Object.freeze({
      id,
      provider: "sportmonks" as const,
      clubId,
      playerId,
      competitionId,
      jerseyNumber: provider.jerseyNumber,
      position: provider.position,
      status: "active" as const,
      sourceUpdatedAt: requiredText(membership.source_updated_at, "TL_QA_REPRESENTATIVE_MEMBERSHIP_REVISION_INVALID"),
    });
  });

  const publicationPlayerIds = new Set<string>();
  const publicationClubIds = new Set<string>();
  const inventory = publication.rows.map((row) => {
    const playerId = asUuid(row.canonicalPlayerId, "TL_QA_REPRESENTATIVE_PUBLICATION_PLAYER_INVALID");
    const clubId = asUuid(row.canonicalClubId, "TL_QA_REPRESENTATIVE_PUBLICATION_CLUB_INVALID");
    const membershipId = asUuid(row.canonicalMembershipId, "TL_QA_REPRESENTATIVE_PUBLICATION_MEMBERSHIP_INVALID");
    const player = playersById.get(playerId);
    const club = clubsById.get(clubId);
    const membership = membershipsById.get(membershipId);
    invariant(player && club && membership, "TL_QA_REPRESENTATIVE_PUBLICATION_IDENTITY_MISSING");
    invariant(player.current_club_id === clubId && membership.player_id === playerId && membership.club_id === clubId, "TL_QA_REPRESENTATIVE_PUBLICATION_IDENTITY_MISMATCH");
    invariant(String(club.provider_team_id) === String(row.providerTeamId) && String(player.provider_player_id) === String(row.providerPlayerId), "TL_QA_REPRESENTATIVE_PUBLICATION_PROVIDER_MISMATCH");
    const tier = requiredText(row.calculatedTier, "TL_QA_REPRESENTATIVE_TIER_INVALID");
    invariant(TIER_KEYS.has(tier), "TL_QA_REPRESENTATIVE_TIER_INVALID");
    const nominalPriceGbp = Number(row.canonicalNominalPriceGbp);
    invariant(nominalPriceGbp === publicationPriceForTier(tier), "TL_QA_REPRESENTATIVE_PRICE_INVALID");
    const marketValueEur = Number(row.manualMarketValueEur);
    invariant(Number.isSafeInteger(marketValueEur) && marketValueEur >= 0, "TL_QA_REPRESENTATIVE_VALUE_INVALID");
    invariant(!publicationPlayerIds.has(playerId), "TL_QA_REPRESENTATIVE_PUBLICATION_PLAYER_DUPLICATE");
    publicationPlayerIds.add(playerId);
    publicationClubIds.add(clubId);
    const clubName = requiredText(club.name, "TL_QA_REPRESENTATIVE_PUBLICATION_CLUB_NAME_INVALID");
    return Object.freeze({
      id: deterministicUuid(`touchline-qa-inventory:${playerId}`),
      playerId,
      clubId,
      playerName: requiredText(player.name, "TL_QA_REPRESENTATIVE_PUBLICATION_PLAYER_NAME_INVALID"),
      clubName,
      tier,
      frameUrl: `/touchlineArena/frames/market-tiers/${tier}.png`,
      cardTemplateUrl: `/touchlineArena/cards/templates/clubs/${encodeURIComponent(clubName)}/market-tiers/${tier}.png`,
      marketValueEur,
      priceTableVersion: requiredText(row.policyVersion, "TL_QA_REPRESENTATIVE_POLICY_INVALID"),
      publishedAt: requiredText(row.lastReviewedAt, "TL_QA_REPRESENTATIVE_REVIEW_DATE_INVALID"),
    });
  });
  invariant(publicationClubIds.size === 19, "TL_QA_REPRESENTATIVE_PUBLICATION_CLUB_SCOPE_INVALID");
  invariant(![...clubsByProviderId.keys()].filter((id) => id !== "8").some((id) => !publication.rows.some((row) => String(row.providerTeamId) === id)), "TL_QA_REPRESENTATIVE_PUBLICATION_CLUB_MISSING");
  invariant(!publication.rows.some((row) => String(row.providerTeamId) === "8"), "TL_QA_REPRESENTATIVE_LIVERPOOL_MUST_REMAIN_EXISTING_BATCH");

  const sourceFingerprintSha256 = sha256({
    rosterRevision: roster.source.sourceRevision,
    publicationFingerprint: publication.manifestFingerprintSha256,
    providerSnapshot: providerSnapshot.schemaVersion,
  });
  const fixtureRunId = deterministicUuid(`${TOUCHLINE_QA_PROJECT_REF}:${TOUCHLINE_QA_FIXTURE_VERSION}:${sourceFingerprintSha256}`);
  const result = {
    schemaVersion: "touchline-representative-qa-package-v1" as const,
    target: { projectRef: TOUCHLINE_QA_PROJECT_REF, environment: "qa" as const },
    fixture: { version: TOUCHLINE_QA_FIXTURE_VERSION, runId: fixtureRunId, sourceFingerprintSha256 },
    source: {
      canonicalRosterRevision: roster.source.sourceRevision,
      ownerApprovedPublicationFingerprintSha256: publication.manifestFingerprintSha256,
    },
    counts: {
      competitions: 1,
      clubs: roster.clubs.length,
      players: players.length,
      memberships: memberships.length,
      ownerApprovedCards: publication.rows.length,
      preservedLiverpoolCards: TOUCHLINE_QA_EXISTING_LIVERPOOL_CARDS,
      expectedPublishedCards: publication.rows.length + TOUCHLINE_QA_EXISTING_LIVERPOOL_CARDS,
    },
    competition: {
      id: competitionId,
      provider: "sportmonks" as const,
      providerCompetitionId: "8",
      sourceUpdatedAt: requiredText(competition.source_updated_at, "TL_QA_REPRESENTATIVE_COMPETITION_REVISION_INVALID"),
    },
    clubs: roster.clubs.map((club) => Object.freeze({
      id: String(club.id),
      provider: "sportmonks" as const,
      providerTeamId: String(club.provider_team_id),
      competitionId,
      name: String(club.name),
      sourceUpdatedAt: String(club.source_updated_at),
    })),
    players,
    memberships,
    publicationRows: publication.rows,
    inventory,
    policy: {
      productionAllowed: false as const,
      syntheticOfficialFootballFactsAllowed: false as const,
      existingLiverpoolBatchPreserved: true as const,
      rollbackScope: "run-created inventory plus owner-approved 533 publication batch" as const,
    },
  };
  return Object.freeze({ ...result, packageFingerprintSha256: sha256(result) });
}

function parseArgs(args: readonly string[]) {
  const result: Record<string, string | boolean> = { check: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--check") result.check = true;
    else if (["--project-ref", "--roster", "--publication", "--provider-snapshot", "--write-new"].includes(argument)) {
      const value = args[index + 1];
      invariant(value && !value.startsWith("--"), `TL_QA_REPRESENTATIVE_ARGUMENT_REQUIRED:${argument}`);
      result[argument.slice(2)] = value;
      index += 1;
    } else throw new Error(`TL_QA_REPRESENTATIVE_UNKNOWN_ARGUMENT:${argument}`);
  }
  invariant(result.check === true, "TL_QA_REPRESENTATIVE_CHECK_REQUIRED");
  for (const key of ["project-ref", "roster", "publication", "provider-snapshot"]) invariant(typeof result[key] === "string", `TL_QA_REPRESENTATIVE_ARGUMENT_REQUIRED:${key}`);
  return result as { check: true; "project-ref": string; roster: string; publication: string; "provider-snapshot": string; "write-new"?: string };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [roster, publication, providerSnapshot] = await Promise.all([
    readFile(resolve(args.roster), "utf8").then(JSON.parse),
    readFile(resolve(args.publication), "utf8").then(JSON.parse),
    readFile(resolve(args["provider-snapshot"]), "utf8").then(JSON.parse),
  ]);
  const plan = buildTouchlineRepresentativeQaPackage({ projectRef: args["project-ref"], roster, publication, providerSnapshot });
  if (args["write-new"]) await writeFile(resolve(args["write-new"]), `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${JSON.stringify({ target: plan.target, fixture: plan.fixture, counts: plan.counts, packageFingerprintSha256: plan.packageFingerprintSha256 }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "TL_QA_REPRESENTATIVE_UNKNOWN_ERROR"}\n`);
    process.exitCode = 1;
  });
}
