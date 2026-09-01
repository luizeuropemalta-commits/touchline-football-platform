export const TOUCHLINE_SOCIAL_CONTENT_REGISTRY = Object.freeze({
  LINEUP: Object.freeze({ module: "040", placement: "INSTAGRAM_FEED", width: 1080, height: 1350, scope: "TEAM_FIXTURE" }),
  MATCH_PREVIEW: Object.freeze({ module: "041", placement: "INSTAGRAM_FEED", width: 1080, height: 1350, scope: "FIXTURE" }),
  FULL_TIME: Object.freeze({ module: "042", placement: "INSTAGRAM_FEED", width: 1080, height: 1350, scope: "FIXTURE" }),
  FINAL_SCORE: Object.freeze({ module: "042", placement: "INSTAGRAM_STORY", width: 1080, height: 1920, scope: "FIXTURE" }),
  GOAL_CONFIRMED: Object.freeze({ module: "043", placement: "INSTAGRAM_STORY", width: 1080, height: 1920, scope: "FIXTURE_EVENT" }),
  RED_CARD_CONFIRMED: Object.freeze({ module: "043", placement: "INSTAGRAM_STORY", width: 1080, height: 1920, scope: "FIXTURE_EVENT" }),
  GAMEWEEK_RANKING_PREVIEW: Object.freeze({ module: "044", placement: "INSTAGRAM_FEED", width: 1080, height: 1350, scope: "GAMEWEEK" }),
  GAMEWEEK_RANKING_FINAL: Object.freeze({ module: "044", placement: "INSTAGRAM_FEED", width: 1080, height: 1350, scope: "GAMEWEEK" }),
  PLAYER_DUEL: Object.freeze({ module: "044", placement: "INSTAGRAM_FEED", width: 1080, height: 1350, scope: "FIXTURE" }),
  GAMEWEEK_HERO: Object.freeze({ module: "044", placement: "INSTAGRAM_FEED", width: 1080, height: 1350, scope: "GAMEWEEK_PLAYER" }),
  TOP_PERFORMER: Object.freeze({ module: "044", placement: "INSTAGRAM_FEED", width: 1080, height: 1350, scope: "FIXTURE_PLAYER" }),
  HAT_TRICK_HERO: Object.freeze({ module: "044", placement: "INSTAGRAM_FEED", width: 1080, height: 1350, scope: "FIXTURE_PLAYER" }),
} as const);

export type TouchlineRegisteredSocialContentType = keyof typeof TOUCHLINE_SOCIAL_CONTENT_REGISTRY;

export function touchlineSocialContentDefinition(contentType: string) {
  return Object.prototype.hasOwnProperty.call(TOUCHLINE_SOCIAL_CONTENT_REGISTRY, contentType)
    ? TOUCHLINE_SOCIAL_CONTENT_REGISTRY[contentType as TouchlineRegisteredSocialContentType]
    : null;
}

export function isTouchlineSocialContentTypeEnabledInModule(
  contentType: string,
  module: string,
) {
  return touchlineSocialContentDefinition(contentType)?.module === module;
}
