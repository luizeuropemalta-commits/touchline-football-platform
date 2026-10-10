import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url), "utf8");

test("repeated current-club labels preserve contrast without individual backdrop surfaces", () => {
  const label = source.indexOf("{cardLabels.currentClub}");
  assert.ok(label > 0, "the shared localized label remains present");
  const span = source.slice(source.lastIndexOf("<span", label), label);
  assert.doesNotMatch(span, /backdropFilter|WebkitBackdropFilter/, "each repeated label must not sample and blur the page behind its card");
  assert.match(span, /background: "linear-gradient\(180deg, rgba\(15,20,23,\.58\), rgba\(2,5,8,\.76\)\)"/);
  assert.match(span, /border: "1px solid rgba\(255,255,255,\.10\)"/);
  assert.match(span, /color: "#fff"/);
  assert.match(span, /textShadow:/);
  assert.match(span, /boxShadow:/);
  assert.match(span, /pointerEvents: "none"/);
});
