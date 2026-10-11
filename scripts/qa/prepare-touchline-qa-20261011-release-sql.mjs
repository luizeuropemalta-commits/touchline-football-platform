// Offline packaging only. This program never connects to Supabase or executes SQL.
// Its output remains a candidate until an independent review and JIT QA gates.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { open, readFile, lstat } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { buildTouchlineQaBatchAtomicRehearsal } from "./build-touchline-qa-20261011-atomic-rehearsal.mjs";
import { TOUCHLINE_QA_MIGRATION_BATCH_20261011 } from "./verify-touchline-qa-migration-batch-20261011.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const approvedBaselineSha = "262ca6991abaa47bad4ac5ff5692713012aa4f66";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^[0-9a-f]{64}$/;

function git(repo, ...args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).trim();
}

function releasePath(path) {
  assert(typeof path === "string" && path.length > 0 && !path.startsWith("/") && !path.includes("\\"), "TL_QA_RELEASE_PATH_INVALID");
  assert(path.split("/").every((part) => part && part !== "." && part !== ".."), "TL_QA_RELEASE_PATH_TRAVERSAL");
  assert(!/(^|\/)(\.env[^/]*|\.next|\.vercel|node_modules|coverage|dist)(\/|$)/.test(path), "TL_QA_RELEASE_FORBIDDEN_PATH");
  return path;
}

export async function verifyTouchlineQaReleaseIdentity(manifestBytes, { repo = repository, expectedBaselineSha = approvedBaselineSha } = {}) {
  assert(Buffer.isBuffer(manifestBytes), "TL_QA_RELEASE_MANIFEST_BYTES_REQUIRED");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  assert.deepEqual(Object.keys(manifest).sort(), ["baseSha", "files", "releaseSha"], "TL_QA_RELEASE_MANIFEST_FIELDS_INVALID");
  assert(shaPattern.test(manifest.baseSha) && shaPattern.test(manifest.releaseSha), "TL_QA_RELEASE_SHA_INVALID");
  assert.equal(manifest.baseSha, expectedBaselineSha, "TL_QA_RELEASE_BASELINE_MISMATCH");
  assert(Array.isArray(manifest.files) && manifest.files.length > 0, "TL_QA_RELEASE_MANIFEST_EMPTY");
  assert.equal(git(repo, "branch", "--show-current"), "qa", "TL_QA_RELEASE_BRANCH_MISMATCH");
  assert.equal(git(repo, "rev-parse", "HEAD"), manifest.releaseSha, "TL_QA_RELEASE_HEAD_MISMATCH");
  if (git(repo, "status", "--porcelain=v1", "--untracked-files=all") !== "")
    throw new Error("TL_QA_RELEASE_WORKTREE_DIRTY");
  assert.equal(git(repo, "merge-base", manifest.baseSha, manifest.releaseSha), manifest.baseSha, "TL_QA_RELEASE_BASE_NOT_ANCESTOR");
  const nameStatus = git(repo, "diff", "--name-status", "-z", "--no-renames", manifest.baseSha, manifest.releaseSha).split("\0").filter(Boolean);
  assert.equal(nameStatus.length % 2, 0, "TL_QA_RELEASE_DIFF_FORMAT_INVALID");
  const actualPaths = [];
  for (let index = 0; index < nameStatus.length; index += 2) {
    assert(["A", "M"].includes(nameStatus[index]), "TL_QA_RELEASE_DIFF_STATUS_NOT_APPROVED");
    actualPaths.push(nameStatus[index + 1]);
  }
  actualPaths.sort();
  const manifestPaths = manifest.files.map((file) => {
    assert.deepEqual(Object.keys(file).sort(), ["path", "sha256"], "TL_QA_RELEASE_FILE_FIELDS_INVALID");
    releasePath(file.path);
    assert(digestPattern.test(file.sha256), "TL_QA_RELEASE_FILE_HASH_INVALID");
    return file.path;
  });
  assert.deepEqual([...manifestPaths].sort(), actualPaths, "TL_QA_RELEASE_PATH_SET_MISMATCH");
  assert.equal(new Set(manifestPaths).size, manifestPaths.length, "TL_QA_RELEASE_DUPLICATE_PATH");
  for (const file of manifest.files) {
    const absolute = resolve(repo, file.path);
    assert(relative(repo, absolute) !== ".." && !relative(repo, absolute).startsWith(`..${sep}`), "TL_QA_RELEASE_PATH_OUTSIDE_REPOSITORY");
    assert((await lstat(absolute)).isFile(), "TL_QA_RELEASE_NON_REGULAR_FILE");
    assert.equal(sha256(await readFile(absolute)), file.sha256, `TL_QA_RELEASE_FILE_DRIFT: ${file.path}`);
  }
  return Object.freeze({ releaseSha: manifest.releaseSha, manifestSha256: sha256(manifestBytes), paths: Object.freeze(manifestPaths) });
}

export async function prepareTouchlineQaReleaseSql({ manifestBytes, vipGrant }) {
  const identity = await verifyTouchlineQaReleaseIdentity(manifestBytes);
  assert(vipGrant && vipGrant.actorEmail === "admin@touchline.com.br"
    && vipGrant.targetEmail === "jl_nenelopes10@hotmail.com", "TL_QA_RELEASE_PERSONA_MISMATCH");
  const preimageSource = await readFile(new URL("../../supabase/qa/060_touchline_qa_20261011_batch_preimage_DRAFT.sql", import.meta.url));
  const batchSources = new Map(await Promise.all(TOUCHLINE_QA_MIGRATION_BATCH_20261011.map(async (entry) => [
    entry.file, await readFile(new URL(`../../${entry.file}`, import.meta.url)),
  ])));
  const built = buildTouchlineQaBatchAtomicRehearsal({
    releaseSha: identity.releaseSha,
    manifestSha256: identity.manifestSha256,
    preimageSource,
    batchSources,
    vipGrant,
  });
  assert.equal(built.metadata.remoteExecution, "forbidden", "TL_QA_RELEASE_BUILDER_GUARD_CHANGED");
  const oldHeader = "-- LOCAL REHEARSAL / DRAFT / NOT_FOR_REMOTE_EXECUTION.\n-- Generated from hash-bound sources. It is not an apply command.";
  assert(built.sql.startsWith(oldHeader), "TL_QA_RELEASE_BUILDER_HEADER_CHANGED");
  const candidateSql = built.sql.replace(oldHeader,
    `-- QA REMOTE SQL CANDIDATE; NOT APPROVED FOR EXECUTION.\n-- Release ${identity.releaseSha}; manifest SHA-256 ${identity.manifestSha256}.\n-- Independently review this exact SQL and recheck target, preimages, ingress and recovery before any apply.`);
  assert(candidateSql.includes("\nbegin;\n"), "TL_QA_RELEASE_TRANSACTION_HEADER_CHANGED");
  const sql = candidateSql.replace("\nbegin;\n", "\nbegin;\ndo $qa_release_not_approved$ begin raise exception 'TL_QA_RELEASE_SQL_NOT_APPROVED'; end $qa_release_not_approved$;\n");
  return Object.freeze({ sql, identity, sqlSha256: sha256(Buffer.from(sql)) });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.deepEqual(args.filter((arg) => arg.startsWith("--")), ["--manifest", "--vip-grant", "--output"],
    "Usage: --manifest <private-json> --vip-grant <private-json> --output <new-private-sql>");
  assert.equal(args.length, 6, "TL_QA_RELEASE_ARGUMENTS_INVALID");
  assert(/^\/private\/tmp\/touchline-qa-[a-zA-Z0-9_-]+\.sql$/.test(args[5]), "TL_QA_RELEASE_PRIVATE_OUTPUT_REQUIRED");
  const result = await prepareTouchlineQaReleaseSql({
    manifestBytes: await readFile(args[1]), vipGrant: JSON.parse(await readFile(args[3], "utf8")),
  });
  const handle = await open(args[5], "wx", 0o600);
  try { await handle.writeFile(result.sql, "utf8"); } finally { await handle.close(); }
  process.stdout.write(`${JSON.stringify({ releaseSha: result.identity.releaseSha,
    manifestSha256: result.identity.manifestSha256, sqlSha256: result.sqlSha256,
    pathCount: result.identity.paths.length, output: args[5], execution: "DRAFT_FAIL_CLOSED" })}\n`);
}
