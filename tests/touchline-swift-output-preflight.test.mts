import test from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { statfsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readlink, realpath, lstat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

test("real Swift output preflight preserves existing targets and rejects lookup errors", {
  skip: process.env.TOUCHLINE_RUN_SWIFT_OUTPUT_PREFLIGHT !== "1", timeout: 90_000,
}, async t => {
  assert.equal(process.platform, "darwin", "Darwin preflight requires installed macOS toolchain");
  const capacity = (directory: string) => {
    const disk = statfsSync(directory);
    assert.ok(disk.bavail * disk.bsize > 5 * 1024 ** 3, "capacity gate: disk must exceed 5 GiB");
    const memory = execFileSync("/usr/bin/memory_pressure", [], { encoding: "utf8", timeout: 3000 });
    const percentage = Number(memory.match(/System-wide memory free percentage: (\d+)%/)?.[1]);
    assert.ok(Number.isFinite(percentage) && percentage >= 25, "capacity gate: memory must be at least 25%");
  };
  capacity(tmpdir());
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "tl-swift-preflight-")));
  t.diagnostic(`Preserved Swift harness/evidence (no cleanup): ${root}`);
  const source = await readFile(new URL("../scripts/local/encode-png-sequence-to-mp4.swift", import.meta.url), "utf8");
  const start = source.indexOf("let output = URL(fileURLWithPath: arguments[1])");
  const end = source.indexOf("let frames = try FileManager.default.contentsOfDirectory(");
  assert.ok(start >= 0 && end > start, "review extraction if encoder structure changes");
  const guard = source.slice(start, end);
  assert.doesNotMatch(guard, /AppKit|AVFoundation|CoreVideo|AVAssetWriter|removeItem|write\(/);
  assert.match(guard, /lstat\(/);
  assert.match(guard, /errno == ENOENT/);
  // Exact production guard, not a JavaScript reimplementation. Only argument setup and success marker are harness code.
  const swift = `import Foundation\nimport Darwin\nlet arguments = Array(CommandLine.arguments.dropFirst())\n${guard}\nprint("PREFLIGHT_ACCEPTED")\n`;
  const sourcePath = path.join(root, "preflight.swift"), binary = path.join(root, "preflight");
  await writeFile(sourcePath, swift, { flag: "wx" });
  const cache = path.join(root, "module-cache"); await mkdir(cache);
  const run = (file: string, args: string[], timeout: number) => new Promise<{ code: number | string | null; stdout: string; stderr: string }>((resolve, reject) => {
    if (t.signal.aborted) { reject(new Error("test already aborted before spawn")); return; }
    capacity(root);
    if (t.signal.aborted) { reject(new Error("test aborted during capacity check")); return; }
    let pressureError: unknown;
    const child = execFile(file, args, { timeout, maxBuffer: 256 * 1024, env: { ...process.env, CLANG_MODULE_CACHE_PATH: cache, SWIFT_MODULECACHE_PATH: cache } }, (error, stdout, stderr) => {
      clearInterval(monitor); t.signal.removeEventListener("abort", abort);
      if (pressureError) { reject(pressureError); return; }
      if (error && (error.killed || error.signal)) { reject(error); return; }
      resolve({ code: error?.code ?? 0, stdout, stderr });
    });
    const abort = () => { child.kill("SIGTERM"); };
    t.signal.addEventListener("abort", abort, { once: true });
    if (t.signal.aborted) abort();
    const monitor = setInterval(() => {
      try { capacity(root); } catch (error) { pressureError = error; child.kill("SIGTERM"); }
    }, 2000);
  });
  // One compilation only, Foundation/Darwin, no frame loading or video encoding.
  const compilation = await run("/usr/bin/swiftc", ["-module-cache-path", cache, sourcePath, "-o", binary], 45_000);
  assert.equal(compilation.code, 0, compilation.stderr);
  const regular = path.join(root, "existing.mp4"); await writeFile(regular, "file-sentinel", { flag: "wx" });
  const directory = path.join(root, "directory.mp4"); await mkdir(directory);
  const nested = path.join(directory, "sentinel"); await writeFile(nested, "directory-sentinel", { flag: "wx" });
  const linked = path.join(root, "linked.mp4"); await symlink(regular, linked);
  const dangling = path.join(root, "dangling.mp4"); await symlink(path.join(root, "absent-target"), dangling);
  const newFile = path.join(root, "new.mp4");
  // ENOTDIR is deterministic without changing permissions or relying on a non-root user.
  const lookupError = path.join(regular, "child.mp4");
  const scenarios = [["regular", regular, 73], ["directory", directory, 73], ["symlink", linked, 73],
    ["dangling", dangling, 73], ["new", newFile, 0], ["lookup-error-ENOTDIR", lookupError, 73],
    ["wrong-extension", path.join(root, "new.txt"), 64]] as const;
  const results = [];
  for (const [name, output, expected] of scenarios) {
    const result = await run(binary, ["unused-frames", output], 5000);
    if (name === "directory") assert.ok(result.code === 64 || result.code === 73, `${name}: ${result.stderr}`);
    else assert.equal(result.code, expected, `${name}: ${result.stderr}`);
    assert.equal(result.stdout.includes("PREFLIGHT_ACCEPTED"), expected === 0, name);
    assert.equal(await readFile(regular, "utf8"), "file-sentinel");
    assert.equal(await readFile(nested, "utf8"), "directory-sentinel");
    assert.equal(await readlink(linked), regular);
    assert.equal(await readlink(dangling), path.join(root, "absent-target"));
    await assert.rejects(lstat(newFile), { code: "ENOENT" });
    results.push({ name, ...result });
  }
  capacity(root);
  await writeFile(path.join(root, "evidence.json"), JSON.stringify({
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    extractedSha256: createHash("sha256").update(guard).digest("hex"),
    compilation, results, scope: "Swift preflight only, no encoder/video validation",
  }, null, 2), { flag: "wx" });
});
