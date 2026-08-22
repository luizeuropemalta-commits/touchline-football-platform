export const CARD_ENGINE_IMPORT_MAX_ROWS = 200;
export const CARD_ENGINE_ALLOWED_OVERRIDE_FIELDS = [
  "displayName", "shirtNumber", "marketValueEur", "cardTemplateKey",
] as const;

export type CardEngineOverrideField = typeof CARD_ENGINE_ALLOWED_OVERRIDE_FIELDS[number];
export type CardEngineMatchStatus = "matched" | "review" | "conflict" | "unmatched";
export type CardEngineMatchStrategy = "provider_player_id" | "internal_uuid" | "name_club_dob" | "name_club_manual" | "none";

export type CardEngineImportInput = Readonly<{
  providerPlayerId?: string | null;
  playerId?: string | null;
  name?: string | null;
  club?: string | null;
  dateOfBirth?: string | null;
  displayName?: string | null;
  shirtNumber?: number | null;
  marketValueEur?: number | null;
  cardTemplateKey?: string | null;
}>;

export type CardEngineCandidate = Readonly<{
  playerId: string;
  providerPlayerId: string;
  name: string;
  club: string | null;
  dateOfBirth: string | null;
  provider: Readonly<Record<string, unknown>>;
}>;

export type CardEngineResolvedRow = Readonly<{
  rowNumber: number;
  raw: CardEngineImportInput;
  playerId: string | null;
  providerPlayerId: string | null;
  matchStatus: CardEngineMatchStatus;
  matchStrategy: CardEngineMatchStrategy;
  proposed: Readonly<Record<string, unknown>>;
  errors: readonly string[];
  provider: Readonly<Record<string, unknown>> | null;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEXT_MAX = 300;

function text(value: unknown, max = TEXT_MAX) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalized(value: unknown) {
  return text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toLowerCase();
}

function safeNonNegativeInteger(value: unknown) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
  const candidate = text(value, 30).replace(/[€,\s]/g, "");
  return /^\d+$/.test(candidate) && Number.isSafeInteger(Number(candidate)) ? Number(candidate) : null;
}

function safeShirtNumber(value: unknown) {
  const parsed = safeNonNegativeInteger(value);
  return parsed !== null && parsed >= 1 && parsed <= 99 ? parsed : null;
}

function cleanCell(value: unknown) {
  const candidate = text(value);
  if (/^[=+\-@]/.test(candidate)) return { value: "", error: "formula-like-cell-rejected" } as const;
  return { value: candidate, error: null } as const;
}

/** Parses a bounded CSV/paste payload without evaluating spreadsheet formulas. */
export function parseCardEngineDelimitedInput(input: string): CardEngineImportInput[] {
  const lines = input.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim()).slice(0, CARD_ENGINE_IMPORT_MAX_ROWS + 1);
  if (lines.length < 2) return [];
  const delimiter = lines[0]!.includes("\t") ? "\t" : lines[0]!.includes(";") ? ";" : ",";
  const cells = (line: string) => {
    const values: string[] = []; let value = ""; let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]!;
      if (char === '"' && line[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === delimiter && !quoted) { values.push(value); value = ""; }
      else value += char;
    }
    values.push(value);
    return values;
  };
  const headers = cells(lines[0]!).map((header) => normalized(header).replace(/[^a-z0-9]+/g, ""));
  const value = (row: string[], keys: string[]) => row[headers.findIndex((header) => keys.includes(header))] ?? "";
  return lines.slice(1).map((line) => {
    const row = cells(line);
    const providerPlayerId = cleanCell(value(row, ["providerplayerid", "sportmonksplayerid"]));
    const playerId = cleanCell(value(row, ["playerid", "internaluuid", "uuid"]));
    const name = cleanCell(value(row, ["name", "playername"]));
    const club = cleanCell(value(row, ["club", "clubname"]));
    const dateOfBirth = cleanCell(value(row, ["dateofbirth", "dob"]));
    const displayName = cleanCell(value(row, ["displayname", "carddisplayname"]));
    const template = cleanCell(value(row, ["cardtemplatekey", "template"]));
    return {
      providerPlayerId: providerPlayerId.value || null, playerId: playerId.value || null,
      name: name.value || null, club: club.value || null, dateOfBirth: dateOfBirth.value || null,
      displayName: displayName.value || null, cardTemplateKey: template.value || null,
      shirtNumber: safeShirtNumber(value(row, ["shirtnumber", "jerseynumber"])),
      marketValueEur: safeNonNegativeInteger(value(row, ["marketvalueeur", "marketvalue"])),
    };
  });
}

export function resolveCardEngineImportRows(rows: readonly CardEngineImportInput[], candidates: readonly CardEngineCandidate[]): CardEngineResolvedRow[] {
  return rows.slice(0, CARD_ENGINE_IMPORT_MAX_ROWS).map((raw, index) => {
    const errors: string[] = [];
    const providerId = text(raw.providerPlayerId, 64);
    const playerId = text(raw.playerId, 64).toLowerCase();
    const byProvider = providerId ? candidates.filter((candidate) => candidate.providerPlayerId === providerId) : [];
    const byId = UUID_PATTERN.test(playerId) ? candidates.filter((candidate) => candidate.playerId === playerId) : [];
    if (raw.playerId && !UUID_PATTERN.test(playerId)) errors.push("invalid-internal-uuid");
    if (byProvider.length > 1 || byId.length > 1) errors.push("canonical-identity-ambiguous");
    if (byProvider[0] && byId[0] && byProvider[0].playerId !== byId[0].playerId) errors.push("provider-and-internal-id-conflict");
    const identity = byProvider[0] ?? byId[0] ?? null;
    const proposed: Record<string, unknown> = {};
    const displayName = cleanCell(raw.displayName);
    const template = cleanCell(raw.cardTemplateKey);
    if (displayName.error || template.error) errors.push("formula-like-cell-rejected");
    if (displayName.value) proposed.displayName = displayName.value;
    if (raw.shirtNumber !== null && raw.shirtNumber !== undefined) {
      const shirt = safeShirtNumber(raw.shirtNumber); if (shirt === null) errors.push("invalid-shirt-number"); else proposed.shirtNumber = shirt;
    }
    if (raw.marketValueEur !== null && raw.marketValueEur !== undefined) {
      const value = safeNonNegativeInteger(raw.marketValueEur); if (value === null) errors.push("invalid-market-value"); else proposed.marketValueEur = value;
    }
    if (template.value) {
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(template.value)) errors.push("invalid-card-template-key"); else proposed.cardTemplateKey = template.value;
    }
    if (!Object.keys(proposed).length) errors.push("no-supported-editorial-change");
    if (identity && !errors.length) return { rowNumber: index + 1, raw, playerId: identity.playerId, providerPlayerId: identity.providerPlayerId, matchStatus: "matched", matchStrategy: byProvider[0] ? "provider_player_id" : "internal_uuid", proposed, errors, provider: identity.provider };
    if (identity) return { rowNumber: index + 1, raw, playerId: identity.playerId, providerPlayerId: identity.providerPlayerId, matchStatus: "review", matchStrategy: byProvider[0] ? "provider_player_id" : "internal_uuid", proposed, errors, provider: identity.provider };
    const byNameClubDob = candidates.filter((candidate) => normalized(candidate.name) === normalized(raw.name) && normalized(candidate.club) === normalized(raw.club) && text(candidate.dateOfBirth, 10) === text(raw.dateOfBirth, 10));
    if (byNameClubDob.length === 1 && !errors.length) return { rowNumber: index + 1, raw, playerId: byNameClubDob[0]!.playerId, providerPlayerId: byNameClubDob[0]!.providerPlayerId, matchStatus: "matched", matchStrategy: "name_club_dob", proposed, errors, provider: byNameClubDob[0]!.provider };
    const byNameClub = candidates.filter((candidate) => normalized(candidate.name) === normalized(raw.name) && normalized(candidate.club) === normalized(raw.club));
    if (byNameClub.length) return { rowNumber: index + 1, raw, playerId: byNameClub.length === 1 ? byNameClub[0]!.playerId : null, providerPlayerId: byNameClub.length === 1 ? byNameClub[0]!.providerPlayerId : null, matchStatus: byNameClub.length === 1 ? "review" : "conflict", matchStrategy: "name_club_manual", proposed, errors: [...errors, byNameClub.length === 1 ? "manual-confirmation-required" : "name-club-conflict"], provider: byNameClub.length === 1 ? byNameClub[0]!.provider : null };
    return { rowNumber: index + 1, raw, playerId: null, providerPlayerId: providerId || null, matchStatus: errors.length ? "review" : "unmatched", matchStrategy: "none", proposed, errors: errors.length ? errors : ["no-canonical-match"], provider: null };
  });
}

export function summarizeCardEngineRows(rows: readonly Pick<CardEngineResolvedRow, "matchStatus">[]) {
  return rows.reduce((summary, row) => ({ ...summary, [row.matchStatus]: summary[row.matchStatus] + 1 }), { matched: 0, review: 0, conflict: 0, unmatched: 0 });
}
