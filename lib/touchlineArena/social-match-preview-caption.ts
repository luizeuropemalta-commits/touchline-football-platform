const DISCLOSURE = "COMING SOON • CURRENTLY IN TESTING";
const PUBLIC_PROVIDER_WORDING = /\b(?:sportmonks|api|provider|pipeline|settlement)\b/i;

function ordinal(value: number) {
  const remainder100 = value % 100;
  const suffix = remainder100 >= 11 && remainder100 <= 13
    ? "th"
    : value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
  return `${value}${suffix}`;
}

function clubHashtag(value: string) {
  const hashtag = value.normalize("NFKD").replace(/[^A-Za-z0-9]/g, "");
  return hashtag ? `#${hashtag}` : null;
}

export function buildTouchlineMatchPreviewCaption(input: Readonly<{
  homeName: string;
  awayName: string;
  homePosition: number;
  awayPosition: number;
  homeLeaderName: string;
  awayLeaderName: string;
  homeTotalRating: number;
  awayTotalRating: number;
  venueName: string;
  gameweekNumber: number;
  kickOffLabel: string;
}>) {
  const values = [input.homeName, input.awayName, input.homeLeaderName, input.awayLeaderName,
    input.venueName, input.kickOffLabel].map((value) => value.trim());
  if (values.some((value) => !value)
    || !Number.isInteger(input.homePosition) || input.homePosition < 1
    || !Number.isInteger(input.awayPosition) || input.awayPosition < 1
    || !Number.isInteger(input.gameweekNumber) || input.gameweekNumber < 1
    || !Number.isFinite(input.homeTotalRating) || !Number.isFinite(input.awayTotalRating)) {
    return { ok: false, reason: "MATCH_PREVIEW_CONTEXT_INVALID" } as const;
  }
  const [homeName, awayName, homeLeaderName, awayLeaderName, venueName, kickOffLabel] = values;
  const hashtags = ["#TouchLine", clubHashtag(homeName), clubHashtag(awayName), "#PremierLeague", `#Gameweek${input.gameweekNumber}`]
    .filter((value): value is string => Boolean(value));
  if (hashtags.length !== 5 || new Set(hashtags).size !== hashtags.length) {
    return { ok: false, reason: "MATCH_PREVIEW_HASHTAG_IDENTITY_INVALID" } as const;
  }
  const caption = [
    "TouchLine Match Preview",
    "",
    `${homeName} v ${awayName}`,
    `Premier League · Gameweek ${input.gameweekNumber}`,
    `${kickOffLabel} · ${venueName}`,
    `${homeName} are ${ordinal(input.homePosition)}; ${awayName} are ${ordinal(input.awayPosition)} in the current table.`,
    `${homeLeaderName} (${input.homeTotalRating.toFixed(2)}) and ${awayLeaderName} (${input.awayTotalRating.toFixed(2)}) are their leading TouchLine cards in the current ranking.`,
    "Who comes out on top?",
    "",
    "TouchLine Verified Match Data",
    DISCLOSURE,
    hashtags.join(" "),
  ].join("\n");
  if (PUBLIC_PROVIDER_WORDING.test(caption)) {
    return { ok: false, reason: "PUBLIC_SOURCE_WORDING_FORBIDDEN" } as const;
  }
  return { ok: true, caption } as const;
}

export { ordinal as touchlineEnglishOrdinal };
