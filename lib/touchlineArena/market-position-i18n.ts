import { type TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const enGB = {
  goalkeeper: "Goalkeeper / GK",
  "centre-back": "Centre-back / CB",
  "right-back": "Right-back / RB",
  "left-back": "Left-back / LB",
  "defensive-midfield": "Defensive midfielder / CDM",
  midfield: "Midfielder / MID",
  attacker: "Attacker / ATT",
  "centre-forward": "Centre-forward / ST",
  outfield: "Position pending classification",
} as const;

export type TouchlineMarketPositionCopy = Readonly<Record<keyof typeof enGB, string>>;
export const TOUCHLINE_MARKET_POSITION_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_MARKET_POSITION_DRAFT_STATUS = "draft" as const;

/** Descriptive presentation only. Canonical bucket IDs and tactical abbreviations
 * stay unchanged. Six additional catalogues remain drafts behind the existing
 * EN/PT runtime gate, pending linguistic and rendered/RTL verification.
 */
export const TOUCHLINE_MARKET_POSITION_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    goalkeeper: "Goleiro / GK",
    "centre-back": "Zagueiro / CB",
    "right-back": "Lateral direito / RB",
    "left-back": "Lateral esquerdo / LB",
    "defensive-midfield": "Volante / CDM",
    midfield: "Meia / MID",
    attacker: "Atacante / ATT",
    "centre-forward": "Centroavante / ST",
    outfield: "Posição em classificação",
  },
  "es-ES": {
    goalkeeper: "Portero / GK",
    "centre-back": "Defensa central / CB",
    "right-back": "Lateral derecho / RB",
    "left-back": "Lateral izquierdo / LB",
    "defensive-midfield": "Centrocampista defensivo / CDM",
    midfield: "Centrocampista / MID",
    attacker: "Atacante / ATT",
    "centre-forward": "Delantero centro / ST",
    outfield: "Posición pendiente de clasificación",
  },
  "it-IT": {
    goalkeeper: "Portiere / GK",
    "centre-back": "Difensore centrale / CB",
    "right-back": "Terzino destro / RB",
    "left-back": "Terzino sinistro / LB",
    "defensive-midfield": "Mediano / CDM",
    midfield: "Centrocampista / MID",
    attacker: "Attaccante / ATT",
    "centre-forward": "Centravanti / ST",
    outfield: "Posizione in attesa di classificazione",
  },
  "fr-FR": {
    goalkeeper: "Gardien de but / GK",
    "centre-back": "Défenseur central / CB",
    "right-back": "Arrière droit / RB",
    "left-back": "Arrière gauche / LB",
    "defensive-midfield": "Milieu défensif / CDM",
    midfield: "Milieu de terrain / MID",
    attacker: "Attaquant / ATT",
    "centre-forward": "Avant-centre / ST",
    outfield: "Poste en attente de classification",
  },
  "ar-SA": {
    goalkeeper: "حارس مرمى / GK",
    "centre-back": "قلب دفاع / CB",
    "right-back": "ظهير أيمن / RB",
    "left-back": "ظهير أيسر / LB",
    "defensive-midfield": "لاعب وسط دفاعي / CDM",
    midfield: "لاعب وسط / MID",
    attacker: "مهاجم / ATT",
    "centre-forward": "رأس حربة / ST",
    outfield: "المركز بانتظار التصنيف",
  },
  "tr-TR": {
    goalkeeper: "Kaleci / GK",
    "centre-back": "Stoper / CB",
    "right-back": "Sağ bek / RB",
    "left-back": "Sol bek / LB",
    "defensive-midfield": "Ön libero / CDM",
    midfield: "Orta saha / MID",
    attacker: "Hücum oyuncusu / ATT",
    "centre-forward": "Santrfor / ST",
    outfield: "Mevki sınıflandırması bekleniyor",
  },
  "de-DE": {
    goalkeeper: "Torwart / GK",
    "centre-back": "Innenverteidiger / CB",
    "right-back": "Rechtsverteidiger / RB",
    "left-back": "Linksverteidiger / LB",
    "defensive-midfield": "Defensiver Mittelfeldspieler / CDM",
    midfield: "Mittelfeldspieler / MID",
    attacker: "Angreifer / ATT",
    "centre-forward": "Mittelstürmer / ST",
    outfield: "Position noch nicht zugeordnet",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineMarketPositionCopy>>;

export function getTouchlineMarketPositionCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineMarketPositionCopy {
  return TOUCHLINE_MARKET_POSITION_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
