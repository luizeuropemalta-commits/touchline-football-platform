import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { studioChecksum, studioMediaIdentity, validateStudioProbe, verifyStudioArtifact } from "../lib/touchlineArena/social-studio-artifact.ts";
import type { StudioMedia } from "../lib/touchlineArena/social-studio-contract.ts";

test("native decoder evidence requires completion, actual motion, exact media and separate loop review", () => {
  // Synthetic metadata tests the contract only; it is never a publishable media manifest.
  const media = { sha256: "test-only-sha", width: 1080, height: 1350, durationSeconds: 6 };
  const report = { artifactSha256: media.sha256, decoder: "avfoundation", decoderCompleted: true,
    codec: "h264", width: 1080, height: 1350, durationSeconds: 6, decodedFrames: 72,
    distinctFrames: 40, loopSeamReviewed: true };
  assert.doesNotThrow(() => validateStudioProbe(report, media));
  assert.doesNotThrow(() => validateStudioProbe({ ...report, decoder: "ffprobe" }, media));
  for (const invalid of [
    { decoderCompleted: false }, { decoderCompleted: undefined }, { decoder: "unknown" },
    { decoder: "ffprobe", decoderCompleted: false }, { decoder: "ffprobe", decoderCompleted: undefined },
    { loopSeamReviewed: false }, { decodedFrames: 2 }, { decodedFrames: 71.5 },
    { distinctFrames: 1 }, { distinctFrames: 73 }, { width: 720 }, { durationSeconds: 5.9 },
    { codec: "vp9" }, { artifactSha256: "different-video" },
  ]) assert.throws(() => validateStudioProbe({ ...report, ...invalid }, media), /VIDEO_PROBE_EVIDENCE_REQUIRED/);
});

test("private artifact verification fails closed for absent files, malformed video, stale data and changed probe bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "touchline-studio-artifact-test-"));
  try {
    const directory = join(root, "artifacts/social-studio");
    await mkdir(directory, { recursive: true });
    // Deliberately invalid media: this test never labels fabricated footage as a usable artifact.
    const invalidBytes = Buffer.from("This is not a video.");
    const reportBytes = Buffer.from(JSON.stringify({ decoder: "ffprobe", hasMotion: true }));
    const snapshot = { source: "test-fixture", fetchedAt: "2026-09-14T10:00:00Z", asOf: "2026-09-14T09:00:00Z", validUntil: "2026-09-15T00:00:00Z", competitionId: "test-league", seasonId: "test-season", fixtureIds: ["test-fixture"], teamIds: ["test-home", "test-away"], playerIds: ["test-home-player", "test-away-player"], factualData: { testOnly: true } };
    const snapshotBytes = Buffer.from(JSON.stringify(snapshot));
    const media: StudioMedia = {
      artId: "MATCH_PREVIEW", placement: "FEED", version: "v1", filePath: "artifacts/social-studio/test.mp4", sha256: studioChecksum(invalidBytes), width: 1080, height: 1350, durationSeconds: 6, caption: "Test-only contract data.",
      objectKey: `v1/MATCH_PREVIEW/FEED/${studioChecksum(invalidBytes).slice(7)}.mp4`, byteSize: 32, etag: '"test-etag"',
      verification: { reportPath: "artifacts/social-studio/report.json", reportSha256: studioChecksum(reportBytes) },
      provenance: { ...snapshot, snapshotPath: "artifacts/social-studio/snapshot.json", snapshotSha256: studioChecksum(snapshotBytes) },
    };
    const now = Date.parse("2026-09-14T12:00:00Z");
    await assert.rejects(verifyStudioArtifact(media, root, now), /ENOENT/);
    await Promise.all([writeFile(join(directory, "test.mp4"), invalidBytes), writeFile(join(directory, "report.json"), reportBytes), writeFile(join(directory, "snapshot.json"), snapshotBytes)]);
    await assert.rejects(verifyStudioArtifact(media, root, now), /INVALID_MP4/);
    await writeFile(join(directory, "test.mp4"), "changed bytes");
    await assert.rejects(verifyStudioArtifact(media, root, now), /ARTIFACT_CHECKSUM_MISMATCH/);
    await writeFile(join(directory, "test.mp4"), invalidBytes);
    await writeFile(join(directory, "report.json"), JSON.stringify({ decoder: "ffprobe", hasMotion: true, forged: true }));
    await assert.rejects(verifyStudioArtifact(media, root, now), /ARTIFACT_CHECKSUM_MISMATCH/);
    await assert.rejects(verifyStudioArtifact(media, root, Date.parse("2026-09-16T00:00:00Z")), /FACTUAL_SNAPSHOT_EXPIRED_OR_INVALID/);
    await writeFile(join(root, "outside.mp4"), invalidBytes);
    await symlink(join(root, "outside.mp4"), join(directory, "outside-link.mp4"));
    await assert.rejects(verifyStudioArtifact({ ...media, filePath: "artifacts/social-studio/outside-link.mp4" }, root, now), /INVALID_PRIVATE_MEDIA_PATH/);
    assert.notEqual(studioMediaIdentity(media), studioMediaIdentity({ ...media, caption: "Changed text-base" }));
    assert.notEqual(studioMediaIdentity(media), studioMediaIdentity({ ...media, version: "v2" }));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("source boundary retains a protected media endpoint and additive paused-only persistence", async () => {
  const source = async (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const [page, video, server, ui, sql, preparation] = await Promise.all([
    source("app/(app)/admin/social-publications/studio/page.tsx"), source("app/api/admin/social-publications/studio/video/route.ts"),
    source("lib/touchlineArena/social-studio-server.ts"), source("components/touchline/admin/TouchlineSocialStudio.tsx"),
    source("supabase/migrations/20260914212250_touchline_social_studio_review_plans.sql"),
    source("lib/touchlineArena/social-studio-save.ts"),
  ]);
  assert.ok(page.indexOf("await authorizeStudio()") < page.indexOf("await readStudioSnapshot()"));
  assert.ok(video.indexOf("await authorizeStudio()") < video.indexOf("await storage.createSignedPreview(media, 300)"));
  assert.match(video, /status: 307/);
  assert.doesNotMatch(video, /new Uint8Array|Content-Range/);
  assert.match(server, /assertTouchlineSocialQaRuntime\(\)/);
  assert.match(server, /admin\.rpc\("touchline_social_studio_save_v3"/);
  assert.match(server, /verifyArtifact: \(candidate, now\) => verifyStudioArtifact\(candidate, process\.cwd\(\), now\)/);
  assert.match(preparation, /await dependencies\.verifyArtifact\(media\.manifest, now\)[\s\S]*studioEyesApproved\(verified\.eyes\)[\s\S]*await dependencies\.verifySource/);
  assert.doesNotMatch(ui + server + video, /localStorage|graph\.facebook|graph\.instagram|media_publish/);
  assert.doesNotMatch(sql, /update public\.touchline_social_(templates|publication_drafts)|insert into public\.touchline_social_.*outbox/i);
  assert.match(sql, /security invoker set search_path = ''/);
});
