import assert from "node:assert/strict";
import test from "node:test";
import { handlePlayerSocial, type PlayerSocialDependencies } from "../lib/touchlineArena/player-social-handler.ts";
import { parsePlayerSocialMutation, parsePlayerSocialSummary } from "../lib/touchlineArena/player-social-contract.ts";

const summary = { followerCount: 12, likeCount: 7, following: false, liked: true };
function setup(overrides: Partial<PlayerSocialDependencies> = {}) {
  const writes: unknown[][] = [];
  const deps: PlayerSocialDependencies = {
    enabled: true,
    currentActor: async () => ({ id: "verified-user", allowed: true }),
    resolvePlayer: async (id) => id === "123" ? "canonical-player-uuid" : null,
    read: async () => summary,
    write: async (...args) => { writes.push(args); return summary; },
    ...overrides,
  };
  return { deps, writes };
}
const request = (body: unknown = { kind: "like", active: true }, origin = "https://touchline.test") => new Request("https://touchline.test/api/touchline/players/123/social", {
  method: "PUT", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
});

test("disabled feature neither authenticates nor reads or writes the database", async () => {
  const fail = async () => { throw new Error("must not run"); };
  const { deps, writes } = setup({ enabled: false, currentActor: fail, resolvePlayer: fail });
  assert.equal((await handlePlayerSocial(request(), "123", deps)).status, 503);
  assert.equal(writes.length, 0);
});
test("mutation uses verified actor and resolved canonical player, never caller identity", async () => {
  const { deps, writes } = setup();
  const response = await handlePlayerSocial(request(), "123", deps);
  assert.equal(response.status, 200);
  assert.deepEqual(writes, [["canonical-player-uuid", "verified-user", "like", true]]);
  assert.deepEqual(await response.json(), { ok: true, data: summary, canReact: true });
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal((await handlePlayerSocial(request({ kind: "like", active: true, userId: "victim" }), "123", deps)).status, 400);
  assert.equal(writes.length, 1);
});
test("unauthenticated, unentitled and cross-origin mutations never write", async () => {
  for (const [actor, expected] of [[null, 401], [{ id: "user", allowed: false }, 403]] as const) {
    const { deps, writes } = setup({ currentActor: async () => actor });
    assert.equal((await handlePlayerSocial(request(), "123", deps)).status, expected);
    assert.equal(writes.length, 0);
  }
  const { deps, writes } = setup();
  assert.equal((await handlePlayerSocial(request(undefined, "https://attacker.test"), "123", deps)).status, 403);
  assert.equal(writes.length, 0);
});
test("malformed IDs, payloads and missing canonical players fail closed", async () => {
  const { deps, writes } = setup();
  for (const id of ["demo-haaland", "0", "123?admin=true", "-1", "1.5"]) {
    assert.equal((await handlePlayerSocial(request(), id, deps)).status, 400);
  }
  for (const body of [null, [], { kind: "follow", active: "true" }, { kind: "share", active: true }]) {
    assert.equal((await handlePlayerSocial(request(body), "123", deps)).status, 400);
  }
  assert.equal((await handlePlayerSocial(request(), "999", deps)).status, 404);
  assert.equal(writes.length, 0);
});
test("backend failures return unavailable instead of fabricated success or SQL details", async () => {
  for (const overrides of [
    { write: async () => { throw new Error("private SQL details"); } },
    { write: async () => ({ ...summary, followerCount: -1 }) },
  ]) {
    const { deps } = setup(overrides);
    const response = await handlePlayerSocial(request(), "123", deps);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: "SOCIAL_UNAVAILABLE" });
  }
});
test("anonymous reads contain aggregate totals only and are never cached across accounts", async () => {
  const { deps } = setup({ currentActor: async () => null, read: async (_id, actor) => {
    assert.equal(actor, null); return { ...summary, liked: false, following: false, privateUserIds: ["secret"] };
  } });
  const response = await handlePlayerSocial(new Request("https://touchline.test/social"), "123", deps);
  assert.deepEqual(await response.json(), { ok: true, data: { ...summary, liked: false }, canReact: false });
  assert.equal(response.headers.get("vary"), "Cookie");
});
test("zero is valid only from a complete backend summary; missing/fractional totals stay unavailable", () => {
  assert.deepEqual(parsePlayerSocialSummary({ followerCount: 0, likeCount: 0, following: false, liked: false }), { followerCount: 0, likeCount: 0, following: false, liked: false });
  for (const value of [null, {}, { ...summary, likeCount: 1.5 }, { ...summary, followerCount: "12" }]) assert.equal(parsePlayerSocialSummary(value), null);
  assert.deepEqual(parsePlayerSocialMutation({ kind: "follow", active: false }), { kind: "follow", active: false });
});
