export const TOUCHLINE_CONFIRMED_EVENT_KINDS = [
  "goal",
  "own-goal",
  "penalty",
  "red-card",
  "second-yellow-red",
] as const;

export type TouchlineConfirmedEventKind =
  (typeof TOUCHLINE_CONFIRMED_EVENT_KINDS)[number];

const REJECTED_EVENT_STATE = /(?:VAR|REVIEW|PENDING|DISALLOW|CANCEL|RESCIND|OVERTURN)/i;

function normalizedEventType(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase().replace(/[\s_-]+/g, "");
}

export function classifyTouchlineConfirmedMatchEvent(input: Readonly<{
  type: string | null | undefined;
  status: string | null | undefined;
  info: string | null | undefined;
  addition: string | null | undefined;
}>): TouchlineConfirmedEventKind | null {
  if (String(input.status ?? "").trim().toLowerCase() !== "recorded") return null;
  if (REJECTED_EVENT_STATE.test([
    input.type,
    input.info,
    input.addition,
  ].filter(Boolean).join(" "))) return null;
  switch (normalizedEventType(input.type)) {
    case "GOAL": return "goal";
    case "OWNGOAL": return "own-goal";
    case "PENALTY": return "penalty";
    case "REDCARD": return "red-card";
    case "YELLOWREDCARD":
    case "SECONDYELLOWCARD":
    case "SECONDYELLOWREDCARD": return "second-yellow-red";
    default: return null;
  }
}

export function parseTouchlineEventScore(value: string | null | undefined) {
  const match = String(value ?? "").trim().match(/^(\d{1,2})\s*[-–—:]\s*(\d{1,2})$/);
  if (!match) return null;
  const home = Number(match[1]);
  const away = Number(match[2]);
  return Number.isSafeInteger(home) && Number.isSafeInteger(away)
    ? { home, away } as const
    : null;
}

export function formatTouchlineConfirmedEventMinute(minute: number, extraMinute: number | null) {
  return `${minute}${extraMinute ? `+${extraMinute}` : ""}'`;
}

export function touchlineConfirmedEventContentType(kind: TouchlineConfirmedEventKind) {
  return kind === "red-card" || kind === "second-yellow-red"
    ? "RED_CARD_CONFIRMED" as const
    : "GOAL_CONFIRMED" as const;
}
