import assert from "node:assert/strict";
import test from "node:test";
import { resolveTouchLineAuthCallbackDestination } from "../lib/server/auth-callback-destination.ts";

const origin = "https://touchline.example";

test("callback accepts only same-origin TouchLine destinations and preserves language", () => {
  const arena = resolveTouchLineAuthCallbackDestination("/arena?lang=pt-BR", origin);
  assert.equal(arena.origin, origin);
  assert.equal(arena.pathname, "/arena");
  assert.equal(arena.searchParams.get("lang"), "pt-BR");

  const reset = resolveTouchLineAuthCallbackDestination("/reset-password?lang=pt-BR", origin);
  assert.equal(reset.origin, origin);
  assert.equal(reset.pathname, "/reset-password");
  assert.equal(reset.searchParams.get("lang"), "pt-BR");

  const arenaPanel = resolveTouchLineAuthCallbackDestination("/arena/bench?lang=en-GB", origin);
  assert.equal(arenaPanel.href, `${origin}/arena/bench?lang=en-GB`);

  const firstEntry = resolveTouchLineAuthCallbackDestination("/arena?lang=pt-BR&intro=first", origin);
  assert.equal(firstEntry.href, `${origin}/arena?lang=pt-BR&intro=first`);
  assert.equal(firstEntry.searchParams.get("intro"), "first");

  const clubHeadquarters = resolveTouchLineAuthCallbackDestination("/club-owner/luiz-lopez?lang=pt-BR", origin);
  assert.equal(clubHeadquarters.href, `${origin}/club-owner/luiz-lopez?lang=pt-BR`);

  const dynamicClubOwner = resolveTouchLineAuthCallbackDestination("/club-owner/new-owner/substitution?lang=en-GB", origin);
  assert.equal(dynamicClubOwner.href, `${origin}/club-owner/new-owner/substitution?lang=en-GB`);

  const protectedOperation = resolveTouchLineAuthCallbackDestination(
    "/market-transfer?contractPlayer=10&lang=pt-BR",
    origin,
  );
  assert.equal(
    protectedOperation.href,
    `${origin}/market-transfer?contractPlayer=10&lang=pt-BR`,
  );

  const nestedAdmin = resolveTouchLineAuthCallbackDestination("/admin/finance?lang=en-GB", origin);
  assert.equal(nestedAdmin.href, `${origin}/admin/finance?lang=en-GB`);
});

test("callback rejects protocol-relative, absolute, backslash and unapproved paths", () => {
  const unsafeDestinations = [
    "//evil.example/steal",
    "https://evil.example/steal",
    "/\\evil.example/steal",
    "///evil.example/steal",
    "/login?lang=pt-BR",
    "javascript:alert(1)",
  ];

  for (const unsafe of unsafeDestinations) {
    const destination = resolveTouchLineAuthCallbackDestination(unsafe, origin);
    assert.equal(destination.origin, origin, unsafe);
    assert.equal(destination.pathname, "/arena", unsafe);
    assert.equal(destination.search, "", unsafe);
  }
});

test("callback falls back to Arena for absent or malformed destinations", () => {
  assert.equal(resolveTouchLineAuthCallbackDestination(null, origin).href, `${origin}/arena`);
  assert.equal(resolveTouchLineAuthCallbackDestination("http://[", origin).href, `${origin}/arena`);
});
