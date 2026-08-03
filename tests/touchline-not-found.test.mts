import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/not-found.tsx", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../components/touchline/TouchlineNotFound.tsx", import.meta.url), "utf8");

test("the global not-found boundary uses the TouchLine safe navigation surface", () => {
  assert.match(page, /<Suspense fallback=\{null\}>/);
  assert.match(page, /<TouchlineNotFound/);
  assert.match(renderer, /useSearchParams\(\)/);
  assert.match(renderer, /normalizeTouchLineLocale\(searchParams\.get\("lang"\)\)/);
  assert.match(renderer, /touchlineArenaHref\(locale\)/);
  assert.match(renderer, /touchlineClubHubHref\(locale\)/);
  assert.match(renderer, /Nenhum dado do seu clube foi alterado/);
  assert.match(renderer, /No club data was changed/);
});
