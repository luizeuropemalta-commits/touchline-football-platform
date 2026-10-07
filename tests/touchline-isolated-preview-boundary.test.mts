import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRankingLoadDiagnostics } from "../lib/touchlineArena/ranking-load-diagnostics.ts";
import { inspectTouchlineQaVercelEnvironment } from "../lib/touchlinePreview/qa-environment-verifier-core.ts";
import { TOUCHLINE_QA_HOSTNAME, TOUCHLINE_QA_ORIGIN } from "../lib/touchlineArena/public-origin.ts";

import {
  inspectTouchlineIsolatedPreviewEnvironment,
  resolveTouchlineIsolatedPreviewRoutePolicy,
  TOUCHLINE_ISOLATED_PREVIEW_MODE,
  TOUCHLINE_QA_PREVIEW_MODE,
  TOUCHLINE_PREVIEW_AUTH_UNAVAILABLE_DIAGNOSTIC,
} from "../lib/touchlinePreview/isolation.ts";

function isolatedEnvironment(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    VERCEL_URL: "touchline-isolated-pr-123.vercel.app",
    VERCEL_PROJECT_ID: "prj_isolated_preview",
    VERCEL_ORG_ID: "team_isolated_preview",
    TOUCHLINE_DEPLOYMENT_MODE: TOUCHLINE_ISOLATED_PREVIEW_MODE,
    NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: TOUCHLINE_ISOLATED_PREVIEW_MODE,
    TOUCHLINE_ISOLATED_PREVIEW_PROJECT_ID: "prj_isolated_preview",
    TOUCHLINE_ISOLATED_PREVIEW_TEAM_ID: "team_isolated_preview",
    ...overrides,
  };
}

function qaEnvironment(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    VERCEL_URL: "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app",
    VERCEL_PROJECT_ID: "prj_official",
    VERCEL_ORG_ID: "team_official",
    TOUCHLINE_DEPLOYMENT_MODE: TOUCHLINE_QA_PREVIEW_MODE,
    NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: TOUCHLINE_QA_PREVIEW_MODE,
    NEXT_PUBLIC_SUPABASE_URL: "https://qa-project.supabase.co",
    SUPABASE_URL: "https://qa-project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "qa-anon",
    SUPABASE_SERVICE_ROLE_KEY: "qa-service-role",
    TOUCHLINE_QA_SUPABASE_PROJECT_REF: "qa-project",
    ...overrides,
  };
}

test("Fixture account scope admits only its exact private name in the complete QA envelope", () => {
  const key = "TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE";
  const environment: Readonly<Record<string, string | undefined>> = Object.freeze(qaEnvironment({
    VERCEL_GIT_COMMIT_REF: "qa", VERCEL_BRANCH_URL: TOUCHLINE_QA_HOSTNAME,
    NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN: TOUCHLINE_QA_ORIGIN,
    NEXT_PUBLIC_SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
    SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
    TOUCHLINE_QA_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-qa-anon-not-a-real-credential",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-qa-service-not-a-real-credential",
    TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED: "false",
    [key]: "synthetic-fixture-scope",
  }));
  const before = { ...environment };
  const verify = (snapshot: Readonly<Record<string, string | undefined>>, requestHostname = TOUCHLINE_QA_HOSTNAME) =>
    inspectTouchlineQaVercelEnvironment({ environment: snapshot, requestHostname });
  assert.deepEqual(inspectTouchlineIsolatedPreviewEnvironment(environment), { status: "qa", reasons: [] });
  assert.deepEqual(verify(environment), { status: "PASS", reason: "QA_ENVIRONMENT_CONFIGURATION_COHERENT" });
  assert.deepEqual(resolveTouchlineIsolatedPreviewRoutePolicy("/api/football-data/live-sync", environment), { status: "inactive" });
  // Name admission is not value validation, a provider allowance or activation.
  assert.equal(inspectTouchlineIsolatedPreviewEnvironment({ ...environment, [key]: "" }).status, "qa");
  assert.equal(inspectTouchlineIsolatedPreviewEnvironment(isolatedEnvironment({ [key]: environment[key] })).status, "invalid");
  for (const patch of [
    { VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "main" }, { VERCEL_BRANCH_URL: "other.vercel.app" },
    { SUPABASE_URL: "https://other.supabase.co" }, { NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" },
    { TOUCHLINE_QA_SUPABASE_PROJECT_REF: "other" }, { NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN: "https://other.example.test" },
    { VERCEL_URL: undefined }, { VERCEL_URL: "invalid" }, { SUPABASE_SERVICE_ROLE_KEY: undefined },
    { TOUCHLINE_DEPLOYMENT_MODE: TOUCHLINE_ISOLATED_PREVIEW_MODE },
  ]) assert.equal(verify({ ...environment, ...patch }).status, "FAIL", JSON.stringify(Object.keys(patch)));
  assert.equal(verify(environment, "other.example.test").status, "FAIL");
  for (const forbidden of [`NEXT_PUBLIC_${key}`, `${key}_OTHER`, "TOUCHLINE_OTHER_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE",
    "TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT", "STRIPE_SECRET_KEY", "AWS_ACCESS_KEY_ID"]) {
    // Pass the whole snapshot, including the forbidden key; never filter it.
    const snapshot = Object.freeze({ ...environment, [forbidden]: "synthetic-forbidden-value" });
    const result = inspectTouchlineIsolatedPreviewEnvironment(snapshot);
    assert.equal(result.status, "invalid", forbidden);
    if (result.status !== "invalid") assert.fail("Forbidden configuration must stay visible");
    assert.ok(result.reasons.includes(`forbidden-qa-environment-key:${forbidden}`));
    assert.ok(result.reasons.every(reason => !reason.includes("synthetic-forbidden-value")));
    assert.equal(verify(snapshot).status, "FAIL");
    assert.equal(resolveTouchlineIsolatedPreviewRoutePolicy("/api/football-data/live-sync", snapshot).status, "blocked");
  }
  assert.deepEqual(environment, before);
});

test("QA admits only exact push configuration names and never public private-key variants", () => {
  const settings = {
    NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY: "synthetic-public-key",
    TOUCHLINE_WEB_PUSH_PRIVATE_KEY: "synthetic-private-key",
    TOUCHLINE_WEB_PUSH_SUBJECT: "mailto:qa@example.test",
  };
  assert.equal(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment(settings)).status, "qa");
  for (const key of Object.keys(settings)) {
    assert.equal(inspectTouchlineIsolatedPreviewEnvironment(isolatedEnvironment({ [key]: "sentinel" })).status, "invalid");
    assert.equal(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment({ [`${key}_OTHER`]: "sentinel" })).status, "invalid");
  }
  for (const key of ["NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PRIVATE_KEY", "NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_SUBJECT"]) {
    const environment = qaEnvironment({ ...settings, [key]: "sentinel" });
    assert.equal(inspectTouchlineIsolatedPreviewEnvironment(environment).status, "invalid");
    assert.equal(resolveTouchlineIsolatedPreviewRoutePolicy("/clubowner", environment).status, "blocked");
  }
  for (const patch of [{ VERCEL_ENV: "production" }, { SUPABASE_URL: "https://other.supabase.co" }]) {
    assert.equal(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment({ ...settings, ...patch })).status, "invalid");
  }
});

test("phone rehearsal configuration names are private QA-only allowances, not send authority", () => {
  const settings = {
    TOUCHLINE_PUSH_REHEARSAL_ENABLED: "false",
    TOUCHLINE_PUSH_REHEARSAL_ACCOUNT_ID: "11111111-1111-4111-8111-111111111111",
    TOUCHLINE_PUSH_REHEARSAL_INSTALLATION_ID: "22222222-2222-4222-8222-222222222222",
    TOUCHLINE_PUSH_REHEARSAL_ORIGIN: "https://qa.example.test",
  };
  assert.equal(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment(settings)).status, "qa");
  for (const key of Object.keys(settings)) {
    assert.equal(inspectTouchlineIsolatedPreviewEnvironment(isolatedEnvironment({ [key]: "sentinel" })).status, "invalid");
    for (const forbidden of [`NEXT_PUBLIC_${key}`, `${key}_OTHER`]) {
      assert.equal(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment({ [forbidden]: "sentinel" })).status, "invalid");
    }
  }
  for (const patch of [{ VERCEL_ENV: "production" }, { SUPABASE_URL: "https://other.supabase.co" }]) {
    assert.equal(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment({ ...settings, ...patch })).status, "invalid");
  }
});

test("avatar read flag name is QA-only, never public, isolated or environment activation", () => {
  const key = "TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED";
  for (const value of ["false", "true"]) {
    assert.equal(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment({ [key]: value })).status, "qa");
    assert.equal(inspectTouchlineIsolatedPreviewEnvironment(isolatedEnvironment({ [key]: value })).status, "invalid");
    for (const patch of [{ VERCEL_ENV: "production" }, { SUPABASE_URL: "https://other.supabase.co" },
      { VERCEL_URL: undefined }, { VERCEL_URL: "invalid" }, { STRIPE_SECRET_KEY: "synthetic-forbidden" }]) {
      assert.equal(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment({ [key]: value, ...patch })).status, "invalid");
    }
  }
  for (const forbidden of [`NEXT_PUBLIC_${key}`, `${key}_OTHER`]) {
    assert.equal(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment({ [forbidden]: "true" })).status, "invalid");
  }
});

test("avatar upload configuration names admit only private QA preparation, never activation or notification authority", () => {
  const keys = ["TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ENABLED", "TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID"];
  const settings = { [keys[0]]: "false", [keys[1]]: "11111111-1111-4111-8111-111111111111" };
  const before = { ...settings };
  assert.equal(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment(settings)).status, "qa");
  for (const key of keys) {
    assert.equal(inspectTouchlineIsolatedPreviewEnvironment(isolatedEnvironment({ [key]: settings[key] })).status, "invalid");
    for (const forbidden of [`NEXT_PUBLIC_${key}`, `${key}_OTHER`]) {
      assert.equal(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment({ ...settings, [forbidden]: "sentinel" })).status, "invalid");
    }
  }
  for (const patch of [{ VERCEL_ENV: "production" }, { SUPABASE_URL: "https://other.supabase.co" },
    { STRIPE_SECRET_KEY: "sentinel" }, { AWS_ACCESS_KEY_ID: "sentinel" }]) {
    assert.equal(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment({ ...settings, ...patch })).status, "invalid");
  }
  assert.deepEqual(settings, before);
});

test("match push worker settings remain server-only and constrained to functional QA", () => {
  const keys = ["TOUCHLINE_MATCH_PUSH_WORKER_ENABLED", "TOUCHLINE_MATCH_PUSH_WORKER_SECRET", "TOUCHLINE_MATCH_PUSH_SOURCE_AGE_POLICY"];
  for (const enabled of ["false", "true"]) {
    const settings = { [keys[0]]: enabled, [keys[1]]: "synthetic-secret-0000000000000000000000", [keys[2]]: "{}" };
    assert.equal(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment(settings)).status, "qa");
    assert.deepEqual(resolveTouchlineIsolatedPreviewRoutePolicy("/api/notifications/match-push/dispatch", qaEnvironment(settings)), { status: "inactive" });
    for (const patch of [{ VERCEL_ENV: "production" }, { SUPABASE_URL: "https://other.supabase.co" }]) {
      assert.equal(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment({ ...settings, ...patch })).status, "invalid");
    }
  }
  for (const key of keys) {
    assert.equal(inspectTouchlineIsolatedPreviewEnvironment(isolatedEnvironment({ [key]: "sentinel" })).status, "invalid");
    for (const forbidden of [`NEXT_PUBLIC_${key}`, `${key}_OTHER`]) {
      assert.equal(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment({ [forbidden]: "sentinel" })).status, "invalid");
    }
  }
});

test("exact private Golden Boot settings admit QA without weakening isolated or public boundaries", () => {
  const keys = ["TOUCHLINE_GOLDEN_BOOT_ENABLED", "TOUCHLINE_GOLDEN_BOOT_REFRESH_ENABLED", "TOUCHLINE_GOLDEN_BOOT_REFRESH_SECRET"];
  const paths = ["/clubowner", "/rankings", "/touchline-clubs", "/api/touchline-awards/golden-boot", "/api/touchline-awards/golden-boot/refresh"];
  for (const enabled of ["false", "true"]) {
    const environment = qaEnvironment({ [keys[0]]: enabled, [keys[1]]: enabled, [keys[2]]: "synthetic-secret-not-real-000000000000" });
    assert.equal(inspectTouchlineIsolatedPreviewEnvironment(environment).status, "qa");
    for (const path of paths) assert.deepEqual(resolveTouchlineIsolatedPreviewRoutePolicy(path, environment), { status: "inactive" });
    for (const patch of [{ SUPABASE_URL: "https://other.supabase.co" }, { VERCEL_ENV: "production" }]) {
      assert.equal(inspectTouchlineIsolatedPreviewEnvironment({ ...environment, ...patch }).status, "invalid");
    }
  }
  for (const key of keys) {
    assert.equal(inspectTouchlineIsolatedPreviewEnvironment(isolatedEnvironment({ [key]: "synthetic-only" })).status, "invalid");
    for (const forbidden of [`NEXT_PUBLIC_${key}`, `${key}_OTHER`]) {
      const environment = qaEnvironment({ [forbidden]: "synthetic-only" });
      assert.equal(inspectTouchlineIsolatedPreviewEnvironment(environment).status, "invalid");
      for (const path of paths) assert.equal(resolveTouchlineIsolatedPreviewRoutePolicy(path, environment).status, "blocked");
    }
  }
});

test("exact server ranking timing key admits real QA contract only and collector remains gated", async () => {
  const environment = qaEnvironment({
    VERCEL_GIT_COMMIT_REF: "qa", TOUCHLINE_QA_RANKING_TIMINGS: "true",
    NEXT_PUBLIC_SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
    SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
    TOUCHLINE_QA_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy",
  });
  assert.equal(inspectTouchlineIsolatedPreviewEnvironment(environment).status, "qa");
  let summaries = 0;
  const diagnostics = createRankingLoadDiagnostics(environment, () => 1, () => { summaries++; });
  await Promise.all((["activeRanking", "topXI", "catalog", "coach", "count", "fixtures", "auth"] as const)
    .map(label => diagnostics.measure(label, () => Promise.resolve(null))));
  diagnostics.seal(); assert.equal(summaries, 1);
  for (const patch of [{ VERCEL_ENV: "production" }, { NEXT_PUBLIC_SUPABASE_URL: "https://production.supabase.co" }]) {
    const invalid = { ...environment, ...patch };
    assert.equal(inspectTouchlineIsolatedPreviewEnvironment(invalid).status, "invalid");
    const disabled = createRankingLoadDiagnostics(invalid, () => assert.fail("clock must remain off"), () => assert.fail("log"));
    await disabled.measure("auth", () => Promise.resolve(null)); disabled.seal();
  }
  for (const key of ["NEXT_PUBLIC_TOUCHLINE_QA_RANKING_TIMINGS", "TOUCHLINE_QA_RANKING_TIMINGS_OTHER"]) {
    assert.equal(inspectTouchlineIsolatedPreviewEnvironment({ ...environment, [key]: "true" }).status, "invalid");
  }
  assert.equal(inspectTouchlineIsolatedPreviewEnvironment(isolatedEnvironment({ TOUCHLINE_QA_RANKING_TIMINGS: "true" })).status, "invalid");
});

test("only an exact Vercel-bound isolated contract enables the inert preview route", () => {
  assert.deepEqual(inspectTouchlineIsolatedPreviewEnvironment({ NODE_ENV: "test" }), {
    status: "inactive",
    reasons: [],
  });
  assert.deepEqual(inspectTouchlineIsolatedPreviewEnvironment(isolatedEnvironment()), {
    status: "active",
    reasons: [],
  });

  assert.deepEqual(
    resolveTouchlineIsolatedPreviewRoutePolicy("/preview", isolatedEnvironment()),
    { status: "allow-preview" },
  );
  for (const pathname of [
    "/api/football-data/premier-squad",
    "/auth/callback",
    "/login",
    "/arena",
    "/clubowner",
    "/admin",
    "/club-owner/me",
    "/live",
    "/touchline-clubs",
    "/touchline-players/example",
    "/rankings",
    "/touchline-player-card-rankings",
    "/_next/image",
    "/robots.txt",
    "/sitemap.xml",
  ]) {
    assert.deepEqual(
      resolveTouchlineIsolatedPreviewRoutePolicy(pathname, isolatedEnvironment()),
      { status: "blocked", reason: "isolated-preview", diagnosticReasons: [] },
      pathname,
    );
  }
});

test("an ordinary Vercel Preview fails closed because no Staging Supabase exists", () => {
  const environment = {
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    VERCEL_URL: "touchline-ordinary-pr-123.vercel.app",
    VERCEL_PROJECT_ID: "prj_official",
    VERCEL_ORG_ID: "team_official",
  };

  assert.deepEqual(inspectTouchlineIsolatedPreviewEnvironment(environment), {
    status: "invalid",
    reasons: [TOUCHLINE_PREVIEW_AUTH_UNAVAILABLE_DIAGNOSTIC],
  });
  assert.deepEqual(resolveTouchlineIsolatedPreviewRoutePolicy("/login", environment), {
    status: "blocked",
    reason: "invalid-preview-contract",
    diagnosticReasons: [TOUCHLINE_PREVIEW_AUTH_UNAVAILABLE_DIAGNOSTIC],
  });
  assert.deepEqual(inspectTouchlineIsolatedPreviewEnvironment({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    VERCEL_URL: "touchline.com.br",
  }), {
    status: "inactive",
    reasons: [],
  });
});

test("a dedicated QA Supabase contract enables functional Preview routes without isolated headers", () => {
  assert.deepEqual(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment()), {
    status: "qa",
    reasons: [],
  });
  assert.deepEqual(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment({
    TOUCHLINE_LIVE_SYNC_SECRET: "scheduler-secret-kept-server-side",
  })), {
    status: "qa",
    reasons: [],
  });
  assert.deepEqual(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment({
    AWS_EXECUTION_ENV: "AWS_Lambda_nodejs22.x",
    AWS_REGION: "us-east-1",
    AWS_DEFAULT_REGION: "us-east-1",
    UV_PYTHON_DOWNLOADS_JSON_URL: "https://example.invalid/uv.json",
    TOUCHLINE_CARD_PUBLICATION_GATE: "enabled",
  })), {
    status: "qa",
    reasons: [],
  });
  assert.deepEqual(resolveTouchlineIsolatedPreviewRoutePolicy("/clubowner", qaEnvironment()), {
    status: "inactive",
  });

  const missingQaServiceRole = inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment({
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  }));
  assert.equal(missingQaServiceRole.status, "invalid");
  if (missingQaServiceRole.status === "invalid") {
    assert.ok(missingQaServiceRole.reasons.includes("missing-or-mismatched-qa-supabase-contract"));
  }

  assert.deepEqual(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment({
    SPORTMONKS_API_TOKEN: "qa-only-token",
  })), { status: "qa", reasons: [] });

  assert.deepEqual(inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment({
    // Server-only feature gate: QA may carry the value without exposing it.
    TOUCHLINE_PLAYER_SOCIAL_ENABLED: "true",
  })), { status: "qa", reasons: [] });

  const awsCredentialLeak = inspectTouchlineIsolatedPreviewEnvironment(qaEnvironment({
    AWS_ACCESS_KEY_ID: "not-allowed",
  }));
  assert.equal(awsCredentialLeak.status, "invalid");
  if (awsCredentialLeak.status === "invalid") {
    assert.ok(awsCredentialLeak.reasons.includes("forbidden-qa-environment-key:AWS_ACCESS_KEY_ID"));
  }
});

test("missing Preview identity or mode fails closed without exposing a value", () => {
  const result = inspectTouchlineIsolatedPreviewEnvironment(isolatedEnvironment({
    VERCEL_ENV: undefined,
    TOUCHLINE_DEPLOYMENT_MODE: undefined,
    VERCEL_URL: "unexpected-preview.vercel.app",
    TOUCHLINE_ISOLATED_PREVIEW_PROJECT_ID: undefined,
  }));
  assert.equal(result.status, "invalid");
  if (result.status !== "invalid") return;
  assert.ok(result.reasons.includes("vercel-env-not-preview"));
  assert.ok(result.reasons.includes("missing-server-preview-mode"));
  assert.ok(result.reasons.includes("project-binding-mismatch"));
  assert.ok(result.reasons.every((reason) => !reason.includes("unexpected-preview")));
  assert.deepEqual(
    resolveTouchlineIsolatedPreviewRoutePolicy("/preview", isolatedEnvironment({
      VERCEL_ENV: undefined,
      TOUCHLINE_DEPLOYMENT_MODE: undefined,
      VERCEL_URL: "unexpected-preview.vercel.app",
    })),
    {
      status: "blocked",
      reason: "invalid-preview-contract",
      diagnosticReasons: [
        "vercel-env-not-preview",
        "missing-server-preview-mode",
      ],
    },
  );
});

test("any recognised production integration key rejects the isolated contract by name", () => {
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SPORTMONKS_API_TOKEN",
    "FOOTBALL_DATA_SYNC_SECRET",
    "TOUCHLINE_CARD_PUBLICATION_GATE",
    "TOUCHLINE_PLAYER_SOCIAL_ENABLED",
    "STRIPE_SECRET_KEY",
    "RESEND_API_KEY",
    "AWS_ACCESS_KEY_ID",
    "BLOB_READ_WRITE_TOKEN",
    "KV_REST_API_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "DATABASE_URL",
    "OPENAI_API_KEY",
    "VERCEL_OIDC_TOKEN",
  ]) {
    const result = inspectTouchlineIsolatedPreviewEnvironment(isolatedEnvironment({ [key]: "sentinel-value" }));
    assert.equal(result.status, "invalid", key);
    if (result.status !== "invalid") continue;
    assert.ok(result.reasons.includes(`forbidden-environment-key:${key}`), key);
    assert.ok(result.reasons.every((reason) => !reason.includes("sentinel-value")), key);
  }
});

test("proxy and Preview shell enforce the boundary before product work", () => {
  const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/preview/page.tsx", import.meta.url), "utf8");
  const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

  const isolationPolicy = proxy.indexOf("resolveTouchlineIsolatedPreviewRoutePolicy(pathname)");
  const localeRedirect = proxy.indexOf("canonicalPresentationLocaleRedirect(request, draftLocalesEnabled)");
  assert.ok(isolationPolicy >= 0 && localeRedirect >= 0);
  assert.ok(isolationPolicy < localeRedirect);
  assert.ok(proxy.indexOf("resolveTouchlineIsolatedPreviewRoutePolicy(pathname)") < proxy.indexOf("NEXT_PUBLIC_SUPABASE_URL"));
  assert.match(proxy, /x-touchline-preview/);
  assert.match(proxy, /request blocked by Preview contract/);
  assert.match(proxy, /diagnosticReasons/);
  assert.match(proxy, /connect-src 'none'; form-action 'none'/);
  assert.doesNotMatch(proxy, /_next\/static\|_next\/image/);
  assert.match(config, /assertTouchlineIsolatedPreviewEnvironment\(\)/);
  assert.match(layout, /!isIsolatedPreview \? \(/);
  assert.match(layout, /TouchLine isolated Preview/);
  assert.match(page, /TOUCHLINE_ISOLATED_PREVIEW_HEADER/);
  assert.match(page, /notFound\(\)/);
  assert.doesNotMatch(page, /supabase|fetch\(|TouchlineActivityTracker|AuthForm|ArenaClient|TouchlineMatchCentre|football-data/i);
});
