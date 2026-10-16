import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { chromium, webkit } from "@playwright/test";
import { verifiedTimestampLabel } from "../lib/touchlineArena/verified-timestamp-label.ts";
import { arabicFixtureDate } from "../lib/touchlineArena/arabic-fixture-date.ts";

test("verified timestamp preserves the exact instant, timezone and missing state", () => {
  assert.equal(verifiedTimestampLabel("2026-09-30T19:07:00Z", "UTC"), "2026-09-30 19:07");
  assert.equal(verifiedTimestampLabel("2026-09-30T19:07:00Z", "Europe/Malta"), "2026-09-30 21:07");
  assert.equal(verifiedTimestampLabel("2026-10-01T00:00:00Z", "UTC"), "2026-10-01 00:00");
  assert.equal(verifiedTimestampLabel("not a timestamp", "UTC"), "—");
});

test("Arabic weekday, long-date grammar and hour policy match Node in both browser engines", async () => {
  const source = ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/arabic-fixture-date.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const cases: Intl.DateTimeFormatOptions[] = [
    { weekday: "short" },
    { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false },
    { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" },
  ];
  assert.equal(arabicFixtureDate("2026-10-17T11:30:00Z", "UTC", cases[0]), "السبت");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      await page.addScriptTag({ content: `window.arabicFixtureDate = (() => {const exports={}; const require=()=>({verifiedTimestampLabel:${verifiedTimestampLabel.toString()}}); ${source}; return exports.arabicFixtureDate;})();` });
      for (const options of cases) for (const zone of ["UTC", "Europe/Malta", "America/Sao_Paulo"]) {
        const input = { value: "2026-10-17T11:30:00Z", zone, options };
        const actual = await page.evaluate(({ value, zone, options }) => (
          window as unknown as { arabicFixtureDate(value: string, zone: string, options: Intl.DateTimeFormatOptions): string }
        ).arabicFixtureDate(value, zone, options), input);
        assert.equal(actual, arabicFixtureDate(input.value, zone, options), engine.name());
      }
    } finally { await browser.close(); }
  }
});

test("Node SSR and Chromium/WebKit produce identical verified timestamp text", async () => {
  const cases = [
    ["2026-09-30T19:07:00Z", "UTC"],
    ["2026-10-01T00:00:00Z", "UTC"],
    ["2026-10-25T01:30:00Z", "Europe/Malta"],
    ["2026-01-01T01:00:00Z", "America/Sao_Paulo"],
  ];
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      await page.addScriptTag({ content: `window.verifiedTimestampLabel = ${verifiedTimestampLabel.toString()};` });
      for (const [instant, zone] of cases) {
        const actual = await page.evaluate(([value, timeZone]) => (
          window as unknown as { verifiedTimestampLabel(value: string, zone: string): string }
        ).verifiedTimestampLabel(value, timeZone), [instant, zone]);
        assert.equal(actual, verifiedTimestampLabel(instant, zone), `${engine.name()}: ${instant}/${zone}`);
      }
    } finally { await browser.close(); }
  }
});
