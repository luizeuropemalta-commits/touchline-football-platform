import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRankingsFramesDirectory, createRankingsRenderRun, rankingsRenderInputOptions, writeRankingsEvidence } from "../scripts/local/rankings-render-output.mjs";

test("rankings runs are exclusive and preserve legacy, interrupted and current evidence", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tl-rankings-output-s02-"));
  t.diagnostic(`Retained test evidence (no cleanup): ${root}`);
  const legacyInput = path.join(root, "render-input-20260914.json");
  const legacySample = path.join(root, "golden-boot-feed-start.png");
  const interrupted = path.join(root, "golden-boot-feed-frames");
  await mkdir(interrupted);
  const oldFrame = path.join(interrupted, "frame-0000.png");
  const sentinel = Buffer.from("prior evidence must survive");
  for (const file of [legacyInput, legacySample, oldFrame]) await writeFile(file, sentinel, { flag: "wx" });
  const inputBytes = Buffer.from('{ "synthetic": true }\n');
  const runs = await Promise.all([createRankingsRenderRun(root, inputBytes), createRankingsRenderRun(root, inputBytes)]);
  assert.notEqual(runs[0].runRoot, runs[1].runRoot);
  for (const run of runs) {
    assert.equal(path.dirname(run.runRoot), root);
    assert.deepEqual(await readFile(run.inputPath), inputBytes);
    await assert.rejects(writeRankingsEvidence(run.inputPath, "replacement"), { code: "EEXIST" });
    assert.deepEqual(await readFile(run.inputPath), inputBytes);
    const frames = await createRankingsFramesDirectory(run.runRoot, "golden-boot-feed");
    const frame = path.join(frames, "frame-0000.png");
    await writeRankingsEvidence(frame, sentinel);
    await assert.rejects(createRankingsFramesDirectory(run.runRoot, "golden-boot-feed"), { code: "EEXIST" });
    await assert.rejects(writeRankingsEvidence(frame, "replacement"), { code: "EEXIST" });
    assert.deepEqual(await readFile(frame), sentinel);
    await assert.rejects(createRankingsFramesDirectory(run.runRoot, "../escape"), /INVALID_FRAME_STEM/);
  }
  for (const file of [legacyInput, legacySample, oldFrame]) assert.deepEqual(await readFile(file), sentinel);
});

test("rankings CLI keeps legacy read fallback and requires unambiguous preparation", () => {
  const root = path.resolve("synthetic-artifacts");
  assert.deepEqual(rankingsRenderInputOptions([], root), {
    prepare: false, prepareOnly: false, sourcePath: path.join(root, "render-input-20260914.json"),
  });
  assert.deepEqual(rankingsRenderInputOptions(["--prepare-input", "--prepare-only"], root), {
    prepare: true, prepareOnly: true, sourcePath: null,
  });
  assert.equal(rankingsRenderInputOptions(["--input=prepared.json"], root).sourcePath, path.resolve("prepared.json"));
  assert.throws(() => rankingsRenderInputOptions(["--prepare-only"], root), /PREPARE_ONLY_REQUIRES/);
  assert.throws(() => rankingsRenderInputOptions(["--prepare-input", "--input=x"], root), /INPUT_AND_PREPARE/);
  assert.throws(() => rankingsRenderInputOptions(["--input="], root), /INVALID_INPUT/);
  assert.throws(() => rankingsRenderInputOptions(["--input=a", "--input=b"], root), /INVALID_INPUT/);
});

test("renderer uses isolated output helpers, preserves source input and manifest provenance", async () => {
  const source = await readFile(new URL("../scripts/touchline-social-rankings-live-render.mjs", import.meta.url), "utf8");
  assert.match(source, /createRankingsRenderRun\(artifactRoot, inputBytes\)/);
  assert.match(source, /readFile\(inputOptions\.sourcePath\)/);
  assert.match(source, /createRankingsFramesDirectory\(runRoot, stem\)/);
  assert.match(source, /snapshotPath: path\.relative\(process\.cwd\(\), inputPath\), snapshotSha256: hash\(inputBytes\)/);
  assert.doesNotMatch(source, /\b(?:writeFile|mkdir|rm|rmdir)\s*\(/);
  assert.doesNotMatch(source, /writeRankingsEvidence\((?:inputOptions\.sourcePath|path\.join\(artifactRoot)/);
  for (const suffix of ["start.png", "quarter.png", "verification.json", "manifest.json", "dispatch-proposal.json", "mp4"]) {
    assert.ok(source.includes(`path.join(runRoot, \`\${stem}-${suffix}\`)`) || (suffix === "mp4" && source.includes("path.join(runRoot, `${stem}.mp4`)")), suffix);
  }
  assert.ok(source.indexOf("INPUT_REPREPARATION_REQUIRED") < source.indexOf("await createRankingsRenderRun"));
  assert.ok(source.indexOf("if (inputOptions.prepareOnly) process.exit(0)") < source.indexOf("chromium.launch"));
});
