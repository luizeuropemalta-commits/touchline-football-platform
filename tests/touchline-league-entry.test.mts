import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { TOUCHLINE_AVAILABLE_LEAGUES, touchlineLeagueEntryHref } from "../lib/touchlineArena/league-entry.ts";

test("global entry offers only the implemented league and preserves language without changing identity", () => {
  assert.deepEqual(TOUCHLINE_AVAILABLE_LEAGUES.map(x => x.key), ["touchline-england"]);
  assert.equal(TOUCHLINE_AVAILABLE_LEAGUES[0].name, "TouchLine England 2026/27");
  for (const locale of ["pt-BR", "en-GB"]) {
    assert.equal(touchlineLeagueEntryHref("touchline-england", locale), `/market-transfer?lang=${locale}`);
  }
  for (const key of ["", "touchline-spain", "https://outside.test", "../admin"]) {
    assert.equal(touchlineLeagueEntryHref(key, "pt-BR"), null);
  }
});

test("auth entry exposes accessible league navigation without account writes or fictitious options", () => {
  const picker = readFileSync(new URL("../components/auth-league-picker.tsx", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../components/auth-layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /<AuthLeaguePicker locale=\{normalizedLocale\}/);
  assert.match(picker, /<summary/);
  assert.match(picker, /aria-label=\{pt \? "Ligas disponíveis"/);
  assert.match(picker, /prefetch=\{false\}/);
  assert.doesNotMatch(picker, /fetch\(|localStorage|document\.cookie|supabase/);
});
