import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { validateStudioMedia, validateStudioProvenance, type StudioMedia } from "./social-studio-contract.ts";
import { studioEyesSeal } from "./social-studio-desk.ts";

export function studioChecksum(value: string | Uint8Array) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
export function studioMediaIdentity(media: StudioMedia) { return studioChecksum(JSON.stringify(media)); }

/** A decoder result is not visual approval. Both independent gates are required. */
export function validateStudioProbe(report: Record<string, unknown>, media: Pick<StudioMedia, "sha256" | "width" | "height" | "durationSeconds">, requireReviewedLoop = true) {
  const decoderVerified = ["ffprobe", "avfoundation"].includes(String(report.decoder))
    && report.decoderCompleted === true;
  if (report.artifactSha256 !== media.sha256 || !decoderVerified || report.codec !== "h264"
    || report.width !== media.width || report.height !== media.height || report.durationSeconds !== media.durationSeconds
    || !Number.isInteger(report.decodedFrames) || Number(report.decodedFrames) < 3
    || !Number.isInteger(report.distinctFrames) || Number(report.distinctFrames) < 2
    || Number(report.distinctFrames) > Number(report.decodedFrames) || (requireReviewedLoop && report.loopSeamReviewed !== true)) throw new Error("VIDEO_PROBE_EVIDENCE_REQUIRED");
}

async function readPrivateFile(root: string, filePath: string, maximumBytes: number) {
  const allowed = await realpath(resolve(root, "artifacts/social-studio"));
  const actual = await realpath(resolve(root, filePath));
  if (!actual.startsWith(`${allowed}${sep}`)) throw new Error("INVALID_PRIVATE_MEDIA_PATH");
  const info = await stat(actual);
  if (!info.isFile() || info.size > maximumBytes || info.size === 0) throw new Error("INVALID_ARTIFACT_SIZE");
  return readFile(actual);
}

/** The offline probe report and factual snapshot are content-addressed alongside the exact video bytes. */
async function readStudioArtifact(media: StudioMedia, root: string, now: number, approval: boolean) {
  validateStudioMedia(media);
  if (approval) validateStudioProvenance(media, now);
  const [bytes, reportBytes, snapshotBytes] = await Promise.all([
    readPrivateFile(root, media.filePath, 40 * 1024 * 1024),
    readPrivateFile(root, media.verification.reportPath, 1024 * 1024),
    readPrivateFile(root, media.provenance.snapshotPath, 4 * 1024 * 1024),
  ]);
  if (studioChecksum(bytes) !== media.sha256 || studioChecksum(reportBytes) !== media.verification.reportSha256
    || studioChecksum(snapshotBytes) !== media.provenance.snapshotSha256) throw new Error("ARTIFACT_CHECKSUM_MISMATCH");
  if (bytes.length < 32 || bytes.toString("ascii", 4, 8) !== "ftyp" || !bytes.includes(Buffer.from("moov")) || !bytes.includes(Buffer.from("mdat"))) throw new Error("INVALID_MP4");
  const report = JSON.parse(reportBytes.toString("utf8")) as Record<string, unknown>;
  validateStudioProbe(report, media, approval);
  const snapshot = JSON.parse(snapshotBytes.toString("utf8")) as Record<string, unknown>;
  if (snapshot.source !== media.provenance.source || snapshot.competitionId !== media.provenance.competitionId
    || snapshot.seasonId !== media.provenance.seasonId || snapshot.asOf !== media.provenance.asOf
    || snapshot.fetchedAt !== media.provenance.fetchedAt || snapshot.validUntil !== media.provenance.validUntil
    || JSON.stringify(snapshot.fixtureIds) !== JSON.stringify(media.provenance.fixtureIds)
    || JSON.stringify(snapshot.teamIds) !== JSON.stringify(media.provenance.teamIds)
    || JSON.stringify(snapshot.playerIds) !== JSON.stringify(media.provenance.playerIds)
    || snapshot.factualData === null || typeof snapshot.factualData !== "object" || !snapshot.factualData
    || Object.keys(snapshot.factualData).length === 0) throw new Error("FACTUAL_SNAPSHOT_MISMATCH");
  return { bytes, identity: studioMediaIdentity(media), manifest: media, snapshot, loopReviewed: report.loopSeamReviewed === true, eyes: studioEyesSeal(report.eyes, media, now) };
}

/** Approval validates fresh facts and the loop. A candidate preview is never an approval. */
export function verifyStudioArtifact(media: StudioMedia, root = process.cwd(), now = Date.now()) { return readStudioArtifact(media, root, now, true); }
export function inspectStudioArtifact(media: StudioMedia, root = process.cwd(), now = Date.now()) { return readStudioArtifact(media, root, now, false); }
