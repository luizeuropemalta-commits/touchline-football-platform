import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("functions use one Frankfurt region alongside the canonical Supabase databases", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  // No new cron, redirect, environment, build-machine or concurrency override.
  // Runtime deployment metadata remains the authority for actual placement.
  assert.deepEqual(config, {
    $schema: "https://openapi.vercel.sh/vercel.json",
    regions: ["fra1"],
  });
});
