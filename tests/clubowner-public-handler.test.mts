import assert from "node:assert/strict";
import test from "node:test";
import { handlePublicOwners, type PeopleDependencies, type PeopleEndpoint } from "../lib/touchlineArena/clubowner-public-handler.ts";
import { normalizeTouchLineAuthReturnTo } from "../lib/touchlineArena/auth-i18n.ts";

const id = "11111111-2222-4333-8444-555555555555";
const publicProfile = { publicId: id, displayName: "Synthetic Person", followerCount: 2, following: false, viewer: "member" };
function fixture(overrides: Partial<PeopleDependencies> = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = [];
  const deps: PeopleDependencies = {
    enabled: true, currentActor: async () => ({ allowed: true }),
    rpc: async (name, args) => { calls.push({ name, args }); return name.endsWith("search") ? [{ ...publicProfile, email: "PRIVATE_EMAIL", accountId: "PRIVATE_ID" }] : name.includes("own_profile") || name.includes("save_profile") ? { publicId: id, displayName: "Synthetic Person", published: true, followerCount: 2, email: "PRIVATE_EMAIL" } : { ...publicProfile, accountId: "PRIVATE_ID" }; },
    ...overrides,
  };
  const invoke = (endpoint: PeopleEndpoint, body?: unknown, headers: Record<string, string> = {}) => handlePublicOwners(new Request("https://touchline.test/api?q=Synthetic", {
    method: body === undefined ? "GET" : "PUT", headers: { origin: "https://touchline.test", "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), endpoint, deps, id);
  return { calls, deps, invoke };
}
test("public DTO allowlists names/IDs/counts; no private passthrough or failure-as-zero", async () => {
  const f = fixture();
  for (const endpoint of ["directory", "profile", "own"] as const) {
    const response = await f.invoke(endpoint); assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.doesNotMatch(await response.text(), /PRIVATE_|email|accountId/);
  }
  assert.equal((await fixture({ rpc: async () => { throw new Error("PRIVATE_DATABASE_ERROR"); } }).invoke("profile")).status, 503);
  const invalid = await fixture({ rpc: async () => ({ ...publicProfile, followerCount: "2" }) }).invoke("profile");
  assert.equal(invalid.status, 503); assert.doesNotMatch(await invalid.text(), /followerCount/);
});
test("application gate off never touches auth or database", async () => {
  const f = fixture({ enabled: false, currentActor: async () => assert.fail("auth"), rpc: async () => assert.fail("database") });
  assert.equal((await f.invoke("own", { displayName: "Name", published: true })).status, 503);
});
test("session, access and exact origin are required before writes", async () => {
  for (const [overrides, status] of [[{ currentActor: async () => null }, 401], [{ currentActor: async () => ({ allowed: false }) }, 403], [{ currentActor: async () => { throw new Error("AUTH_DOWN"); } }, 503]] as const) {
    const f = fixture(overrides); assert.equal((await f.invoke("follow", { active: true })).status, status); assert.equal(f.calls.length, 0);
  }
  for (const headers of [{ origin: "https://evil.test" }, { origin: "" }, { "sec-fetch-site": "cross-site" }, { origin: "https://touchline.test.evil.test" }]) {
    const f = fixture(); assert.equal((await f.invoke("follow", { active: true }, headers)).status, 403); assert.equal(f.calls.length, 0);
  }
});
test("publication and follow payloads cannot choose an actor or assign the public ID", async () => {
  const f = fixture();
  for (const body of [{ active: true, actorId: id }, { active: "true" }, [], null, { active: true, publicId: id }]) assert.equal((await f.invoke("follow", body)).status, 400);
  for (const body of [{ displayName: "Name", published: true, accountId: id }, { displayName: "email@example.test", published: true }, { displayName: "Name", published: "true" }]) assert.equal((await f.invoke("own", body)).status, 400);
  assert.equal(f.calls.length, 0);
  assert.equal((await f.invoke("own", { displayName: "Name", published: false })).status, 200);
  assert.deepEqual(f.calls.pop(), { name: "touchline_people_save_profile", args: { p_display_name: "Name", p_published: false } });
  assert.equal((await f.invoke("follow", { active: true })).status, 200);
  assert.deepEqual(f.calls.pop(), { name: "touchline_people_set_follow", args: { p_public_id: id, p_active: true } });
});
test("body is byte-bounded while streaming, cancels overflow and rejects non-JSON", async () => {
  let cancelled = false, pulled = 0;
  const stream = new ReadableStream({ pull(controller) { pulled++; controller.enqueue(new Uint8Array(1025)); }, cancel() { cancelled = true; } });
  const request = new Request("https://touchline.test/api", { method: "PUT", headers: { origin: "https://touchline.test", "content-type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
  const f = fixture(); assert.equal((await handlePublicOwners(request, "follow", f.deps, id)).status, 400);
  assert.equal(cancelled, true); assert.ok(pulled <= 2); assert.equal(f.calls.length, 0);
  assert.equal((await f.invoke("follow", { active: true }, { "content-type": "text/plain" })).status, 400);
  assert.equal((await f.invoke("own", { displayName: "😀".repeat(60), published: true })).status, 200);
});
test("hidden/unknown IDs have the same public response; mutation failures are sanitized", async () => {
  assert.equal((await fixture({ rpc: async () => null }).invoke("profile")).status, 404);
  for (const [message, status] of [["PEOPLE_NOT_FOUND", 404], ["PEOPLE_FORBIDDEN", 403], ["PEOPLE_SELF_FOLLOW", 400], ["PEOPLE_UNAVAILABLE", 503]]) {
    const response = await fixture({ rpc: async () => { throw new Error(String(message)); } }).invoke("follow", { active: true });
    assert.equal(response.status, status); assert.doesNotMatch(await response.text(), /PEOPLE_/);
  }
});
test("new public-profile login return paths are allowed without changing retired private routes", () => {
  assert.equal(normalizeTouchLineAuthReturnTo(`/clubowners/${id}?lang=pt-BR`), `/clubowners/${id}?lang=pt-BR`);
  assert.equal(normalizeTouchLineAuthReturnTo("/clubowners?lang=en-GB"), "/clubowners?lang=en-GB");
  assert.equal(normalizeTouchLineAuthReturnTo("/club-owner/legacy-name?lang=pt-BR"), "/clubowner?lang=pt-BR");
  assert.equal(normalizeTouchLineAuthReturnTo("https://evil.test/clubowners"), null);
});

test("public photo URL enrichment is bounded, gated and never passes private metadata", async () => {
  const url = `/api/touchline/clubowners/${id}/avatar?v=${"a".repeat(64)}`;
  const reads: string[][] = [];
  const f = fixture({ photoEnabled: true, photoUrls: async ids => { reads.push([...ids]); return { [id]: url }; } });
  for (const endpoint of ["directory", "profile"] as const) {
    const response = await f.invoke(endpoint); assert.equal(response.status, 200);
    const body = await response.text(); assert.ok(body.includes(url)); assert.doesNotMatch(body, /PRIVATE_|accountId|email|digest|operation/);
  }
  assert.deepEqual(reads, [[id], [id]]);
  const off = fixture({ photoEnabled: false, photoUrls: async () => assert.fail("disabled photo projection") });
  assert.doesNotMatch(await (await off.invoke("profile")).text(), /avatarUrl/);
});

test("photo read failing after follow mutation returns uncertain 503 and fresh GET recovers authoritative state", async () => {
  let following = false, failPhoto = true, mutations = 0;
  const f = fixture({ photoEnabled: true, rpc: async (name, args) => {
    if (name === "touchline_people_set_follow") { following = args!.p_active === true; mutations++; }
    return { ...publicProfile, following, followerCount: following ? 3 : 2 };
  }, photoUrls: async () => { if (failPhoto) throw Error("PRIVATE_PHOTO_READ"); return {}; } });
  const unknown = await f.invoke("follow", { active: true });
  assert.equal(unknown.status, 503); assert.equal(following, true); assert.equal(mutations, 1);
  assert.doesNotMatch(await unknown.text(), /PRIVATE_PHOTO_READ|following|followerCount/);
  failPhoto = false;
  const refreshed = await f.invoke("profile"); assert.equal(refreshed.status, 200);
  assert.deepEqual(await refreshed.json(), { profile: { ...publicProfile, following: true, followerCount: 3, avatarUrl: null } });
  assert.equal(mutations, 1);
  assert.equal((await f.invoke("follow", { active: true })).status, 200); assert.equal(following, true);
});
