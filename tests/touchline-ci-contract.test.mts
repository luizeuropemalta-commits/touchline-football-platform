import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/touchline-ci.yml", import.meta.url);

test("CI candidate is read-only and covers every required release gate", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /pnpm\/action-setup@v4/);
  assert.match(workflow, /version: 11\.9\.0/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm run check:release-readiness/);
  assert.match(workflow, /pnpm exec tsc --noEmit --incremental false/);
  assert.match(workflow, /pnpm run lint/);
  assert.match(workflow, /pnpm run test/);
  assert.match(workflow, /git diff --check/);
  assert.match(workflow, /git status --porcelain/);
  assert.match(workflow, /pnpm run build/);

  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(workflow, /SPORTMONKS/);
  assert.doesNotMatch(workflow, /STRIPE/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /vercel deploy|supabase db push|git push/i);
});
