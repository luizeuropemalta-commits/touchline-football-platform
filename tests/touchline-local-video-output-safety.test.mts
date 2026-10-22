import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Source-contract checks only: these do not execute Swift or AVAssetWriter.
const source = readFileSync(new URL("../scripts/local/encode-png-sequence-to-mp4.swift", import.meta.url), "utf8");

test("encoder rejects non-mp4 and directory-shaped output before processing frames", () => {
  const validation = source.indexOf('guard output.pathExtension.lowercased() == "mp4", !output.hasDirectoryPath else {');
  assert.ok(validation > 0);
  assert.ok(validation < source.indexOf("contentsOfDirectory("));
  assert.match(source.slice(validation), /exit\(64\)/);
});

test("encoder rejects all existing entries including dangling symlinks and unknown lookup failures", () => {
  assert.match(source, /import Darwin/);
  assert.match(source, /var outputStatus = stat\(\)/);
  assert.match(source, /output\.path\.withCString \{ lstat\(\$0, &outputStatus\) \}/);
  assert.match(source, /guard outputLookup != 0 else \{\s*fputs\("refusing to replace existing output\\n", stderr\)\s*exit\(73\)\s*\}/);
  assert.match(source, /guard errno == ENOENT else \{\s*fputs\("unable to verify that output is absent\\n", stderr\)\s*exit\(73\)\s*\}/);
  assert.ok(source.indexOf("guard errno == ENOENT") < source.indexOf("AVAssetWriter(outputURL:"));
});

test("encoder does not remove or replace an existing output and retains normal writer creation", () => {
  assert.doesNotMatch(source, /removeItem|replaceItem|\bunlink\s*\(|\brename\s*\(/);
  assert.match(source, /AVAssetWriter\(outputURL: output, fileType: \.mp4\)/);
  assert.match(source, /guard writer\.startWriting\(\) else \{ throw writer\.error/);
});
