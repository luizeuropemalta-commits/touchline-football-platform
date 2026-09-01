import { createHash } from "node:crypto";

import type {
  TouchlineSocialContentType,
  TouchlineSocialPlacement,
} from "./social-publication-contract.ts";

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const VERSION = /^[A-Za-z0-9._-]{1,160}$/;

export const TOUCHLINE_SOCIAL_TEMPLATE_POLICY_VERSION = "touchline-social-template-policy-v1" as const;

export type TouchlineSocialTemplateState =
  | "TEMPLATE_APPROVAL_REQUIRED"
  | "TEMPLATE_APPROVED"
  | "AUTO_PUBLISH_ENABLED"
  | "PAUSED"
  | "REVOKED";

export type TouchlineSocialTemplateDescriptor = Readonly<{
  contentType: TouchlineSocialContentType;
  placement: TouchlineSocialPlacement;
  locale: "en-GB";
  width: 1080;
  height: 1350 | 1920;
  templateVersion: string;
  renderedFields: readonly string[];
  visualTemplateChecksum: string;
  baseCopyChecksum: string;
  lexiconChecksum: string;
}>;

export type TouchlineSocialTemplateIdentity = TouchlineSocialTemplateDescriptor & Readonly<{
  renderedFieldsChecksum: string;
  templateIdentityChecksum: string;
}>;

export const TOUCHLINE_SOCIAL_TEMPLATE_DEFINITIONS = Object.freeze([
  {
    contentType: "LINEUP", placement: "INSTAGRAM_FEED", locale: "en-GB",
    width: 1080, height: 1350, templateVersion: "touchline-lineup-feed-v1",
    renderedFields: ["competition", "fixture", "formation", "kickOff", "lineup11", "bench9", "currentClubCoach", "stadium", "team"],
  },
  {
    contentType: "MATCH_PREVIEW", placement: "INSTAGRAM_FEED", locale: "en-GB",
    width: 1080, height: 1350, templateVersion: "touchline-match-preview-feed-v1",
    renderedFields: ["awayClub", "awayLeader", "competition", "gameweek", "homeClub", "homeLeader", "kickOff", "stadium", "tablePositions"],
  },
  {
    contentType: "FULL_TIME", placement: "INSTAGRAM_FEED", locale: "en-GB",
    width: 1080, height: 1350, templateVersion: "touchline-full-time-feed-v1",
    renderedFields: ["awayClub", "competition", "finalScore", "gameweek", "goalEvents", "homeClub", "stadium", "topMatchCard"],
  },
  {
    contentType: "FINAL_SCORE", placement: "INSTAGRAM_STORY", locale: "en-GB",
    width: 1080, height: 1920, templateVersion: "touchline-final-score-story-v1",
    renderedFields: ["awayClub", "competition", "finalScore", "gameweek", "goalEvents", "homeClub", "stadium", "topMatchCard"],
  },
  {
    contentType: "GOAL_CONFIRMED", placement: "INSTAGRAM_STORY", locale: "en-GB",
    width: 1080, height: 1920, templateVersion: "touchline-goal-confirmed-story-v1",
    renderedFields: ["currentScore", "eventMinute", "eventPlayer", "eventTeam", "fixture", "playerCard", "totalRating"],
  },
  {
    contentType: "RED_CARD_CONFIRMED", placement: "INSTAGRAM_STORY", locale: "en-GB",
    width: 1080, height: 1920, templateVersion: "touchline-red-card-confirmed-story-v1",
    renderedFields: ["currentScore", "eventMinute", "eventPlayer", "eventTeam", "fixture", "playerCard"],
  },
  ...([
    "GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL", "PLAYER_DUEL",
    "GAMEWEEK_HERO", "TOP_PERFORMER", "HAT_TRICK_HERO",
  ] as const).map((contentType) => ({
    contentType, placement: "INSTAGRAM_FEED" as const, locale: "en-GB" as const,
    width: 1080 as const, height: 1350 as const,
    templateVersion: "touchline-social-ranking-feed-v1",
    renderedFields: contentType === "PLAYER_DUEL"
      ? ["awayLeader", "fixture", "homeLeader", "rankingSnapshot", "totalRatings"]
      : ["fixtureOrGameweek", "rankingSnapshot", "rankedCards", "totalRatings"],
  })),
] satisfies readonly Omit<TouchlineSocialTemplateDescriptor,
  "visualTemplateChecksum" | "baseCopyChecksum" | "lexiconChecksum">[]);

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function checksumTuple(values: readonly (string | number)[]) {
  return `sha256:${createHash("sha256").update(values.join("\u001f"), "utf8").digest("hex")}`;
}

export function checksumTouchlineSocialTemplateValue(value: unknown) {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

export function buildTouchlineSocialTemplateIdentity(
  descriptor: TouchlineSocialTemplateDescriptor,
): TouchlineSocialTemplateIdentity {
  const renderedFields = [...new Set(descriptor.renderedFields.map((field) => field.trim()))].sort();
  if (!VERSION.test(descriptor.templateVersion)
    || renderedFields.length === 0
    || renderedFields.length > 64
    || renderedFields.some((field) => !/^[A-Za-z][A-Za-z0-9._-]{0,79}$/.test(field))
    || !SHA256.test(descriptor.visualTemplateChecksum)
    || !SHA256.test(descriptor.baseCopyChecksum)
    || !SHA256.test(descriptor.lexiconChecksum)
    || descriptor.width !== 1080
    || ![1350, 1920].includes(descriptor.height)
    || (descriptor.placement === "INSTAGRAM_FEED" && descriptor.height !== 1350)
    || (descriptor.placement === "INSTAGRAM_STORY" && descriptor.height !== 1920)) {
    throw new Error("TL_SOCIAL_TEMPLATE_IDENTITY_INVALID");
  }
  const renderedFieldsChecksum = checksumTuple(renderedFields);
  const templateIdentityChecksum = checksumTuple([
    TOUCHLINE_SOCIAL_TEMPLATE_POLICY_VERSION,
    descriptor.contentType,
    descriptor.placement,
    descriptor.locale,
    descriptor.width,
    descriptor.height,
    descriptor.templateVersion,
    renderedFields.join(","),
    renderedFieldsChecksum,
    descriptor.visualTemplateChecksum,
    descriptor.baseCopyChecksum,
    descriptor.lexiconChecksum,
  ]);
  return Object.freeze({
    ...descriptor,
    renderedFields,
    renderedFieldsChecksum,
    templateIdentityChecksum,
  });
}

export function touchlineSocialTemplateDefinition(
  contentType: TouchlineSocialContentType,
  placement: TouchlineSocialPlacement,
  templateVersion: string,
) {
  return TOUCHLINE_SOCIAL_TEMPLATE_DEFINITIONS.find((candidate) => (
    candidate.contentType === contentType
    && candidate.placement === placement
    && candidate.templateVersion === templateVersion
  )) ?? null;
}

export function touchlineSocialAutoDeliveryIdempotencyKey(input: Readonly<{
  draftId: string;
  draftRevision: number;
  templateIdentityChecksum: string;
  sourceRevisionChecksum: string;
  manifestChecksum: string;
  artifactChecksum: string;
  captionChecksum: string;
}>) {
  return checksumTuple([
    "TOUCHLINE_OFFICIAL_INSTAGRAM",
    input.draftId,
    input.draftRevision,
    input.templateIdentityChecksum,
    input.sourceRevisionChecksum,
    input.manifestChecksum,
    input.artifactChecksum,
    input.captionChecksum,
  ]);
}
