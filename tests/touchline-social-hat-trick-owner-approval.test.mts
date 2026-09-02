import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const EXPECTED_COMBINED_HASH =
  "a0bc151bfbe5348e204bac32ad2893e27490d8c0dace7d1d82953d6b01a0ef38";

const EXPECTED_FILES = [
  ["components/touchline/social/TouchlineSocialRankingDraft.tsx", "8bf06f57e9c94ab30303eb799e0db43709844270c0cc2249de8eddef8ce2252f"],
  ["components/touchline/social/TouchlineSocialRankingDraft.module.css", "62e76dd7cb22e6099bdd7e7f8fe9d13822ca0f86746d9d471f5323ca6d78cd2e"],
  ["components/touchline/social/TouchlineSocialFixtureScoreboard.tsx", "09e36f2e203fef2103a08d3fa482942f192ba193b6722e8eddcbc6240921f4e2"],
  ["components/touchline/social/TouchlineSocialFixtureScoreboard.module.css", "b03c09fde61c9433098c21aa10b980dbf70757ed7f0f87d76c2cd3fb500f680c"],
  ["components/touchline/cards/TouchlineEliteExactCard.tsx", "6cb7a2565e02f5ef18e089ede11d9fc682745a14eeb6587fbeb3e01fb8a55f9f"],
  ["components/touchline/cards/TouchlineCardPerimeterTrace.tsx", "eac6e8b7fb59a021e205bcaf221fbf7d0b4a6f537e5e2d42304453c98e5d14a2"],
  ["public/touchlineArena/card-layouts/master-shirt-back-layout.json", "7b1b432152001e3728eb967ba9d4cdb31c6b78b4c49e54787e83d6a9529e292f"],
  ["lib/touchlineArena/social-ranking-visual-tokens.ts", "e04103f74777689205b395ed9124246253a8ce19ac2e7f237d0360243d7a27d8"],
  ["lib/touchlineArena/social-visual-tokens.ts", "354442783ed145e90643b18f03ad3af3f22a747eb877245c0cb421214f1cd3ce"],
  ["public/touchlineArena/trophies/touchline-england-league-trophy-lion-cup-candidate-v4-text.png", "2ae6490be56d63b62523bdbf6eebb5889d906ec6e8de1724f57c985b9bdd372f"],
  ["public/touchlineArena/brand/tl-shield-lime.svg", "37522f0bfcab553f08df45300e22724af0292b7f620046c71c75ee91cb10fc3d"],
] as const;

const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");

test("owner-approved Hat-trick artwork remains byte-for-byte locked", async () => {
  let manifest = "";

  for (const [file, expectedHash] of EXPECTED_FILES) {
    const actualHash = sha256(await readFile(file));
    assert.equal(actualHash, expectedHash, `${file} changed after OWNER approval`);
    manifest += `${actualHash}  ${file}\n`;
  }

  assert.equal(sha256(manifest), EXPECTED_COMBINED_HASH);
});

test("approval records Hat-trick as 043 and keeps the transition fail-closed", async () => {
  const approval = await readFile(
    "docs/touchline-arena/social-publishing-playbook/043_HAT_TRICK_OWNER_ART_APPROVAL.md",
    "utf8",
  );

  assert.match(approval, /Hat-trick is a \*\*043 confirmed-goal event\*\*/);
  assert.match(approval, /known\s+transitional mismatch/);
  assert.match(approval, /outbound remains fail-closed/);
  assert.match(approval, new RegExp(EXPECTED_COMBINED_HASH));
});
