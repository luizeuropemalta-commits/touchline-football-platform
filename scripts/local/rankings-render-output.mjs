import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";

export function rankingsRenderInputOptions(args, artifactRoot) {
  const prepare = args.includes("--prepare-input");
  const prepareOnly = args.includes("--prepare-only");
  const inputs = args.filter((value) => value.startsWith("--input="));
  if (inputs.length > 1 || (inputs.length && !inputs[0].slice(8))) throw new Error("INVALID_INPUT_ARGUMENT");
  if (prepare && inputs.length) throw new Error("INPUT_AND_PREPARE_ARE_EXCLUSIVE");
  if (prepareOnly && !prepare) throw new Error("PREPARE_ONLY_REQUIRES_PREPARE_INPUT");
  return {
    prepare,
    prepareOnly,
    sourcePath: prepare ? null : inputs.length ? path.resolve(inputs[0].slice(8)) : path.join(artifactRoot, "render-input-20260914.json"),
  };
}

export async function writeRankingsEvidence(filePath, bytes) {
  await writeFile(filePath, bytes, { flag: "wx" });
}

export async function createRankingsRenderRun(artifactRoot, inputBytes) {
  await mkdir(artifactRoot, { recursive: true });
  const runRoot = await mkdtemp(path.join(artifactRoot, "render-"));
  const inputPath = path.join(runRoot, "render-input.json");
  await writeRankingsEvidence(inputPath, inputBytes);
  return { runRoot, inputPath };
}

export async function createRankingsFramesDirectory(runRoot, stem) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stem)) throw new Error("INVALID_FRAME_STEM");
  const framesDir = path.join(runRoot, `${stem}-frames`);
  await mkdir(framesDir);
  return framesDir;
}
