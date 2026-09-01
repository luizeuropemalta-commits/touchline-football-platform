import type { TouchlineSocialRankingContentType } from "./social-ranking-family-contract.ts";

const DISCLOSURE = "COMING SOON • CURRENTLY IN TESTING";
const PUBLIC_SOURCE_WORDING = /\b(?:sportmonks|api|provider|pipeline|settlement)\b/i;

type RankedCardCopy = Readonly<{ name: string; clubName: string; totalRating: number; rank: number }>;

function validCard(card: RankedCardCopy, requireRank = true) {
  return Boolean(card.name.trim() && card.clubName.trim())
    && Number.isFinite(card.totalRating)
    && (!requireRank || (Number.isInteger(card.rank) && card.rank >= 1));
}

function finish(lines: readonly string[], hashtags: readonly string[]) {
  const caption = [...lines, "", "TouchLine Verified", DISCLOSURE, hashtags.join(" ")].join("\n");
  if (hashtags.length > 5 || new Set(hashtags).size !== hashtags.length || PUBLIC_SOURCE_WORDING.test(caption)) {
    return { ok: false, reason: "PUBLIC_COPY_INVALID" } as const;
  }
  return { ok: true, caption } as const;
}

export function buildTouchlineRankingFamilyCaption(input: Readonly<{
  contentType: TouchlineSocialRankingContentType;
  gameweekNumber: number;
  cards: readonly RankedCardCopy[];
  homeName?: string;
  awayName?: string;
  playerName?: string;
  officialMatchRating?: number;
  confirmedGoals?: number;
  gameweekOpen?: boolean;
}>) {
  if (!Number.isInteger(input.gameweekNumber) || input.gameweekNumber < 1
    || !input.cards.length || input.cards.some((card) => !validCard(card, !["TOP_PERFORMER", "HAT_TRICK_HERO"].includes(input.contentType)))) {
    return { ok: false, reason: "RANKING_COPY_CONTEXT_INVALID" } as const;
  }
  const cardLine = (card: RankedCardCopy) => (
    `${card.rank}. ${card.name} · ${card.clubName} · Total Rating ${card.totalRating.toFixed(2)}`
  );
  if (input.contentType === "GAMEWEEK_RANKING_PREVIEW") {
    if (input.cards.length !== 3) return { ok: false, reason: "TOP_THREE_REQUIRED" } as const;
    return finish([
      "🏆 TouchLine Ranking Race",
      `Gameweek ${input.gameweekNumber} · Current Top 3`,
      ...input.cards.map(cardLine),
      "The Gameweek is still open. Who finishes on top?",
    ], ["#TouchLine", "#PremierLeague", `#Gameweek${input.gameweekNumber}`, "#FootballCards"]);
  }
  if (input.contentType === "GAMEWEEK_RANKING_FINAL") {
    if (input.cards.length !== 3) return { ok: false, reason: "TOP_THREE_REQUIRED" } as const;
    return finish([
      "🏆 Gameweek Ranking Final",
      `Gameweek ${input.gameweekNumber} · Final Top 3`,
      ...input.cards.map(cardLine),
      "Which card impressed you most?",
    ], ["#TouchLine", "#PremierLeague", `#Gameweek${input.gameweekNumber}`, "#FootballCards"]);
  }
  if (input.contentType === "PLAYER_DUEL") {
    if (input.cards.length !== 2 || !input.homeName?.trim() || !input.awayName?.trim()) {
      return { ok: false, reason: "PLAYER_DUEL_CONTEXT_INVALID" } as const;
    }
    return finish([
      "⚔️ TouchLine Card Duel",
      `${input.homeName.trim()} v ${input.awayName.trim()}`,
      ...input.cards.map(cardLine),
      "Who comes out on top?",
    ], ["#TouchLine", "#PremierLeague", `#Gameweek${input.gameweekNumber}`, "#CardDuel"]);
  }
  const hero = input.cards[0];
  if (input.cards.length !== 1 || !input.playerName?.trim() || hero.name !== input.playerName.trim()
    || (input.contentType !== "GAMEWEEK_HERO" && !Number.isFinite(input.officialMatchRating))) {
    return { ok: false, reason: "HERO_CONTEXT_INVALID" } as const;
  }
  const heading = input.contentType === "HAT_TRICK_HERO"
    ? "🎩 Hat-trick Hero"
    : input.contentType === "TOP_PERFORMER" ? "⭐ Top Performer" : "🏆 Gameweek Hero";
  if (input.contentType === "HAT_TRICK_HERO" && (!Number.isInteger(input.confirmedGoals) || Number(input.confirmedGoals) < 3)) {
    return { ok: false, reason: "HAT_TRICK_NOT_CONFIRMED" } as const;
  }
  return finish([
    heading,
    `${hero.name} · ${hero.clubName}`,
    ...(input.contentType === "GAMEWEEK_HERO"
      ? [`Total Rating ${hero.totalRating.toFixed(2)} · Current rank #${hero.rank}`]
      : [`Official Match Rating ${Number(input.officialMatchRating).toFixed(2)} · Total Rating ${hero.totalRating.toFixed(2)}`]),
    ...(input.contentType === "HAT_TRICK_HERO" ? [`${input.confirmedGoals} confirmed goals.`] : []),
    ...(input.gameweekOpen ? ["Current Gameweek leader — the Gameweek is still open."] : []),
    "How would you rate the performance?",
  ], ["#TouchLine", "#PremierLeague", `#Gameweek${input.gameweekNumber}`, "#TopPerformer"]);
}
