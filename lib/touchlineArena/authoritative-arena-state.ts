import {
  findApprovedArenaAsset,
  inferArenaRole,
  type ArenaLineupPlayer,
  type ArenaLineupRole,
} from "../football-data/arena-lineup.ts";
import {
  touchlineArenaClubTemplateForCard,
} from "./card-rules.ts";
import type { ClubOwnerSquadCard } from "./demo-data.ts";

type DatabaseRecord = Record<string, unknown>;

type ArenaTacticalSlot = Pick<ArenaLineupPlayer, "x" | "y" | "heightVh">;

export type ArenaLineupRebuildReport = {
  lineupWasArray: boolean;
  lineupTooLarge: boolean;
  lineup: ArenaLineupPlayer[];
  missingInventoryIndexes: number[];
  foreignInventoryIds: string[];
  duplicateInventoryIds: string[];
  invalidTacticalIndexes: number[];
};

export type CanonicalArenaLineupResult =
  | { ok: true; lineup: ArenaLineupPlayer[] }
  | {
    ok: false;
    error: "TL_ARENA_LINEUP_INVALID";
    lineupTooLarge: boolean;
    missingInventoryIndexes: number[];
    foreignInventoryIds: string[];
    duplicateInventoryIds: string[];
    invalidTacticalIndexes: number[];
  };

export type SanitizedArenaFormationLayoutsResult =
  | { ok: true; layouts: Record<string, unknown> }
  | { ok: false; error: "TL_ARENA_FORMATION_LAYOUT_INVALID" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ARENA_ROLES = ["goalkeeper", "defender", "midfielder", "forward"] as const;
const ARENA_ROLE_SET = new Set<string>(ARENA_ROLES);
const ARENA_FORMATION_KEYS = ["4-3-3", "4-4-2"] as const;
const ARENA_FORMATION_KEY_SET = new Set<string>(ARENA_FORMATION_KEYS);
const ARENA_CAMERA_IDS = new Set(["wide-touchline", "lower-stand", "side-sweep"]);
const ARENA_CARD_COMPACT_HEIGHT_VH = 14;
const ARENA_CARD_MIN_HEIGHT_VH = 8;
const ARENA_CARD_MAX_HEIGHT_VH = 20;
const ARENA_LINEUP_MAX_PLAYERS = 11;

const ARENA_ROLE_X_LIMITS: Record<ArenaLineupRole, { min: number; max: number }> = {
  goalkeeper: { min: 10, max: 22 },
  defender: { min: 20, max: 38 },
  midfielder: { min: 37, max: 58 },
  forward: { min: 57, max: 78 },
};

const ARENA_ROLE_Y_LIMITS: Record<ArenaLineupRole, { min: number; max: number }> = {
  goalkeeper: { min: 43, max: 61 },
  defender: { min: 32, max: 72 },
  midfielder: { min: 30, max: 74 },
  forward: { min: 32, max: 72 },
};

const ARENA_ROLE_DEFAULT_X: Record<ArenaLineupRole, number> = {
  goalkeeper: 15,
  defender: 29,
  midfielder: 48,
  forward: 68,
};

function asRecord(value: unknown): DatabaseRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as DatabaseRecord
    : null;
}

function asUuid(value: unknown) {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toLowerCase();
  return UUID_PATTERN.test(candidate) ? candidate : null;
}

function lineupInventoryId(value: unknown) {
  const entry = asRecord(value);
  if (!entry) return null;
  return asUuid(entry.inventoryId)
    ?? asUuid(asRecord(entry.card)?.inventoryId);
}

function authoritativeRole(card: ClubOwnerSquadCard): ArenaLineupRole {
  return ARENA_ROLE_SET.has(card.role)
    ? card.role as ArenaLineupRole
    : inferArenaRole(card.position);
}

function roundedTacticalNumber(
  value: unknown,
  limits: { min: number; max: number },
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < limits.min || value > limits.max) return null;
  return Math.round(value * 10) / 10;
}

function strictTacticalSlot(value: unknown, role: ArenaLineupRole): ArenaTacticalSlot | null {
  const entry = asRecord(value);
  if (!entry) return null;
  const x = roundedTacticalNumber(entry.x, ARENA_ROLE_X_LIMITS[role]);
  const y = roundedTacticalNumber(entry.y, ARENA_ROLE_Y_LIMITS[role]);
  const heightVh = roundedTacticalNumber(entry.heightVh, {
    min: ARENA_CARD_MIN_HEIGHT_VH,
    max: ARENA_CARD_MAX_HEIGHT_VH,
  });
  return x === null || y === null || heightVh === null
    ? null
    : { x, y, heightVh };
}

function safeTacticalSlot(value: unknown, role: ArenaLineupRole): ArenaTacticalSlot {
  return strictTacticalSlot(value, role) ?? {
    x: ARENA_ROLE_DEFAULT_X[role],
    y: 52,
    heightVh: ARENA_CARD_COMPACT_HEIGHT_VH,
  };
}

function canonicalArenaPlayer(
  rosterCard: ClubOwnerSquadCard,
  inventoryId: string,
  slot: ArenaTacticalSlot,
): ArenaLineupPlayer {
  const role = authoritativeRole(rosterCard);
  return {
    id: `field-${inventoryId}`,
    name: rosterCard.name,
    shortName: rosterCard.shortName,
    role,
    asset: findApprovedArenaAsset(rosterCard.name),
    ...slot,
    card: {
      templateUrl: touchlineArenaClubTemplateForCard(
        rosterCard.clubName,
        rosterCard.marketValue,
        rosterCard.cardTier,
      ) || "",
      playerName: rosterCard.name,
      shirtNumber: rosterCard.shirtNumber,
      clubName: rosterCard.clubName,
      position: rosterCard.position,
      countryCode3: rosterCard.countryCode3,
      flagUrl: null,
      fantasyPoints: rosterCard.touchlinePoints,
      marketValue: rosterCard.marketValue,
      marketValueSource: rosterCard.marketValueSource ?? "unavailable",
      ...(rosterCard.marketValueState != null
        ? { marketValueState: rosterCard.marketValueState }
        : {}),
      ...(rosterCard.classificationState != null
        ? { classificationState: rosterCard.classificationState }
        : {}),
      cardTier: rosterCard.cardTier,
      cardPriceVersion: rosterCard.cardPriceVersion,
      cardPriceAuthority: rosterCard.cardPriceAuthority,
      inventoryId,
      matchStats: {
        goals: 0,
        assists: 0,
        defense: 0,
        cleanSheets: 0,
        cards: 0,
      },
    },
  };
}

/**
 * Rebuilds every saved entry from the active-contract roster. Browser supplied
 * identity, tier, pricing, points, assets and statistics are never copied.
 * In reconciliation mode stale/foreign entries are omitted and malformed
 * tactical coordinates are replaced with safe role defaults.
 */
export function rebuildArenaLineupFromAuthoritativeRoster(
  lineup: unknown,
  roster: ClubOwnerSquadCard[],
  options: { strictTactics: boolean },
): ArenaLineupRebuildReport {
  const entries = Array.isArray(lineup) ? lineup : [];
  const rosterByInventoryId = new Map(
    roster.flatMap((card) => {
      const inventoryId = asUuid(card.inventoryId);
      return inventoryId ? [[inventoryId, card] as const] : [];
    }),
  );
  const seen = new Set<string>();
  const rebuilt: ArenaLineupPlayer[] = [];
  const missingInventoryIndexes: number[] = [];
  const foreignInventoryIds = new Set<string>();
  const duplicateInventoryIds = new Set<string>();
  const invalidTacticalIndexes: number[] = [];

  entries.forEach((entry, index) => {
    if (rebuilt.length >= ARENA_LINEUP_MAX_PLAYERS) return;
    const inventoryId = lineupInventoryId(entry);
    if (!inventoryId) {
      missingInventoryIndexes.push(index);
      return;
    }
    const rosterCard = rosterByInventoryId.get(inventoryId);
    if (!rosterCard) {
      foreignInventoryIds.add(inventoryId);
      return;
    }
    if (seen.has(inventoryId)) {
      duplicateInventoryIds.add(inventoryId);
      return;
    }
    seen.add(inventoryId);

    const role = authoritativeRole(rosterCard);
    const strictSlot = strictTacticalSlot(entry, role);
    if (!strictSlot && options.strictTactics) {
      invalidTacticalIndexes.push(index);
      return;
    }
    rebuilt.push(canonicalArenaPlayer(
      rosterCard,
      inventoryId,
      strictSlot ?? safeTacticalSlot(entry, role),
    ));
  });

  return {
    lineupWasArray: Array.isArray(lineup),
    lineupTooLarge: entries.length > ARENA_LINEUP_MAX_PLAYERS,
    lineup: rebuilt,
    missingInventoryIndexes,
    foreignInventoryIds: [...foreignInventoryIds],
    duplicateInventoryIds: [...duplicateInventoryIds],
    invalidTacticalIndexes,
  };
}

/** Strict write boundary used before an Arena-state upsert. */
export function canonicalizeArenaLineupForPersistence(
  lineup: unknown,
  roster: ClubOwnerSquadCard[],
): CanonicalArenaLineupResult {
  const report = rebuildArenaLineupFromAuthoritativeRoster(lineup, roster, {
    strictTactics: true,
  });
  const ok = report.lineupWasArray
    && !report.lineupTooLarge
    && report.missingInventoryIndexes.length === 0
    && report.foreignInventoryIds.length === 0
    && report.duplicateInventoryIds.length === 0
    && report.invalidTacticalIndexes.length === 0;

  return ok
    ? { ok: true, lineup: report.lineup }
    : {
      ok: false,
      error: "TL_ARENA_LINEUP_INVALID",
      lineupTooLarge: report.lineupTooLarge,
      missingInventoryIndexes: report.missingInventoryIndexes,
      foreignInventoryIds: report.foreignInventoryIds,
      duplicateInventoryIds: report.duplicateInventoryIds,
      invalidTacticalIndexes: report.invalidTacticalIndexes,
    };
}

/** Read boundary: never returns raw, foreign, released or duplicate entries. */
export function reconcileStoredArenaLineupWithAuthoritativeRoster(
  lineup: unknown,
  roster: ClubOwnerSquadCard[],
) {
  return rebuildArenaLineupFromAuthoritativeRoster(lineup, roster, {
    strictTactics: false,
  }).lineup;
}

function sanitizeLayoutSlot(value: unknown) {
  const slot = asRecord(value);
  if (!slot) return null;
  const x = roundedTacticalNumber(slot.x, { min: 2, max: 98 });
  const y = roundedTacticalNumber(slot.y, { min: 6, max: 96 });
  const heightVh = roundedTacticalNumber(slot.heightVh, {
    min: ARENA_CARD_MIN_HEIGHT_VH,
    max: ARENA_CARD_MAX_HEIGHT_VH,
  });
  if (x === null || y === null || heightVh === null) return null;
  if (Object.keys(slot).some((key) => !["x", "y", "heightVh"].includes(key))) return null;
  return { x, y, heightVh };
}

function sanitizeRoleLayout(
  input: unknown,
) {
  const layout = asRecord(input);
  if (!layout) return null;
  const output: Record<string, ArenaTacticalSlot[]> = {};
  let slotCount = 0;

  for (const [role, slots] of Object.entries(layout)) {
    if (!ARENA_ROLE_SET.has(role) || !Array.isArray(slots)) return null;
    const maxSlots = role === "goalkeeper" ? 1 : 10;
    if (slots.length > maxSlots) return null;
    slotCount += slots.length;
    if (slotCount > ARENA_LINEUP_MAX_PLAYERS) return null;
    const sanitizedSlots = slots.map(sanitizeLayoutSlot);
    if (sanitizedSlots.some((slot) => slot === null)) return null;
    output[role] = sanitizedSlots as ArenaTacticalSlot[];
  }

  return output;
}

function sanitizeFormationLayout(
  input: unknown,
) {
  const layout = asRecord(input);
  if (!layout) return null;
  const allowedKeys = new Set<string>([...ARENA_ROLES, "cameras"]);
  if (Object.keys(layout).some((key) => !allowedKeys.has(key))) return null;

  const directRoleInput = Object.fromEntries(
    Object.entries(layout).filter(([key]) => ARENA_ROLE_SET.has(key)),
  );
  const directRoles = sanitizeRoleLayout(directRoleInput);
  if (!directRoles) return null;

  const output: Record<string, unknown> = { ...directRoles };
  if ("cameras" in layout) {
    const cameras = asRecord(layout.cameras);
    if (!cameras) return null;
    const sanitizedCameras: Record<string, unknown> = {};
    for (const [cameraId, cameraLayout] of Object.entries(cameras)) {
      if (!ARENA_CAMERA_IDS.has(cameraId)) return null;
      const sanitizedCamera = sanitizeRoleLayout(cameraLayout);
      if (!sanitizedCamera) return null;
      sanitizedCameras[cameraId] = sanitizedCamera;
    }
    output.cameras = sanitizedCameras;
  }
  return output;
}

function rebuildFormationLayouts(input: unknown, strict: boolean) {
  const layouts = asRecord(input);
  if (!layouts) return { ok: false, layouts: {} as Record<string, unknown> };
  const output: Record<string, unknown> = {};
  let valid = true;

  for (const [formationKey, layout] of Object.entries(layouts)) {
    if (!ARENA_FORMATION_KEY_SET.has(formationKey)) {
      valid = false;
      continue;
    }
    const sanitized = sanitizeFormationLayout(layout);
    if (!sanitized) {
      valid = false;
      continue;
    }
    output[formationKey] = sanitized;
  }

  return { ok: strict ? valid : true, layouts: output };
}

/** Strictly validates and strips all non-layout fields before persistence. */
export function sanitizeArenaFormationLayoutsForPersistence(
  input: unknown,
): SanitizedArenaFormationLayoutsResult {
  const result = rebuildFormationLayouts(input, true);
  return result.ok
    ? { ok: true, layouts: result.layouts }
    : { ok: false, error: "TL_ARENA_FORMATION_LAYOUT_INVALID" };
}

/** Tolerant read repair for legacy state: only known numeric layout slots survive. */
export function reconcileStoredArenaFormationLayouts(input: unknown) {
  return rebuildFormationLayouts(input, false).layouts;
}
