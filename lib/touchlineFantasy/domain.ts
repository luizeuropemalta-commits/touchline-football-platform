import type {
  TouchlineFormationGeometry,
  TouchlineFormationGeometrySlot,
} from "../touchlineArena/formation-geometry.ts";
import type { TouchlineMarketPositionBucket } from "../touchlineArena/position-eligibility.ts";

export const TOUCHLINE_FANTASY_ENTITLEMENT_KEY = "fantasy_access" as const;
export const TOUCHLINE_FANTASY_SUBSCRIPTION_PRICE_MINOR = 2_990 as const;
export const TOUCHLINE_FANTASY_SUBSCRIPTION_CURRENCY = "GBP" as const;
export const TOUCHLINE_FANTASY_INITIAL_BUDGET_EUR = 900_000_000 as const;
export const TOUCHLINE_FANTASY_MAX_PLAYERS_PER_CLUB = 11 as const;
export const TOUCHLINE_FANTASY_DEFAULT_LOCK_OFFSET_MINUTES = 5 as const;
export const TOUCHLINE_FANTASY_DEADLINE_TIME_ZONE = "Europe/London" as const;

export type TouchlineFantasyPublicManagerRank = Readonly<{
  rank: number;
  name: string;
  score: number;
  isCurrentManager: boolean;
}>;

export function rankTouchlineFantasyManagers(
  values: readonly Readonly<{ userId: string; name: string; score: number }>[],
  viewerUserId: string,
): readonly TouchlineFantasyPublicManagerRank[] {
  return [...values]
    .sort((first, second) => second.score - first.score || first.name.localeCompare(second.name) || first.userId.localeCompare(second.userId))
    .map(({ userId, name, score }, index) => ({
      rank: index + 1,
      name,
      score,
      isCurrentManager: userId === viewerUserId,
    }));
}

export type TouchlineFantasyGameweekState =
  | "UPCOMING"
  | "MARKET_OPEN"
  | "LOCKED"
  | "LIVE"
  | "FINAL"
  | "SETTLED";

export type TouchlineFantasyMarketClock = Readonly<{
  phase: "closing" | "opening" | "awaiting-final" | "syncing" | "unavailable";
  targetAt: string | null;
  gameweekNumber: number | null;
}>;

type TouchlineFantasyMarketClockGameweek = Readonly<{
  number: number;
  state: TouchlineFantasyGameweekState;
  marketOpensAt: string;
  locksAt: string;
}>;

/**
 * Resolves the visible Markt clock exclusively from the canonical Gameweek
 * timestamps. Future rounds retain a lock-minus-one-microsecond sentinel until
 * the previous round is final; that sentinel is deliberately never presented
 * as a fabricated reopening countdown.
 */
export function resolveTouchlineFantasyMarketClock(
  gameweeks: readonly TouchlineFantasyMarketClockGameweek[],
  nowMs: number,
): TouchlineFantasyMarketClock {
  const parsed = gameweeks.flatMap((gameweek) => {
    const marketOpensAtMs = Date.parse(gameweek.marketOpensAt);
    const locksAtMs = Date.parse(gameweek.locksAt);
    return Number.isFinite(marketOpensAtMs) && Number.isFinite(locksAtMs)
      ? [{ gameweek, marketOpensAtMs, locksAtMs }]
      : [];
  });
  const openGameweek = parsed
    .filter(({ gameweek, locksAtMs }) => gameweek.state === "MARKET_OPEN" && locksAtMs > nowMs)
    .sort((first, second) => first.locksAtMs - second.locksAtMs)[0];
  if (openGameweek) {
    return {
      phase: "closing",
      targetAt: openGameweek.gameweek.locksAt,
      gameweekNumber: openGameweek.gameweek.number,
    };
  }

  const nextOpening = parsed
    .filter(({ marketOpensAtMs }) => marketOpensAtMs > nowMs)
    .sort((first, second) => first.marketOpensAtMs - second.marketOpensAtMs)[0];
  if (nextOpening) {
    const awaitingPreviousRoundFinal = nextOpening.gameweek.number > 1
      && nextOpening.marketOpensAtMs >= nextOpening.locksAtMs - 1_000;
    return {
      phase: awaitingPreviousRoundFinal ? "awaiting-final" : "opening",
      targetAt: awaitingPreviousRoundFinal ? null : nextOpening.gameweek.marketOpensAt,
      gameweekNumber: nextOpening.gameweek.number,
    };
  }

  const staleOpening = parsed
    .filter(({ gameweek, marketOpensAtMs, locksAtMs }) => gameweek.state === "UPCOMING" && marketOpensAtMs <= nowMs && locksAtMs > nowMs)
    .sort((first, second) => first.marketOpensAtMs - second.marketOpensAtMs)[0];
  if (staleOpening) {
    return { phase: "syncing", targetAt: null, gameweekNumber: staleOpening.gameweek.number };
  }
  return { phase: "unavailable", targetAt: null, gameweekNumber: null };
}

export type TouchlineFantasyParticipation =
  | "rated_appearance"
  | "no_provider_rating"
  | "did_not_play";

export type TouchlineFantasyFixtureContribution = Readonly<{
  rating: number | null;
  goals: number;
  hatTrickMultiplier: 1 | 2;
  roundScore: number;
  participation: TouchlineFantasyParticipation;
  reason: "RATED_APPEARANCE" | "NO_PROVIDER_RATING" | "DID_NOT_PLAY";
}>;

export type TouchlineFantasyEligiblePlayer = Readonly<{
  playerId: string;
  clubId: string;
  marketValueEur: number;
  positionBucket: Exclude<TouchlineMarketPositionBucket, "outfield">;
}>;

export type TouchlineFantasySelection = Readonly<{
  playerId: string;
  slotId: string;
}>;

export type TouchlineFantasyLineupIssue =
  | "SELECTION_COUNT"
  | "DUPLICATE_PLAYER"
  | "DUPLICATE_SLOT"
  | "PLAYER_INELIGIBLE"
  | "SLOT_INVALID"
  | "POSITION_INVALID"
  | "BUDGET_EXCEEDED";

export type TouchlineFantasyLineupValidation = Readonly<{
  valid: boolean;
  issues: readonly TouchlineFantasyLineupIssue[];
  selectedCount: number;
  totalMarketValueEur: number;
  budgetRemainingEur: number;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{7,159}$/;

function finiteNonNegative(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizedGoals(value: unknown) {
  const goals = finiteNonNegative(value);
  return goals === null ? 0 : Math.trunc(goals);
}

function roundedRating(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * The complete active Fantasy scoring rule. No event statistic other than the
 * per-fixture hat-trick threshold changes the provider Rating.
 */
export function touchlineFantasyFixtureContribution(input: Readonly<{
  appearanceStatus: "started" | "substitute" | "unused" | "absent" | "unavailable";
  rating: number | null | undefined;
  goals: number | null | undefined;
}>): TouchlineFantasyFixtureContribution {
  const appeared = input.appearanceStatus === "started" || input.appearanceStatus === "substitute";
  const goals = normalizedGoals(input.goals);
  const multiplier = goals >= 3 ? 2 as const : 1 as const;
  const rating = finiteNonNegative(input.rating);

  if (!appeared) {
    return {
      rating: null,
      goals,
      hatTrickMultiplier: multiplier,
      roundScore: 0,
      participation: "did_not_play",
      reason: "DID_NOT_PLAY",
    };
  }
  if (rating === null) {
    return {
      rating: null,
      goals,
      hatTrickMultiplier: multiplier,
      roundScore: 0,
      participation: "no_provider_rating",
      reason: "NO_PROVIDER_RATING",
    };
  }
  return {
    rating: roundedRating(rating),
    goals,
    hatTrickMultiplier: multiplier,
    roundScore: roundedRating(rating * multiplier),
    participation: "rated_appearance",
    reason: "RATED_APPEARANCE",
  };
}

export function touchlineFantasyGameweekScore(values: readonly TouchlineFantasyFixtureContribution[]) {
  return roundedRating(values.reduce((total, value) => total + value.roundScore, 0));
}

function slotMap(geometry: TouchlineFormationGeometry) {
  return new Map(geometry.slots.map((slot) => [slot.id, slot] as const));
}

function slotAcceptsPlayer(slot: TouchlineFormationGeometrySlot, player: TouchlineFantasyEligiblePlayer) {
  return slot.allowedPositions.includes(player.positionBucket);
}

export function validateTouchlineFantasyLineup(input: Readonly<{
  selections: readonly TouchlineFantasySelection[];
  players: readonly TouchlineFantasyEligiblePlayer[];
  geometry: TouchlineFormationGeometry;
  budgetEur: number;
  maxPlayersPerClub: number;
  requireComplete?: boolean;
}>): TouchlineFantasyLineupValidation {
  const issues = new Set<TouchlineFantasyLineupIssue>();
  const players = new Map(input.players.map((player) => [player.playerId, player] as const));
  const slots = slotMap(input.geometry);
  const seenPlayers = new Set<string>();
  const seenSlots = new Set<string>();
  let totalMarketValueEur = 0;

  if (input.selections.length > 11 || (input.requireComplete && input.selections.length !== 11)) {
    issues.add("SELECTION_COUNT");
  }

  for (const selection of input.selections) {
    if (seenPlayers.has(selection.playerId)) issues.add("DUPLICATE_PLAYER");
    if (seenSlots.has(selection.slotId)) issues.add("DUPLICATE_SLOT");
    seenPlayers.add(selection.playerId);
    seenSlots.add(selection.slotId);

    const player = players.get(selection.playerId);
    if (!player) {
      issues.add("PLAYER_INELIGIBLE");
      continue;
    }
    const slot = slots.get(selection.slotId);
    if (!slot) {
      issues.add("SLOT_INVALID");
      continue;
    }
    if (!slotAcceptsPlayer(slot, player)) issues.add("POSITION_INVALID");
    totalMarketValueEur += player.marketValueEur;
  }

  if (totalMarketValueEur > input.budgetEur) issues.add("BUDGET_EXCEEDED");

  return {
    valid: issues.size === 0,
    issues: [...issues],
    selectedCount: input.selections.length,
    totalMarketValueEur,
    budgetRemainingEur: input.budgetEur - totalMarketValueEur,
  };
}

export function assignTouchlineFantasyPlayerToFirstSlot(input: Readonly<{
  player: TouchlineFantasyEligiblePlayer;
  geometry: TouchlineFormationGeometry;
  selections: readonly TouchlineFantasySelection[];
}>) {
  const occupied = new Set(input.selections.map((selection) => selection.slotId));
  return input.geometry.slots
    .filter((slot) => !occupied.has(slot.id) && slotAcceptsPlayer(slot, input.player))
    .sort((first, second) => first.priority - second.priority)[0]?.id ?? null;
}

export type TouchlineFantasyLineupRequest = Readonly<{
  gameweekId: string;
  selectedCoachId: string;
  formationCode: string;
  selections: readonly TouchlineFantasySelection[];
  action: "draft" | "confirm";
  idempotencyKey: string;
}>;

export function parseTouchlineFantasyLineupRequest(value: unknown): TouchlineFantasyLineupRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!UUID_PATTERN.test(String(record.gameweekId ?? ""))) return null;
  if (!/^\d{1,16}$/.test(String(record.selectedCoachId ?? ""))) return null;
  if (!/^\d(?:-\d){2,3}$/.test(String(record.formationCode ?? ""))) return null;
  if (record.action !== "draft" && record.action !== "confirm") return null;
  if (!IDEMPOTENCY_PATTERN.test(String(record.idempotencyKey ?? ""))) return null;
  if (!Array.isArray(record.selections) || record.selections.length > 11) return null;
  const selections: TouchlineFantasySelection[] = [];
  for (const entry of record.selections) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const selection = entry as Record<string, unknown>;
    const playerId = String(selection.playerId ?? "").toLowerCase();
    const slotId = String(selection.slotId ?? "").trim();
    if (!UUID_PATTERN.test(playerId) || !/^[A-Z0-9-]{1,24}$/.test(slotId)) return null;
    selections.push({ playerId, slotId });
  }
  return {
    gameweekId: String(record.gameweekId).toLowerCase(),
    selectedCoachId: String(record.selectedCoachId),
    formationCode: String(record.formationCode),
    selections,
    action: record.action,
    idempotencyKey: String(record.idempotencyKey),
  };
}

export type TouchlineFantasyBuilderStep = "coach" | "formation" | "players" | "review" | "locked";

export function resolveTouchlineFantasyBuilderStep(input: Readonly<{
  editable: boolean;
  selectedCoachId: string | null;
  formationCode: string | null;
  selectedCount: number;
  lineupValid: boolean;
}>): TouchlineFantasyBuilderStep {
  if (!input.editable) return "locked";
  if (!input.selectedCoachId) return "coach";
  if (!input.formationCode) return "formation";
  if (input.selectedCount < 11 || !input.lineupValid) return "players";
  return "review";
}

export function touchlineFantasyLandscapeIsBlocked(input: Readonly<{
  width: number;
  height: number;
  coarsePointer: boolean;
  mobileDevice?: boolean;
}>) {
  return (input.coarsePointer || input.mobileDevice === true) && input.width > input.height;
}

export function formatTouchlineFantasyDeadline(value: string, locale: string) {
  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return "—";
  const resolvedLocale = locale === "pt-BR" ? "pt-BR" : "en-GB";
  const date = new Intl.DateTimeFormat(resolvedLocale, {
    dateStyle: "medium",
    timeZone: TOUCHLINE_FANTASY_DEADLINE_TIME_ZONE,
  }).format(deadline);
  const time = new Intl.DateTimeFormat(resolvedLocale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TOUCHLINE_FANTASY_DEADLINE_TIME_ZONE,
  }).format(deadline);
  return `${date}, ${time}`;
}

export function formatTouchlineFantasyMarketValue(valueEur: number, locale: string) {
  const millions = valueEur / 1_000_000;
  return new Intl.NumberFormat(locale === "pt-BR" ? "pt-BR" : "en-GB", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: millions < 10 ? 2 : 1,
  }).format(valueEur);
}
