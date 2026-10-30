import assert from "node:assert/strict";
import test from "node:test";
import { allowsClubOwnerAvatarAudience, parseClubOwnerAvatarAudience } from "../lib/touchlineArena/club-owner-avatar-audience.ts";

const actor = "123e4567-e89b-42d3-a456-426614174000", other = "123e4567-e89b-42d3-a456-426614174002";

test("absent avatar audience preserves the single configured UUID and casing contract", () => {
  for (const accountId of [actor, actor.toUpperCase()]) {
    const policy = parseClubOwnerAvatarAudience({ accountId });
    assert.deepEqual(policy, { mode: "account", accountId: actor }); assert.ok(Object.isFrozen(policy));
    assert.equal(allowsClubOwnerAvatarAudience(policy, actor), true);
    assert.equal(allowsClubOwnerAvatarAudience(policy, actor.toUpperCase()), true);
    assert.equal(allowsClubOwnerAvatarAudience(policy, other), false);
  }
  for (const accountId of [undefined, null, "", "bad", ` ${actor}`, `${actor},${other}`]) {
    assert.equal(parseClubOwnerAvatarAudience({ accountId }), null);
  }
});

test("explicit customers audience admits both valid actor IDs without supplying authentication or readiness", () => {
  for (const accountId of [undefined, actor, actor.toUpperCase()]) {
    const policy = parseClubOwnerAvatarAudience({ audience: "customers", accountId });
    assert.deepEqual(policy, { mode: "customers" }); assert.ok(Object.isFrozen(policy));
    for (const id of [actor, other]) assert.equal(allowsClubOwnerAvatarAudience(policy, id), true);
    for (const id of [undefined, null, "", "bad", ` ${actor}`, `${actor},${other}`]) assert.equal(allowsClubOwnerAvatarAudience(policy, id), false);
  }
});

test("unknown audience or malformed supplied account fails closed without a fallback", () => {
  for (const audience of [null, "", "account", "CUSTOMERS", " customers ", "all", "*", true, {}]) {
    const policy = parseClubOwnerAvatarAudience({ audience, accountId: actor });
    assert.equal(policy, null); assert.equal(allowsClubOwnerAvatarAudience(policy, actor), false);
  }
  for (const accountId of [null, "", "bad", ` ${actor}`, `${actor},${other}`]) {
    assert.equal(parseClubOwnerAvatarAudience({ audience: "customers", accountId }), null);
  }
});
