import { lstat, readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

/** Selectors are identifiers, never filesystem paths. */
export function rankingsInputSelection(runId, inputSha256) {
  if (runId === undefined && inputSha256 === undefined) return null;
  if (typeof runId !== "string" || !/^render-[A-Za-z0-9]{6}$/.test(runId)
    || typeof inputSha256 !== "string" || !/^[a-f0-9]{64}$/.test(inputSha256)) {
    throw new Error("INVALID_RANKINGS_INPUT_SELECTION");
  }
  return { runId, inputSha256 };
}

export function validateRankingsLocalInput(value) {
  if (value?.publicCardsRevalidated !== true || value?.coachSnapshotValidated !== true
    || value?.data?.provenance?.source !== "LOCAL_CANONICAL_REPLAY_NOT_PUBLISHED"
    || value?.data?.publishable !== false || !value?.data?.weeklySelection?.complete
    || !value?.goldenBootEvidenceSha256) throw new Error("INVALID_LOCAL_REVIEW_INPUT_REPREPARE_REQUIRED");
  return value;
}

export async function readRankingsLocalInput(root, runId, inputSha256) {
  const selection = rankingsInputSelection(runId, inputSha256);
  const rootReal = await realpath(root);
  let inputPath = path.join(rootReal, "render-input-20260914.json");
  if (selection) {
    const runPath = path.join(rootReal, selection.runId);
    const runStat = await lstat(runPath);
    if (runStat.isSymbolicLink() || !runStat.isDirectory() || await realpath(runPath) !== runPath) {
      throw new Error("INVALID_RANKINGS_RUN_DIRECTORY");
    }
    inputPath = path.join(runPath, "render-input.json");
  }
  const inputStat = await lstat(inputPath);
  if (inputStat.isSymbolicLink() || !inputStat.isFile() || await realpath(inputPath) !== inputPath) {
    throw new Error("INVALID_RANKINGS_INPUT_FILE");
  }
  const bytes = await readFile(inputPath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (selection && digest !== selection.inputSha256) throw new Error("RANKINGS_INPUT_HASH_MISMATCH");
  const input = validateRankingsLocalInput(JSON.parse(bytes.toString("utf8")));
  return { input, runId: selection?.runId ?? "legacy", inputSha256: digest };
}
