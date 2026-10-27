import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");

/** Lightweight parent boundary: never import TypeScript or the bundler here. */
export async function compileRankingBrowserFixture(kind: "podium" | "zoom", signal: AbortSignal) {
  assert.ok(kind === "podium" || kind === "zoom", "unknown ranking fixture kind");
  signal.throwIfAborted();
  const directory = mkdtempSync(`/private/tmp/touchline-ranking-${kind}-`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types",
      path.join(root, "tests/helpers/touchline-ranking-browser-compile-worker.mts"), kind, directory], {
      cwd: root, stdio: "ignore",
    });
    let failure: Error | undefined;
    const abort = () => { failure = new Error("Ranking fixture compilation aborted"); child.kill("SIGKILL"); };
    const timeout = setTimeout(() => {
      failure = new Error("Ranking fixture compilation exceeded 30 seconds"); child.kill("SIGKILL");
    }, 30_000);
    signal.addEventListener("abort", abort, { once: true });
    child.once("error", () => { failure = new Error("Ranking fixture compiler could not start"); });
    child.once("close", code => {
      clearTimeout(timeout); signal.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`Ranking fixture compiler exited with code ${code}; evidence directory: ${directory}`));
      else resolve();
    });
    if (signal.aborted) abort();
  });
  signal.throwIfAborted();
  const script = readFileSync(path.join(directory, "fixture.js"), "utf8");
  const css = readFileSync(path.join(directory, "fixture.css"), "utf8");
  const receipt = JSON.parse(readFileSync(path.join(directory, "fixture-sources.json"), "utf8")) as {
    kind: string; sources: string[]; sha256: Record<string, string>;
  };
  assert.equal(receipt.kind, kind);
  assert.ok(script.length > 0 && css.length > 0 && Array.isArray(receipt.sources) && receipt.sources.length > 0,
    "fresh compiled ranking fixture and source receipt required");
  for (const source of receipt.sources) assert.ok(typeof source === "string" && /^[a-f0-9]{64}$/.test(receipt.sha256[source]));
  return { script, css, sources: receipt.sources, directory };
}
