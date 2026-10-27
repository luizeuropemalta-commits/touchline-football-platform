import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { stripTypeScriptTypes } from "node:module";
import { arenaRequiredSources, readArenaScrollBundle } from "./helpers/touchline-arena-scroll-bundle-receipt.mts";

function fixture(t: TestContext) {
  const root = mkdtempSync("/private/tmp/touchline-arena-receipt-source-");
  const directory = mkdtempSync("/private/tmp/touchline-arena-scroll-");
  t.after(() => { rmSync(directory, { recursive: true }); rmSync(root, { recursive: true }); });
  const sha256: Record<string, string> = {};
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  for (const source of arenaRequiredSources) {
    const file = path.join(root, source); mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, source); sha256[source] = digest(source);
  }
  const script = "fixture-only script", css = "fixture-only css";
  writeFileSync(path.join(directory, "fixture.js"), script);
  writeFileSync(path.join(directory, "fixture.css"), css);
  const receipt = { sources: [...arenaRequiredSources], sha256, outputs: { script: digest(script), css: digest(css) } };
  const save = () => writeFileSync(path.join(directory, "fixture-sources.json"), JSON.stringify(receipt));
  save(); return { root, directory, receipt, save };
}

test("Arena reuse reads validated outputs without importing a compiler", t => {
  const f = fixture(t), result = readArenaScrollBundle(f.root, f.directory);
  assert.equal(result.script, "fixture-only script"); assert.equal(result.css, "fixture-only css");
  assert.deepEqual(result.sources, [...arenaRequiredSources]);
});

for (const source of ["app/fantasy/FantasyGameweekClient.tsx", "tests/helpers/touchline-arena-scroll-compile-worker.mts"]) {
  test(`Arena reuse rejects stale ${source}`, t => {
    const f = fixture(t); writeFileSync(path.join(f.root, source), "changed after compilation");
    assert.throws(() => readArenaScrollBundle(f.root, f.directory), /unchanged real source/);
  });
}
for (const output of ["fixture.js", "fixture.css"]) {
  test(`Arena reuse rejects changed ${output}`, t => {
    const f = fixture(t); writeFileSync(path.join(f.directory, output), "changed output");
    assert.throws(() => readArenaScrollBundle(f.root, f.directory), /compiled .* receipt/);
  });
}
test("Arena reuse rejects missing required source provenance", t => {
  const f = fixture(t); f.receipt.sources.pop(); f.save();
  assert.throws(() => readArenaScrollBundle(f.root, f.directory), /Arena provenance requires/);
});
test("Arena reuse rejects aliases, output symlinks and source traversal", t => {
  const f = fixture(t);
  assert.throws(() => readArenaScrollBundle(f.root, `${f.directory}/../${path.basename(f.directory)}`));
  assert.throws(() => readArenaScrollBundle(f.root, f.directory.replace("/private/tmp", "/tmp")));
  const alias = `${f.directory}Alias`; symlinkSync(f.directory, alias);
  t.after(() => rmSync(alias));
  assert.throws(() => readArenaScrollBundle(f.root, alias), /exact real path/);
  rmSync(path.join(f.directory, "fixture.js"));
  symlinkSync(path.join(f.directory, "fixture.css"), path.join(f.directory, "fixture.js"));
  assert.throws(() => readArenaScrollBundle(f.root, f.directory), /output symlinks/);
  rmSync(path.join(f.directory, "fixture.js")); writeFileSync(path.join(f.directory, "fixture.js"), "fixture-only script");
  f.receipt.sources.push("../outside" as typeof arenaRequiredSources[number]); f.save();
  assert.throws(() => readArenaScrollBundle(f.root, f.directory), /invalid source path/);
});
test("Arena harness retains capacity gates and explicit opt-in reuse with no fallback compilation", () => {
  const source = readFileSync(new URL("./touchline-clubowner-arena-scroll-browser.test.mts", import.meta.url), "utf8");
  assert.match(source, /TOUCHLINE_ARENA_SCROLL_BUNDLE_DIR/);
  assert.match(source, /if \(reuseDirectory === undefined\) await new Promise/);
  assert.match(source, /readArenaScrollBundle\(rootPath, directory\)/);
  assert.ok(source.indexOf("readArenaScrollBundle(rootPath, directory)") < source.indexOf("engine.launch"));
  // Execute the actual wrapper and shared helper with controlled local OS
  // reads. This preserves the helper's io === local boundary and never starts
  // a real system process or browser.
  const wrappers = source.match(/^  const capacity = \(\) => requireBrowserCapacity\([^\n]+;$/gm);
  assert.equal(wrappers?.length, 1, "one bounded real capacity wrapper required");
  const helper = readFileSync(new URL("./helpers/touchline-browser-capacity.mts", import.meta.url), "utf8");
  const helperBody = stripTypeScriptTypes(helper.replace(/^import .*;\n/gm, "").replace(/^export /gm, ""));
  const check = (pressure: string, options: { override?: string; ci?: string; free?: number; disk?: bigint; injected?: boolean } = {}) => {
    const calls: string[] = [];
    const disk = options.disk ?? 5n * 1024n ** 3n + 1n;
    const invoke = options.injected
      ? "requireBrowserCapacity(rootPath, { darwinFreePercent: true }, { ...local });"
      : `${wrappers![0]}\ncapacity();`;
    runInNewContext(`${helperBody}\n${invoke}`, {
      assert, posix: path.posix, rootPath: "fixture-root",
      process: { platform: "darwin", env: { TOUCHLINE_LOCAL_IGNORE_MEMORY_GATE: options.override, CI: options.ci } },
      console: { warn: () => { calls.push("override-warning"); } },
      statfsSync: (root: string) => { assert.equal(root, "fixture-root"); calls.push("disk"); return { bavail: disk, bsize: 1n }; },
      readFileSync: () => { throw new Error("Unexpected filesystem read"); },
      execFileSync: (command: string, args: string[]) => {
        calls.push(command);
        if (command === "sysctl") { assert.deepEqual(Array.from(args), ["-n", "kern.memorystatus_vm_pressure_level"]); return pressure; }
        assert.equal(command, "memory_pressure"); assert.equal(args.length, 0);
        return `System-wide memory free percentage: ${options.free ?? 25}%`;
      },
    }, { timeout: 1000 });
    return calls;
  };
  assert.deepEqual(check("1"), ["disk", "sysctl", "memory_pressure"]);
  for (const pressure of ["0", "2", "4", "8", "unknown"]) assert.throws(() => check(pressure));
  for (const free of [24, 101, NaN]) assert.throws(() => check("1", { free }));
  for (const disk of [0n, 5n * 1024n ** 3n]) {
    assert.throws(() => check("1", { disk }));
    assert.throws(() => check("4", { disk, override: "1" }), /5 GiB/);
  }
  // Only the explicit local operator override bypasses memory, never disk,
  // never CI, and never dependency-injected IO pretending to be local.
  assert.deepEqual(check("4", { override: "1", free: 0 }), ["disk", "override-warning"]);
  for (const override of [undefined, "", "0", "true"]) assert.throws(() => check("2", { override }));
  assert.throws(() => check("4", { override: "1", ci: "true" }));
  assert.throws(() => check("4", { override: "1", injected: true }));
  assert.match(source, /timeout: 120_000/);
});
