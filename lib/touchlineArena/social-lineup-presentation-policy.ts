const NUMERIC_ID = /^[1-9]\d{0,19}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;

export const TOUCHLINE_OFFICIAL_LINEUP_PROVENANCE = "PERSISTED_OFFICIAL_FIXTURE" as const;
export const TOUCHLINE_GEOMETRY_QA_PROVENANCE = "SYNTHETIC_GEOMETRY_QA_NOT_PUBLISHABLE" as const;

type OfficialLineupPresentationIdentity = Readonly<{
  fixtureId: string;
  side: "home" | "away";
  sourceProvenance: typeof TOUCHLINE_OFFICIAL_LINEUP_PROVENANCE;
  sourceVersion: string;
  sourceChecksum: string;
  sourceRevisionManifest: Readonly<Record<string, number>>;
  sourceRevisionChecksum: string;
  lineupAvailableAt: string;
  club: Readonly<{ teamId: string; name: string }>;
  home: Readonly<{ teamId: string; name: string }>;
  away: Readonly<{ teamId: string; name: string }>;
  players: readonly Readonly<{ card: Readonly<{ id: string }> }>[];
  bench: readonly Readonly<{ id: string }>[];
}>;

/**
 * Final presentation guard for the renderer that is allowed to say
 * "LINE-UP CONFIRMED". Synthetic geometry fixtures must use the dedicated
 * neutral QA template and can never cross this boundary.
 */
export function assertTouchlineOfficialLineupPresentation(
  draft: OfficialLineupPresentationIdentity,
) {
  const starterIds = Array.isArray(draft.players)
    ? draft.players.map((entry) => String(entry?.card?.id ?? ""))
    : [];
  const benchIds = Array.isArray(draft.bench)
    ? draft.bench.map((card) => String(card?.id ?? ""))
    : [];
  const sourceRevisionEntries = draft.sourceRevisionManifest
    && typeof draft.sourceRevisionManifest === "object"
    && !Array.isArray(draft.sourceRevisionManifest)
      ? Object.entries(draft.sourceRevisionManifest)
      : [];
  const expectedTeam = draft.side === "home" ? draft.home : draft.away;
  const identityIsOfficial = draft.sourceProvenance === TOUCHLINE_OFFICIAL_LINEUP_PROVENANCE
    && draft.sourceVersion === "touchline-official-lineup-feed-v1"
    && NUMERIC_ID.test(draft.fixtureId)
    && NUMERIC_ID.test(draft.club?.teamId ?? "")
    && NUMERIC_ID.test(draft.home?.teamId ?? "")
    && NUMERIC_ID.test(draft.away?.teamId ?? "")
    && draft.home?.teamId !== draft.away?.teamId
    && draft.club?.teamId === expectedTeam?.teamId
    && draft.club?.name === expectedTeam?.name
    && SHA256.test(draft.sourceChecksum)
    && SHA256.test(draft.sourceRevisionChecksum)
    && sourceRevisionEntries.length >= 1
    && sourceRevisionEntries.length <= 128
    && sourceRevisionEntries.every(([key, revision]) => (
      /^(fixture-provider|fixture|competition|season|round|club|player|formation|coach-ranking|card-ranking):[A-Za-z0-9._-]{1,160}$/.test(key)
      && Number.isSafeInteger(revision)
      // Zero is the safe baseline for an existing row that has not changed
      // since the source-revision triggers were installed. Its first change
      // advances to one and invalidates the bound draft transactionally.
      && revision >= 0
    ))
    && Number.isFinite(Date.parse(draft.lineupAvailableAt))
    && starterIds.length === 11
    && benchIds.length === 9
    && starterIds.every((id) => NUMERIC_ID.test(id))
    && benchIds.every((id) => NUMERIC_ID.test(id))
    && new Set(starterIds).size === 11
    && new Set(benchIds).size === 9
    && starterIds.every((id) => !benchIds.includes(id));

  if (!identityIsOfficial) {
    throw new Error("TL_SOCIAL_OFFICIAL_LINEUP_PRESENTATION_IDENTITY_REJECTED");
  }
}

export type TouchlineGeometryQaFormation = "4-2-3-1" | "3-4-2-1" | "5-4-1";

export type TouchlineGeometryQaFixture = Readonly<{
  sourceProvenance: typeof TOUCHLINE_GEOMETRY_QA_PROVENANCE;
  fixtureId: `geometry-qa-${string}`;
  teamId: "geometry-qa-team-a";
  opponentTeamId: "geometry-qa-team-b";
  teamName: "GEOMETRY QA A";
  opponentName: "GEOMETRY QA B";
  formation: TouchlineGeometryQaFormation;
  players: readonly Readonly<{ id: `geometry-qa-player-${string}`; label: string; x: number; y: number }>[];
}>;

const FORMATION_LINES: Readonly<Record<TouchlineGeometryQaFormation, readonly number[]>> = {
  "4-2-3-1": [1, 4, 2, 3, 1],
  "3-4-2-1": [1, 3, 4, 2, 1],
  "5-4-1": [1, 5, 4, 1],
};

/**
 * Canonical neutral fixture for geometry-only visual QA. It deliberately has
 * no real club, crest, player, provider ID or publishable card asset.
 */
export function createTouchlineGeometryQaFixture(
  formation: TouchlineGeometryQaFormation,
): TouchlineGeometryQaFixture {
  const lines = FORMATION_LINES[formation];
  let playerIndex = 0;
  const players = lines.flatMap((count, lineIndex) => Array.from({ length: count }, (_, slotIndex) => {
    playerIndex += 1;
    const lateral = count === 1 ? 50 : 12 + ((76 / (count - 1)) * slotIndex);
    const depth = 88 - ((69 / Math.max(1, lines.length - 1)) * lineIndex);
    return {
      id: `geometry-qa-player-${String(playerIndex).padStart(2, "0")}` as const,
      label: `QA PLAYER ${String(playerIndex).padStart(2, "0")}`,
      x: lateral,
      y: depth,
    };
  }));

  return {
    sourceProvenance: TOUCHLINE_GEOMETRY_QA_PROVENANCE,
    fixtureId: `geometry-qa-${formation}`,
    teamId: "geometry-qa-team-a",
    opponentTeamId: "geometry-qa-team-b",
    teamName: "GEOMETRY QA A",
    opponentName: "GEOMETRY QA B",
    formation,
    players,
  };
}
