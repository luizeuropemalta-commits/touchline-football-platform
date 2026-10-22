import type { ExchangePosition } from "./exchange-eligibility.ts";
import { resolveTouchlineCatalogueLocale } from "../touchlineArena/catalogue-locale.ts";
import { TOUCHLINE_POSITION_LABEL_CATALOGUES } from "../touchlineArena/position-labels.ts";

/** Presentation groups never change the persisted area, slot or contract. */
export const COLLECTION_POSITION_GROUPS = [
  { id: "goalkeepers", pt: "Goleiros", en: "Goalkeepers", positions: ["GK"] },
  { id: "defence", pt: "Defesa", en: "Defence", positions: ["CB", "RB", "LB"] },
  { id: "midfield", pt: "Meio-campo", en: "Midfield", positions: ["DM", "MID"] },
  { id: "attack", pt: "Ataque", en: "Attack", positions: ["RW", "LW", "CF"] },
] as const;

const names: Record<ExchangePosition, readonly [string, string]> = {
  GK: ["Goleiro", "Goalkeeper"], CB: ["Zagueiro", "Centre-back"],
  RB: ["Lateral direito", "Right-back"], LB: ["Lateral esquerdo", "Left-back"],
  DM: ["Volante", "Defensive midfielder"], MID: ["Meio-campista", "Midfielder"],
  RW: ["Ponta direita", "Right winger"], LW: ["Ponta esquerda", "Left winger"],
  CF: ["Centroavante", "Centre-forward"],
};

const positionLabelKeys = {
  GK: "goalkeeper", CB: "centreBack", RB: "rightBack", LB: "leftBack",
  DM: "defensiveMidfielder", MID: "midfielder", RW: "rightWing", LW: "leftWing", CF: "striker",
} as const satisfies Record<ExchangePosition, keyof typeof TOUCHLINE_POSITION_LABEL_CATALOGUES["en-GB"]>;

type CollectionGroupId = typeof COLLECTION_POSITION_GROUPS[number]["id"];
const draftGroupNames = {
  "es-ES": { goalkeepers: "Porteros", defence: "Defensa", midfield: "Centrocampo", attack: "Ataque" },
  "it-IT": { goalkeepers: "Portieri", defence: "Difesa", midfield: "Centrocampo", attack: "Attacco" },
  "fr-FR": { goalkeepers: "Gardiens de but", defence: "Défense", midfield: "Milieu de terrain", attack: "Attaque" },
  "ar-SA": { goalkeepers: "حراس المرمى", defence: "الدفاع", midfield: "خط الوسط", attack: "الهجوم" },
  "tr-TR": { goalkeepers: "Kaleciler", defence: "Defans", midfield: "Orta saha", attack: "Hücum" },
  "de-DE": { goalkeepers: "Torhüter", defence: "Abwehr", midfield: "Mittelfeld", attack: "Angriff" },
} satisfies Record<Exclude<keyof typeof TOUCHLINE_POSITION_LABEL_CATALOGUES, "pt-BR" | "en-GB">, Record<CollectionGroupId, string>>;

export function collectionGroupName(groupId: CollectionGroupId, locale: string, draftLocalesEnabled = false) {
  const presentationLocale = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  if (presentationLocale !== "pt-BR" && presentationLocale !== "en-GB") return draftGroupNames[presentationLocale][groupId];
  const group = COLLECTION_POSITION_GROUPS.find(entry => entry.id === groupId)!;
  return locale.startsWith("pt") ? group.pt : group.en;
}

export function collectionPositionName(position: ExchangePosition, locale: string, draftLocalesEnabled = false) {
  const presentationLocale = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  // Only six opt-in drafts reuse generic descriptors. Published literals stay exact,
  // especially CF: the collection calls it Centre-forward, not Forward/Striker.
  if (presentationLocale !== "pt-BR" && presentationLocale !== "en-GB") {
    return TOUCHLINE_POSITION_LABEL_CATALOGUES[presentationLocale][positionLabelKeys[position]];
  }
  return names[position][locale.startsWith("pt") ? 0 : 1];
}

export function groupCollectionSlots<T extends { slot: number; position: ExchangePosition | null }>(slots: readonly T[]) {
  const assigned = COLLECTION_POSITION_GROUPS.map(group => ({
    ...group, slots: slots.filter(slot => (group.positions as readonly string[]).includes(slot.position ?? ""))
      .sort((a, b) => (group.positions as readonly string[]).indexOf(a.position!) - (group.positions as readonly string[]).indexOf(b.position!) || a.slot - b.slot),
  }));
  return { groups: assigned, unassigned: slots.filter(slot => slot.position === null) };
}
