type TouchlineMatchPreviewLiveCaptionInput = Readonly<{
  homeClub: string;
  awayClub: string;
  startsAt: string;
  timeZone: string;
  homeLeader: Readonly<{ name: string; totalRating: number }>;
  awayLeader: Readonly<{ name: string; totalRating: number }>;
}>;

function text(value: string, reason: string) {
  const clean = value.trim();
  if (!clean) throw new Error(reason);
  return clean;
}

function label(startsAt: string, timeZone: string) {
  if (!Number.isFinite(Date.parse(startsAt))) throw new Error("MATCH_PREVIEW_CAPTION_START_INVALID");
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(startsAt)).replace(",", " ·");
  } catch {
    throw new Error("MATCH_PREVIEW_CAPTION_TIME_ZONE_INVALID");
  }
}

function leader(input: Readonly<{ name: string; totalRating: number }>) {
  const name = text(input.name, "MATCH_PREVIEW_CAPTION_LEADER_REQUIRED");
  if (!Number.isFinite(input.totalRating) || input.totalRating < 0) throw new Error("MATCH_PREVIEW_CAPTION_RATING_INVALID");
  return `${name} · ${input.totalRating.toFixed(2)} Total Rating`;
}

/**
 * Editorial copy for an owner-review video. All sport-facing facts are
 * explicit input, so the renderer cannot substitute a sample player, fixture
 * or rating. It intentionally has no URL and makes no publishing claim.
 */
export function buildTouchlineMatchPreviewLiveApprovalCaption(input: TouchlineMatchPreviewLiveCaptionInput) {
  const homeClub = text(input.homeClub, "MATCH_PREVIEW_CAPTION_HOME_REQUIRED");
  const awayClub = text(input.awayClub, "MATCH_PREVIEW_CAPTION_AWAY_REQUIRED");
  if (homeClub === awayClub) throw new Error("MATCH_PREVIEW_CAPTION_CLUBS_MUST_BE_DISTINCT");
  const timeZone = text(input.timeZone, "MATCH_PREVIEW_CAPTION_TIME_ZONE_REQUIRED");
  return [
    `⚽ ${homeClub} x ${awayClub}`,
    `📅 ${label(input.startsAt, timeZone)} · ${timeZone}`,
    "",
    "O confronto começa antes da bola rolar: os cards líderes de cada clube pelo Total Rating acumulado na temporada.",
    `${homeClub}: ${leader(input.homeLeader)}`,
    `${awayClub}: ${leader(input.awayLeader)}`,
    "",
    "Monte seu XI na TouchLine e acompanhe a próxima rodada com o seu elenco.",
    "",
    "#TouchLine #PremierLeague",
  ].join("\n");
}

export function matchPreviewLivePlatformCaptions(caption: string) {
  if (!caption.includes("Monte seu XI na TouchLine")) throw new Error("MATCH_PREVIEW_CAPTION_CTA_REQUIRED");
  return { INSTAGRAM: caption, FACEBOOK: caption.replace(/\n\n#TouchLine #PremierLeague$/, "") };
}
