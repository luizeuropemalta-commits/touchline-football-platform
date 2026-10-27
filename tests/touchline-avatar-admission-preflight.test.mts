import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectCandidateAvatarConfiguration } from "../scripts/local/qa-avatar-admission-preflight.mts";
test("canonical builder projection proves independent origin, envelope and capability blockers", () => {
  const result = inspectCandidateAvatarConfiguration();
  assert.equal(result.basis, "canonical-builder-configuration-projection");
  assert.equal(result.credentialsRead, false); assert.equal(result.serverStarted, false);
  assert.equal(result.authenticated, false); assert.equal(result.retentionExecutionVerified, false);
  assert.equal(result.hostedEnvelopePresent, true);
  assert.deepEqual(result.candidate3100.codes, ["local_origin_rejected", "local_environment_rejected", "read_disabled", "upload_disabled", "selection_disabled", "retention_unverified", "configured_actor_invalid", "actor_unverified"]);
  assert.deepEqual(result.contract3319.codes, result.candidate3100.codes.filter(code => code !== "local_origin_rejected"));
  assert.equal(result.candidate3100.configuration, "blocked"); assert.equal(result.contract3319.configuration, "blocked");
});
test("CLI executes read-only projection and never echoes inherited secrets or host overrides", () => {
  const script = fileURLToPath(new URL("../scripts/local/qa-avatar-admission-preflight.mts", import.meta.url));
  const secret = "PRIVATE_SENTINEL_MUST_NOT_LEAK";
  const stdout = execFileSync(process.execPath, ["--experimental-strip-types", script], { encoding: "utf8",
    env: { PATH: process.env.PATH, SUPABASE_SERVICE_ROLE_KEY: secret, TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED: "true" } });
  assert.ok(!stdout.includes(secret)); assert.ok(!stdout.includes("placeholder")); assert.ok(!stdout.includes("supabase.co"));
  assert.deepEqual(JSON.parse(stdout), inspectCandidateAvatarConfiguration());
});
