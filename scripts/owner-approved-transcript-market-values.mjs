import { createHash } from "node:crypto";

/**
 * This is an owner-input parser, not a provider parser. It only converts the
 * explicit EUR text that Luiz supplied in the transcript and intentionally
 * produces review records without a canonical identity binding.
 */
export const OWNER_APPROVED_TRANSCRIPT_CLUBS = [
  { line: 8842, clubName: "Arsenal FC" },
  { line: 9508, clubName: "Hull City" },
  { line: 9593, clubName: "Chelsea FC" },
  { line: 9693, clubName: "Brentford FC" },
  { line: 9730, clubName: "AFC Bournemouth" },
  { line: 9758, clubName: "Tottenham Hotspur" },
  { line: 9777, clubName: "Crystal Palace" },
  { line: 9812, clubName: "Leeds United" },
  { line: 9841, clubName: "Ipswich Town" },
  { line: 9875, clubName: "Manchester United" },
  { line: 9912, clubName: "Aston Villa" },
  { line: 9922, clubName: "Sunderland AFC" },
  { line: 9972, clubName: "Fulham FC" },
  { line: 10062, clubName: "Manchester City" },
  { line: 10078, clubName: "Brighton & Hove Albion" },
  { line: 10088, clubName: "Coventry City" },
  { line: 10104, clubName: "Newcastle United" },
  { line: 10139, clubName: "Everton FC" },
  { line: 10176, clubName: "Nottingham Forest" },
];

const POSITION_NAMES = [
  "Attacking Midfield",
  "Central Midfield",
  "Defensive Midfield",
  "Centre-Forward",
  "Centre-Back",
  "Left Midfield",
  "Right Midfield",
  "Left Winger",
  "Right Winger",
  "Left-Back",
  "Right-Back",
  "Goalkeeper",
  "Second Striker",
  "Médio Defensivo",
  "Médio Ofensivo",
  "Médio Esquerdo",
  "Médio Direito",
  "Médio Centro",
  "Ponta de Lança",
  "Segundo Avançado",
  "Defesa Central",
  "Lateral Esquerdo",
  "Lateral Direito",
  "Guarda-Redes",
  "Extremo Esquerdo",
  "Extremo Direito",
  "Midfielder",
  "Defender",
  "Forward",
  "Sweeper",
].sort((left, right) => right.length - left.length);

const POSITION_PATTERN = POSITION_NAMES
  .map((position) => position.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const RECORD_START = new RegExp(
  `(?:^|\\n)(?<rawName>[^\\n]+)\\n(?<position>${POSITION_PATTERN})\\n`,
  "g",
);

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function cleanText(value) {
  return String(value ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
}

export function normalizeOwnerSuppliedPlayerName(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function collapseRepeatedDisplayName(rawName) {
  const parts = String(rawName ?? "")
    .split(/\t+/)
    .map(cleanText)
    .filter(Boolean);
  if (parts.length > 1 && parts.every((part) => normalizeOwnerSuppliedPlayerName(part) === normalizeOwnerSuppliedPlayerName(parts[0]))) {
    return parts[0];
  }

  const compact = cleanText(rawName);
  const words = compact.split(" ").filter(Boolean);
  if (words.length > 1 && words.length % 2 === 0) {
    const midpoint = words.length / 2;
    const firstHalf = words.slice(0, midpoint).join(" ");
    const secondHalf = words.slice(midpoint).join(" ");
    if (normalizeOwnerSuppliedPlayerName(firstHalf) === normalizeOwnerSuppliedPlayerName(secondHalf)) {
      return firstHalf;
    }
  }
  return compact;
}

function compactRawValue(value) {
  return cleanText(value).replace(/\s+/g, " ");
}

/** Only explicit EUR M/K/mil forms are accepted. No conversion from another currency exists here. */
export function parseOwnerApprovedEuroValue(rawValue) {
  const raw = compactRawValue(rawValue);
  const english = raw.match(/^€\s*([0-9]+(?:[.,][0-9]+)?)\s*([mMkK])$/);
  const portuguese = raw.match(/^([0-9]+(?:[.,][0-9]+)?)\s*(M|m|mil)\s*€$/i);
  const match = english ?? portuguese;
  if (!match) return null;

  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount < 0) return null;
  const unit = match[2].toLocaleLowerCase("en-US");
  const multiplier = unit === "m" ? 1_000_000 : 1_000;
  return Math.round(amount * multiplier);
}

function findRawEuroValue(recordBody) {
  const english = recordBody.match(/€\s*([0-9]+(?:[.,][0-9]+)?)\s*([mMkK])\b/);
  if (english) return `€${english[1]}${english[2]}`;

  const portuguese = recordBody.match(/([0-9]+(?:[.,][0-9]+)?)\s*(M|m|mil)\s*€/i);
  if (portuguese) return `${portuguese[1]} ${portuguese[2]} €`;
  return null;
}

function ownerRequestBody(message) {
  const requestMarker = "## My request:";
  const afterRequest = message.includes(requestMarker)
    ? message.slice(message.lastIndexOf(requestMarker) + requestMarker.length)
    : message;
  return afterRequest
    .replace(/\r/g, "")
    .split(/\n(?:Plantel detalhado|Detailed squad)\b/i)[0]
    .trim();
}

function readUserMessage(event, line) {
  if (event?.type !== "event_msg" || event?.payload?.type !== "user_message") {
    throw new Error(`TL_OWNER_TRANSCRIPT_EXPECTED_USER_MESSAGE:${line}`);
  }
  if (typeof event.timestamp !== "string" || typeof event.payload.message !== "string") {
    throw new Error(`TL_OWNER_TRANSCRIPT_MALFORMED_MESSAGE:${line}`);
  }
  return {
    timestamp: event.timestamp,
    message: event.payload.message,
  };
}

function sourceRowStatus(rawValue, valueEur) {
  if (!rawValue) return {
    reviewStatus: "PENDING_VALUE_MISSING",
    reviewReason: "owner transcript supplied no EUR market value",
  };
  if (valueEur === null) return {
    reviewStatus: "PENDING_VALUE_PARSE",
    reviewReason: "owner transcript value is not an accepted explicit EUR M/K form",
  };
  if (valueEur === 0) return {
    reviewStatus: "REVIEW_ZERO_VALUE",
    reviewReason: "explicit zero requires identity and owner-review confirmation before any Ruby presentation",
  };
  return {
    reviewStatus: "REVIEW_PROVIDER_ID_MISSING",
    reviewReason: "display-name normalization is only a candidate; canonical player/provider identity and active membership are not yet reviewed",
  };
}

export function extractOwnerApprovedTranscriptBlock({ clubName, line, rawJsonLine, sourceSelectionSha256 }) {
  const event = JSON.parse(rawJsonLine);
  const { timestamp, message } = readUserMessage(event, line);
  // The immutable selection contract hashes the owner message itself, not the
  // enclosing JSONL event. The session file can gain non-message metadata and
  // appended events without changing the owner-supplied input we are staging.
  const messageSha256 = sha256(message);
  const jsonlLineSha256 = sha256(rawJsonLine);
  const rosterText = ownerRequestBody(message);
  const starts = [...rosterText.matchAll(RECORD_START)];
  const rows = [];

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = starts[index + 1]?.index ?? rosterText.length;
    const recordBody = rosterText.slice((start.index ?? 0) + start[0].length, end);
    if (!/\b\d{2}\/\d{2}\/\d{4}\s*\(\d{1,2}\)/.test(recordBody)) continue;

    // Preserve the source tab boundary for provenance and for the common
    // `Name<TAB>Name` repetition in the captured roster markup. `cleanText`
    // intentionally flattens tabs, so applying it first would turn that into
    // an ambiguous doubled display name.
    const rawPlayerDisplayName = String(start.groups.rawName ?? "").replace(/\r/g, "").trim();
    const playerDisplayName = collapseRepeatedDisplayName(rawPlayerDisplayName);
    const rawValue = findRawEuroValue(recordBody);
    const marketValueEur = rawValue ? parseOwnerApprovedEuroValue(rawValue) : null;
    const state = sourceRowStatus(rawValue, marketValueEur);
    const sourceRowOrdinal = rows.length + 1;

    rows.push({
      source_file: "rollout-2026-08-08T06-46-52-019fdfb2-003a-7fa0-aa05-6b268b203143.jsonl",
      source_selection_sha256: sourceSelectionSha256,
      source_jsonl_line: line,
      source_message_timestamp_utc: timestamp,
      source_message_sha256: messageSha256,
      source_jsonl_line_sha256: jsonlLineSha256,
      source_row_ordinal: sourceRowOrdinal,
      source_row_sha256: sha256(`${messageSha256}:${sourceRowOrdinal}:${rawPlayerDisplayName}:${rawValue ?? ""}`),
      source: "owner_approved_transcript",
      source_metadata: "owner-supplied voice-transcript import; not provider-verified",
      club_name: clubName,
      raw_player_display_name: rawPlayerDisplayName,
      player_display_name: playerDisplayName,
      normalized_player_name: normalizeOwnerSuppliedPlayerName(playerDisplayName),
      roster_position_text: cleanText(start.groups.position),
      raw_market_value: rawValue ?? "",
      market_value_eur: marketValueEur ?? "",
      currency: marketValueEur === null ? "" : "EUR",
      valuation_date: "",
      owner_approval_timestamp_utc: timestamp,
      canonical_player_id: "",
      provider_player_id: "",
      canonical_club_id: "",
      provider_team_id: "",
      review_status: state.reviewStatus,
      review_reason: state.reviewReason,
      market_tier_policy_version: "",
      parser_version: "owner-transcript-eur-v1",
    });
  }

  if (!rows.length) throw new Error(`TL_OWNER_TRANSCRIPT_NO_ROSTER_ROWS:${clubName}:${line}`);

  return {
    clubName,
    line,
    timestamp,
    messageSha256,
    rows,
  };
}

export function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(rows) {
  const columns = Object.keys(rows[0] ?? {});
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
    "",
  ].join("\n");
}
