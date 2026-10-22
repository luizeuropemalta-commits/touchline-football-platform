import type { ExchangePosition } from "./exchange-eligibility.ts";

/** Exact football position only; an unknown side cannot become a generic winger. */
export function clubPlayerPosition(input: unknown): ExchangePosition | null {
  if (typeof input !== "string") return null;
  const value = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[_/.-]+/g, " ").replace(/\s+/g, " ").trim();
  const aliases: Readonly<Record<ExchangePosition, readonly string[]>> = {
    GK: ["gk", "goalkeeper", "keeper", "goleiro"],
    CB: ["cb", "centre back", "center back", "central defender", "zagueiro"],
    RB: ["rb", "rwb", "right back", "right wing back", "lateral direito"],
    LB: ["lb", "lwb", "left back", "left wing back", "lateral esquerdo"],
    DM: ["dm", "cdm", "defensive midfield", "defensive midfielder", "holding midfielder", "volante"],
    MID: ["mid", "cm", "cam", "am", "lm", "rm", "midfield", "central midfield", "central midfielder", "attacking midfield", "attacking midfielder", "left midfield", "right midfield", "left midfielder", "right midfielder", "meia", "meio campo"],
    RW: ["rw", "right wing", "right winger", "right attacker", "ponta direito"],
    LW: ["lw", "left wing", "left winger", "left attacker", "ponta esquerdo"],
    CF: ["cf", "st", "striker", "centre forward", "center forward", "centroavante"],
  };
  return (Object.entries(aliases).find(([, names]) => names.includes(value))?.[0] as ExchangePosition | undefined) ?? null;
}
