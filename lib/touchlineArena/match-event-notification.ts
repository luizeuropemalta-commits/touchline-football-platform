import { touchLinePlayerFixtureScoreV4 } from "../football-data/player-score-engine-v4.ts";
import { getTouchlineNotificationCopy } from "./notification-i18n.ts";
import type { TouchLineLocale } from "./i18n.ts";
import type { TouchlineSocialConfirmedEventDraft } from "./social-confirmed-event-draft-server";

type NotificationDraft = Pick<TouchlineSocialConfirmedEventDraft,
  "sourceProvenance" | "fixtureId" | "eventId" | "score" | "event" | "matchRating" | "touchlinePoints">
  & { home: { name: string }; away: { name: string } };
type VerifiedResult = { ok: true; data: NotificationDraft } | { ok: false; reason: string };

/** Presentation only: the persisted reader must verify the event first.
 * This does not authorise delivery, establish freshness or replace an outbox.
 * V4 points equal the player's match rating, never an extra goal/card bonus.
 */
export function buildMatchEventNotification(
  result: VerifiedResult,
  locale: TouchLineLocale,
  update = false,
) {
  const copy = getTouchlineNotificationCopy(locale);
  if (!result.ok || !copy) return null;
  const draft = result.data;
  const ownGoal = draft.event.kind === "own-goal";
  const penalty = draft.event.kind === "penalty";
  const goal = draft.event.kind === "goal" || penalty || ownGoal;
  const red = draft.event.kind === "red-card" || draft.event.kind === "second-yellow-red";
  if ((!goal && !red) || draft.sourceProvenance !== "PERSISTED_VERIFIED_CONFIRMED_EVENT"
    || !/^[1-9]\d{0,19}$/.test(draft.fixtureId) || !/^[1-9]\d{0,19}$/.test(draft.eventId)
    || !draft.event.playerName.trim() || !draft.home.name.trim() || !draft.away.name.trim()
    || ![draft.score.home, draft.score.away, draft.event.minute].every(value => Number.isSafeInteger(value) && value >= 0)
    || (draft.event.extraMinute !== null && (!Number.isSafeInteger(draft.event.extraMinute) || draft.event.extraMinute < 0))
    || !Number.isFinite(draft.touchlinePoints)
    || touchLinePlayerFixtureScoreV4(draft.matchRating).points !== draft.touchlinePoints) return null;
  const heading = copy.eventLabels[ownGoal ? "own-goal" : penalty ? "penalty-converted" : goal ? "goal" : "red-card"];
  const minute = `${draft.event.minute}${draft.event.extraMinute ? `+${draft.event.extraMinute}` : ""}′`;
  const facts: Record<string, string> = {
    home: draft.home.name, away: draft.away.name, event: heading, minute,
    homeScore: String(draft.score.home), awayScore: String(draft.score.away), player: draft.event.playerName,
  };
  // One-pass substitution never interprets tokens inside a player's/team's name.
  const render = (template: string) => template.replace(/\{([A-Za-z]+)\}/g, (token, key: string) => facts[key] ?? token);
  return {
    title: render(copy.match.titleTemplate),
    body: render(copy.match.bodyTemplate),
    tag: `fixture:${draft.fixtureId}:event:${draft.eventId}`,
    href: `/live?fixture=${draft.fixtureId}&lang=${locale}`,
    update: update === true,
    eventIcon: goal ? "goal" : "red-card",
  };
}
