import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { createClubOwnerAvatarReader, CLUB_OWNER_AVATAR_BUCKET } from "../lib/touchlineArena/club-owner-avatar-storage.ts";
import { validateClubOwnerAvatar, CLUB_OWNER_AVATAR_MAX_BYTES } from "../lib/touchlineArena/club-owner-avatar-validation.ts";
import type { AvatarCurrent } from "../lib/touchlineArena/club-owner-avatar-upload-contract.ts";

const load = () => import("../lib/touchlineArena/club-owner-avatar-read-handler.ts");
const actorId = "123e4567-e89b-42d3-a456-426614174000", operationId = "123e4567-e89b-42d3-a456-426614174001";
const other = "123e4567-e89b-42d3-a456-426614174002", origin = "https://avatar-app.invalid";
// Verified-reader boundary fixture; decoding/real WebP tests belong to Storage.
const bytes = Buffer.from("verified-private-image-boundary");
const digest = createHash("sha256").update(bytes).digest("hex");
const published: AvatarCurrent = { actorId, revision: "1", avatarUrl: `/api/account/avatar?version=${operationId}`, operationId, digest };
const settings = { enabled: true, requestOrigin: origin };
function request(query = `version=${operationId}`, headers: Record<string, string> = {}, signal?: AbortSignal) {
  return new Request(`${origin}/api/account/avatar?${query}`, { headers, signal });
}
function fixture() {
  const calls: string[] = [], identities: unknown[] = [];
  const deps = {
    actor: async (_signal: AbortSignal) => { calls.push("actor"); return { id: actorId, allowed: true }; },
    readCurrent: async (actor: string, _signal: AbortSignal): Promise<AvatarCurrent> => { calls.push("current"); assert.equal(actor, actorId); return { ...published }; },
    readImmutable: async (identity: unknown, _signal: AbortSignal): Promise<Buffer | null> => { calls.push("bytes"); identities.push(identity); return Buffer.from(bytes); },
  };
  return { deps, calls, identities };
}
function headers(response: Response) {
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.has("location"), false); assert.equal(response.headers.has("etag"), false);
}

test("GET without Origin captures actor once and serves only a rechecked current operation", async () => {
  const { handleClubOwnerAvatarRead } = await load(); const f = fixture();
  const response = await handleClubOwnerAvatarRead(request(), f.deps, settings);
  assert.equal(response.status, 200); headers(response);
  assert.equal(response.headers.get("content-type"), "image/webp"); assert.equal(response.headers.get("content-length"), String(bytes.length));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.deepEqual(f.calls, ["actor", "current", "bytes", "current"]);
  assert.deepEqual(f.identities, [{ actorId, operationId, digest }]);
});

test("default OFF and GET origin/query/method boundaries perform no authentication or reads", async () => {
  const { handleClubOwnerAvatarRead } = await load();
  const cases: [Request, Record<string, unknown>, number][] = [
    [request(), {}, 503], [request(), { ...settings, enabled: "true" }, 503],
    [request(), { ...settings, requestOrigin: "http://unsafe.invalid" }, 503],
    [request("version=bad"), settings, 400], [request(`version=${operationId}&version=${operationId}`), settings, 400],
    [request(`version=${operationId}&actorId=${other}`), settings, 400],
    [request(`version=${operationId}`, { origin: "https://other.invalid" }), settings, 403],
    [request(`version=${operationId}`, { "sec-fetch-site": "same-site" }), settings, 403],
    [request(`version=${operationId}`, { "sec-fetch-site": "cross-site" }), settings, 403],
    [request(`version=${operationId}`, { "x-touchline-isolated-preview": "true" }), settings, 403],
    [new Request(`${origin}/api/account/avatar?version=${operationId}`, { method: "POST" }), settings, 405],
  ];
  for (const [req, config, status] of cases) {
    const f = fixture(); const response = await handleClubOwnerAvatarRead(req, f.deps, config);
    assert.equal(response.status, status); headers(response); assert.deepEqual(f.calls, []);
  }
});

test("same-origin and direct-navigation metadata are valid without mandatory POST Origin", async () => {
  const { handleClubOwnerAvatarRead } = await load();
  for (const metadata of [{ origin }, { "sec-fetch-site": "same-origin" }, { "sec-fetch-site": "none" }] as Record<string, string>[]) {
    const f = fixture(); const response = await handleClubOwnerAvatarRead(request(`version=${operationId}`, metadata), f.deps, settings);
    assert.equal(response.status, 200); headers(response);
  }
});

test("no session, forbidden account and uncertain identity fail before authoritative reads", async () => {
  const { handleClubOwnerAvatarRead } = await load();
  for (const [actor, status] of [[null, 401], [{ id: actorId, allowed: false }, 403], [{ id: "bad", allowed: true }, 503]] as const) {
    const f = fixture(); const response = await handleClubOwnerAvatarRead(request(), { ...f.deps, actor: async () => actor }, settings);
    assert.equal(response.status, status); headers(response); assert.deepEqual(f.calls, []);
  }
  const f = fixture(); const response = await handleClubOwnerAvatarRead(request(), { ...f.deps, actor: async () => { throw Error("PRIVATE"); } }, settings);
  assert.equal(response.status, 503); headers(response); assert.doesNotMatch(await response.text(), /PRIVATE|123e4567/);
});

test("zero/absent or superseded operation is 404; wrong actor and malformed current state are 503, never external URL fetches", async () => {
  const { handleClubOwnerAvatarRead } = await load();
  for (const [value, status] of [
    [{ ...published, revision: "0", operationId: null, digest: null, avatarUrl: "https://legacy.invalid/photo" }, 404],
    [{ ...published, operationId: other, avatarUrl: `/api/account/avatar?version=${other}` }, 404],
    [{ ...published, actorId: other }, 503], [{ ...published, revision: "01" }, 503],
    [{ ...published, avatarUrl: "https://external.invalid/image" }, 503],
  ] as const) {
    const f = fixture(); const response = await handleClubOwnerAvatarRead(request(), { ...f.deps, readCurrent: async () => value }, settings);
    assert.equal(response.status, status); headers(response); assert.deepEqual(f.calls, ["actor"]);
  }
  const f = fixture(); const response = await handleClubOwnerAvatarRead(request(), { ...f.deps, readCurrent: async () => { throw Error("PROFILE_UNAVAILABLE"); } }, settings);
  assert.equal(response.status, 503); headers(response); assert.equal(f.calls.includes("bytes"), false);
});

test("publication change while downloading cannot serve the prior version; second-read failure remains unknown", async () => {
  const { handleClubOwnerAvatarRead } = await load();
  for (const mode of ["revision", "operation", "digest", "failure"] as const) {
    const f = fixture(); let reads = 0;
    const response = await handleClubOwnerAvatarRead(request(), { ...f.deps, readCurrent: async () => {
      if (++reads === 1) return published;
      if (mode === "failure") throw Error("PRIVATE");
      return mode === "revision" ? { ...published, revision: "2" } : mode === "digest" ? { ...published, digest: "b".repeat(64) }
        : { ...published, operationId: other, avatarUrl: `/api/account/avatar?version=${other}` };
    } }, settings);
    assert.equal(response.status, mode === "failure" ? 503 : 404); headers(response); assert.equal(reads, 2); assert.equal(f.calls.filter(call => call === "actor").length, 1);
  }
});

test("missing object is 404; wrong/oversized bytes or failed Storage never produce image success", async () => {
  const { handleClubOwnerAvatarRead } = await load();
  for (const [value, status] of [[null, 404], [Buffer.from("wrong"), 503], [Buffer.alloc(4_000_001), 503]] as const) {
    const f = fixture(); const response = await handleClubOwnerAvatarRead(request(), { ...f.deps, readImmutable: async () => value }, settings);
    assert.equal(response.status, status); headers(response);
  }
  const f = fixture(); const unavailable = await handleClubOwnerAvatarRead(request(), { ...f.deps, readImmutable: async () => { throw Error("PRIVATE_STORAGE_FAILURE"); } }, settings);
  assert.equal(unavailable.status, 503); headers(unavailable); assert.doesNotMatch(await unavailable.text(), /PRIVATE_STORAGE_FAILURE/);
});

test("account binding is immutable across awaits, and returned bytes are snapshotted before the final current-state read", async () => {
  const { handleClubOwnerAvatarRead } = await load(); const f = fixture();
  const actor = { id: actorId, allowed: true }, image = Buffer.from(bytes); let reads = 0;
  const response = await handleClubOwnerAvatarRead(request(), { ...f.deps,
    actor: async () => actor,
    readCurrent: async captured => { assert.equal(captured, actorId); if (++reads === 2) image.fill(0); return published; },
    readImmutable: async identity => { assert.equal(identity.actorId, actorId); actor.id = other; return image; },
  }, settings);
  assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes); assert.equal(reads, 2);
});

test("cancel between resolved absence and handler settlement is unknown rather than a false 404", async () => {
  const { handleClubOwnerAvatarRead } = await load();
  for (const boundary of ["current", "object"] as const) {
    const f = fixture(), controller = new AbortController();
    const cancel = () => queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => controller.abort())));
    const deps = boundary === "current" ? { ...f.deps, readCurrent: async () => { cancel(); return { ...published, revision: "0", operationId: null, digest: null, avatarUrl: null }; } }
      : { ...f.deps, readImmutable: async () => { cancel(); return null; } };
    const response = await handleClubOwnerAvatarRead(request(undefined, {}, controller.signal), deps, settings);
    assert.equal(controller.signal.aborted, true); assert.equal(response.status, 503); headers(response);
  }
});

test("abort/stalled read and expiry at settlement are 503 without another session or later reads", async t => {
  const { handleClubOwnerAvatarRead } = await load(); const controller = new AbortController(); controller.abort();
  const early = fixture(); const aborted = await handleClubOwnerAvatarRead(request(undefined, {}, controller.signal), early.deps, settings);
  assert.equal(aborted.status, 503); headers(aborted); assert.deepEqual(early.calls, []);
  const stalled = fixture(); const timeout = await handleClubOwnerAvatarRead(request(), { ...stalled.deps, readImmutable: async () => new Promise(() => {}) }, { ...settings, timeoutMs: 5 });
  assert.equal(timeout.status, 503); headers(timeout); assert.deepEqual(stalled.calls, ["actor", "current"]);
  let clock = 0, reads = 0; t.mock.method(performance, "now", () => clock);
  const late = fixture(); const expired = await handleClubOwnerAvatarRead(request(), { ...late.deps, readCurrent: async () => {
    if (++reads === 2) queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => { clock = 30_001; })));
    return published;
  } }, settings);
  assert.equal(expired.status, 503); headers(expired); assert.equal(reads, 2);
});

test("handler plus real private reader serves normalized WebP through injected GET-only transport", async () => {
  const { handleClubOwnerAvatarRead } = await load();
  const normalized = await validateClubOwnerAvatar(await sharp({ create: { width: 4, height: 2, channels: 3, background: "red" } }).png().toBuffer());
  assert.equal(normalized.ok, true); if (!normalized.ok) assert.fail("normalization fixture failed");
  const actualDigest = createHash("sha256").update(normalized.bytes).digest("hex"), calls: string[] = [];
  const reader = createClubOwnerAvatarReader({ supabaseOrigin: "https://storage.invalid", serviceRoleKey: "local-test-only", fetchImpl: async (input, init) => {
    assert.equal(init?.method, "GET"); calls.push(String(input));
    if (String(input).endsWith(`/bucket/${CLUB_OWNER_AVATAR_BUCKET}`)) return Response.json({ id: CLUB_OWNER_AVATAR_BUCKET, name: CLUB_OWNER_AVATAR_BUCKET, public: false, file_size_limit: CLUB_OWNER_AVATAR_MAX_BYTES, allowed_mime_types: ["image/webp"] });
    assert.equal(String(input), `https://storage.invalid/storage/v1/object/authenticated/${CLUB_OWNER_AVATAR_BUCKET}/${actorId}/${operationId}/${actualDigest}.webp`);
    return new Response(new Uint8Array(normalized.bytes), { headers: { "content-type": "image/webp" } });
  } });
  const f = fixture(); const response = await handleClubOwnerAvatarRead(request(), {
    ...f.deps, ...reader, readCurrent: async () => ({ ...published, digest: actualDigest }),
  }, settings);
  assert.equal(response.status, 200); headers(response); assert.equal(calls.length, 2);
  const returned = Buffer.from(await response.arrayBuffer()); assert.deepEqual(returned, normalized.bytes);
  assert.equal((await sharp(returned).metadata()).width, 4); assert.deepEqual(f.calls, ["actor"]);
});

test("transport GET boundary uses matching digest and rejects excess before second read or image response", async () => {
  const { handleClubOwnerAvatarRead } = await load();
  // Injected-reader contract proof only: these buffers are not real WebP fixtures.
  for (const size of [3_999_999, 4_000_000, 4_000_001]) {
    const image = Buffer.alloc(size), digest = createHash("sha256").update(image).digest("hex");
    const f = fixture(); let reads = 0;
    const response = await handleClubOwnerAvatarRead(request(), { ...f.deps,
      readCurrent: async () => { reads++; return { ...published, digest }; },
      readImmutable: async () => image,
    }, settings);
    headers(response);
    assert.equal(response.status, size <= 4_000_000 ? 200 : 503);
    assert.equal(reads, size <= 4_000_000 ? 2 : 1);
    if (size <= 4_000_000) assert.equal((await response.arrayBuffer()).byteLength, size);
    else {
      assert.notEqual(response.headers.get("content-type"), "image/webp");
      assert.deepEqual(await response.json(), { ok: false, error: "AVATAR_READ_UNAVAILABLE" });
    }
  }
});
