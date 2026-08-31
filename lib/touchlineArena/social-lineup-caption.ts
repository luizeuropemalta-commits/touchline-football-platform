const DISCLOSURE = "COMING SOON • CURRENTLY IN TESTING";
const FORMATION = /^\d(?:-\d){2,4}$/;
const PUBLIC_PROVIDER_WORDING = /sportmonks|\bapi\b|\bprovider\b/i;

export type TouchlineSocialLineupCaptionInput = Readonly<{
  fixtureId: string;
  teamId: string;
  teamName: string;
  opponentName: string;
  side: "HOME" | "AWAY";
  venueName: string;
  formation: string;
  gameweekNumber: number;
  kickOffLabel: string;
  lineupConfirmed: true;
}>;

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function positiveId(value: string) {
  return /^[1-9]\d{0,19}$/.test(value);
}

/**
 * Generates fixture-specific British English copy only after the official XI
 * has passed the upstream lineup contract. It never exposes internal source or
 * provider wording and is deliberately independent from Instagram delivery.
 */
export function buildTouchlineOfficialLineupCaption(
  input: TouchlineSocialLineupCaptionInput,
) {
  const teamName = clean(input.teamName);
  const opponentName = clean(input.opponentName);
  const venueName = clean(input.venueName);
  const formation = clean(input.formation);
  const kickOffLabel = clean(input.kickOffLabel);
  if (!positiveId(input.fixtureId) || !positiveId(input.teamId)) {
    return { ok: false, reason: "FIXTURE_IDENTITY_INVALID" } as const;
  }
  if (!teamName || !opponentName || teamName === opponentName || !venueName || !kickOffLabel) {
    return { ok: false, reason: "FIXTURE_COPY_INCOMPLETE" } as const;
  }
  if (!FORMATION.test(formation) || !Number.isInteger(input.gameweekNumber) || input.gameweekNumber < 1) {
    return { ok: false, reason: "MATCH_CONTEXT_INVALID" } as const;
  }

  const venuePhrase = input.side === "HOME"
    ? `at home at ${venueName}`
    : `away at ${venueName}`;
  const fixtureLabel = input.side === "HOME"
    ? `${teamName} v ${opponentName}`
    : `${opponentName} v ${teamName}`;
  const caption = [
    "TouchLine Official Line-up",
    "",
    fixtureLabel,
    `Gameweek ${input.gameweekNumber} · ${kickOffLabel}`,
    `${teamName} line up in a ${formation}, ${venuePhrase}.`,
    "Follow the match in TouchLine.",
    "",
    "TouchLine Verified Match Data",
    DISCLOSURE,
  ].join("\n");
  if (PUBLIC_PROVIDER_WORDING.test(caption)) {
    return { ok: false, reason: "PUBLIC_SOURCE_WORDING_FORBIDDEN" } as const;
  }
  return { ok: true, caption } as const;
}
