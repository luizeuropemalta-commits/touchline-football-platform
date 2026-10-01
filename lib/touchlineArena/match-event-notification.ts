import { touchLinePlayerFixtureScoreV4 } from "../football-data/player-score-engine-v4.ts";
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
  locale: "pt-BR" | "en-GB",
  update = false,
) {
  if (!result.ok) return null;
  const draft = result.data;
  const pt = locale === "pt-BR";
  const goal = draft.event.kind === "goal" || draft.event.kind === "penalty";
  const red = draft.event.kind === "red-card" || draft.event.kind === "second-yellow-red";
  if ((!goal && !red) || draft.sourceProvenance !== "PERSISTED_VERIFIED_CONFIRMED_EVENT"
    || !/^[1-9]\d{0,19}$/.test(draft.fixtureId) || !/^[1-9]\d{0,19}$/.test(draft.eventId)
    || !draft.event.playerName.trim() || !draft.home.name.trim() || !draft.away.name.trim()
    || ![draft.score.home, draft.score.away, draft.event.minute].every(value => Number.isSafeInteger(value) && value >= 0)
    || (draft.event.extraMinute !== null && (!Number.isSafeInteger(draft.event.extraMinute) || draft.event.extraMinute < 0))
    || !Number.isFinite(draft.touchlinePoints)
    || touchLinePlayerFixtureScoreV4(draft.matchRating).points !== draft.touchlinePoints) return null;
  const heading = goal ? (pt ? "GOL" : "GOAL") : (pt ? "CARTÃO VERMELHO" : "RED CARD");
  const minute = `${draft.event.minute}${draft.event.extraMinute ? `+${draft.event.extraMinute}` : ""}′`;
  const points = `${draft.touchlinePoints}`;
  return {
    title: `${heading} — ${draft.home.name} ${draft.score.home} × ${draft.score.away} ${draft.away.name}`,
    body: `${draft.event.playerName} · ${minute} · ${pt ? "Nota da partida" : "Match rating"}: ${points}`,
    tag: `fixture:${draft.fixtureId}:event:${draft.eventId}`,
    href: `/live?fixture=${draft.fixtureId}&lang=${locale}`,
    update: update === true,
    eventIcon: goal ? "goal" : "red-card",
  };
}
