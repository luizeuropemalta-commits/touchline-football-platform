import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { readRankingsLocalInput, rankingsInputSelection, validateRankingsLocalInput } from "../lib/social-rankings-render-input-local.mjs";

const hash = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
const value = (identity: string) => ({ identity, publicCardsRevalidated: true, coachSnapshotValidated: true,
  goldenBootEvidenceSha256: "synthetic", data: { provenance: { source: "LOCAL_CANONICAL_REPLAY_NOT_PUBLISHED" }, publishable: false, weeklySelection: { complete: true } } });

test("reader binds exact run bytes, never falls back and preserves legacy", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tl-s02-binding-"));
  t.diagnostic(`Retained synthetic evidence: ${root}`);
  const legacy = path.join(root, "render-input-20260914.json");
  await writeFile(legacy, JSON.stringify(value("A")), { flag: "wx" });
  const run = path.join(root, "render-Ab1234"); await mkdir(run);
  const file = path.join(run, "render-input.json");
  const bytes = JSON.stringify(value("B")); await writeFile(file, bytes, { flag: "wx" });
  const result = await readRankingsLocalInput(root, "render-Ab1234", hash(bytes));
  assert.equal((result.input as unknown as { identity: string }).identity, "B");
  assert.equal(result.inputSha256, hash(bytes));
  assert.equal(result.runId, "render-Ab1234");
  await writeFile(legacy, JSON.stringify(value("A2")));
  assert.deepEqual(await readRankingsLocalInput(root, "render-Ab1234", hash(bytes)), result);
  await assert.rejects(readRankingsLocalInput(root, "render-Ab1234", "0".repeat(64)), /HASH_MISMATCH/);
  await writeFile(file, JSON.stringify(value("changed")));
  await assert.rejects(readRankingsLocalInput(root, "render-Ab1234", hash(bytes)), /HASH_MISMATCH/);
  await assert.rejects(readRankingsLocalInput(root, "render-absent", hash(bytes)), { code: "ENOENT" });
  await symlink(run, path.join(root, "render-Link01"));
  await assert.rejects(readRankingsLocalInput(root, "render-Link01", hash(bytes)), /INVALID_RANKINGS_RUN_DIRECTORY/);
  const linkedFileRun = path.join(root, "render-Link02"); await mkdir(linkedFileRun);
  await symlink(legacy, path.join(linkedFileRun, "render-input.json"));
  await assert.rejects(readRankingsLocalInput(root, "render-Link02", hash(bytes)), /INVALID_RANKINGS_INPUT_FILE/);
  assert.equal(JSON.parse(await readFile(legacy, "utf8")).identity, "A2");
});

test("selection rejects paths, arrays and partial parameters; validation retains fail-closed flags", () => {
  const digest = "a".repeat(64);
  assert.equal(rankingsInputSelection(undefined, undefined), null);
  for (const run of ["", "../render-Ab1234", "%2e%2e", "render-Ab1234/", ["render-Ab1234"], undefined]) {
    assert.throws(() => rankingsInputSelection(run, digest), /INVALID_RANKINGS_INPUT_SELECTION/);
  }
  for (const sha of [undefined, "", "A".repeat(64), [digest]]) {
    assert.throws(() => rankingsInputSelection("render-Ab1234", sha), /INVALID_RANKINGS_INPUT_SELECTION/);
  }
  for (const property of ["publicCardsRevalidated", "coachSnapshotValidated", "goldenBootEvidenceSha256"]) {
    assert.throws(() => validateRankingsLocalInput({ ...value("x"), [property]: false }), /INVALID_LOCAL_REVIEW/);
  }
  assert.throws(() => validateRankingsLocalInput({ ...value("x"), data: { ...value("x").data, publishable: true } }), /INVALID_LOCAL_REVIEW/);
  assert.throws(() => validateRankingsLocalInput({ ...value("x"), data: { ...value("x").data, weeklySelection: {} } }), /INVALID_LOCAL_REVIEW/);
});

test("real page passes selector, uses reader DTO and emits reader digest rather than query echo", async () => {
  const require = createRequire(import.meta.url);
  const ts = require("typescript");
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const source = await readFile(new URL("../app/visual-qa/social-rankings-live/page.tsx", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const verified = { input: value("B"), runId: "render-Reader", inputSha256: "reader-digest" };
  let selected: unknown[] = [];
  const pageModule = { exports: {} as { default?: (props: unknown) => Promise<unknown> } };
  const scopedRequire = (id: string) => {
    if (id === "next/navigation") return { notFound: () => { throw new Error("NOT_FOUND"); } };
    if (id === "@/lib/social-rankings-live-contract") return { RANKINGS_LIVE_ART_IDS: ["GOLDEN_BOOT"] };
    if (id === "@/lib/social-rankings-live-server") return { readRankingsLiveRenderInput: async (...args: unknown[]) => { selected = args; return verified; } };
    if (id === "@/components/touchline/social/TouchlineSocialRankingsLive") return { default: ({ input }: { input: unknown }) => {
      assert.equal(input, verified.input); return React.createElement("span", null, "synthetic B");
    } };
    return require(id);
  };
  // Dependency injection exercises the real page without importing its admin/preparation graph.
  new Function("require", "module", "exports", "process", js)(scopedRequire, pageModule, pageModule.exports, { env: { NODE_ENV: "development" } });
  const element = await pageModule.exports.default!({ searchParams: Promise.resolve({ artId: "GOLDEN_BOOT", runId: "render-Query1", inputSha256: "query-digest" }) });
  assert.deepEqual(selected, ["render-Query1", "query-digest"]);
  const html = renderToStaticMarkup(element);
  assert.match(html, /data-rankings-input-run="render-Reader"/);
  assert.match(html, /data-rankings-input-sha256="reader-digest"/);
  assert.doesNotMatch(html, /query-digest/);
});

test("renderer waits for streamed binding and checks identity before any capture", async () => {
  const source = await readFile(new URL("../scripts/touchline-social-rankings-live-render.mjs", import.meta.url), "utf8");
  assert.match(source, /searchParams.set\("runId", runId\)/);
  assert.match(source, /searchParams.set\("inputSha256", inputSha256\)/);
  assert.ok(source.indexOf("RANKINGS_PAGE_INPUT_BINDING_MISMATCH") < source.indexOf("art.screenshot"));
  assert.doesNotMatch(source, /RANKINGS_RENDER_INPUT_BINDING_NOT_VERIFIED/);
  assert.match(source, /binding\.first\(\)\.waitFor\(\{ state: "attached", timeout: 15000 \}\)/);
  assert.ok(source.indexOf("binding.first().waitFor") < source.indexOf("binding.count()"));
  assert.match(source, /binding\.count\(\) !== 1/);
  assert.match(source, /getAttribute\("data-rankings-input-run"\) !== runId/);
  assert.match(source, /getAttribute\("data-rankings-input-sha256"\) !== inputSha256/);
  const server = await readFile(new URL("../lib/social-rankings-live-server.ts", import.meta.url), "utf8");
  const reader = server.slice(server.indexOf("export async function readRankingsLiveRenderInput"));
  assert.ok(reader.indexOf("LOCAL_DEVELOPMENT_ONLY") < reader.indexOf("readRankingsLocalInput(root(), runId, inputSha256)"));
});
