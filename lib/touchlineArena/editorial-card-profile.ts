/**
 * Local editorial contract for a player card.
 *
 * This deliberately has no dependency on a valuation, provider, checkout or
 * pricing module. `cardPrice` is display data approved by the editorial team;
 * it is never an authority to charge, contract or fulfil a card.
 */
export const TOUCHLINE_EDITORIAL_CARD_TIER_KEYS = [
  "ruby-red",
  "sapphire-blue",
  "amethyst-purple",
  "radiant-gold",
  "emerald-green",
  "clear-diamond",
  "diamond-gold",
] as const;

export const TOUCHLINE_EDITORIAL_CARD_CURRENCIES = ["TC", "GBP", "EUR"] as const;

/**
 * Canonical TouchLine game-card lifecycle. A real football player can exist
 * in the football layer at every one of these stages; only `published` may
 * cross into a game-card surface.
 */
export const TOUCHLINE_CARD_PUBLICATION_STATES = [
  "detected",
  "market_value_required",
  "ready_for_review",
  "ready_to_publish",
  "published",
  "inactive_in_competition",
  "archived",
] as const;

export type TouchlineEditorialCardTierKey = (typeof TOUCHLINE_EDITORIAL_CARD_TIER_KEYS)[number];
export type TouchlineEditorialCardCurrency = (typeof TOUCHLINE_EDITORIAL_CARD_CURRENCIES)[number];
export type TouchlineCardPublicationState = (typeof TOUCHLINE_CARD_PUBLICATION_STATES)[number];
/** @deprecated Use TouchlineCardPublicationState. */
export type TouchlineEditorialCardState = TouchlineCardPublicationState;

export type TouchlineEditorialCardPrice = Readonly<{
  amountMinor: number;
  currency: TouchlineEditorialCardCurrency;
}>;

export type TouchlineEditorialCardRecord = Readonly<{
  playerId: string;
  tierKey: TouchlineEditorialCardTierKey;
  cardPrice: TouchlineEditorialCardPrice;
  publicationState: TouchlineCardPublicationState;
  lastReviewedAt: string;
  internalNote?: string;
  internalSource?: string;
}>;

/**
 * The public card surface receives only information that an editor has
 * explicitly published. Internal notes and sources never cross this boundary.
 */
export type TouchlinePublicEditorialCardPresentation = Readonly<{
  tierKey: TouchlineEditorialCardTierKey;
  cardPrice: TouchlineEditorialCardPrice;
  /** Canonical verified value used by the Fantasy/card presentation only. */
  marketValueEur?: number;
  lastReviewedAt: string;
}>;

type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
const RECORD_KEYS = new Set([
  "playerId",
  "tierKey",
  "cardPrice",
  "publicationState",
  "lastReviewedAt",
  "internalNote",
  "internalSource",
]);
const PRICE_KEYS = new Set(["amountMinor", "currency"]);
const PUBLIC_PRESENTATION_KEYS = new Set(["tierKey", "cardPrice", "marketValueEur", "lastReviewedAt"]);

function asPlainRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? value as UnknownRecord
    : null;
}

function hasOnlyKnownKeys(value: UnknownRecord, allowedKeys: ReadonlySet<string>) {
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function normalizePlayerId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value) return false;
  const match = value.match(ISO_TIMESTAMP_PATTERN);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (
    year < 1
    || month < 1
    || month > 12
    || hour > 23
    || minute > 59
    || second > 59
  ) return false;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return false;

  if (zone === "Z") return true;
  const [offsetHourText, offsetMinuteText] = zone.slice(1).split(":");
  const offsetHour = Number(offsetHourText);
  const offsetMinute = Number(offsetMinuteText);
  return offsetHour <= 14
    && offsetMinute <= 59
    && (offsetHour < 14 || offsetMinute === 0);
}

function parsePrice(value: unknown): TouchlineEditorialCardPrice | null {
  const record = asPlainRecord(value);
  if (!record || !hasOnlyKnownKeys(record, PRICE_KEYS)) return null;
  const amountMinor = record.amountMinor;
  if (
    typeof amountMinor !== "number"
    || !Number.isSafeInteger(amountMinor)
    || amountMinor < 0
  ) return null;
  if (!isOneOf(record.currency, TOUCHLINE_EDITORIAL_CARD_CURRENCIES)) return null;
  return Object.freeze({ amountMinor, currency: record.currency });
}

function parseOptionalInternalText(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) return null;
  return value;
}

/**
 * Strictly validates a locally maintained editorial record. Invalid or
 * unexpected input is rejected as `null` so consumers fail closed.
 */
export function parseTouchlineEditorialCardRecord(value: unknown): TouchlineEditorialCardRecord | null {
  const record = asPlainRecord(value);
  if (!record || !hasOnlyKnownKeys(record, RECORD_KEYS)) return null;

  const playerId = normalizePlayerId(record.playerId);
  const cardPrice = parsePrice(record.cardPrice);
  const internalNote = parseOptionalInternalText(record.internalNote);
  const internalSource = parseOptionalInternalText(record.internalSource);

  if (
    !playerId
    || !isOneOf(record.tierKey, TOUCHLINE_EDITORIAL_CARD_TIER_KEYS)
    || !cardPrice
    || !isOneOf(record.publicationState, TOUCHLINE_CARD_PUBLICATION_STATES)
    || !isValidIsoTimestamp(record.lastReviewedAt)
    || internalNote === null
    || internalSource === null
  ) return null;

  return Object.freeze({
    playerId,
    tierKey: record.tierKey,
    cardPrice,
    publicationState: record.publicationState,
    lastReviewedAt: record.lastReviewedAt,
    ...(internalNote === undefined ? {} : { internalNote }),
    ...(internalSource === undefined ? {} : { internalSource }),
  });
}

/**
 * Removes all private editorial fields and hides cards that have not been
 * explicitly published. The output is suitable only for visual presentation.
 */
export function resolveTouchlinePublicEditorialCardPresentation(
  value: unknown,
): TouchlinePublicEditorialCardPresentation | null {
  const record = parseTouchlineEditorialCardRecord(value);
  if (!record || record.publicationState !== "published") return null;

  return Object.freeze({
    tierKey: record.tierKey,
    cardPrice: Object.freeze({ ...record.cardPrice }),
    lastReviewedAt: record.lastReviewedAt,
  });
}

/**
 * Validates the small public projection that may cross a server-to-browser
 * roster boundary. It accepts neither an editorial status nor internal
 * metadata, so a client cannot turn a draft/review record into a published
 * card by sending extra fields.
 */
export function parseTouchlinePublicEditorialCardPresentation(
  value: unknown,
): TouchlinePublicEditorialCardPresentation | null {
  const record = asPlainRecord(value);
  const cardPrice = record ? parsePrice(record.cardPrice) : null;
  const marketValueEur = record?.marketValueEur;
  if (
    !record
    || !hasOnlyKnownKeys(record, PUBLIC_PRESENTATION_KEYS)
    || !isOneOf(record.tierKey, TOUCHLINE_EDITORIAL_CARD_TIER_KEYS)
    || !cardPrice
    || (marketValueEur !== undefined && (
      typeof marketValueEur !== "number"
      || !Number.isSafeInteger(marketValueEur)
      || marketValueEur < 0
    ))
    || !isValidIsoTimestamp(record.lastReviewedAt)
  ) return null;

  return Object.freeze({
    tierKey: record.tierKey,
    cardPrice,
    ...(marketValueEur === undefined ? {} : { marketValueEur }),
    lastReviewedAt: record.lastReviewedAt as string,
  });
}

export function formatTouchlineMarketValueEur(
  valueEur: number,
  locale: string | null | undefined,
) {
  return new Intl.NumberFormat(locale === "pt-BR" ? "pt-BR" : "en-GB", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: valueEur < 10_000_000 ? 2 : 1,
  }).format(valueEur);
}

/**
 * Editorial prices are presentation-only. This formatter deliberately lives
 * beside the editorial contract instead of the checkout pricing module so a
 * displayed manual price never becomes an authority to charge a user.
 */
export function formatTouchlineEditorialCardPrice(
  value: TouchlineEditorialCardPrice,
  locale: string | null | undefined,
) {
  const resolvedLocale = locale === "pt-BR" ? "pt-BR" : "en-GB";
  if (value.currency === "TC") {
    const formatted = new Intl.NumberFormat(resolvedLocale, {
      maximumFractionDigits: 2,
      minimumFractionDigits: value.amountMinor % 100 === 0 ? 0 : 2,
    }).format(value.amountMinor / 100);
    return `${formatted} TC`;
  }

  return new Intl.NumberFormat(resolvedLocale, {
    style: "currency",
    currency: value.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value.amountMinor / 100);
}
