import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { TOUCHLINE_ENGLAND_CLUBS } from "../lib/touchlineArena/demo-data.ts";
import {
  TOUCHLINE_CALIBRATED_FORMATION_CODES,
  TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY,
  isTouchlineTacticalSlotCandidateEligible,
  mergeTouchlineFormationGeometryRegistry,
  parseTouchlineFormationGeometry,
  resolveTouchlineFormationGeometry,
  touchlineFormationGeometryPayload,
  validateTouchlineFormationGeometry,
  type TouchlineFormationGeometry,
} from "../lib/touchlineArena/formation-geometry.ts";

const arenaClient = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/qa/028_touchline_qa_formation_geometry_registry.sql", import.meta.url), "utf8");
const fieldDepthMigration = readFileSync(new URL("../supabase/qa/029_touchline_qa_formation_geometry_field_depth.sql", import.meta.url), "utf8");
const adminRoute = readFileSync(new URL("../app/api/admin/formation-geometries/route.ts", import.meta.url), "utf8");
const adminStudio = readFileSync(new URL("../components/touchline/admin/FormationCalibrationStudio.tsx", import.meta.url), "utf8");

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key] extends readonly (infer Item)[]
    ? Mutable<Item>[]
    : T[Key] extends object
      ? Mutable<T[Key]>
      : T[Key];
};

function mutableGeometry(code: string): Mutable<TouchlineFormationGeometry> {
  return structuredClone(resolveTouchlineFormationGeometry(code)) as Mutable<TouchlineFormationGeometry>;
}

test("every supported formation has eleven named, collision-free slots at all required viewports", () => {
  assert.deepEqual(TOUCHLINE_CALIBRATED_FORMATION_CODES, [
    "4-3-3", "4-4-2", "4-2-3-1", "4-1-4-1", "4-5-1", "3-4-3",
    "3-5-2", "3-4-2-1", "5-2-3", "5-3-2", "5-4-1",
  ]);

  for (const code of TOUCHLINE_CALIBRATED_FORMATION_CODES) {
    const geometry = resolveTouchlineFormationGeometry(code);
    const validation = validateTouchlineFormationGeometry(geometry);
    assert.equal(geometry.slots.length, 11, `${code} must contain eleven slots`);
    assert.equal(new Set(geometry.slots.map((slot) => slot.id)).size, 11, `${code} slot names must be unique`);
    assert.equal(validation.publishable, true, `${code}: ${validation.issues.map((issue) => issue.message).join("; ")}`);
    assert.deepEqual(validation.checkedViewports, ["1920x1080", "1440x900", "1280x720", "1024x768", "844x390"]);
  }
});

test("the calibrated 4-2-3-1 keeps tactical identities rather than generic rows", () => {
  const geometry = resolveTouchlineFormationGeometry("4-2-3-1");
  assert.deepEqual(geometry.slots.map((slot) => slot.id), [
    "GK", "RB", "RCB", "LCB", "LB", "RDM", "LDM", "RAM", "CAM", "LAM", "ST",
  ]);
  assert.equal(geometry.slots.find((slot) => slot.id === "GK")?.side, "centre");
  assert.equal(geometry.slots.find((slot) => slot.id === "GK")?.x, 10);
  assert.equal(geometry.slots.find((slot) => slot.id === "ST")?.x, 88);
  assert.deepEqual(geometry.slots.find((slot) => slot.id === "RB")?.allowedPositions, ["right-back"]);
  assert.deepEqual(geometry.slots.find((slot) => slot.id === "CAM")?.allowedPositions, ["midfield", "attacker"]);
});

test("validation blocks collisions, field exits, duplicate names and invalid role capacity", () => {
  const collision = mutableGeometry("4-3-3");
  collision.slots[1] = { ...collision.slots[1]!, x: collision.slots[2]!.x, y: collision.slots[2]!.y };
  assert.ok(validateTouchlineFormationGeometry(collision).issues.some((issue) => issue.code === "card-collision"));

  const outside = mutableGeometry("4-3-3");
  outside.slots[0] = { ...outside.slots[0]!, x: 0 };
  assert.ok(validateTouchlineFormationGeometry(outside).issues.some((issue) => issue.code === "card-out-of-field"));

  const duplicate = mutableGeometry("4-3-3");
  duplicate.slots[1] = { ...duplicate.slots[1]!, id: duplicate.slots[2]!.id };
  assert.ok(validateTouchlineFormationGeometry(duplicate).issues.some((issue) => issue.code === "slot-duplicate"));

  const capacity = mutableGeometry("4-3-3");
  capacity.slots[1] = { ...capacity.slots[1]!, role: "midfielder" };
  assert.ok(validateTouchlineFormationGeometry(capacity).issues.some((issue) => issue.code === "role-capacity"));
});

test("only valid published versions override code defaults and unknown formations fail safe to 4-3-3", () => {
  const candidate = mutableGeometry("4-4-2");
  candidate.geometryVersion = 7;
  candidate.source = "qa-published";
  candidate.publishedAt = "2026-08-23T10:00:00.000Z";
  candidate.slots[0] = { ...candidate.slots[0]!, x: 9 };
  const parsed = parseTouchlineFormationGeometry(touchlineFormationGeometryPayload(candidate), {
    formationCode: "4-4-2",
    geometryVersion: 7,
    source: "qa-published",
    publishedAt: candidate.publishedAt,
  });
  assert.ok(parsed);
  const registry = mergeTouchlineFormationGeometryRegistry([parsed]);
  assert.equal(registry["4-4-2"]?.geometryVersion, 7);
  assert.equal(registry["4-4-2"]?.slots[0]?.x, 9);
  assert.equal(resolveTouchlineFormationGeometry("unknown", registry), registry["4-3-3"]);

  const invalid = mutableGeometry("4-3-3");
  invalid.geometryVersion = 9;
  invalid.slots[0] = { ...invalid.slots[0]!, x: 0 };
  assert.equal(mergeTouchlineFormationGeometryRegistry([invalid])["4-3-3"]?.geometryVersion, 0);
});

test("tactical eligibility distinguishes full-backs, centre-backs and goalkeeper", () => {
  const slots = resolveTouchlineFormationGeometry("4-3-3").slots;
  assert.equal(isTouchlineTacticalSlotCandidateEligible({ position: "RB", role: "defender" }, slots.find((slot) => slot.id === "RB")!), true);
  assert.equal(isTouchlineTacticalSlotCandidateEligible({ position: "CB", role: "defender" }, slots.find((slot) => slot.id === "RB")!), false);
  assert.equal(isTouchlineTacticalSlotCandidateEligible({ position: "GK", role: "goalkeeper" }, slots.find((slot) => slot.id === "GK")!), true);
  assert.equal(isTouchlineTacticalSlotCandidateEligible({ position: "ST", role: "forward" }, slots.find((slot) => slot.id === "GK")!), false);
});

test("one formation registry is reusable by all twenty clubs without club-specific geometry", () => {
  assert.equal(TOUCHLINE_ENGLAND_CLUBS.length, 20);
  const reference = resolveTouchlineFormationGeometry("4-3-3", TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY);
  for (const club of TOUCHLINE_ENGLAND_CLUBS) {
    assert.equal(resolveTouchlineFormationGeometry("4-3-3", TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY), reference, club.name);
  }
  assert.ok(Object.keys(TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY).every((key) => /^\d(?:-\d){2,3}$/.test(key)));
});

test("Arena field and camera calibration remain independent from the 2D registry", () => {
  assert.match(arenaClient, /Market\/Club Construction only; the Arena field keeps its independent camera calibration/);
  assert.match(arenaClient, /Squad management uses a flat tactical board/);
  assert.match(arenaClient, /const fieldPlayerPositions = new Map\(lockedCameraPositions \?\? canonical433VideoPositions \?\? projectedFieldPlayerPositions\)/);
  assert.doesNotMatch(arenaClient, /arenaSlotsForFormation\([^)]*initialTwoDimensionalFormationRegistry/);
  assert.doesNotMatch(arenaClient, /fieldPlayerPositions[^;]*initialTwoDimensionalFormationRegistry/);
  assert.match(arenaClient, /geometryRegistry=\{initialTwoDimensionalFormationRegistry\}/);
});

test("QA migration is fenced, versioned, service-role only and rolls back as a new version", () => {
  assert.match(migration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all privileges on table public\.touchline_formation_geometry_versions from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update on table public\.touchline_formation_geometry_versions to service_role/);
  assert.match(migration, /security definer[\s\S]*?set search_path = ''/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /touchline_rollback_formation_geometry[\s\S]*?touchline_publish_formation_geometry/);
  assert.match(migration, /Arena camera calibration is explicitly out of scope/);
  assert.equal((migration.match(/^\s*\('\d(?:-\d){2,3}', array/gm) ?? []).length, 11);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete).*authenticated/i);
});

test("QA field-depth correction creates a new 2D version without touching Arena calibration", () => {
  assert.match(fieldDepthMigration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(fieldDepthMigration, /Line-up, Market and[\s\S]*?Training Center/);
  assert.match(fieldDepthMigration, /Arena field\/camera geometry is independent/);
  assert.match(fieldDepthMigration, /role' = 'goalkeeper'[\s\S]*?then 10::numeric/);
  assert.match(fieldDepthMigration, /role' = 'forward'[\s\S]*?then 88::numeric/);
  assert.match(fieldDepthMigration, /touchline_publish_formation_geometry/);
  assert.match(fieldDepthMigration, /QA 2D field-depth calibration; Arena untouched/);
  assert.doesNotMatch(fieldDepthMigration, /update\s+public\.touchline_formation_geometry_versions[\s\S]*?set\s+geometry/i);
});

test("Admin calibration uses owner RBAC, same-origin writes, validation and explicit preview/save", () => {
  assert.match(adminRoute, /hasTouchLineArenaAccess\(user\)/);
  assert.match(adminRoute, /isOwnerEmail\(user\.email\)/);
  assert.match(adminRoute, /fetchSite === "same-origin"/);
  assert.match(adminRoute, /validateTouchlineFormationGeometry\(geometry\)/);
  assert.match(adminRoute, /cache-control", "private, no-store"/);
  assert.doesNotMatch(adminRoute, /error\?\.message/);
  assert.match(adminStudio, /Draft → Preview → Save & Validate/);
  assert.match(adminStudio, /Nothing is auto-saved/);
  assert.match(adminStudio, /Rollback as new version/);
  assert.doesNotMatch(adminStudio, /localStorage|sessionStorage/);
});
