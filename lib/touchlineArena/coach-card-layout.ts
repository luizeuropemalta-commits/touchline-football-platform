export const TOUCHLINE_COACH_CARD_LAYOUT_VERSION = 6;
export const TOUCHLINE_COACH_CARD_LAYOUT_STORAGE_KEY = `touchline:coach-card:master-layout:v${TOUCHLINE_COACH_CARD_LAYOUT_VERSION}`;
export const TOUCHLINE_COACH_CARD_LAYOUT_EVENT = "touchline:coach-card-layout-change";

export const TOUCHLINE_COACH_CARD_EDITOR_SAFE_AREA = {
  left: 2,
  right: 98,
  top: 2,
  bottom: 75,
} as const;

export const TOUCHLINE_COACH_LAYER_KEYS = ["nationality", "clubCrest", "portrait", "nameplate", "stats", "footer"] as const;
export type TouchlineCoachLayerKey = (typeof TOUCHLINE_COACH_LAYER_KEYS)[number];

export type TouchlineCoachLayerLayout = {
  x: number;
  y: number;
  w: number;
  h?: number;
};

export type TouchlineCoachCardLayout = {
  layers: Record<TouchlineCoachLayerKey, TouchlineCoachLayerLayout>;
  portraitScale: number;
  nameSize: number;
  crestSize: number;
  neonStrength: number;
};

const FALLBACK_LAYOUT: TouchlineCoachCardLayout = {
  layers: {
    nationality: { x: 42.5, y: 12.2, w: 15 },
    clubCrest: { x: 20.360540577355295, y: 18.39326773385237, w: 10 },
    portrait: { x: 23, y: 8.5, w: 54, h: 25.5 },
    nameplate: { x: 13, y: 52, w: 74 },
    stats: { x: 11.5, y: 65.5, w: 77 },
    footer: { x: 18, y: 86.4, w: 64 },
  },
  portraitScale: 1,
  nameSize: 5.8,
  crestSize: 30.8,
  neonStrength: 1,
};

function cleanNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

export function normalizeTouchlineCoachCardLayout(input?: unknown): TouchlineCoachCardLayout {
  const source = input && typeof input === "object"
    ? input as Partial<TouchlineCoachCardLayout> & { layout?: Partial<Record<TouchlineCoachLayerKey, Partial<TouchlineCoachLayerLayout>>> }
    : {};
  const rawLayers = source.layers ?? source.layout;
  const sourceLayers = rawLayers && typeof rawLayers === "object"
    ? rawLayers as Partial<Record<TouchlineCoachLayerKey, Partial<TouchlineCoachLayerLayout>>>
    : {};
  const layers = {} as Record<TouchlineCoachLayerKey, TouchlineCoachLayerLayout>;

  for (const key of TOUCHLINE_COACH_LAYER_KEYS) {
    const fallback = FALLBACK_LAYOUT.layers[key];
    const candidate: Partial<TouchlineCoachLayerLayout> = sourceLayers[key] && typeof sourceLayers[key] === "object"
      ? sourceLayers[key]
      : {};
    const minWidth = key === "clubCrest" || key === "nationality" ? 6 : 18;
    const width = cleanNumber(candidate.w, fallback.w, minWidth, 94);
    layers[key] = {
      x: cleanNumber(candidate.x, fallback.x, 0, 100 - width),
      y: cleanNumber(candidate.y, fallback.y, 0, 96),
      w: width,
      ...(key === "portrait" ? { h: cleanNumber(candidate.h, fallback.h ?? 25.5, 14, 58) } : {}),
    };
  }

  return {
    layers,
    portraitScale: cleanNumber(source.portraitScale, FALLBACK_LAYOUT.portraitScale, .68, 1.42),
    nameSize: cleanNumber(source.nameSize, FALLBACK_LAYOUT.nameSize, 3.4, 7.2),
    crestSize: cleanNumber(source.crestSize, FALLBACK_LAYOUT.crestSize, 6, 90),
    neonStrength: cleanNumber(source.neonStrength, FALLBACK_LAYOUT.neonStrength, .25, 1.8),
  };
}

export const TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT = normalizeTouchlineCoachCardLayout(FALLBACK_LAYOUT);
