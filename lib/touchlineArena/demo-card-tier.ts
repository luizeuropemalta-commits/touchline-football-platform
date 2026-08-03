import { TOUCHLINE_CARD_TIER_KEYS, type TouchlineCardTierKey } from "./card-rules.ts";

const DEMO_PLAYER_TIERS: Record<string, TouchlineCardTierKey> = {
  haaland: "diamond-gold",
  saka: "clear-diamond",
  rodri: "emerald-green",
  palmer: "radiant-gold",
  rice: "amethyst-purple",
  foden: "sapphire-blue",
  isak: "ruby-red",
  alisson: "diamond-gold",
  "reece-james": "clear-diamond",
  konate: "emerald-green",
  "sven-botman": "sapphire-blue",
  botman: "sapphire-blue",
  robinson: "amethyst-purple",
  caicedo: "radiant-gold",
  "bruno-guimaraes": "ruby-red",
  "bruno-g": "ruby-red",
  rogers: "diamond-gold",
  salah: "clear-diamond",
  watkins: "radiant-gold",
};

function normalizeDemoPlayerIdentity(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^(?:demo|squad|builder)-/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function touchlineDemoTierForPlayer(...identities: Array<string | null | undefined>) {
  const keys = identities.map(normalizeDemoPlayerIdentity).filter(Boolean);
  for (const key of keys) {
    if (DEMO_PLAYER_TIERS[key]) return DEMO_PLAYER_TIERS[key];
  }

  const seed = keys[0] || "touchline-player";
  const hash = [...seed].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 17);
  return TOUCHLINE_CARD_TIER_KEYS[hash % TOUCHLINE_CARD_TIER_KEYS.length];
}
