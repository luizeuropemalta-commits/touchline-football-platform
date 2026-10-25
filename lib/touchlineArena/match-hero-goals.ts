import type { TouchlinePublicFantasyEvent } from "../football-data/public-fantasy-fixture.ts";
import { touchlineMatchEventKind } from "./match-event-i18n.ts";

/** Team IDs in the canonical event feed identify the scoring club, including own goals. */
export function matchHeroGoals(events: readonly TouchlinePublicFantasyEvent[], fixtureId: string, teamId?: string) {
  if (!teamId) return [];
  const latest = new Map<string, TouchlinePublicFantasyEvent>();
  for (const event of events) latest.set(event.id, event);
  return [...latest.values()].filter(event => {
    const kind = touchlineMatchEventKind(event.type);
    return event.teamId === teamId && (!event.fixtureId || event.fixtureId === fixtureId)
      && event.status !== "rescinded" && Boolean(event.playerName?.trim())
      && (kind === "goal" || kind === "penalty" || kind === "ownGoal");
  }).sort((a, b) => (a.minute ?? Infinity) - (b.minute ?? Infinity)
    || (a.extraMinute ?? 0) - (b.extraMinute ?? 0) || a.id.localeCompare(b.id));
}

export function matchHeroScorers(events: readonly TouchlinePublicFantasyEvent[], fixtureId: string, teamId?: string) {
  const groups = new Map<string, { key: string; playerName: string; goals: TouchlinePublicFantasyEvent[] }>();
  for (const goal of matchHeroGoals(events, fixtureId, teamId)) {
    // Never merge unrelated people by display name when their identity is missing.
    const key = goal.playerId ? `player:${goal.playerId}` : `event:${goal.id}`;
    const group = groups.get(key) ?? { key, playerName: goal.playerName!, goals: [] };
    group.goals.push(goal);
    groups.set(key, group);
  }
  return [...groups.values()];
}
