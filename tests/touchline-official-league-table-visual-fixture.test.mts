import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("initial official-table visual fixture stays local, static and presentation-only", () => {
  const source = readFileSync(
    new URL("../app/visual-qa/official-league-table-initial/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /data-official-league-table-fixture="initial-static"/);
  assert.match(source, /resolveTouchlineOfficialLeagueTable/);
  assert.match(source, /TouchlineOfficialLeagueTable/);
  assert.match(source, /const FIXTURE_CLUBS: readonly \[string, string, string\]\[\] = \[/);
  assert.equal((source.match(/\["\d+", ".+?", ".+?"\]/g) ?? []).length, 20);
  assert.match(source, /fixtures: \[\]/);
  assert.match(source, /viewport === "mobile"/);
  assert.match(source, /resolveTouchlineVisualQaLocale/);
  assert.match(source, /data-visual-qa-locale=\{locale\}/);
  assert.match(source, /locale=\{locale\}/);
  assert.match(source, /Tabela oficial inicial da liga/);
  assert.match(source, /viewport=mobile&lang=\$\{locale\}/);
  assert.doesNotMatch(source, /\bfetch\(/);
  assert.doesNotMatch(source, /create(?:Admin)?Client|supabase|market-value|card-ranking|wallet/i);
});
