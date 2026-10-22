import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("profile title has a thin green underline bounded by its text, not the panel", () => {
  const css = readFileSync(new URL("../components/touchline/ClubOwnerMarketHeader.module.css", import.meta.url), "utf8");
  const rule = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    assert.notEqual(start, -1);
    return css.slice(start, css.indexOf("}", start));
  };
  assert.doesNotMatch(rule(".title"), /border-bottom/);
  assert.match(rule(".title"), /padding-bottom: 22px/);
  assert.match(rule(".title h1"), /position: relative/);
  const underline = rule(".title h1::after");
  assert.match(underline, /inset-inline: 0/);
  assert.match(underline, /height: 1px/);
  assert.match(underline, /background: #a3ff12/);
  assert.match(underline, /pointer-events: none/);
  assert.doesNotMatch(underline, /animation:/);
});
