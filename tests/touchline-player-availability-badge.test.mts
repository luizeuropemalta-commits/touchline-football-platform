import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  availabilityBadgeForPlayer,
  confirmedAvailabilityFromSidelined,
  playerAvailabilityBadgeLabel,
  resolvePlayerAvailabilityBadge,
  type ConfirmedPlayerAvailability,
} from "../lib/touchlineArena/player-availability-badge.ts";

const fixtureId = "fixture-100";
const playerId = "player-200";
const evidence: ConfirmedPlayerAvailability = {
  source: "sportmonks", fixtureId, playerId, confirmed: true, reason: "injury",
  estimatedReturnDate: "2026-10-30",
};

test("all four original card assets are project-local transparent PNGs of equal display size", () => {
  for (const reason of ["injury", "five-yellows", "ten-yellows", "red-card"] as const) {
    const badge = resolvePlayerAvailabilityBadge({ ...evidence, reason }, fixtureId, playerId);
    assert.ok(badge);
    assert.deepEqual([badge.width, badge.height], [48, 48]);
    assert.ok(existsSync(resolve(process.cwd(), "public", badge.asset.slice(1))));
  }
});

test("badges fail closed without exact confirmed provider and fixture/player identity", () => {
  assert.equal(resolvePlayerAvailabilityBadge(null, fixtureId, playerId), null);
  assert.equal(resolvePlayerAvailabilityBadge(evidence, "another-fixture", playerId), null);
  assert.equal(resolvePlayerAvailabilityBadge(evidence, fixtureId, "another-player"), null);
  assert.equal(resolvePlayerAvailabilityBadge({ ...evidence, confirmed: false } as unknown as ConfirmedPlayerAvailability, fixtureId, playerId), null);
  assert.equal(resolvePlayerAvailabilityBadge({ ...evidence, source: "unknown" } as unknown as ConfirmedPlayerAvailability, fixtureId, playerId), null);
  assert.equal(resolvePlayerAvailabilityBadge({ ...evidence, reason: "maybe" } as unknown as ConfirmedPlayerAvailability, fixtureId, playerId), null);
});

test("only active injury records from this fixture become confirmed badges; generic suspension stays unclassified", () => {
  const item = { id: "sidelined-1", providerId: "1", provider: "sportmonks" as const,
    fixtureId, playerId, category: "injury", completed: false };
  assert.deepEqual(confirmedAvailabilityFromSidelined(item, fixtureId, playerId),
    { source: "sportmonks", fixtureId, playerId, confirmed: true, reason: "injury" });
  assert.deepEqual(confirmedAvailabilityFromSidelined({ ...item, category: "illness" }, fixtureId, playerId),
    { source: "sportmonks", fixtureId, playerId, confirmed: true, reason: "illness" });
  assert.equal(confirmedAvailabilityFromSidelined({ ...item, completed: true }, fixtureId, playerId), null);
  assert.equal(confirmedAvailabilityFromSidelined({ ...item, category: "suspension" }, fixtureId, playerId), null);
  assert.equal(confirmedAvailabilityFromSidelined({ ...item, category: "suspension", reason: "Suspension after 5 yellow cards" }, fixtureId, playerId)?.reason, "five-yellows");
  assert.equal(confirmedAvailabilityFromSidelined({ ...item, category: "suspension", typeName: "10 yellow cards" }, fixtureId, playerId)?.reason, "ten-yellows");
  assert.equal(confirmedAvailabilityFromSidelined({ ...item, category: "suspension", typeName: "Red card suspension" }, fixtureId, playerId)?.reason, "red-card");
  assert.equal(confirmedAvailabilityFromSidelined({ ...item, category: "suspension", reason: "Disciplinary ban" }, fixtureId, playerId), null);
  assert.equal(confirmedAvailabilityFromSidelined({ ...item, category: "injury", completed: undefined }, fixtureId, playerId), null);
  assert.equal(confirmedAvailabilityFromSidelined(item, "other-fixture", playerId), null);
  assert.equal(availabilityBadgeForPlayer([item], fixtureId, playerId)?.reason, "injury");
  assert.equal(availabilityBadgeForPlayer([item], null, playerId), null);
});

test("provider return date is optional and never inferred", () => {
  assert.equal(resolvePlayerAvailabilityBadge({ ...evidence, estimatedReturnDate: null }, fixtureId, playerId)?.estimatedReturnDate, null);
  assert.equal(resolvePlayerAvailabilityBadge({ ...evidence, estimatedReturnDate: "soon" }, fixtureId, playerId)?.estimatedReturnDate, null);
  assert.equal(resolvePlayerAvailabilityBadge({ ...evidence, estimatedReturnDate: "2026-02-31" }, fixtureId, playerId)?.estimatedReturnDate, null);
  assert.equal(resolvePlayerAvailabilityBadge(evidence, fixtureId, playerId)?.estimatedReturnDate, "2026-10-30");
});

test("conflicting or duplicate absence records never choose a badge by array order", () => {
  const active = { id: "sidelined-1", providerId: "1", provider: "sportmonks" as const,
    fixtureId, playerId, category: "injury", completed: false };
  for (const other of [
    { ...active },
    { ...active, id: "sidelined-2", providerId: "2", completed: true },
    { ...active, category: "suspension", typeName: "Red card suspension" },
    { ...active, completed: undefined },
    { ...active, fixtureId: "wrong-fixture" },
  ]) {
    assert.equal(availabilityBadgeForPlayer([active, other], fixtureId, playerId), null);
    assert.equal(availabilityBadgeForPlayer([other, active], fixtureId, playerId), null);
  }
  assert.equal(availabilityBadgeForPlayer([active], fixtureId, playerId)?.reason, "injury");
  assert.equal(availabilityBadgeForPlayer([{ ...active, completed: true }], fixtureId, playerId), null);
  assert.equal(availabilityBadgeForPlayer([], fixtureId, playerId), null);
  assert.equal(availabilityBadgeForPlayer([active, { ...active, playerId: "other-player" }], fixtureId, playerId)?.reason, "injury");
});

test("malformed or incomplete absence evidence cannot throw or invent an active injury", () => {
  const item = { id: "sidelined-1", providerId: "1", provider: "sportmonks" as const,
    fixtureId, playerId, category: "injury", completed: false };
  for (const key of ["category", "reason", "typeName"] as const) {
    const malformed = { ...item, [key]: 123 } as unknown as typeof item;
    assert.equal(availabilityBadgeForPlayer([malformed], fixtureId, playerId), null);
  }
  const nonTarget = null as unknown as typeof item;
  assert.equal(availabilityBadgeForPlayer([nonTarget, item], fixtureId, playerId)?.reason, "injury");
  assert.equal(availabilityBadgeForPlayer([item, nonTarget], fixtureId, playerId)?.reason, "injury");
  assert.equal(availabilityBadgeForPlayer([nonTarget], fixtureId, playerId), null);
  assert.equal(availabilityBadgeForPlayer([{ ...item, category: undefined, completed: undefined, typeName: "Hamstring Injury" }], fixtureId, playerId), null);
});

test("a sidelined end date is not silently reclassified as a return estimate", () => {
  // Sportmonks documents end_date as the end of the sidelined period,
  // not a dedicated expected-return field. Keep the source distinction.
  const item = { id: "sidelined-1", providerId: "1", provider: "sportmonks" as const,
    fixtureId, playerId, category: "injury", completed: false, endDate: "2026-10-30" };
  const badge = availabilityBadgeForPlayer([item], fixtureId, playerId);
  assert.ok(badge);
  assert.equal(badge.estimatedReturnDate, null);
  assert.equal(playerAvailabilityBadgeLabel(badge, "pt-BR"), "Lesionado — fora desta partida");
  assert.equal(availabilityBadgeForPlayer([{ ...item, completed: true }], fixtureId, playerId), null);
});

test("confirmed labels are present in all eight public languages", () => {
  const badge = resolvePlayerAvailabilityBadge(evidence, fixtureId, playerId);
  assert.ok(badge);
  for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const) {
    const label = playerAvailabilityBadgeLabel(badge, locale);
    assert.ok(label.length > 20, locale);
    assert.ok(label.includes("2026") || label.includes("٢٠٢٦"), locale);
  }
});
