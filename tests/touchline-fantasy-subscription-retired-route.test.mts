import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/api/touchline-fantasy/subscription/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

type AuthScenario = "authenticated" | "anonymous" | "no-email" | "auth-error" | "auth-throws" | "no-client" | "client-throws";

function harness(scenario: AuthScenario = "authenticated") {
  const calls = { client: 0, auth: 0, stripe: 0, config: 0, fetch: 0, body: 0 };
  const exports: Record<string, unknown> = {};
  const forbidden = (name: "stripe" | "config" | "fetch" | "body"): never => {
    calls[name]++;
    throw new Error(`Retired checkout must not access ${name}`);
  };
  runInNewContext(compiled, {
    exports,
    URL,
    process: { env: new Proxy({}, { get: () => forbidden("config") }) },
    fetch: () => forbidden("fetch"),
    require: (specifier: string) => {
      if (specifier === "next/server") return {
        NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
      };
      if (specifier === "@/lib/supabase/server") return {
        createClient: async () => {
          calls.client++;
          if (scenario === "client-throws") throw new Error("Synthetic auth configuration unavailable");
          if (scenario === "no-client") return null;
          return { auth: { getUser: async () => {
            calls.auth++;
            if (scenario === "auth-throws") throw new Error("Synthetic auth request failed");
            return {
              data: { user: scenario === "anonymous" ? null : {
                id: "synthetic-user", email: scenario === "no-email" ? null : "member@example.test",
              } },
              error: scenario === "auth-error" ? { message: "Synthetic invalid session" } : null,
            };
          } } };
        },
      };
      if (specifier.toLowerCase().includes("stripe") || specifier === "@/lib/touchlineFantasy/subscription") {
        return forbidden("stripe");
      }
      throw new Error(`Unexpected checkout dependency: ${specifier}`);
    },
  });
  const request = (origin: string | null = "https://qa.example.test") => ({
    headers: new Headers(origin === null ? {} : { origin, "content-type": "application/json" }),
    nextUrl: new URL("https://qa.example.test/api/touchline-fantasy/subscription"),
    get body() { return forbidden("body"); },
    json: async () => forbidden("body"),
    text: async () => forbidden("body"),
    arrayBuffer: async () => forbidden("body"),
    formData: async () => forbidden("body"),
  });
  return { calls, request, post: exports.POST as (request: ReturnType<typeof request>) => Promise<Response> };
}

function assertNoBillingOrBody(calls: ReturnType<typeof harness>["calls"]) {
  assert.equal(calls.stripe, 0, "even the billing/Stripe module must stay unloaded");
  assert.equal(calls.config, 0, "retirement needs no billing environment or price configuration");
  assert.equal(calls.fetch, 0, "the checkout route must not issue an external request");
  assert.equal(calls.body, 0, "retirement must precede parsing any request body");
}

test("retired monthly GBP checkout returns 410 after authentication without loading billing or reading body", async () => {
  const h = harness();
  const response = await h.post(h.request());
  assert.equal(response.status, 410);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "LEGACY_GBP_CHECKOUT_RETIRED",
    message: "This monthly GBP offer is no longer available. Existing subscriptions are unchanged.",
  });
  assert.equal(h.calls.client, 1);
  assert.equal(h.calls.auth, 1);
  assertNoBillingOrBody(h.calls);
});

test("retired checkout still rejects absent, malformed and cross-origin requests before auth", async () => {
  for (const origin of [null, "null", "not-a-url", "https://other.example.test", "http://qa.example.test", "https://qa.example.test:8443"]) {
    const h = harness();
    const response = await h.post(h.request(origin));
    assert.equal(response.status, 403, String(origin));
    assert.deepEqual(await response.json(), { ok: false, error: "INVALID_ORIGIN" });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(h.calls.client, 0);
    assert.equal(h.calls.auth, 0);
    assertNoBillingOrBody(h.calls);
  }
});

test("retired checkout requires a verified auth response even when a failed response contains a user", async () => {
  for (const scenario of ["anonymous", "no-email", "auth-error", "auth-throws", "no-client", "client-throws"] as const) {
    const h = harness(scenario);
    const response = await h.post(h.request());
    assert.equal(response.status, 401, scenario);
    assert.deepEqual(await response.json(), { ok: false, error: "AUTH_REQUIRED" });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assertNoBillingOrBody(h.calls);
  }
});

test("repeating a legacy checkout request cannot create or replace a subscription", async () => {
  const h = harness();
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await h.post(h.request());
    assert.equal(response.status, 410);
    const body = await response.json();
    assert.equal(Object.hasOwn(body, "url"), false);
    assert.equal(Object.hasOwn(body, "subscription"), false);
    assert.equal(body.error, "LEGACY_GBP_CHECKOUT_RETIRED");
  }
  assert.equal(h.calls.auth, 3);
  assertNoBillingOrBody(h.calls);
});
