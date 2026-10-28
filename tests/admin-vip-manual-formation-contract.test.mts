import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const pages = {
  vip: readFileSync("app/(app)/admin/vip-access/page.tsx", "utf8"),
  manual: readFileSync("app/(app)/admin/manual-card-editorial/page.tsx", "utf8"),
  formation: readFileSync("app/(app)/admin/formation-calibration/page.tsx", "utf8"),
};

test("VIP/manual/formation keep OWNER denial and protected server gates", () => {
  for (const source of Object.values(pages)) {
    assert.match(source, /isOwnerEmail/);
    assert.match(source, /notFound\(\)/);
  }
  assert.match(pages.vip, /hasTouchLineArenaAccess/);
  assert.match(pages.manual, /createAdminClient/);
  assert.match(pages.formation, /resolveServerReadWithin/);
});

test("VIP and manual pages expose localized empty/error states without private errors", () => {
  assert.match(pages.vip, /A configuração protegida está indisponível/);
  assert.match(pages.vip, /Protected configuration is unavailable/);
  assert.match(pages.manual, /Nenhuma alteração foi feita/);
  assert.match(pages.manual, /No changes were made/);
  assert.match(pages.manual, /temporarily unavailable|temporariamente indisponível/);
});

test("manual editorial delegates actions to protected components and formation preserves registry/history", () => {
  assert.match(pages.manual, /ManualCardEditorialEditor/);
  assert.match(pages.manual, /ManualCardEditorialBulkPreview/);
  assert.match(pages.manual, /ManualCardEditorialHistory/);
  assert.match(pages.formation, /readTouchlineFormationGeometryRegistry/);
  assert.match(pages.formation, /readTouchlineFormationGeometryHistory/);
  assert.match(pages.formation, /registry=\{registry\}/);
  assert.match(pages.formation, /history=\{history\}/);
});
