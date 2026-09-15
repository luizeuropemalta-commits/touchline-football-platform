import assert from "node:assert/strict";
import test from "node:test";
import { isOwnerEmail, ownerEmails } from "../lib/admin/owner.ts";

async function withOwnerEnv(value: string | undefined, action: () => void) {
  const previous = process.env.TOUCHLINE_OWNER_EMAILS;
  try {
    if (value === undefined) delete process.env.TOUCHLINE_OWNER_EMAILS;
    else process.env.TOUCHLINE_OWNER_EMAILS = value;
    action();
  } finally {
    if (previous === undefined) delete process.env.TOUCHLINE_OWNER_EMAILS;
    else process.env.TOUCHLINE_OWNER_EMAILS = previous;
  }
}

test("owner authorization fails closed when the environment allowlist is absent or empty", async () => {
  await withOwnerEnv(undefined, () => {
    assert.deepEqual(ownerEmails(), []);
    assert.equal(isOwnerEmail("former-owner@example.com"), false);
  });
  await withOwnerEnv("  ,  ", () => {
    assert.deepEqual(ownerEmails(), []);
    assert.equal(isOwnerEmail("owner@example.com"), false);
  });
});

test("owner allowlist is normalized, validated, and deduplicated", async () => {
  await withOwnerEnv(" Owner@Example.COM,invalid, second@example.org, owner@example.com ", () => {
    assert.deepEqual(ownerEmails(), ["owner@example.com", "second@example.org"]);
    assert.equal(isOwnerEmail("  OWNER@example.com "), true);
    assert.equal(isOwnerEmail("invalid"), false);
    assert.equal(isOwnerEmail(null), false);
  });
});
