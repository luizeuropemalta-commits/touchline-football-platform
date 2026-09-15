import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("the Haaland approved portrait exception resolves to an existing public asset", async () => {
  const route = await readFile(new URL("../app/api/players/search-and-build-card/route.ts", import.meta.url), "utf8");
  const expected = "/touchlineArena/players/haaland/man-city/v1/approved/card_portrait_transparent.png";
  assert.match(route, new RegExp(expected.replaceAll("/", "\\/")));
  assert.doesNotMatch(route.slice(route.indexOf("if (playerSlugs[0] === \"erling-haaland\""), route.indexOf("// Do not probe")), /cards\/portrait/);
  await access(new URL(`../public${expected}`, import.meta.url));
});
