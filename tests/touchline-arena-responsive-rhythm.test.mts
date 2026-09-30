import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shared controls retain viewport sizing and a minimum touch target", () => {
  const globals = read("app/globals.css");
  assert.match(globals, /--touchline-ui-unit: clamp\(\.75rem, min\(1\.25vw, 2\.1dvh\), 1\.5rem\)/);
  assert.match(globals, /--touchline-control-size: max\(2\.75rem,/);
});
