import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TOUCHLINE_QA_SUPABASE_PROJECT_REF,
  inspectTouchlineQaVercelEnvironment,
} from "../lib/touchlinePreview/qa-environment-verifier-core.ts";

const QA_HOSTNAME = "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app";
const QA_ORIGIN = `https://${QA_HOSTNAME}`;
const QA_SUPABASE_ORIGIN = `https://${TOUCHLINE_QA_SUPABASE_PROJECT_REF}.supabase.co`;

function qaEnvironment(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    VERCEL_URL: "touchline-arena-official-candidate.vercel.app",
    VERCEL_BRANCH_URL: QA_HOSTNAME,
    VERCEL_GIT_COMMIT_REF: "qa",
    TOUCHLINE_DEPLOYMENT_MODE: "qa-preview",
    NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: "qa-preview",
    TOUCHLINE_QA_SUPABASE_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL: QA_SUPABASE_ORIGIN,
    SUPABASE_URL: QA_SUPABASE_ORIGIN,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: `anon_${"a".repeat(40)}`,
    SUPABASE_SERVICE_ROLE_KEY: `service_${"b".repeat(40)}`,
    NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN: QA_ORIGIN,
    ...overrides,
  };
}

test("exact QA Vercel, alias and Supabase configuration returns only PASS plus a safe reason", () => {
  assert.deepEqual(inspectTouchlineQaVercelEnvironment({
    environment: qaEnvironment(),
    requestHostname: QA_HOSTNAME,
  }), {
    status: "PASS",
    reason: "QA_ENVIRONMENT_CONFIGURATION_COHERENT",
  });
});

test("non-QA, Production and wrong branch environments fail closed", () => {
  for (const environment of [
    qaEnvironment({ VERCEL_ENV: "production" }),
    qaEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
    qaEnvironment({ VERCEL_GIT_COMMIT_REF: "QA" }),
    qaEnvironment({ VERCEL_GIT_COMMIT_REF: "Qa" }),
    qaEnvironment({ VERCEL_GIT_COMMIT_REF: " qa " }),
    qaEnvironment({ TOUCHLINE_DEPLOYMENT_MODE: "isolated-preview" }),
  ]) {
    const result = inspectTouchlineQaVercelEnvironment({ environment, requestHostname: QA_HOSTNAME });
    assert.equal(result.status, "FAIL");
    assert.ok(["QA_RUNTIME_INVALID", "QA_BRANCH_MISMATCH"].includes(result.reason));
  }
});

test("the stable QA alias is mandatory and no hostname is reflected", () => {
  const foreignHostname = "private-value.example";
  const requestMismatch = inspectTouchlineQaVercelEnvironment({
    environment: qaEnvironment(),
    requestHostname: foreignHostname,
  });
  const branchAliasMismatch = inspectTouchlineQaVercelEnvironment({
    environment: qaEnvironment({ VERCEL_BRANCH_URL: foreignHostname }),
    requestHostname: QA_HOSTNAME,
  });
  assert.deepEqual(requestMismatch, { status: "FAIL", reason: "QA_ALIAS_MISMATCH" });
  assert.deepEqual(branchAliasMismatch, { status: "FAIL", reason: "QA_ALIAS_MISMATCH" });
  assert.doesNotMatch(JSON.stringify([requestMismatch, branchAliasMismatch]), /private-value/i);
});

test("Supabase project and origin mismatches return one non-sensitive reason", () => {
  const secretUrl = "https://wrong-project.supabase.co/private-path?secret=value";
  for (const environment of [
    qaEnvironment({ TOUCHLINE_QA_SUPABASE_PROJECT_REF: "wrong-project" }),
    qaEnvironment({ NEXT_PUBLIC_SUPABASE_URL: secretUrl }),
    qaEnvironment({ SUPABASE_URL: secretUrl }),
    qaEnvironment({ NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN: "https://wrong.example" }),
  ]) {
    const result = inspectTouchlineQaVercelEnvironment({ environment, requestHostname: QA_HOSTNAME });
    assert.equal(result.status, "FAIL");
    assert.ok(["QA_RUNTIME_INVALID", "QA_PROJECT_MISMATCH", "QA_AUTH_ORIGIN_MISMATCH"].includes(result.reason));
    assert.doesNotMatch(JSON.stringify(result), /wrong-project|private-path|secret=value|wrong\.example/i);
  }
});

test("missing, short or reused credentials fail without identifying or echoing them", () => {
  const repeatedCredential = `same_${"x".repeat(40)}`;
  for (const environment of [
    qaEnvironment({ NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined }),
    qaEnvironment({ SUPABASE_SERVICE_ROLE_KEY: "short" }),
    qaEnvironment({
      NEXT_PUBLIC_SUPABASE_ANON_KEY: repeatedCredential,
      SUPABASE_SERVICE_ROLE_KEY: repeatedCredential,
    }),
  ]) {
    assert.deepEqual(inspectTouchlineQaVercelEnvironment({
      environment,
      requestHostname: QA_HOSTNAME,
    }), { status: "FAIL", reason: "QA_CREDENTIAL_CONFIGURATION_INVALID" });
  }
});

test("server facade and protected route never serialize environment values or raw provider errors", () => {
  const server = readFileSync(
    new URL("../lib/touchlinePreview/qa-environment-verifier-server.ts", import.meta.url),
    "utf8",
  );
  const route = readFileSync(
    new URL("../app/api/admin/qa-environment/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(server, /^import "server-only";/);
  assert.match(route, /inspectTouchlineQaVercelEnvironment/);
  assert.match(route, /hasTouchLineArenaAccess/);
  assert.match(route, /isOwnerEmail/);
  assert.match(route, /touchline_assert_qa_fixture_target/);
  assert.match(route, /Cache-Control": "private, no-store, max-age=0"/);
  assert.doesNotMatch(route, /console\.|error\.message|JSON\.stringify\(process\.env|Object\.entries\(process\.env/);
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL/);
  assert.doesNotMatch(route, /return\s+NextResponse\.json\(\s*process\.env/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});
