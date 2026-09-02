import {
  formatTouchlineConfirmedEventMinute,
  type TouchlineConfirmedEventKind,
} from "./social-confirmed-event-contract.ts";

const DISCLOSURE = "COMING SOON • CURRENTLY IN TESTING";
const FORBIDDEN_PUBLIC_WORDING = /\b(?:sportmonks|api|provider|pipeline|settlement)\b/i;

function clubHashtag(value: string) {
  const hashtag = value.normalize("NFKD").replace(/[^A-Za-z0-9]/g, "");
  return hashtag ? `#${hashtag}` : null;
}

function signedPoints(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function goalImpactLine(input: Readonly<{
  eventKind: TouchlineConfirmedEventKind;
  eventTeam: "home" | "away";
  homeName: string;
  awayName: string;
  score: Readonly<{ home: number; away: number }>;
  playerName: string;
  minute: string;
}>) {
  if (input.eventKind === "penalty") return `${input.playerName} converts from the spot at ${input.minute}.`;
  if (input.eventKind === "own-goal") return `Own goal by ${input.playerName} at ${input.minute}.`;
  const clubName = input.eventTeam === "home" ? input.homeName : input.awayName;
  const clubScore = input.eventTeam === "home" ? input.score.home : input.score.away;
  const opponentScore = input.eventTeam === "home" ? input.score.away : input.score.home;
  const previousClubScore = clubScore - 1;
  if (clubScore === opponentScore) return `${input.playerName} draws ${clubName} level at ${input.minute}.`;
  if (clubScore > opponentScore && previousClubScore <= opponentScore) {
    return `${input.playerName} puts ${clubName} in front at ${input.minute}.`;
  }
  if (clubScore > opponentScore) return `${input.playerName} extends ${clubName}'s lead at ${input.minute}.`;
  return `${input.playerName} pulls one back for ${clubName} at ${input.minute}.`;
}

export function buildTouchlineConfirmedEventCaption(input: Readonly<{
  contentType: "GOAL_CONFIRMED" | "RED_CARD_CONFIRMED";
  homeName: string;
  awayName: string;
  score: Readonly<{ home: number; away: number }>;
  playerName: string;
  eventTeam: "home" | "away";
  minute: number;
  extraMinute: number | null;
  eventKind: TouchlineConfirmedEventKind;
  totalRating: number;
  matchRating: number | null;
  touchlinePoints: number;
  gameweekNumber: number;
}>) {
  const homeName = input.homeName.trim();
  const awayName = input.awayName.trim();
  const playerName = input.playerName.trim();
  const redCard = input.eventKind === "red-card" || input.eventKind === "second-yellow-red";
  if (!homeName || !awayName || !playerName
    || !Number.isSafeInteger(input.score.home) || input.score.home < 0
    || !Number.isSafeInteger(input.score.away) || input.score.away < 0
    || !Number.isSafeInteger(input.minute) || input.minute < 0
    || (input.extraMinute !== null && (!Number.isSafeInteger(input.extraMinute) || input.extraMinute < 1))
    || !Number.isFinite(input.totalRating) || input.totalRating < 0
    || (input.matchRating !== null && (!Number.isFinite(input.matchRating) || input.matchRating < 0))
    || !Number.isFinite(input.touchlinePoints)
    || !Number.isSafeInteger(input.gameweekNumber) || input.gameweekNumber < 1
    || (input.contentType === "RED_CARD_CONFIRMED") !== redCard) {
    return { ok: false, reason: "CONFIRMED_EVENT_CONTEXT_INVALID" } as const;
  }
  const minute = formatTouchlineConfirmedEventMinute(input.minute, input.extraMinute);
  const eventLabel = input.eventKind === "second-yellow-red"
    ? `${playerName} is sent off for a second yellow at ${minute}.`
    : input.eventKind === "red-card"
      ? `${playerName} is sent off at ${minute}.`
      : goalImpactLine({
        eventKind: input.eventKind,
        eventTeam: input.eventTeam,
        homeName,
        awayName,
        score: input.score,
        playerName,
        minute,
      });
  const hashtags = [
    "#TouchLine",
    clubHashtag(homeName),
    clubHashtag(awayName),
    "#PremierLeague",
    `#Gameweek${input.gameweekNumber}`,
  ].filter((value): value is string => Boolean(value));
  if (hashtags.length !== 5 || new Set(hashtags).size !== hashtags.length) {
    return { ok: false, reason: "CONFIRMED_EVENT_HASHTAG_IDENTITY_INVALID" } as const;
  }
  const ratingLine = [
    `Total Rating ${input.totalRating.toFixed(2)}`,
    ...(input.matchRating === null ? [] : [`Match Rating ${input.matchRating.toFixed(2)}`]),
    `TouchLine Points ${signedPoints(input.touchlinePoints)}`,
  ].join(" · ");
  const caption = [
    input.contentType === "GOAL_CONFIRMED" ? "GOALLLLLLL ⚽" : "Red card confirmed 🟥",
    `${homeName} ${input.score.home}–${input.score.away} ${awayName} · ${minute}`,
    eventLabel,
    ratingLine,
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
