import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { touchlinePlayerAppearanceLabel, touchlinePlayerDataSourceLabel } from "../lib/touchlineArena/player-appearance-presentation.ts";

test("legacy inferred absence never claims available lineup evidence in either locale", () => {
  assert.equal(touchlinePlayerAppearanceLabel("absent", "pt-BR"), "Participação não confirmada");
  assert.equal(touchlinePlayerAppearanceLabel("absent", "en"), "Participation unconfirmed");
});

test("known participation and unavailable values preserve their meanings", () => {
  for (const [locale, expected] of [
    ["pt-BR", ["Titular", "Substituto", "Não utilizado", "Indisponível"]],
    ["en", ["Started", "Substitute", "Unused", "Unavailable"]],
  ] as const) {
    assert.deepEqual(["started", "substitute", "unused", "unavailable"].map(status =>
      touchlinePlayerAppearanceLabel(status as "started" | "substitute" | "unused" | "unavailable", locale)), expected);
    assert.equal(touchlinePlayerAppearanceLabel(null, locale), expected[3]);
    assert.equal(touchlinePlayerAppearanceLabel(undefined, locale), expected[3]);
  }
});

test("source attribution qualifies match coverage instead of certifying every status", () => {
  assert.equal(touchlinePlayerDataSourceLabel("pt-BR"), "Fonte: Sportmonks · cobertura por partida");
  assert.equal(touchlinePlayerDataSourceLabel("en"), "Source: Sportmonks · coverage varies by match");
});

test("profile and zoom do not certify inferred absence or universally verified data", async () => {
  const source = await readFile(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /absent:\s*"(?:Ausente|Absent)"/);
  assert.doesNotMatch(source, /providerVerified:\s*"(?:Verified by TouchLine|Verificado pela TouchLine)"/);
  assert.match(source, /return touchlinePlayerAppearanceLabel\(value, locale\)/);
  assert.match(source, /const appearance = touchlinePlayerAppearanceLabel\(fixture.appearanceStatus, locale\)/);
  assert.match(source, /touchlinePlayerDataSourceLabel\(locale\)/);
  assert.match(source, /Unconfirmed participation does not establish an absence or its reason/);
  assert.match(source, /Participação não confirmada não comprova ausência nem seu motivo/);
});
