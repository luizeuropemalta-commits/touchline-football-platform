const TOUCHLINE_CLUB_CREST_UI_ROOT = "/touchlineArena/shared/club-logos/2026-27/ui-512/";
const TOUCHLINE_CLUB_CREST_LIVE_ROOT = "/touchlineArena/shared/club-logos/2026-27/live-160/";

export const TOUCHLINE_CLUB_CREST_ASSET_VERSION = "2026-07-28-1";

export function touchlineLiveOptimizedClubLogoUrl(
  sourceUrl?: string | null,
  version: string = TOUCHLINE_CLUB_CREST_ASSET_VERSION,
) {
  if (!sourceUrl) return null;
  const unversionedUrl = sourceUrl.split("?")[0] ?? sourceUrl;
  if (!unversionedUrl.includes(TOUCHLINE_CLUB_CREST_UI_ROOT)) return sourceUrl;

  return `${unversionedUrl
    .replace(TOUCHLINE_CLUB_CREST_UI_ROOT, TOUCHLINE_CLUB_CREST_LIVE_ROOT)
    .replace(/\.png$/i, ".webp")}?v=${version}`;
}
