const DISCLOSURE = "COMING SOON • CURRENTLY IN TESTING";
const FORBIDDEN_PUBLIC_WORDING = /\b(?:sportmonks|api|provider|pipeline|settlement)\b/i;

function clubHashtag(value: string) {
  const hashtag = value.normalize("NFKD").replace(/[^A-Za-z0-9]/g, "");
  return hashtag ? `#${hashtag}` : null;
}

export function formatTouchlineGoalMinute(minute: number, extraMinute: number | null) {
  return `${minute}${extraMinute ? `+${extraMinute}` : ""}'`;
}

export function buildTouchlineFinalResultCaption(input: Readonly<{
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  venueName: string;
  gameweekNumber: number;
  goals: readonly Readonly<{
    playerName: string;
    minute: number;
    extraMinute: number | null;
    kind: "goal" | "own-goal" | "penalty";
  }>[];
  topCardName: string;
  officialMatchRating: number;
}>) {
  const textValues = [input.homeName, input.awayName, input.venueName, input.topCardName]
    .map((value) => value.trim());
  if (textValues.some((value) => !value)
    || !Number.isSafeInteger(input.homeScore) || input.homeScore < 0
    || !Number.isSafeInteger(input.awayScore) || input.awayScore < 0
    || !Number.isSafeInteger(input.gameweekNumber) || input.gameweekNumber < 1
    || !Number.isFinite(input.officialMatchRating) || input.officialMatchRating < 0
    || input.goals.length !== input.homeScore + input.awayScore) {
    return { ok: false, reason: "FINAL_RESULT_CONTEXT_INVALID" } as const;
  }
  const [homeName, awayName, venueName, topCardName] = textValues;
  const goalLine = input.goals.map((goal) => {
    const label = goal.kind === "own-goal" ? " OG" : goal.kind === "penalty" ? " PEN" : "";
    return `${goal.playerName} ${formatTouchlineGoalMinute(goal.minute, goal.extraMinute)}${label}`;
  }).join(" · ");
  const hashtags = ["#TouchLine", clubHashtag(homeName), clubHashtag(awayName), "#PremierLeague", `#Gameweek${input.gameweekNumber}`]
    .filter((value): value is string => Boolean(value));
  if (hashtags.length !== 5 || new Set(hashtags).size !== hashtags.length) {
    return { ok: false, reason: "FINAL_RESULT_HASHTAG_IDENTITY_INVALID" } as const;
  }
  const caption = [
    "Full Time 🏁",
    "",
    `${homeName} ${input.homeScore}–${input.awayScore} ${awayName}`,
    `Premier League · Gameweek ${input.gameweekNumber} · ${venueName}`,
    goalLine,
    `⭐ Top Match Card: ${topCardName} — Official Match Rating ${input.officialMatchRating.toFixed(2)}.`,
    "Which moment decided the match?",
    "",
    "TouchLine Verified Match Data",
    DISCLOSURE,
    hashtags.join(" "),
  ].join("\n");
  if (FORBIDDEN_PUBLIC_WORDING.test(caption)) {
    return { ok: false, reason: "PUBLIC_SOURCE_WORDING_FORBIDDEN" } as const;
  }
  return { ok: true, caption } as const;
}
