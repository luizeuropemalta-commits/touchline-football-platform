import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";
import { TOUCHLINE_EXACT_CARD_CATALOGUES } from "./exact-card-i18n.ts";
import { TOUCHLINE_MATCH_CENTRE_CATALOGUES } from "./match-centre-i18n.ts";

function shared(locale: TouchLineLocale) {
  const card = TOUCHLINE_EXACT_CARD_CATALOGUES[locale];
  const match = TOUCHLINE_MATCH_CENTRE_CATALOGUES[locale];
  return { yellowCard: card.yellowCard, redCard: card.redCard, assist: match.assist, substitutedFor: match.substitutedFor };
}

export const TOUCHLINE_MATCH_EVENT_CATALOGUES = {
  "en-GB": { ...shared("en-GB"), goal: "Goal", substitution: "Substitution", penalty: "Penalty goal", ownGoal: "Own goal", secondYellow: "Second yellow card", missedPenalty: "Missed penalty", penaltySave: "Penalty save", var: "VAR", event: "Event", relatedPlayer: "Related player" },
  "pt-BR": { ...shared("pt-BR"), goal: "Gol", substitution: "Substituição", penalty: "Gol de pênalti", ownGoal: "Gol contra", secondYellow: "Segundo cartão amarelo", missedPenalty: "Pênalti perdido", penaltySave: "Pênalti defendido", var: "VAR", event: "Evento", relatedPlayer: "Jogador relacionado" },
  "es-ES": { ...shared("es-ES"), goal: "Gol", substitution: "Sustitución", penalty: "Gol de penalti", ownGoal: "Gol en propia puerta", secondYellow: "Segunda tarjeta amarilla", missedPenalty: "Penalti fallado", penaltySave: "Penalti detenido", var: "VAR", event: "Evento", relatedPlayer: "Jugador relacionado" },
  "it-IT": { ...shared("it-IT"), goal: "Gol", substitution: "Sostituzione", penalty: "Gol su rigore", ownGoal: "Autogol", secondYellow: "Secondo cartellino giallo", missedPenalty: "Rigore sbagliato", penaltySave: "Rigore parato", var: "VAR", event: "Evento", relatedPlayer: "Giocatore coinvolto" },
  "fr-FR": { ...shared("fr-FR"), goal: "But", substitution: "Remplacement", penalty: "But sur penalty", ownGoal: "But contre son camp", secondYellow: "Deuxième carton jaune", missedPenalty: "Penalty manqué", penaltySave: "Penalty arrêté", var: "VAR", event: "Événement", relatedPlayer: "Joueur associé" },
  "ar-SA": { ...shared("ar-SA"), goal: "هدف", substitution: "تبديل", penalty: "هدف من ركلة جزاء", ownGoal: "هدف عكسي", secondYellow: "بطاقة صفراء ثانية", missedPenalty: "ركلة جزاء ضائعة", penaltySave: "ركلة جزاء متصدى لها", var: "VAR", event: "حدث", relatedPlayer: "لاعب مرتبط بالحدث" },
  "tr-TR": { ...shared("tr-TR"), goal: "Gol", substitution: "Oyuncu değişikliği", penalty: "Penaltı golü", ownGoal: "Kendi kalesine gol", secondYellow: "İkinci sarı kart", missedPenalty: "Kaçırılan penaltı", penaltySave: "Kurtarılan penaltı", var: "VAR", event: "Olay", relatedPlayer: "İlgili oyuncu" },
  "de-DE": { ...shared("de-DE"), goal: "Tor", substitution: "Auswechslung", penalty: "Elfmetertor", ownGoal: "Eigentor", secondYellow: "Zweite Gelbe Karte", missedPenalty: "Verschossener Elfmeter", penaltySave: "Gehaltener Elfmeter", var: "VAR", event: "Ereignis", relatedPlayer: "Beteiligter Spieler" },
} as const;

export type TouchlineMatchEventCopy = Readonly<Record<keyof typeof TOUCHLINE_MATCH_EVENT_CATALOGUES["en-GB"], string>>;
export type TouchlineMatchEventKind = "goal" | "yellowCard" | "substitution" | "penalty" | "ownGoal" | "redCard" | "secondYellow" | "missedPenalty" | "penaltySave" | "var";

// Exact provider vocabulary evidenced locally; this is not an exhaustive
// provider enumeration. Never infer a decision from free-form event narrative.
const aliases: Readonly<Record<string, TouchlineMatchEventKind>> = {
  goal: "goal", yellowcard: "yellowCard", substitution: "substitution", penalty: "penalty",
  "own goal": "ownGoal", owngoal: "ownGoal", redcard: "redCard",
  "yellowred card": "secondYellow", yellowredcard: "secondYellow",
  "penalty missed": "missedPenalty", "missed penalty": "missedPenalty", missed_penalty: "missedPenalty",
  "penalty save": "penaltySave",
  var: "var",
};

export function touchlineMatchEventKind(value?: string | null): TouchlineMatchEventKind | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  return Object.hasOwn(aliases, key) ? aliases[key]! : null;
}

export function getTouchlineMatchEventCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineMatchEventCopy {
  return TOUCHLINE_MATCH_EVENT_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

/** Labels only: the caller retains the original IDs, names, times and facts. */
export function touchlineMatchEventLabel(value?: string | null, locale?: string | null, draftLocalesEnabled = false) {
  const copy = getTouchlineMatchEventCopy(locale, draftLocalesEnabled);
  const kind = touchlineMatchEventKind(value);
  return kind ? copy[kind] : copy.event;
}

/** The provider's primary substitution player enters; the related player exits.
 * Only an exact Goal can identify an assist. Penalty/own-goal/card/VAR relations
 * are not evidence of assists and must keep a neutral related-player label.
 */
export function touchlineMatchEventRelatedPlayerLabel(value?: string | null, locale?: string | null, draftLocalesEnabled = false) {
  const copy = getTouchlineMatchEventCopy(locale, draftLocalesEnabled);
  const kind = touchlineMatchEventKind(value);
  return kind === "goal" ? copy.assist : kind === "substitution" ? copy.substitutedFor : copy.relatedPlayer;
}
