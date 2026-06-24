import test from "node:test";
import assert from "node:assert/strict";
import {
  extractTransfermarktEntityId,
  parseTransfermarktEntityUrl,
  transfermarktDedupeKey,
} from "../lib/market-link-parser.ts";

test("extracts Transfermarkt player ID from profile URL", () => {
  assert.equal(
    extractTransfermarktEntityId("https://www.transfermarkt.com/romarinho/profil/spieler/193925", "player"),
    "193925",
  );
});

test("extracts Transfermarkt agent ID from advisor URL", () => {
  assert.equal(
    extractTransfermarktEntityId("https://www.transfermarkt.com/example/berater/12345", "agent"),
    "12345",
  );
});

test("extracts Transfermarkt club ID from club URL", () => {
  assert.equal(
    extractTransfermarktEntityId("https://www.transfermarkt.com/fc-barcelona/startseite/verein/131", "club"),
    "131",
  );
});

test("rejects invalid or non-Transfermarkt URLs", () => {
  assert.equal(parseTransfermarktEntityUrl("https://example.com/neymar/profil/spieler/68290"), null);
  assert.equal(parseTransfermarktEntityUrl("not a url"), null);
  assert.equal(parseTransfermarktEntityUrl("http://www.transfermarkt.com/neymar/profil/spieler/68290"), null);
});

test("parses player, agent and club URLs with canonical IDs", () => {
  assert.deepEqual(parseTransfermarktEntityUrl("https://www.transfermarkt.com/neymar/profil/spieler/68290#google_vignette"), {
    transfermarktId: "68290",
    entityType: "player",
    canonicalUrl: "https://www.transfermarkt.com/neymar/profil/spieler/68290",
    profileUrl: "https://www.transfermarkt.com/neymar/profil/spieler/68290",
    name: "Neymar",
    sourceDomain: "transfermarkt.com",
  });

  assert.equal(parseTransfermarktEntityUrl("https://www.transfermarkt.com/example/berater/999")?.entityType, "agent");
  assert.equal(parseTransfermarktEntityUrl("https://www.transfermarkt.com/club/startseite/verein/42")?.entityType, "club");
});

test("dedupe key prevents duplicate records for same type and ID", () => {
  const first = parseTransfermarktEntityUrl("https://www.transfermarkt.com/neymar/profil/spieler/68290");
  const second = parseTransfermarktEntityUrl("https://www.transfermarkt.com/neymar/profil/spieler/68290?foo=bar");
  assert.ok(first);
  assert.ok(second);
  assert.equal(transfermarktDedupeKey(first), "player:68290");
  assert.equal(transfermarktDedupeKey(first), transfermarktDedupeKey(second));
});
