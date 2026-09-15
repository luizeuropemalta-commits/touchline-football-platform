import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { STUDIO_REVIEW_BUCKET, STUDIO_REVIEW_MAX_BYTES, type StudioMedia } from "../lib/touchlineArena/social-studio-contract.ts";
import { createStudioReviewStorageCore } from "../lib/touchlineArena/social-studio-storage-core.ts";

const bytes = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftyp"), Buffer.alloc(8), Buffer.from("moov"), Buffer.alloc(8), Buffer.from("mdat"), Buffer.alloc(8)]);
const hash = createHash("sha256").update(bytes).digest("hex");
const etag = '"immutable-etag"';
const media: StudioMedia = {
  artId: "MATCH_PREVIEW", version: "storage-test-v1", placement: "FEED",
  filePath: "artifacts/social-studio/storage-test.mp4", sha256: `sha256:${hash}`,
  objectKey: `v1/MATCH_PREVIEW/FEED/${hash}.mp4`, byteSize: bytes.byteLength, etag,
  width: 1080, height: 1350, durationSeconds: 6, caption: "Storage contract test only.",
  verification: { reportPath: "artifacts/social-studio/storage-test-report.json", reportSha256: `sha256:${"a".repeat(64)}` },
  provenance: { source: "test-only", fetchedAt: "2026-09-15T10:00:00Z", asOf: "2026-09-15T09:00:00Z", validUntil: "2026-09-16T00:00:00Z", competitionId: "test-league", seasonId: "test-season", fixtureIds: ["fixture"], teamIds: ["home", "away"], playerIds: ["player"], snapshotPath: "artifacts/social-studio/storage-test-snapshot.json", snapshotSha256: `sha256:${"b".repeat(64)}` },
};

const bucket = { id: STUDIO_REVIEW_BUCKET, name: STUDIO_REVIEW_BUCKET, public: false, file_size_limit: STUDIO_REVIEW_MAX_BYTES, allowed_mime_types: ["video/mp4"] };
const metadata = { "content-type": "video/mp4", "content-length": String(bytes.byteLength), etag };

test("private Studio preview probes the immutable object and returns only a short same-project signed URL", async () => {
  let signedCalls = 0;
  const storage = createStudioReviewStorageCore({
    supabaseUrl: "https://qa-ref.supabase.co",
    serviceRoleKey: "server-secret",
    getBucket: async () => bucket,
    fetchImpl: async (_url, init) => {
      assert.equal(init?.headers && new Headers(init.headers).get("authorization"), "Bearer server-secret");
      assert.equal(new Headers(init?.headers).get("range"), "bytes=0-0");
      return new Response(bytes.subarray(0, 1), { status: 206, headers: { ...metadata, "content-range": `bytes 0-0/${bytes.byteLength}` } });
    },
    createSignedUrl: async (objectKey, ttl) => {
      signedCalls++;
      assert.equal(objectKey, media.objectKey);
      assert.equal(ttl, 300);
      return `https://qa-ref.supabase.co/storage/v1/object/sign/${STUDIO_REVIEW_BUCKET}/${objectKey}?token=short-lived`;
    },
  });
  const signed = await storage.createSignedPreview(media);
  assert.equal(new URL(signed).searchParams.get("token"), "short-lived");
  assert.equal(signedCalls, 1);
  await assert.rejects(storage.createSignedPreview(media, 301), /SIGNED_TTL_INVALID/);
});

test("missing objects, public or widened buckets, foreign signed URLs and manifest drift fail closed", async () => {
  const build = (overrides: Partial<typeof bucket> = {}, fetchImpl: typeof fetch = async () => new Response(null, { status: 404 }), signed = `https://qa-ref.supabase.co/storage/v1/object/sign/${STUDIO_REVIEW_BUCKET}/${media.objectKey}?token=x`) => createStudioReviewStorageCore({
    supabaseUrl: "https://qa-ref.supabase.co", serviceRoleKey: "server-secret",
    getBucket: async () => ({ ...bucket, ...overrides }), fetchImpl, createSignedUrl: async () => signed,
  });
  await assert.rejects(build().createSignedPreview(media), /OBJECT_MISSING/);
  await assert.rejects(build({ public: true }).probeExact(media), /BUCKET_CONTRACT_MISMATCH/);
  await assert.rejects(build({ allowed_mime_types: ["video/mp4", "text/html"] }).probeExact(media), /BUCKET_CONTRACT_MISMATCH/);
  const goodProbe: typeof fetch = async () => new Response(bytes.subarray(0, 1), { status: 206, headers: { ...metadata, "content-range": `bytes 0-0/${bytes.byteLength}` } });
  await assert.rejects(build({}, goodProbe, `https://evil.example/storage/v1/object/sign/${STUDIO_REVIEW_BUCKET}/${media.objectKey}?token=x`).createSignedPreview(media), /SIGNED_URL_INVALID/);
  await assert.rejects(build({}, goodProbe).probeExact({ ...media, byteSize: media.byteSize + 1 }), /LENGTH_MISMATCH/);
  await assert.rejects(build().probeExact({ ...media, objectKey: `v1/MATCH_PREVIEW/FEED/${"c".repeat(64)}.mp4` }), /INVALID_VIDEO_MANIFEST/);
});

test("Supabase's wrapped NoSuchKey response is absent, but any other 400 remains a hard failure", async () => {
  const wrappedMissing: typeof fetch = async () => new Response(JSON.stringify({ statusCode: "404", code: "NoSuchKey" }), {
    status: 400, headers: { "content-type": "application/json" },
  });
  const missing = createStudioReviewStorageCore({
    supabaseUrl: "https://qa-ref.supabase.co", serviceRoleKey: "server-secret", getBucket: async () => bucket,
    fetchImpl: wrappedMissing, createSignedUrl: async () => assert.fail("missing object never signs"),
  });
  await assert.rejects(missing.createSignedPreview(media), /OBJECT_MISSING/);

  const malformed = createStudioReviewStorageCore({
    supabaseUrl: "https://qa-ref.supabase.co", serviceRoleKey: "server-secret", getBucket: async () => bucket,
    fetchImpl: async () => new Response(JSON.stringify({ statusCode: "400", code: "BadRequest" }), { status: 400 }),
    createSignedUrl: async () => assert.fail("malformed request never signs"),
  });
  await assert.rejects(malformed.createSignedPreview(media), /PROBE_FAILED:400/);
});

test("create-only upload validates bytes before I/O and re-hashes the stored MP4", async () => {
  let calls = 0;
  const storage = createStudioReviewStorageCore({
    supabaseUrl: "https://qa-ref.supabase.co", serviceRoleKey: "server-secret", getBucket: async () => bucket,
    createSignedUrl: async () => assert.fail("upload never signs"),
    fetchImpl: async (_url, init) => {
      calls++;
      if (calls === 1) return new Response(null, { status: 404 });
      if (calls === 2) { assert.equal(init?.method, "POST"); assert.equal(new Headers(init.headers).get("x-upsert"), "false"); return new Response(null, { status: 200 }); }
      assert.equal(init?.method, "GET");
      if (calls === 3) assert.equal(new Headers(init?.headers).get("range"), "bytes=0-0");
      if (calls === 4) assert.equal(new Headers(init?.headers).get("if-match"), etag);
      return new Response(bytes, { status: 200, headers: metadata });
    },
  });
  const { etag: _ignoredEtag, ...uploadManifest } = media;
  void _ignoredEtag;
  const stored = await storage.uploadCreateOnly(uploadManifest, bytes);
  assert.equal(stored.etag, etag);
  assert.equal(calls, 4);
  await assert.rejects(storage.uploadCreateOnly(media, Buffer.from(bytes).fill(0)), /UPLOAD_CHECKSUM_MISMATCH/);
  assert.equal(calls, 4, "bad bytes are rejected before Storage I/O");

  const changed = Buffer.from(bytes); changed[changed.length - 1] = 1;
  const changedReader = createStudioReviewStorageCore({
    supabaseUrl: "https://qa-ref.supabase.co", serviceRoleKey: "server-secret", getBucket: async () => bucket,
    createSignedUrl: async () => "", fetchImpl: async () => new Response(changed, { status: 200, headers: metadata }),
  });
  await assert.rejects(changedReader.readExact(media), /CHECKSUM_MISMATCH/);
});

test("route redirects instead of proxying bytes and renewal invalidates the measured review", async () => {
  const [route, ui, server, manifest] = await Promise.all([
    readFile("app/api/admin/social-publications/studio/video/route.ts", "utf8"),
    readFile("components/touchline/admin/TouchlineSocialStudio.tsx", "utf8"),
    readFile("lib/touchlineArena/social-studio-server.ts", "utf8"),
    readFile("lib/touchlineArena/social-studio-media.ts", "utf8"),
  ]);
  assert.ok(route.indexOf("await authorizeStudio()") < route.indexOf("createSignedPreview"));
  assert.match(route, /status: 307/);
  assert.match(route, /Location: signedUrl/);
  assert.match(route, /private, no-store/);
  assert.doesNotMatch(route, /new Uint8Array|Content-Range|subarray\(/);
  assert.match(ui, /function renewPreview\(\)[\s\S]*interruptPlayback\(\)[\s\S]*setPreviewRevision/);
  assert.match(ui, /onError=\{\(\) => \{ setVideoError\(true\); interruptPlayback\(\); \}\}/);
  assert.match(server, /await storage\.readExact\(media\)[\s\S]*touchline_social_studio_review_start/);
  assert.match(manifest, /readonly StudioMedia\[\]/);
  assert.doesNotMatch(route + server + ui, /media_publish|graph\.facebook|graph\.instagram/);
});
