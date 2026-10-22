import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getAllocationDialogCopy } from "../lib/touchlineFantasy/allocation-dialog-i18n.ts";

// This is the caption composition in the mounted placement consumer, not an
// assertion that the dialog was rendered or a player was moved.
function caption(locale: string, name: string, enabled = true) {
  const copy = getAllocationDialogCopy(locale, enabled);
  return `${copy.startAt} RW · ${copy.replacing} ${name}`;
}

test("Turkish placement uses a noun label before the displaced player name", () => {
  assert.equal(caption("tr-TR", "Mohamed Salah"), "Oynatılacağı pozisyon RW · Yerini alacağı oyuncu: Mohamed Salah");
  assert.equal(caption("tr-TR", "$& Salah"), "Oynatılacağı pozisyon RW · Yerini alacağı oyuncu: $& Salah");
});

test("published Portuguese and English placement captions and closed gate stay unchanged", () => {
  assert.equal(caption("pt-BR", "Mohamed Salah"), "Escalar em RW · no lugar de Mohamed Salah");
  assert.equal(caption("en-GB", "Mohamed Salah"), "Start at RW · replacing Mohamed Salah");
  assert.equal(caption("tr-TR", "Mohamed Salah", false), "Start at RW · replacing Mohamed Salah");
});

test("placement consumer still prefixes the displaced player with the catalogue label", () => {
  const source = readFileSync(new URL("../components/touchline/fantasy/ClubOwnerCollectionSlots.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("${copy.replacing} ${name(option.displacedPlayerId)}"));
});
