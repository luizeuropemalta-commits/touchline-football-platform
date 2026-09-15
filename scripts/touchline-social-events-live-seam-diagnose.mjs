import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import sharp from "sharp";
import { assessEventsLiveSeam, compareEventsLivePixels } from "../lib/touchlineArena/social-events-live-media-evidence.ts";

// Offline, read-only inputs. Always write a NEW private report, never alter failed evidence.
const arg = key => process.argv.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3);
const privateRoot = resolve("artifacts/social-studio/events");
if (!arg("directory") || !arg("report")) throw new Error("DIRECTORY_AND_NEW_REPORT_REQUIRED");
const directory = resolve(arg("directory")), reportPath = resolve(arg("report"));
for (const path of [directory, reportPath]) {
  if (relative(privateRoot, path).startsWith("..") || path === privateRoot) throw new Error("PRIVATE_EVENTS_PATH_REQUIRED");
}
if (dirname(reportPath) !== privateRoot) throw new Error("REPORT_MUST_BE_IN_PRIVATE_EVENTS_ROOT");
const sha = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const originalBytes = await readFile(join(directory, "seam-evidence.json"));
const original = JSON.parse(originalBytes);
const phases = {};
for (const phase of ["start", "mid", "end", "second-mid", "second-loop"]) {
  const path = join(directory, `${phase}.png`), bytes = await readFile(path);
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error("RGB_SOURCE_REQUIRED");
  phases[phase] = { data, info, sha256: sha(bytes), rawSha256: sha(data) };
}
const compare = (first, second) => {
  const a = phases[first], b = phases[second];
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) throw new Error("PHASE_DIMENSIONS_DIFFER");
  return compareEventsLivePixels(a.data, b.data, a.info.width, a.info.height);
};
const pixelComparisons = { firstSeam: compare("start", "end"), secondSeam: compare("end", "second-loop"),
  repeatedMid: compare("mid", "second-mid"), motion: compare("start", "mid") };
const files = await readdir(directory);
const report = {
  directory, generatedAt: new Date().toISOString(), originalEvidenceSha256: sha(originalBytes),
  originalResult: { passed: original.passed, checks: original.checks },
  encodedArtifactCount: files.filter(file => file.endsWith(".mp4")).length,
  decodedComparison: files.includes("decode") ? "AVAILABLE_NOT_EVALUATED_BY_SOURCE_SEAM_PROBE" : "UNAVAILABLE_JOB_STOPPED_BEFORE_ENCODER",
  sourceChecksums: Object.fromEntries(Object.entries(phases).map(([phase, value]) => [phase, { png: value.sha256, rgb: value.rawSha256 }])),
  pixelComparisons, reassessment: assessEventsLiveSeam(original.joins, original.geometry, pixelComparisons),
  publishable: false, loopSeamReviewed: false,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ ...report, reportPath }));
if (!report.reassessment.passed) process.exitCode = 1;
