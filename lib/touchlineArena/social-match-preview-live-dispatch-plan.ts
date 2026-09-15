import { createHash } from "node:crypto";

export const TOUCHLINE_MATCH_PREVIEW_TRIGGER_LEAD_MS = 24 * 60 * 60 * 1_000;

export type TouchlineMatchPreviewPresentation = "SOCIAL_FEED" | "SOCIAL_STORY" | "CLUB_FEED";
export type TouchlineMatchPreviewPlatform = "INSTAGRAM" | "FACEBOOK" | "CLUBHUB";
export type TouchlineMatchPreviewDeliveryState = "AWAITING_EDITORIAL_SCHEDULE" | "SCHEDULED" | "READY" | "BLOCKED_APPROVAL";

export type TouchlineMatchPreviewDispatchInput = Readonly<{
  fixtureId: string;
  revision: number;
  sourceRevisionChecksum: string;
  startsAt: string;
  now: string;
  /** Owner-set moment from Admin. Null deliberately keeps the T-24h value as a suggestion only. */
  editorialScheduledFor: string | null;
  accounts: Readonly<{
    instagram: string;
    facebook: string;
    homeClub: string;
    awayClub: string;
  }>;
  enabled: Readonly<{
    instagram: Readonly<{ feed: boolean; story: boolean }>;
    facebook: Readonly<{ feed: boolean; story: boolean }>;
    clubHubFeed: boolean;
  }>;
  approvals: Readonly<{
    feed: boolean;
    story: boolean;
    clubHubFeed: boolean;
  }>;
}>;

export type TouchlineMatchPreviewDeliveryTask = Readonly<{
  logicalDestination: "INSTAGRAM" | "FACEBOOK" | "HOME_CLUB" | "AWAY_CLUB";
  platform: TouchlineMatchPreviewPlatform;
  accountId: string;
  presentation: TouchlineMatchPreviewPresentation;
  factualInstanceKey: string;
  idempotencyKey: string;
  suggestedAt: string;
  editorialScheduledFor: string | null;
  state: TouchlineMatchPreviewDeliveryState;
}>;

export type TouchlineMatchPreviewAttemptDecision =
  | Readonly<{ action: "ATTEMPT_ALLOWED" }>
  | Readonly<{ action: "SKIP_DUPLICATE_CONFIRMED" }>
  | Readonly<{ action: "SKIP_DUPLICATE_IN_FLIGHT" }>
  | Readonly<{ action: "RECONCILE_BEFORE_RETRY" }>;

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function date(value: string, reason: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(reason);
  return timestamp;
}

function nonEmpty(value: string, reason: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(reason);
  return trimmed;
}

function approvalFor(presentation: TouchlineMatchPreviewPresentation, approvals: TouchlineMatchPreviewDispatchInput["approvals"]) {
  return presentation === "SOCIAL_STORY"
    ? approvals.story
    : presentation === "SOCIAL_FEED"
      ? approvals.feed
      : approvals.clubHubFeed;
}

function deliveryTask(input: Readonly<{
  logicalDestination: TouchlineMatchPreviewDeliveryTask["logicalDestination"];
  platform: TouchlineMatchPreviewPlatform;
  accountId: string;
  presentation: TouchlineMatchPreviewPresentation;
  factualInstanceKey: string;
  suggestedAt: string;
  editorialScheduledFor: string | null;
  due: boolean;
  approved: boolean;
}>): TouchlineMatchPreviewDeliveryTask {
  const idempotencyKey = sha256([
    "touchline-match-preview-live-v1",
    input.factualInstanceKey,
    input.platform,
    input.accountId,
    input.presentation,
  ].join("\0"));
  return Object.freeze({
    logicalDestination: input.logicalDestination,
    platform: input.platform,
    accountId: input.accountId,
    presentation: input.presentation,
    factualInstanceKey: input.factualInstanceKey,
    idempotencyKey,
    suggestedAt: input.suggestedAt,
    editorialScheduledFor: input.editorialScheduledFor,
    state: !input.approved ? "BLOCKED_APPROVAL" : input.editorialScheduledFor === null
      ? "AWAITING_EDITORIAL_SCHEDULE" : input.due ? "READY" : "SCHEDULED",
  });
}

/**
 * Pure local planning seam; it cannot call a network, persist a queue or send
 * a post. The editorial presentation switch is deliberately explicit so a
 * Story candidate is not enabled or approved by the Feed decision.
 */
export function planTouchlineMatchPreviewLiveDispatch(
  input: TouchlineMatchPreviewDispatchInput,
): readonly TouchlineMatchPreviewDeliveryTask[] {
  const fixtureId = nonEmpty(input.fixtureId, "MATCH_PREVIEW_FIXTURE_ID_REQUIRED");
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) throw new Error("MATCH_PREVIEW_REVISION_INVALID");
  const sourceRevisionChecksum = nonEmpty(input.sourceRevisionChecksum, "MATCH_PREVIEW_SOURCE_REVISION_REQUIRED");
  const startsAt = date(input.startsAt, "MATCH_PREVIEW_START_INVALID");
  const now = date(input.now, "MATCH_PREVIEW_NOW_INVALID");
  const homeClub = nonEmpty(input.accounts.homeClub, "MATCH_PREVIEW_HOME_CLUB_REQUIRED");
  const awayClub = nonEmpty(input.accounts.awayClub, "MATCH_PREVIEW_AWAY_CLUB_REQUIRED");
  if (homeClub === awayClub) throw new Error("MATCH_PREVIEW_CLUBS_MUST_BE_DISTINCT");
  if (/clubowner|my[ _-]?club/i.test(`${homeClub}\n${awayClub}`)) throw new Error("MATCH_PREVIEW_CLUBOWNER_DESTINATION_FORBIDDEN");

  const suggestedAt = new Date(startsAt - TOUCHLINE_MATCH_PREVIEW_TRIGGER_LEAD_MS).toISOString();
  const editorialScheduledFor = input.editorialScheduledFor === null
    ? null
    : new Date(date(input.editorialScheduledFor, "MATCH_PREVIEW_EDITORIAL_SCHEDULE_INVALID")).toISOString();
  const factualInstanceKey = sha256([
    "touchline-match-preview-factual-instance-v1",
    fixtureId,
    String(input.revision),
    sourceRevisionChecksum,
  ].join("\0"));
  const due = editorialScheduledFor !== null && now >= Date.parse(editorialScheduledFor);
  const tasks: TouchlineMatchPreviewDeliveryTask[] = [];
  const add = (
    logicalDestination: TouchlineMatchPreviewDeliveryTask["logicalDestination"],
    platform: TouchlineMatchPreviewPlatform,
    accountId: string,
    presentation: TouchlineMatchPreviewPresentation,
  ) => {
    tasks.push(deliveryTask({
      logicalDestination,
      platform,
      accountId: nonEmpty(accountId, "MATCH_PREVIEW_DESTINATION_ACCOUNT_REQUIRED"),
      presentation,
      factualInstanceKey,
      suggestedAt,
      editorialScheduledFor,
      due,
      approved: approvalFor(presentation, input.approvals),
    }));
  };

  if (input.enabled.instagram.feed) add("INSTAGRAM", "INSTAGRAM", input.accounts.instagram, "SOCIAL_FEED");
  if (input.enabled.instagram.story) add("INSTAGRAM", "INSTAGRAM", input.accounts.instagram, "SOCIAL_STORY");
  if (input.enabled.facebook.feed) add("FACEBOOK", "FACEBOOK", input.accounts.facebook, "SOCIAL_FEED");
  if (input.enabled.facebook.story) add("FACEBOOK", "FACEBOOK", input.accounts.facebook, "SOCIAL_STORY");
  if (input.enabled.clubHubFeed) {
    add("HOME_CLUB", "CLUBHUB", homeClub, "CLUB_FEED");
    add("AWAY_CLUB", "CLUBHUB", awayClub, "CLUB_FEED");
  }
  return Object.freeze(tasks);
}

/** Automatic and manual controls call this same decision function. */
export function decideTouchlineMatchPreviewDeliveryAttempt(
  existing: "NONE" | "IN_FLIGHT" | "CONFIRMED" | "UNCERTAIN",
): TouchlineMatchPreviewAttemptDecision {
  if (existing === "CONFIRMED") return Object.freeze({ action: "SKIP_DUPLICATE_CONFIRMED" });
  if (existing === "IN_FLIGHT") return Object.freeze({ action: "SKIP_DUPLICATE_IN_FLIGHT" });
  if (existing === "UNCERTAIN") return Object.freeze({ action: "RECONCILE_BEFORE_RETRY" });
  return Object.freeze({ action: "ATTEMPT_ALLOWED" });
}
