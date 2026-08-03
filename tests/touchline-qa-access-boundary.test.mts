import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const eventsRoute = await readFile(
  new URL("../app/api/football-data/fantasy/events/route.ts", import.meta.url),
  "utf8",
);

test("the live fantasy-event QA endpoint requires owner access outside local development", () => {
  assert.match(eventsRoute, /requireOwnerOrLocalTouchlineEditor\(request\)/);
  assert.ok(
    eventsRoute.indexOf("requireOwnerOrLocalTouchlineEditor(request)") <
      eventsRoute.indexOf('createFootballDataProvider("sportmonks")'),
  );
});
