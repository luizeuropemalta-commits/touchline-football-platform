import { touchlineArenaClubTemplateForCard } from "./card-rules.ts";
import type { TouchlineSocialFinalScoreDraft } from "./social-final-score-draft-server.ts";

export type StudioFullTimeRenderedFactsV1 = Readonly<{
  schema: "touchline-studio-full-time-v1";
  fixture: Readonly<{
    providerFixtureId: string;
    status: "FULL_TIME";
    displayDate: string;
    gameweekNumber: number;
    score: Readonly<{ home: number; away: number }>;
    venue: Readonly<{ name: string; interiorImageUrl: string }>;
  }>;
  home: Readonly<{ providerTeamId: string; name: string; logoUrl: string; accent: string }>;
  away: Readonly<{ providerTeamId: string; name: string; logoUrl: string; accent: string }>;
  goals: readonly Readonly<{
    id: string;
    providerTeamId: string;
    playerName: string;
    minute: number;
    extraMinute: number | null;
    kind: "goal" | "penalty" | "own-goal";
  }>[];
  featured: Readonly<{
    canonicalPlayerId: string;
    providerPlayerId: string;
    providerTeamId: string;
    officialMatchRating: number;
    card: Readonly<{
      name: string;
      shirtNumber: number | null;
      clubName: string;
      role: string;
      position: string;
      countryCode3: string;
      tierKey: string;
      cardPrice: Readonly<{ amountMinor: number; currency: "TC" | "GBP" | "EUR" }>;
      marketValueEur: number | null;
      cardTemplateUrl: string;
      marketValue: string | null;
      seasonTotalRating: number | null;
      stats: Readonly<{
        goals: string | number | null;
        assists: string | number | null;
        defense: string | number | null;
        cleanSheets: string | number | null;
        saves: string | number | null;
        yellowCards: string | number | null;
        redCards: string | number | null;
      }>;
    }>;
  }>;
}>;

const fullTime = (status: string) => /^(?:FT|FINISHED|FULL[ _-]?TIME)$/i.test(status.trim());
const identity = (value: string) => value.trim().toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "");

/**
 * The sole persisted fact surface for a FULL_TIME social candidate. Both the
 * renderer and the approval reader must use this projection so a video cannot
 * present a fact that the source gate did not prove.
 */
export function projectStudioFullTimeRenderedFactsV1(
  draft: TouchlineSocialFinalScoreDraft,
): StudioFullTimeRenderedFactsV1 | null {
  const card = draft.topMatchCard.card;
  const team = draft.topMatchCard.team;
  const canonicalPlayerId = String(card.canonicalPlayerId ?? "").trim();
  const providerPlayerId = String(card.providerPlayerId ?? card.id ?? "").trim();
  const tierKey = String(card.editorialCard?.tierKey ?? card.cardTier ?? "").trim();
  const cardTemplateUrl = touchlineArenaClubTemplateForCard(card.clubName, null, card.editorialCard?.tierKey ?? card.cardTier) ?? "";
  const role = String(card.role ?? "").trim();
  const position = String(card.position ?? "").trim();
  const countryCode3 = String(card.countryCode3 ?? "").trim().toUpperCase();
  const editorialCard = card.editorialCard;
  const officialMatchRating = draft.topMatchCard.officialMatchRating;
  const featuredTeamIsInFixture = team.teamId === draft.home.teamId || team.teamId === draft.away.teamId;
  if (!Number.isFinite(Date.parse(draft.startsAt))) return null;
  const displayDate = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/London",
  }).format(new Date(draft.startsAt));
  if (!fullTime(draft.status) || !canonicalPlayerId || !providerPlayerId || !tierKey || !cardTemplateUrl
    || !featuredTeamIsInFixture || identity(card.clubName) !== identity(team.name) || !role || !position || !/^[A-Z]{3}$/.test(countryCode3)
    || !editorialCard || !Number.isSafeInteger(editorialCard.cardPrice.amountMinor) || editorialCard.cardPrice.amountMinor < 0
    || !Number.isFinite(officialMatchRating) || officialMatchRating < 0 || officialMatchRating > 10 || !Number.isFinite(draft.gameweekNumber)
    || !draft.home.logoUrl || !draft.away.logoUrl || !draft.venue.name || !draft.venue.interiorImageUrl
    ) return null;
  const goals = draft.goals.map((goal) => ({
    id: goal.id,
    providerTeamId: goal.teamId,
    playerName: goal.playerName,
    minute: goal.minute,
    extraMinute: goal.extraMinute,
    kind: goal.kind,
  }));
  if (goals.some((goal) => !["goal", "penalty", "own-goal"].includes(goal.kind))) return null;
  return {
    schema: "touchline-studio-full-time-v1",
    fixture: {
      providerFixtureId: draft.fixtureId,
      status: "FULL_TIME",
      displayDate,
      gameweekNumber: draft.gameweekNumber,
      score: { home: draft.score.home, away: draft.score.away },
      venue: { name: draft.venue.name, interiorImageUrl: draft.venue.interiorImageUrl },
    },
    home: { providerTeamId: draft.home.teamId, name: draft.home.name, logoUrl: draft.home.logoUrl, accent: draft.home.accent },
    away: { providerTeamId: draft.away.teamId, name: draft.away.name, logoUrl: draft.away.logoUrl, accent: draft.away.accent },
    goals,
    featured: {
      canonicalPlayerId,
      providerPlayerId,
      providerTeamId: team.teamId,
      officialMatchRating,
      card: {
        name: card.name,
        shirtNumber: card.shirtNumber,
        clubName: card.clubName,
        role,
        position,
        countryCode3,
        tierKey,
        cardPrice: editorialCard.cardPrice,
        marketValueEur: editorialCard.marketValueEur ?? null,
        cardTemplateUrl,
        marketValue: card.marketValue || null,
        seasonTotalRating: card.seasonTotalRating ?? null,
        stats: {
          goals: card.seasonStats?.goals ?? null,
          assists: card.seasonStats?.assists ?? null,
          defense: card.seasonStats?.defense ?? null,
          cleanSheets: card.seasonStats?.cleanSheets ?? null,
          saves: card.seasonStats?.saves ?? null,
          yellowCards: card.seasonStats?.yellowCards ?? null,
          redCards: card.seasonStats?.redCards ?? null,
        },
      },
    },
  };
}

export function sameStudioFullTimeRenderedFacts(
  left: StudioFullTimeRenderedFactsV1,
  right: StudioFullTimeRenderedFactsV1,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}
