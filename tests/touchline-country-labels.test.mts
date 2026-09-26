import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { localizedCountryLabel } from "../lib/touchlineArena/country-labels.ts";
import { TOUCHLINE_LIVE_COACHES } from "../lib/touchlineArena/live-coaches.ts";

test("all current coach nationalities have Portuguese presentation without changing English identity", () => {
  const expected: Record<string, string> = {
    Spain: "Espanha", Germany: "Alemanha", France: "França", Italy: "Itália", England: "Inglaterra",
    Scotland: "Escócia", Austria: "Áustria", "United States": "Estados Unidos",
    "Republic of Ireland": "República da Irlanda", "Bosnia and Herzegovina": "Bósnia e Herzegovina",
  };
  for (const { coach } of TOUCHLINE_LIVE_COACHES) {
    assert.ok(coach.nationality && expected[coach.nationality], coach.displayName);
    assert.equal(localizedCountryLabel(coach.nationality, "pt-BR"), expected[coach.nationality!]);
    assert.equal(localizedCountryLabel(coach.nationality, "en-GB"), coach.nationality);
  }
});
test("normalisation preserves earlier player labels and leaves absent or unknown evidence unchanged", () => {
  assert.equal(localizedCountryLabel(" UNITED_STATES ", "pt-BR"), "Estados Unidos");
  assert.equal(localizedCountryLabel("France", "pt-BR"), "França");
  for (const value of [null, undefined, "", "Unverified country", "ESP"]) {
    assert.equal(localizedCountryLabel(value, "pt-BR"), value);
  }
});
test("player profile, coach profile and coach zoom share the same display translator", () => {
  for (const path of ["app/touchline-players/[player]/page.tsx", "app/touchline-coaches/[coach]/page.tsx", "components/touchline/cards/TouchlineCoachCardZoom.tsx"]) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, /import \{ localizedCountryLabel \} from "@\/lib\/touchlineArena\/country-labels"/);
    assert.match(source, /localizedCountryLabel\(/);
  }
});
