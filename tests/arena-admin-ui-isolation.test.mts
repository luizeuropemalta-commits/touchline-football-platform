import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ADMIN_ROUTES = [
  "../app/(app)/admin/page.tsx",
  "../app/(app)/admin/analytics/page.tsx",
  "../app/(app)/admin/cards/page.tsx",
  "../app/(app)/admin/finance/page.tsx",
  "../app/(app)/admin/football-data/page.tsx",
  "../app/(app)/admin/promotions/page.tsx",
];

const [arenaAdminUiSource, ...adminRouteSources] = await Promise.all([
  readFile(new URL("../components/arena-admin-ui.tsx", import.meta.url), "utf8"),
  ...ADMIN_ROUTES.map((path) => readFile(new URL(path, import.meta.url), "utf8")),
]);

test("official admin routes use the neutral Arena UI boundary", () => {
  adminRouteSources.forEach((source, index) => {
    assert.match(
      source,
      /from ["']@\/components\/arena-admin-ui["']/,
      `${ADMIN_ROUTES[index]} must use arena-admin-ui`,
    );
    assert.doesNotMatch(
      source,
      /from ["']@\/components\/game-ui["']/,
      `${ADMIN_ROUTES[index]} must not import the professional game-ui`,
    );
  });
});

test("Arena admin UI exposes only the three primitives required by official routes", () => {
  assert.match(arenaAdminUiSource, /export function GamePanel/);
  assert.match(arenaAdminUiSource, /export function StatTile/);
  assert.match(arenaAdminUiSource, /export function LivePill/);

  assert.doesNotMatch(arenaAdminUiSource, /touchline-card-engine|TouchlinePlayerCard|lib\/billing|lib\/server\/workspace/);
  assert.doesNotMatch(arenaAdminUiSource, /export function (Meter|PlayerGameCard|SectionHeader)/);
});

test("neutral primitives preserve the existing admin visual class contract", () => {
  assert.match(arenaAdminUiSource, /glass console-panel rounded-3xl/);
  assert.match(arenaAdminUiSource, /glass glass-hover console-hud group rounded-2xl p-4/);
  assert.match(arenaAdminUiSource, /number-glow font-display text-\[28px\] leading-none/);
  assert.match(arenaAdminUiSource, /pulse-live size-1\.5 rounded-full bg-\[#a3ff12\]/);
});
