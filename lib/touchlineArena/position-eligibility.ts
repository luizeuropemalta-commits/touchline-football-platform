import { normalizeTouchLineLocale, type TouchLineLocale } from "./i18n.ts";

export type TouchlineRosterRole = "goalkeeper" | "defender" | "midfielder" | "forward";

export type TouchlineMarketPositionBucket =
  | "goalkeeper"
  | "centre-back"
  | "right-back"
  | "left-back"
  | "defensive-midfield"
  | "midfield"
  | "attacker"
  | "centre-forward"
  | "outfield";

export type TouchlineMarketPositionInput = {
  position?: string | null;
  role?: TouchlineRosterRole | null;
};

export const TOUCHLINE_MARKET_POSITION_LIMITS: Record<TouchlineMarketPositionBucket, number> = {
  goalkeeper: 3,
  "centre-back": 6,
  "right-back": 2,
  "left-back": 2,
  "defensive-midfield": 3,
  midfield: 6,
  attacker: 8,
  "centre-forward": 5,
  // Unknown provider positions stay visible for review but can never consume
  // a ClubOwner contract slot until TouchLine classifies them.
  outfield: 0,
};

export const TOUCHLINE_MARKET_POSITION_BUCKETS = Object.freeze(
  Object.keys(TOUCHLINE_MARKET_POSITION_LIMITS) as TouchlineMarketPositionBucket[],
);

/**
 * Canonical first-squad purchase journey. The total of these limits is the
 * approved 35-player ClubOwner roster. The first build advances one completed
 * category at a time; replacement remains available through the contract flow.
 */
export const TOUCHLINE_MARKET_POSITION_SEQUENCE = Object.freeze([
  "goalkeeper",
  "centre-back",
  "right-back",
  "left-back",
  "defensive-midfield",
  "midfield",
  "attacker",
  "centre-forward",
] as const satisfies readonly TouchlineMarketPositionBucket[]);

export const TOUCHLINE_MARKET_APPROVED_SQUAD_SIZE = TOUCHLINE_MARKET_POSITION_SEQUENCE.reduce(
  (total, bucket) => total + TOUCHLINE_MARKET_POSITION_LIMITS[bucket],
  0,
);

export type TouchlineMarketPositionProgress = {
  bucket: TouchlineMarketPositionBucket;
  count: number;
  limit: number;
  isFull: boolean;
};

function normalizePositionText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_/.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function touchlineMarketPositionBucket(position?: string | null, role?: TouchlineRosterRole | null): TouchlineMarketPositionBucket {
  const value = normalizePositionText(position);

  if (role === "goalkeeper" || /\b(gk|keeper|goalkeeper|goleiro)\b/.test(value)) return "goalkeeper";
  if (/\b(cb|centre back|center back|central defender|zagueiro)\b/.test(value)) return "centre-back";
  if (/\b(rb|rwb|right back|right wing back|lateral direito|ld)\b/.test(value)) return "right-back";
  if (/\b(lb|lwb|left back|left wing back|lateral esquerdo|le)\b/.test(value)) return "left-back";
  if (/\b(cdm|dm|defensive midfielder|holding midfielder|defensive mid|volante|trinco|pivo)\b/.test(value)) return "defensive-midfield";
  if (/\b(st|cf|striker|centre forward|center forward|centroavante|atacante central|number 9)\b/.test(value)) return "centre-forward";
  if (/\b(lw|rw|winger|left wing|right wing|secondary striker|second striker|ss|ponta|segundo atacante|atacante)\b/.test(value)) return "attacker";
  if (/\b(cm|cam|am|lm|rm|central midfielder|attacking midfielder|advanced midfielder|left midfielder|right midfielder|wide midfielder|box to box|midfielder|meia central|meia ofensivo|meia atacante|meio campo|meio campista|meia)\b/.test(value)) return "midfield";

  if (role === "defender") return "centre-back";
  if (role === "midfielder") return "midfield";
  if (role === "forward") return "attacker";
  return "outfield";
}

export function touchlineMarketPositionBucketLabel(
  bucket: TouchlineMarketPositionBucket,
  locale?: TouchLineLocale | string | null,
) {
  const normalizedLocale = normalizeTouchLineLocale(locale);
  if (normalizedLocale === "pt-BR") {
    if (bucket === "goalkeeper") return "Goleiro / GK";
    if (bucket === "centre-back") return "Zagueiro / CB";
    if (bucket === "right-back") return "Lateral direito / RB";
    if (bucket === "left-back") return "Lateral esquerdo / LB";
    if (bucket === "defensive-midfield") return "Volante / CDM";
    if (bucket === "midfield") return "Meia / MID";
    if (bucket === "attacker") return "Atacante / ATT";
    if (bucket === "centre-forward") return "Centroavante / ST";
    return "Posição em classificação";
  }

  if (bucket === "goalkeeper") return "Goalkeeper / GK";
  if (bucket === "centre-back") return "Centre-back / CB";
  if (bucket === "right-back") return "Right-back / RB";
  if (bucket === "left-back") return "Left-back / LB";
  if (bucket === "defensive-midfield") return "Defensive midfielder / CDM";
  if (bucket === "midfield") return "Midfielder / MID";
  if (bucket === "attacker") return "Attacker / ATT";
  if (bucket === "centre-forward") return "Centre-forward / ST";
  return "Position pending classification";
}

export function touchlineMarketPositionBucketCount(players: TouchlineMarketPositionInput[]) {
  return players.reduce<Partial<Record<TouchlineMarketPositionBucket, number>>>((counts, player) => {
    const bucket = touchlineMarketPositionBucket(player.position, player.role);
    counts[bucket] = (counts[bucket] ?? 0) + 1;
    return counts;
  }, {});
}

/**
 * One shared progress view for the Market, ClubOwner roster and future
 * purchase surfaces. It derives availability from the approved position
 * limits; it never changes the limits or any commercial rule.
 */
export function touchlineMarketPositionProgress(
  counts: Partial<Record<TouchlineMarketPositionBucket, number>>,
): TouchlineMarketPositionProgress[] {
  return TOUCHLINE_MARKET_POSITION_BUCKETS.map((bucket) => {
    const limit = TOUCHLINE_MARKET_POSITION_LIMITS[bucket];
    const count = Math.max(0, counts[bucket] ?? 0);
    return { bucket, count, limit, isFull: count >= limit };
  });
}

export function touchlineTwoStrikerFormationHint(locale?: TouchLineLocale | string | null) {
  return normalizeTouchLineLocale(locale) === "pt-BR"
    ? "Para jogar com 2 centroavantes, mude a formação para 4-4-2."
    : "To use 2 centre-forwards, switch the formation to 4-4-2.";
}
