import { normalizeTouchLineLocale, type TouchLineLocale } from "./i18n.ts";

export type TouchlineRosterRole = "goalkeeper" | "defender" | "midfielder" | "forward";

export type TouchlineMarketPositionBucket =
  | "goalkeeper"
  | "centre-back"
  | "full-back"
  | "defensive-midfield"
  | "central-midfield"
  | "attacking-midfield"
  | "winger"
  | "striker"
  | "outfield";

export type TouchlineMarketPositionInput = {
  position?: string | null;
  role?: TouchlineRosterRole | null;
};

export const TOUCHLINE_MARKET_POSITION_LIMITS: Record<TouchlineMarketPositionBucket, number> = {
  goalkeeper: 3,
  "centre-back": 6,
  "full-back": 6,
  "defensive-midfield": 3,
  "central-midfield": 6,
  "attacking-midfield": 4,
  winger: 6,
  striker: 2,
  outfield: 34,
};

export const TOUCHLINE_MARKET_POSITION_BUCKETS = Object.freeze(
  Object.keys(TOUCHLINE_MARKET_POSITION_LIMITS) as TouchlineMarketPositionBucket[],
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
  if (/\b(lb|rb|lwb|rwb|full back|wing back|left back|right back|lateral)\b/.test(value)) return "full-back";
  if (/\b(cdm|dm|defensive midfielder|holding midfielder|defensive mid|volante|trinco|pivo)\b/.test(value)) return "defensive-midfield";
  if (/\b(cam|am|attacking midfielder|advanced midfielder|meia ofensivo|meia atacante)\b/.test(value)) return "attacking-midfield";
  if (/\b(cm|central midfielder|box to box|midfielder|meia central|meio campo|meio campista)\b/.test(value)) return "central-midfield";
  if (/\b(lw|rw|lm|rm|winger|left wing|right wing|wide midfielder|ponta|ala)\b/.test(value)) return "winger";
  if (/\b(st|cf|striker|centre forward|center forward|forward|centroavante|atacante central)\b/.test(value)) return "striker";

  if (role === "defender") return "centre-back";
  if (role === "midfielder") return "central-midfield";
  if (role === "forward") return "striker";
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
    if (bucket === "full-back") return "Lateral / FB";
    if (bucket === "defensive-midfield") return "Volante / CDM";
    if (bucket === "central-midfield") return "Meia / CM";
    if (bucket === "attacking-midfield") return "Meia ofensivo / CAM";
    if (bucket === "winger") return "Ponta / W";
    if (bucket === "striker") return "Centroavante / ST";
    return "Jogador de linha";
  }

  if (bucket === "goalkeeper") return "Goalkeeper / GK";
  if (bucket === "centre-back") return "Centre-back / CB";
  if (bucket === "full-back") return "Full-back / FB";
  if (bucket === "defensive-midfield") return "Defensive midfielder / CDM";
  if (bucket === "central-midfield") return "Midfielder / CM";
  if (bucket === "attacking-midfield") return "Attacking midfielder / CAM";
  if (bucket === "winger") return "Winger / W";
  if (bucket === "striker") return "Centre-forward / ST";
  return "Outfield player";
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
