import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const controlFile = new URL("../components/admin-football-data-sync-controls.tsx", import.meta.url);

test("owner sync control is bounded to the verified opening-round schedule", async () => {
  const source = await readFile(controlFile, "utf8");

  assert.match(source, /scope: "fixture_schedule"/);
  assert.match(source, /competitionId: "8"/);
  assert.match(source, /fromDate: "2026-08-21"/);
  assert.match(source, /throughDate: "2026-08-24"/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /credentials: "same-origin"/);
  assert.match(source, /no fixture is deleted/i);
});
