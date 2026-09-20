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

// These tests replay locally rendered Social Studio evidence kept in
// `artifacts/`. The directory intentionally stays out of the Git/Vercel
// deployment input: it contains private review media and large decoder
// outputs, not product runtime inputs. The contract, source-gate, persistence
// and rollback Social Studio tests remain in the remote gate.
const LOCAL_ARTIFACT_REPLAY_TESTS = new Set([
  "touchline-social-events-live-watch.test.mts",
  "touchline-social-lineup-live-editorial.test.mts",
  "touchline-social-rankings-live-catalog.test.mts",
  "touchline-social-rankings-live-editorial.test.mts",
  "touchline-social-rankings-live-golden-boot.test.mts",
  "touchline-social-rankings-live.test.mts",
]);

const testsDirectory = resolve(process.cwd(), "tests");
const testFiles = (await readdir(testsDirectory))
  .filter((file) => file.endsWith(".test.mts")
    && !DOCS_ARTIFACT_TESTS.has(file)
    && !LOCAL_ARTIFACT_REPLAY_TESTS.has(file))
  .sort()
  .map((file) => resolve(testsDirectory, file));

const result = spawnSync(process.execPath, [
  "--test",
  // Keep the complete suite, but bound simultaneous workers on the local
  // audit Mac and the cost-safe Vercel build machine.
  "--test-concurrency=2",
  "--test-force-exit",
  "--test-timeout=30000",
  "--experimental-strip-types",
  ...testFiles,
], { stdio: "inherit" });

process.exit(result.status ?? 1);
