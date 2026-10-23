import type { TouchLineLocale } from "./i18n.ts";
import type { TouchlineFantasySidelinedPlayer } from "../football-data/types.ts";

export type ConfirmedPlayerAvailability = Readonly<{
  source: "sportmonks";
  fixtureId: string;
  playerId: string;
  confirmed: true;
  reason: "injury" | "illness" | "five-yellows" | "ten-yellows" | "red-card";
  /** Only a provider-supplied estimate; never calculate this from match dates. */
  estimatedReturnDate?: string | null;
}>;

export type PlayerAvailabilityBadge = Readonly<{
  asset: string;
  width: number;
  height: number;
  reason: ConfirmedPlayerAvailability["reason"];
  estimatedReturnDate: string | null;
}>;

/** Convert only an exact, still-active fixture record. Sportmonks' generic
 * "suspension" category does not state whether five yellows, ten yellows or a
 * red card caused it, so that category alone cannot select an artwork. */
export function confirmedAvailabilityFromSidelined(
  item: TouchlineFantasySidelinedPlayer,
  fixtureId: string,
  playerId: string,
): ConfirmedPlayerAvailability | null {
  if (item.provider !== "sportmonks" || item.fixtureId !== fixtureId
    || item.playerId !== playerId || item.completed !== false) return null;
  if (!(["category", "typeName", "reason"] as const)
    .every(key => item[key] === undefined || typeof item[key] === "string")) return null;
  const category = item.category?.trim().toLowerCase();
  if (category === "injury" || category === "illness") {
    return { source: "sportmonks", fixtureId, playerId, confirmed: true, reason: category };
  }
  if (category !== "suspension") return null;
  // This label must come from the provider's reason/type for this exact active
  // fixture. A season card count or a generic suspension cannot establish it.
  const detail = `${item.typeName ?? ""} ${item.reason ?? ""}`.toLowerCase();
  const reason = /\b(?:5|five)\s+yellow\s+cards?\b/.test(detail) ? "five-yellows"
    : /\b(?:10|ten)\s+yellow\s+cards?\b/.test(detail) ? "ten-yellows"
      : /\bred\s+cards?\b/.test(detail) ? "red-card" : null;
  return reason ? { source: "sportmonks", fixtureId, playerId, confirmed: true, reason } : null;
}

const ASSETS = {
  injury: "/touchlineArena/status-badges/injury-cross.png",
  illness: "/touchlineArena/status-badges/injury-cross.png",
  "five-yellows": "/touchlineArena/status-badges/yellow-five.png",
  "ten-yellows": "/touchlineArena/status-badges/yellow-ten.png",
  "red-card": "/touchlineArena/status-badges/red-card.png",
} as const;

const REASONS = new Set(Object.keys(ASSETS));

/** Fixture-scoped, explicit provider evidence only. Season totals and missing
 * line-up membership never imply that a player is suspended or unavailable. */
export function resolvePlayerAvailabilityBadge(
  evidence: ConfirmedPlayerAvailability | null | undefined,
  fixtureId: string,
  playerId: string,
): PlayerAvailabilityBadge | null {
  if (!evidence || evidence.source !== "sportmonks" || evidence.confirmed !== true
    || !fixtureId || !playerId || evidence.fixtureId !== fixtureId || evidence.playerId !== playerId
    || !REASONS.has(evidence.reason)) return null;

  const date = evidence.estimatedReturnDate ?? null;
  const timestamp = date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? Date.parse(`${date}T00:00:00Z`) : Number.NaN;
  const estimatedReturnDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date ? date : null;
  return { asset: ASSETS[evidence.reason], width: 48, height: 48,
    reason: evidence.reason, estimatedReturnDate };
}

export function availabilityBadgeForPlayer(
  sidelined: readonly TouchlineFantasySidelinedPlayer[],
  fixtureId: string | null | undefined,
  playerId: string,
): PlayerAvailabilityBadge | null {
  if (!fixtureId || !playerId) return null;
  // A fixture feed must provide one unambiguous record for this player.
  // Duplicates, completion corrections and cross-fixture contamination are
  // uncertainty, not permission to select whichever active row appears first.
  // This matches the private gameweek reader without borrowing private state.
  const records = sidelined.filter(item => item?.playerId === playerId);
  if (records.length !== 1) return null;
  const evidence = confirmedAvailabilityFromSidelined(records[0], fixtureId, playerId);
  return resolvePlayerAvailabilityBadge(evidence, fixtureId, playerId);
}

const LABELS = {
  "en-GB": { injury: "Injured — unavailable for this match", illness: "Ill — unavailable for this match", "five-yellows": "Suspended after five yellow cards", "ten-yellows": "Suspended after ten yellow cards", "red-card": "Suspended after a red card", return: "Estimated return" },
  "pt-BR": { injury: "Lesionado — fora desta partida", illness: "Doente — fora desta partida", "five-yellows": "Suspenso após cinco cartões amarelos", "ten-yellows": "Suspenso após dez cartões amarelos", "red-card": "Suspenso após cartão vermelho", return: "Retorno estimado" },
  "es-ES": { injury: "Lesionado — no disponible para este partido", illness: "Enfermo — no disponible para este partido", "five-yellows": "Suspendido tras cinco tarjetas amarillas", "ten-yellows": "Suspendido tras diez tarjetas amarillas", "red-card": "Suspendido tras una tarjeta roja", return: "Regreso estimado" },
  "it-IT": { injury: "Infortunato — indisponibile per questa partita", illness: "Malato — indisponibile per questa partita", "five-yellows": "Squalificato dopo cinque cartellini gialli", "ten-yellows": "Squalificato dopo dieci cartellini gialli", "red-card": "Squalificato dopo un cartellino rosso", return: "Rientro stimato" },
  "fr-FR": { injury: "Blessé — indisponible pour ce match", illness: "Malade — indisponible pour ce match", "five-yellows": "Suspendu après cinq cartons jaunes", "ten-yellows": "Suspendu après dix cartons jaunes", "red-card": "Suspendu après un carton rouge", return: "Retour estimé" },
  "ar-SA": { injury: "مصاب — غير متاح لهذه المباراة", illness: "مريض — غير متاح لهذه المباراة", "five-yellows": "موقوف بعد خمس بطاقات صفراء", "ten-yellows": "موقوف بعد عشر بطاقات صفراء", "red-card": "موقوف بعد بطاقة حمراء", return: "العودة المتوقعة" },
  "tr-TR": { injury: "Sakat — bu maçta oynayamaz", illness: "Hasta — bu maçta oynayamaz", "five-yellows": "Beş sarı kart nedeniyle cezalı", "ten-yellows": "On sarı kart nedeniyle cezalı", "red-card": "Kırmızı kart nedeniyle cezalı", return: "Tahmini dönüş" },
  "de-DE": { injury: "Verletzt — für dieses Spiel nicht verfügbar", illness: "Erkrankt — für dieses Spiel nicht verfügbar", "five-yellows": "Nach fünf Gelben Karten gesperrt", "ten-yellows": "Nach zehn Gelben Karten gesperrt", "red-card": "Nach einer Roten Karte gesperrt", return: "Voraussichtliche Rückkehr" },
} satisfies Record<TouchLineLocale, Record<ConfirmedPlayerAvailability["reason"] | "return", string>>;

export function playerAvailabilityBadgeLabel(badge: PlayerAvailabilityBadge, locale: TouchLineLocale) {
  const copy = LABELS[locale] ?? LABELS["en-GB"];
  if (!badge.estimatedReturnDate) return copy[badge.reason];
  const date = new Intl.DateTimeFormat(locale, { calendar: "gregory", dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(`${badge.estimatedReturnDate}T00:00:00Z`));
  return `${copy[badge.reason]}. ${copy.return}: ${date}`;
}
