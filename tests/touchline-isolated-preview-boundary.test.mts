import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
    "/market-transfer",
    "/admin",
    "/club-owner/me",
    "/live",
    "/touchline-clubs",
    "/touchline-players/example",
    "/touchline-tables",
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
    AWS_EXECUTION_ENV: "AWS_Lambda_nodejs22.x",
    AWS_REGION: "us-east-1",
    AWS_DEFAULT_REGION: "us-east-1",
    UV_PYTHON_DOWNLOADS_JSON_URL: "https://example.invalid/uv.json",
    TOUCHLINE_CARD_PUBLICATION_GATE: "enabled",
  })), {
    status: "qa",
    reasons: [],
  });
  assert.deepEqual(resolveTouchlineIsolatedPreviewRoutePolicy("/market-transfer", qaEnvironment()), {
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

  assert.ok(proxy.indexOf("resolveTouchlineIsolatedPreviewRoutePolicy(pathname)") < proxy.indexOf("canonicalPresentationLocaleRedirect(request)"));
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
