import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("profile layout does not override nested performance panels and statistic grids", () => {
  const source = readFileSync(new URL("../app/touchline-coaches/[coach]/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.coach-profile-grid (?:article|dl|h2|p)(?:\s|\{|,)/);
  assert.doesNotMatch(source, /\.coach-profile-page (?:dt|dd)\s*\{/);
  assert.match(source, /\.coach-profile-grid > article\s*\{/);
  assert.match(source, /\.coach-profile-grid > article > dl\s*\{/);
  const performance = readFileSync(new URL("../components/touchline/cards/TouchlineCoachPerformance.module.css", import.meta.url), "utf8");
  assert.match(performance, /\.recordStats\s*\{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
});
