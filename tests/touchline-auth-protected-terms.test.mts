import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getTouchLineAuthCopy } from "../lib/touchlineArena/auth-i18n.ts";

test("auth drafts use ClubOwner and consistent Spanish tarjeta terminology", () => {
  for (const locale of ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    const copy = getTouchLineAuthCopy(locale, true);
    assert.match(copy.layout.features[2], /ClubOwner/);
    assert.doesNotMatch(JSON.stringify(copy), /Market Transfer/);
    assert.deepEqual(getTouchLineAuthCopy(locale), getTouchLineAuthCopy("en-GB"));
  }
  const es = getTouchLineAuthCopy("es-ES", true).layout;
  assert.equal(es.cardLabel, "Tarjetas");
  assert.equal(es.asideTitleTop, "Abre tarjetas.");
  assert.equal(es.features[0], "Tarjetas premium de jugadores");
  assert.doesNotMatch(JSON.stringify(es), /\bcartas\b/i);
  assert.equal(getTouchLineAuthCopy("it-IT", true).layout.cardLabel, "Carte");
});

test("the wide auth aside consumes the corrected real catalogue fields", () => {
  const source = readFileSync(new URL("../components/auth-layout.tsx", import.meta.url), "utf8");
  const aside = source.slice(source.indexOf("<aside"), source.indexOf("</aside>") + 8);
  assert.match(aside, /2xl:block/);
  assert.match(aside, /copy\.asideTitleTop/);
  assert.match(aside, /copy\.features\.map/);
  assert.match(source, /const presentationLocalesEnabled = draftLocalesEnabled \|\| siteLocalesEnabled/);
  assert.match(source, /presentationLocalesEnabled \? getTouchLineLoginCopy\(normalizedLocale\)/);
});
