import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/touchline-tables/page.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("../app/touchline-tables/touchline-tables-client.tsx", import.meta.url), "utf8");

test("Top 11 never turns a simulated preseason ranking into an official selection", () => {
  assert.match(page, /loadTouchLinePublishedTopEleven/);
  assert.doesNotMatch(page, /source:\s*"simulation"/);
  assert.match(client, /seasonSelectionPending/);
  assert.match(client, /publishedTopEleven\?\.slots/);
});
