import assert from "node:assert/strict";
import test from "node:test";
import { resolveTouchLineAuthCallbackDestination } from "../lib/server/auth-callback-destination.ts";

const origin = "https://touchline.example";

test("callback accepts only same-origin TouchLine destinations and preserves language", () => {
  const arena = resolveTouchLineAuthCallbackDestination("/arena?lang=pt-BR", origin);
  assert.equal(arena.origin, origin);
  assert.equal(arena.pathname, "/market-transfer");
  assert.equal(arena.searchParams.get("lang"), "pt-BR");

  const reset = resolveTouchLineAuthCallbackDestination("/reset-password?lang=pt-BR", origin);
  assert.equal(reset.origin, origin);
  assert.equal(reset.pathname, "/reset-password");
  assert.equal(reset.searchParams.get("lang"), "pt-BR");

  const arenaPanel = resolveTouchLineAuthCallbackDestination("/arena/bench?lang=en-GB", origin);
  assert.equal(arenaPanel.href, `${origin}/market-transfer?lang=en-GB`);

  const firstEntry = resolveTouchLineAuthCallbackDestination("/arena?lang=pt-BR&intro=first", origin);
  assert.equal(firstEntry.href, `${origin}/intro?lang=pt-BR&intro=first`);
  assert.equal(firstEntry.searchParams.get("intro"), "first");

  for (const locale of ["pt-BR", "en-GB"] as const) {
    const myClub = resolveTouchLineAuthCallbackDestination(`/my-club?lang=${locale}`, origin);
    assert.equal(myClub.href, `${origin}/my-club?lang=${locale}`);
  }

  const clubHeadquarters = resolveTouchLineAuthCallbackDestination("/club-owner/luiz-lopez?lang=pt-BR", origin);
  assert.equal(clubHeadquarters.href, `${origin}/market-transfer?lang=pt-BR`);

  const dynamicClubOwner = resolveTouchLineAuthCallbackDestination("/club-owner/new-owner/substitution?lang=en-GB", origin);
  assert.equal(dynamicClubOwner.href, `${origin}/market-transfer?lang=en-GB`);

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

  const inbox = resolveTouchLineAuthCallbackDestination("/inbox?lang=en-GB", origin);
  assert.equal(inbox.href, `${origin}/inbox?lang=en-GB`);
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
    assert.equal(destination.pathname, "/market-transfer", unsafe);
    assert.equal(destination.search, "", unsafe);
  }
});

test("callback falls back to Market for absent or malformed destinations", () => {
  assert.equal(resolveTouchLineAuthCallbackDestination(null, origin).href, `${origin}/market-transfer`);
  assert.equal(resolveTouchLineAuthCallbackDestination("http://[", origin).href, `${origin}/market-transfer`);
});
