export const TOUCHLINE_ARENA_INTRO_VERSION = 1;
export const TOUCHLINE_ARENA_INTRO_QUERY_PARAM = "intro";
export const TOUCHLINE_ARENA_SKIP_INTRO_QUERY_PARAM = "skipIntro";
export const TOUCHLINE_ARENA_FIRST_INTRO_VALUE = "first";
export const TOUCHLINE_ARENA_INTRO_STORAGE_KEY = `touchline:arena:intro:v${TOUCHLINE_ARENA_INTRO_VERSION}:complete`;

export const TOUCHLINE_ARENA_OFFICIAL_LOGO = "/touchlineArena/brand/tl-shield-lime.svg";
export const TOUCHLINE_ARENA_ENTRY_VIDEO = "/touchlineArena/arena/touchline-arena-entry-20260716.mp4";
export const TOUCHLINE_ARENA_LOOP_VIDEO = "/touchlineArena/arena/touchline-arena-loop-20260716.mp4?v=202607170155";
// The QA Arena editor intentionally uses distinct media sources. Each editor
// camera therefore starts at its own local 0:00 instead of seeking through
// the public continuous loop and accidentally showing the preceding camera.
export const TOUCHLINE_ARENA_LOOP_VIDEO_BY_CAMERA = {
  "wide-touchline": "/touchlineArena/arena/touchline-arena-loop-wide-touchline-20260716.mp4",
  "lower-stand": "/touchlineArena/arena/touchline-arena-loop-lower-stand-20260716.mp4",
  "side-sweep": "/touchlineArena/arena/touchline-arena-loop-side-sweep-20260716.mp4",
} as const;
export const TOUCHLINE_ARENA_VIDEO_POSTER = "/touchlineArena/arena/touchline-arena-poster-20260722.jpg";
export const TOUCHLINE_ARENA_INTRO_SLOGAN = "THIS IS NOT A FANTASY.\nTHIS IS REALITY.";

// APPROVED_TOUCHLINE_INTRO_2026_07_26:
// intro oficial aprovada pelo Luiz. Preservar este ritmo:
// suspense -> logo oficial acende por dentro -> slogan -> drone/vídeo oficial.
// Não mostrar o campo/poster parado entre o slogan e o drone.
export type TouchlineArenaIntroIntent = "first" | "skip" | null;
// "returning" is retained only so archived QA checkpoints remain type-safe.
// The resolver never emits it for a normal return to the Arena.
export type TouchlineArenaIntroLaunchMode = "first" | "returning" | "skip";
export type TouchlineArenaIntroPhase = "suspense" | "outline" | "energy" | "slogan" | "stadium" | "reveal";

export type TouchlineArenaIntroTimeline = {
  outlineAt: number;
  energyAt: number;
  sloganAt: number;
  stadiumAt: number;
  revealAt: number;
  completeAt: number;
};

export const TOUCHLINE_ARENA_INTRO_TIMELINE: TouchlineArenaIntroTimeline = {
  outlineAt: 700,
  energyAt: 1500,
  sloganAt: 5000,
  stadiumAt: 9300,
  revealAt: 10500,
  completeAt: 11800,
};

export const TOUCHLINE_ARENA_INTRO_REDUCED_MOTION_TIMELINE: TouchlineArenaIntroTimeline = {
  outlineAt: 40,
  energyAt: 120,
  sloganAt: 220,
  stadiumAt: 620,
  revealAt: 800,
  completeAt: 980,
};

export function parseTouchlineArenaIntroIntent(values: {
  intro?: string | null;
  skipIntro?: string | null;
}): TouchlineArenaIntroIntent {
  if (values.intro === TOUCHLINE_ARENA_FIRST_INTRO_VALUE) return "first";
  if (values.skipIntro === "1") return "skip";
  return null;
}

export function resolveTouchlineArenaIntroLaunchMode(values: {
  intent: TouchlineArenaIntroIntent;
  hasCompletedIntro: boolean;
}): TouchlineArenaIntroLaunchMode {
  if (values.intent === "first") return "first";
  if (values.intent === "skip") return "skip";
  // The official cinematic is a first-entry experience. Returning users go
  // straight to the Arena and can explicitly replay it from the Arena menu.
  return values.hasCompletedIntro ? "skip" : "first";
}

export function touchlineArenaFirstEntryHref(locale: string) {
  const params = new URLSearchParams({
    lang: locale,
    [TOUCHLINE_ARENA_INTRO_QUERY_PARAM]: TOUCHLINE_ARENA_FIRST_INTRO_VALUE,
  });
  return `/arena?${params.toString()}`;
}

export function touchlineArenaIntroTimeline(reducedMotion: boolean) {
  return reducedMotion
    ? TOUCHLINE_ARENA_INTRO_REDUCED_MOTION_TIMELINE
    : TOUCHLINE_ARENA_INTRO_TIMELINE;
}
