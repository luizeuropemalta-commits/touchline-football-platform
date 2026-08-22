import type { TouchlineFantasyEvent } from "./types.ts";

export const TOUCHLINE_PLAYER_SCORING_VERSION = "player_scoring_v2" as const;

export const TOUCHLINE_PLAYER_POSITION_GROUPS = ["Goalkeeper", "Defender", "Midfielder", "Attacker"] as const;
export type TouchLinePlayerPositionGroup = (typeof TOUCHLINE_PLAYER_POSITION_GROUPS)[number];
export type TouchLinePlayerScoringRuleCode =
  | "goal" | "assist" | "shot-on-target" | "yellow-card" | "red-card"
  | "penalty-save" | "penalty-missed" | "own-goal" | "hat-trick"
  | "clean-sheet" | "save" | "goal-conceded" | "rating" | "def";

export type TouchLinePlayerPointContribution = {
  providerEventId: string;
  role: "primary" | "assist" | "fact";
  ruleCode: TouchLinePlayerScoringRuleCode;
  eventType: string;
  minute: number | null;
  quantity: number;
  unitPoints: number;
  points: number;
  factValue?: number;
  detail?: string;
};

export type TouchLinePlayerFixtureScoringInput = Readonly<{
  providerPlayerId: string;
  positionGroup: string | null | undefined;
  appearanceStatus: "started" | "substitute" | "unused" | "absent" | "unavailable";
  minutesPlayed: number | null;
  rating: number | null;
  statistics: Readonly<Record<string, number>> | null;
  events: readonly TouchlineFantasyEvent[] | null;
  teamGoalsConceded: number | null;
}>;

export type TouchLinePlayerFixtureScoringResult = Readonly<{
  scoringVersion: typeof TOUCHLINE_PLAYER_SCORING_VERSION;
  positionGroup: TouchLinePlayerPositionGroup | null;
  points: number | null;
  contributions: TouchLinePlayerPointContribution[];
  statistics: Readonly<Record<string, number>>;
  missingFacts: string[];
  coverageStatus: "complete" | "partial" | "unavailable";
}>;

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function nonNegativeInteger(value: unknown) {
  const numeric = finiteNumber(value);
  return numeric === null || numeric < 0 ? null : Math.trunc(numeric);
}

export function touchLineCanonicalPlayerPositionGroup(value: string | null | undefined): TouchLinePlayerPositionGroup | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (/goalkeeper|keeper|^gk$/.test(normalized)) return "Goalkeeper";
  if (/defender|centre.?back|center.?back|full.?back|wing.?back|left back|right back|^cb$|^lb$|^rb$/.test(normalized)) return "Defender";
  if (/midfielder|midfield|^mid$|^cm$|^dm$|^am$|^cam$|^cdm$/.test(normalized)) return "Midfielder";
  if (/attacker|forward|striker|winger|centre.?forward|center.?forward|^st$|^cf$|^lw$|^rw$/.test(normalized)) return "Attacker";
  return null;
}

function isRecorded(event: TouchlineFantasyEvent) {
  return event.status !== "rescinded";
}

function canonicalEvents(events: readonly TouchlineFantasyEvent[]) {
  return [...new Map(events.map((event) => [event.providerId, event] as const)).values()]
    .filter(isRecorded)
    .sort((first, second) => (
      (first.sortOrder ?? Number.MAX_SAFE_INTEGER) - (second.sortOrder ?? Number.MAX_SAFE_INTEGER)
      || (first.minute ?? Number.MAX_SAFE_INTEGER) - (second.minute ?? Number.MAX_SAFE_INTEGER)
      || first.providerId.localeCompare(second.providerId)
    ));
}

function isGoal(eventType: string) {
  return /goal/i.test(eventType) && !/own\s*goal/i.test(eventType);
}

function isSecondYellow(eventType: string) {
  return /second\s*yellow|yellow\s*red|yellowred/i.test(eventType);
}

/**
 * Event-backed football facts for one player in one fixture. Receiving the
 * complete event feed makes a zero a verified zero; callers must not invoke
 * this helper when the provider event feed is unavailable.
 */
export function touchLinePlayerFixtureEventStatistics(
  providerPlayerId: string,
  events: readonly TouchlineFantasyEvent[],
) {
  const statistics = {
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    penaltySaves: 0,
    penaltiesMissed: 0,
  };
  for (const event of canonicalEvents(events)) {
    const eventType = String(event.type ?? "").trim();
    if (event.playerId === providerPlayerId) {
      if (isGoal(eventType)) statistics.goals += 1;
      if (/own\s*goal/i.test(eventType)) statistics.ownGoals += 1;
      if (/penalty.*save|save.*penalty/i.test(eventType)) statistics.penaltySaves += 1;
      if (/penalty.*miss|miss.*penalty/i.test(eventType)) statistics.penaltiesMissed += 1;
      if (isSecondYellow(eventType)) statistics.redCards += 1;
      else {
        if (/yellow/i.test(eventType)) statistics.yellowCards += 1;
        if (/red/i.test(eventType)) statistics.redCards += 1;
      }
    }
    if (isGoal(eventType) && event.relatedPlayerId === providerPlayerId) statistics.assists += 1;
  }
  return statistics;
}

function statisticValue(statistics: Readonly<Record<string, number>> | null, ...keys: string[]) {
  if (!statistics) return null;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(statistics, key)) continue;
    return nonNegativeInteger(statistics[key]);
  }
  return null;
}

function contribution(input: Omit<TouchLinePlayerPointContribution, "points">): TouchLinePlayerPointContribution {
  return { ...input, points: input.quantity * input.unitPoints };
}

function goalUnitPoints(positionGroup: TouchLinePlayerPositionGroup) {
  if (positionGroup === "Goalkeeper") return 6;
  if (positionGroup === "Defender") return 5;
  if (positionGroup === "Midfielder") return 4;
  return 3;
}

function cleanSheetPoints(positionGroup: TouchLinePlayerPositionGroup) {
  return positionGroup === "Goalkeeper" || positionGroup === "Defender" ? 2 : 1;
}

function ratingPoints(rating: number) {
  if (rating < 6) return -1;
  if (rating < 7) return 0;
  if (rating < 8) return 1;
  if (rating < 9) return 2;
  return 3;
}

export function touchLineDefensiveActionScore(positionGroup: TouchLinePlayerPositionGroup, defensiveActionsTotal: number) {
  if (positionGroup === "Goalkeeper") return null;
  if (positionGroup === "Defender") return defensiveActionsTotal >= 15 ? 2 : defensiveActionsTotal >= 8 ? 1 : 0;
  if (positionGroup === "Midfielder") return defensiveActionsTotal >= 9 ? 2 : defensiveActionsTotal >= 5 ? 1 : 0;
  return defensiveActionsTotal >= 7 ? 1 : 0;
}

/** Single versioned settlement engine. Missing provider facts never become zero. */
export function touchLinePlayerFixturePoints(input: TouchLinePlayerFixtureScoringInput): TouchLinePlayerFixtureScoringResult {
  const providerPlayerId = String(input.providerPlayerId ?? "").trim();
  const positionGroup = touchLineCanonicalPlayerPositionGroup(input.positionGroup);
  const contributions: TouchLinePlayerPointContribution[] = [];
  const missingFacts = new Set<string>();
  const normalizedStatistics: Record<string, number> = {};
  const actualParticipant = (input.appearanceStatus === "started" || input.appearanceStatus === "substitute")
    && typeof input.minutesPlayed === "number" && Number.isFinite(input.minutesPlayed) && input.minutesPlayed > 0;

  if (!providerPlayerId || !positionGroup || !input.events) {
    if (!providerPlayerId) missingFacts.add("provider-player-id");
    if (!positionGroup) missingFacts.add("canonical-position-group");
    if (!input.events) missingFacts.add("canonical-events");
    return { scoringVersion: TOUCHLINE_PLAYER_SCORING_VERSION, positionGroup, points: null, contributions, statistics: normalizedStatistics, missingFacts: [...missingFacts], coverageStatus: "unavailable" };
  }

  const events = canonicalEvents(input.events);
  const eventStatistics = touchLinePlayerFixtureEventStatistics(providerPlayerId, events);
  Object.assign(normalizedStatistics, {
    goals: eventStatistics.goals,
    assists: eventStatistics.assists,
    "yellow-cards": eventStatistics.yellowCards,
    "red-cards": eventStatistics.redCards,
    "own-goals": eventStatistics.ownGoals,
    "penalty-saves": eventStatistics.penaltySaves,
    "penalties-missed": eventStatistics.penaltiesMissed,
  });

  for (const event of events) {
    const eventType = String(event.type ?? "").trim();
    if (event.playerId === providerPlayerId && isGoal(eventType)) {
      contributions.push(contribution({ providerEventId: event.providerId, role: "primary", ruleCode: "goal", eventType: "Goal", minute: event.minute ?? null, quantity: 1, unitPoints: goalUnitPoints(positionGroup) }));
    }
    if (isGoal(eventType) && event.relatedPlayerId === providerPlayerId) {
      contributions.push(contribution({ providerEventId: event.providerId, role: "assist", ruleCode: "assist", eventType: "Assist", minute: event.minute ?? null, quantity: 1, unitPoints: 2 }));
    }
    if (event.playerId !== providerPlayerId) continue;
    if (/own\s*goal/i.test(eventType)) contributions.push(contribution({ providerEventId: event.providerId, role: "fact", ruleCode: "own-goal", eventType: "Own goal", minute: event.minute ?? null, quantity: 1, unitPoints: -1 }));
    if (/penalty.*save|save.*penalty/i.test(eventType)) contributions.push(contribution({ providerEventId: event.providerId, role: "fact", ruleCode: "penalty-save", eventType: "Penalty save", minute: event.minute ?? null, quantity: 1, unitPoints: 3 }));
    if (/penalty.*miss|miss.*penalty/i.test(eventType)) contributions.push(contribution({ providerEventId: event.providerId, role: "fact", ruleCode: "penalty-missed", eventType: "Penalty missed", minute: event.minute ?? null, quantity: 1, unitPoints: -1 }));
    if (isSecondYellow(eventType)) contributions.push(contribution({ providerEventId: event.providerId, role: "fact", ruleCode: "red-card", eventType: "Second yellow / red card", minute: event.minute ?? null, quantity: 1, unitPoints: -3 }));
    else {
      if (/yellow/i.test(eventType)) contributions.push(contribution({ providerEventId: event.providerId, role: "fact", ruleCode: "yellow-card", eventType: "Yellow card", minute: event.minute ?? null, quantity: 1, unitPoints: -1 }));
      if (/red/i.test(eventType)) contributions.push(contribution({ providerEventId: event.providerId, role: "fact", ruleCode: "red-card", eventType: "Red card", minute: event.minute ?? null, quantity: 1, unitPoints: -3 }));
    }
  }

  if (eventStatistics.goals >= 3) {
    contributions.push(contribution({ providerEventId: `fixture:${providerPlayerId}:hat-trick`, role: "fact", ruleCode: "hat-trick", eventType: "Hat-trick bonus", minute: null, quantity: 1, unitPoints: 3, factValue: eventStatistics.goals, detail: `${eventStatistics.goals} valid goals` }));
  }

  const shotsOnTarget = statisticValue(input.statistics, "shots-on-target");
  const shotsOffTarget = statisticValue(input.statistics, "shots-off-target");
  if (shotsOnTarget === null) missingFacts.add("shots-on-target");
  else {
    normalizedStatistics["shots-on-target"] = shotsOnTarget;
    if (shotsOnTarget > 0) contributions.push(contribution({ providerEventId: `stat:${providerPlayerId}:shots-on-target`, role: "fact", ruleCode: "shot-on-target", eventType: "Shots on target", minute: null, quantity: shotsOnTarget, unitPoints: 1 }));
  }
  if (shotsOffTarget === null) missingFacts.add("shots-off-target");
  else normalizedStatistics["shots-off-target"] = shotsOffTarget;

  if (actualParticipant && input.teamGoalsConceded !== null && Number.isFinite(input.teamGoalsConceded)) {
    const teamGoalsConceded = Math.max(0, Math.trunc(input.teamGoalsConceded));
    normalizedStatistics["clean-sheets"] = teamGoalsConceded === 0 ? 1 : 0;
    if (teamGoalsConceded === 0) contributions.push(contribution({ providerEventId: `fixture:${providerPlayerId}:clean-sheet`, role: "fact", ruleCode: "clean-sheet", eventType: "Clean sheet", minute: null, quantity: 1, unitPoints: cleanSheetPoints(positionGroup) }));
  } else if (actualParticipant) missingFacts.add("team-goals-conceded");

  const saves = statisticValue(input.statistics, "saves");
  if (positionGroup === "Goalkeeper") {
    if (saves === null) missingFacts.add("saves");
    else {
      normalizedStatistics.saves = saves;
      if (saves > 0) contributions.push(contribution({ providerEventId: `stat:${providerPlayerId}:saves`, role: "fact", ruleCode: "save", eventType: "Saves", minute: null, quantity: saves, unitPoints: 1 }));
    }
  } else if (saves !== null) normalizedStatistics.saves = saves;

  const goalsConceded = statisticValue(input.statistics, "goalkeeper-goals-conceded", "goals-conceded");
  if (positionGroup === "Goalkeeper" || positionGroup === "Defender") {
    if (actualParticipant && goalsConceded === null) missingFacts.add("goals-conceded-while-on-field");
    if (goalsConceded !== null) {
      normalizedStatistics["goals-conceded"] = goalsConceded;
      if (actualParticipant && goalsConceded > 0) contributions.push(contribution({ providerEventId: `stat:${providerPlayerId}:goals-conceded`, role: "fact", ruleCode: "goal-conceded", eventType: "Goals conceded while on field", minute: null, quantity: goalsConceded, unitPoints: -1 }));
    }
  } else if (goalsConceded !== null) normalizedStatistics["goals-conceded"] = goalsConceded;

  if (actualParticipant) {
    const numericRating = finiteNumber(input.rating);
    if (numericRating === null) missingFacts.add("rating");
    else {
      normalizedStatistics.rating = numericRating;
      const points = ratingPoints(numericRating);
      if (points !== 0) contributions.push(contribution({ providerEventId: `stat:${providerPlayerId}:rating`, role: "fact", ruleCode: "rating", eventType: "Rating", minute: null, quantity: 1, unitPoints: points, factValue: numericRating, detail: `Rating ${numericRating}` }));
    }
  }

  if (actualParticipant && positionGroup !== "Goalkeeper") {
    const defensiveComponents = {
      tacklesWon: statisticValue(input.statistics, "tackles-won"),
      interceptions: statisticValue(input.statistics, "interceptions"),
      clearances: statisticValue(input.statistics, "clearances"),
      blockedShots: statisticValue(input.statistics, "blocked-shots", "shots-blocked"),
      aerialsWon: statisticValue(input.statistics, "aerials-won", "aeriels-won"),
    };
    for (const [key, value] of Object.entries(defensiveComponents)) {
      if (value === null) missingFacts.add(`def:${key}`);
      else normalizedStatistics[`def-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`] = value;
    }
    const defensiveValues = Object.values(defensiveComponents);
    if (defensiveValues.every((value): value is number => value !== null)) {
      const defensiveActionsTotal = defensiveValues.reduce((total, value) => total + value, 0);
      const defScore = touchLineDefensiveActionScore(positionGroup, defensiveActionsTotal) ?? 0;
      normalizedStatistics["defensive-actions-total"] = defensiveActionsTotal;
      normalizedStatistics["def-score"] = defScore;
      if (defScore > 0) contributions.push(contribution({ providerEventId: `stat:${providerPlayerId}:def`, role: "fact", ruleCode: "def", eventType: "DEF", minute: null, quantity: 1, unitPoints: defScore, factValue: defensiveActionsTotal, detail: `DAT ${defensiveActionsTotal}` }));
    }
  }

  return {
    scoringVersion: TOUCHLINE_PLAYER_SCORING_VERSION,
    points: contributions.reduce((total, contribution) => total + contribution.points, 0),
    contributions,
    positionGroup,
    statistics: normalizedStatistics,
    missingFacts: [...missingFacts].sort(),
    coverageStatus: missingFacts.size ? "partial" : "complete",
  };
}
