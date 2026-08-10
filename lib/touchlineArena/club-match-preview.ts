import type { TouchlineTeam } from "../football-data/types.ts";
import {
  TOUCHLINE_ENGLAND_CLUBS,
  findTouchLineClub,
} from "./demo-data.ts";
import { touchLineT, type TouchLineLocale } from "./i18n.ts";

export type TouchlineClubMatchPreviewTeam = {
  name: string;
  shortCode: string;
  logoUrl?: string;
};

type TouchlineClubVisual = NonNullable<ReturnType<typeof findTouchLineClub>>;

function trimOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

/**
 * Resolves fixture identity only against the local canonical club registry.
 * An unknown opponent may retain its provider-supplied name, but it must never
 * borrow the current club crest or manufacture a canonical crest identity.
 */
export function resolveTouchlineClubMatchPreviewTeam(
  team: TouchlineTeam | undefined,
  currentClub: TouchlineClubVisual,
  locale: TouchLineLocale,
): TouchlineClubMatchPreviewTeam {
  const canonicalClub = (team?.providerId
    ? TOUCHLINE_ENGLAND_CLUBS.find((club) => club.teamId === team.providerId)
    : undefined)
    ?? findTouchLineClub(team?.name)
    ?? findTouchLineClub(team?.shortCode);

  if (canonicalClub) {
    return {
      name: trimOrNull(team?.name) ?? canonicalClub.name,
      shortCode: trimOrNull(team?.shortCode) ?? canonicalClub.shortCode,
      logoUrl: canonicalClub.logoUrl,
    };
  }

  if (team?.providerId === currentClub.teamId) {
    return {
      name: currentClub.name,
      shortCode: currentClub.shortCode,
      logoUrl: currentClub.logoUrl,
    };
  }

  const pendingOpponent = touchLineT(locale, "opponentToBeConfirmed");
  return {
    name: trimOrNull(team?.name) ?? pendingOpponent,
    shortCode: trimOrNull(team?.shortCode) ?? pendingOpponent,
    logoUrl: undefined,
  };
}
