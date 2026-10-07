import { type TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

// Display descriptors only, NOT tactical IDs or eligibility/scoring buckets.
// Column order: EN, PT, ES, IT, FR, AR, TR, DE. Six drafts remain unpublished.
const labels = {
  forward: ["Forward", "Atacante", "Delantero", "Attaccante", "Attaquant", "مهاجم", "Forvet", "Angreifer"],
  striker: ["Striker", "Centroavante", "Delantero centro", "Centravanti", "Avant-centre", "رأس حربة", "Santrfor", "Mittelstürmer"],
  defender: ["Defender", "Defensor", "Defensa", "Difensore", "Défenseur", "مدافع", "Defans oyuncusu", "Verteidiger"],
  goalkeeper: ["Goalkeeper", "Goleiro", "Portero", "Portiere", "Gardien de but", "حارس مرمى", "Kaleci", "Torwart"],
  midfielder: ["Midfielder", "Meio-campista", "Centrocampista", "Centrocampista", "Milieu de terrain", "لاعب وسط", "Orta saha oyuncusu", "Mittelfeldspieler"],
  winger: ["Winger", "Ponta", "Extremo", "Ala", "Ailier", "جناح", "Kanat oyuncusu", "Flügelspieler"],
  player: ["Player", "Jogador", "Jugador", "Giocatore", "Joueur", "لاعب", "Oyuncu", "Spieler"],
  leftWing: ["Left winger", "Ponta esquerda", "Extremo izquierdo", "Ala sinistra", "Ailier gauche", "جناح أيسر", "Sol kanat", "Linksaußen"],
  rightWing: ["Right winger", "Ponta direita", "Extremo derecho", "Ala destra", "Ailier droit", "جناح أيمن", "Sağ kanat", "Rechtsaußen"],
  attackingMidfielder: ["Attacking midfielder", "Meia ofensivo", "Mediapunta", "Trequartista", "Milieu offensif", "لاعب وسط هجومي", "Ofansif orta saha", "Offensiver Mittelfeldspieler"],
  defensiveMidfielder: ["Defensive midfielder", "Volante", "Pivote defensivo", "Mediano", "Milieu défensif", "لاعب وسط دفاعي", "Defansif orta saha", "Defensiver Mittelfeldspieler"],
  centreBack: ["Centre-back", "Zagueiro", "Defensa central", "Difensore centrale", "Défenseur central", "قلب دفاع", "Stoper", "Innenverteidiger"],
  leftBack: ["Left-back", "Lateral esquerdo", "Lateral izquierdo", "Terzino sinistro", "Arrière gauche", "ظهير أيسر", "Sol bek", "Linksverteidiger"],
  rightBack: ["Right-back", "Lateral direito", "Lateral derecho", "Terzino destro", "Arrière droit", "ظهير أيمن", "Sağ bek", "Rechtsverteidiger"],
  leftMidfielder: ["Left midfielder", "Meia pela esquerda", "Centrocampista izquierdo", "Centrocampista di sinistra", "Milieu gauche", "لاعب وسط أيسر", "Sol orta saha", "Linker Mittelfeldspieler"],
  rightMidfielder: ["Right midfielder", "Meia pela direita", "Centrocampista derecho", "Centrocampista di destra", "Milieu droit", "لاعب وسط أيمن", "Sağ orta saha", "Rechter Mittelfeldspieler"],
  leftWingBack: ["Left wing-back", "Ala esquerdo", "Carrilero izquierdo", "Esterno sinistro a tutta fascia", "Piston gauche", "ظهير جناح أيسر", "Sol kanat bek", "Linker Schienenspieler"],
  rightWingBack: ["Right wing-back", "Ala direito", "Carrilero derecho", "Esterno destro a tutta fascia", "Piston droit", "ظهير جناح أيمن", "Sağ kanat bek", "Rechter Schienenspieler"],
  secondStriker: ["Second striker", "Segundo atacante", "Segundo delantero", "Seconda punta", "Second attaquant", "مهاجم ثانٍ", "İkinci forvet", "Hängende Spitze"],
} as const satisfies Record<string, readonly [string, string, string, string, string, string, string, string]>;
type PositionLabel = keyof typeof labels;
function column(index: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7): Readonly<Record<PositionLabel, string>> {
  return Object.fromEntries(Object.entries(labels).map(([key, row]) => [key, row[index]])) as Record<PositionLabel, string>;
}
export const TOUCHLINE_POSITION_LABEL_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_POSITION_LABEL_DRAFT_STATUS = "draft" as const;
export const TOUCHLINE_POSITION_LABEL_CATALOGUES = {
  "en-GB": column(0), "pt-BR": column(1), "es-ES": column(2), "it-IT": column(3),
  "fr-FR": column(4), "ar-SA": column(5), "tr-TR": column(6), "de-DE": column(7),
} satisfies Record<TouchLineLocale, Readonly<Record<PositionLabel, string>>>;

// Same accepted aliases as the original PT helper. No fuzzy matching or
// translation back into canonical football identity is introduced.
const aliases: Readonly<Record<string, PositionLabel>> = {
  attacker: "forward", forward: "forward", striker: "striker", defender: "defender",
  goalkeeper: "goalkeeper", midfielder: "midfielder", winger: "winger", player: "player",
  st: "striker", cf: "forward", lw: "leftWing", rw: "rightWing", df: "defender", mf: "midfielder", fw: "forward",
  am: "attackingMidfielder", cam: "attackingMidfielder", cm: "midfielder", dm: "defensiveMidfielder", cdm: "defensiveMidfielder",
  cb: "centreBack", lb: "leftBack", rb: "rightBack", gk: "goalkeeper",
  lm: "leftMidfielder", rm: "rightMidfielder", lwb: "leftWingBack", rwb: "rightWingBack",
  "attacking midfield": "attackingMidfielder", "attacking midfielder": "attackingMidfielder",
  "central midfield": "midfielder", "central midfielder": "midfielder",
  "defensive midfield": "defensiveMidfielder", "defensive midfielder": "defensiveMidfielder",
  "left midfield": "leftMidfielder", "left midfielder": "leftMidfielder",
  "right midfield": "rightMidfielder", "right midfielder": "rightMidfielder",
  "left wing": "leftWing", "left winger": "leftWing", "right wing": "rightWing", "right winger": "rightWing",
  "left back": "leftBack", "right back": "rightBack", "left wing back": "leftWingBack", "right wing back": "rightWingBack",
  "centre back": "centreBack", "center back": "centreBack", "centre forward": "striker", "center forward": "striker",
  "second striker": "secondStriker", "goal keeper": "goalkeeper",
};

export function localizedPositionLabel(value: string | null | undefined, locale: string, draftLocalesEnabled = false) {
  const presentationLocale = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  // English preserves the original provider spelling/abbreviation exactly.
  if (!value || presentationLocale === "en-GB") return value;
  const key = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return Object.hasOwn(aliases, key) ? TOUCHLINE_POSITION_LABEL_CATALOGUES[presentationLocale][aliases[key]] : value;
}
