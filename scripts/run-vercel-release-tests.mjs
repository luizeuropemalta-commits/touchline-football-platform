import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Vercel intentionally excludes docs/ from the deployment input. These tests
// validate immutable local audit artifacts under docs/, so they remain part of
// `pnpm test` but cannot run inside the production build sandbox.
const DOCS_ARTIFACT_TESTS = new Set([
  "owner-approved-sportmonks-application-candidate.test.mts",
  "owner-approved-transcript-market-values.test.mts",
  "owner-approved-transcript-reconciliation.test.mts",
  "touchline-existing-verified-liverpool-publication-manifest.test.mts",
  "touchline-owner-approved-market-value-application-plan.test.mts",
  "touchline-owner-approved-market-value-binding.test.mts",
]);

const testsDirectory = resolve(process.cwd(), "tests");
const testFiles = (await readdir(testsDirectory))
  .filter((file) => file.endsWith(".test.mts") && !DOCS_ARTIFACT_TESTS.has(file))
  .sort()
  .map((file) => resolve(testsDirectory, file));

const result = spawnSync(process.execPath, [
  "--test",
  "--test-force-exit",
  "--test-timeout=30000",
  "--experimental-strip-types",
  ...testFiles,
], { stdio: "inherit" });

process.exit(result.status ?? 1);
