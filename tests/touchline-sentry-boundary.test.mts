import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { scrubTouchlineSentryEvent } from "../lib/sentry/privacy.ts";

test("Sentry privacy boundary strips credentials, personal data, query strings and request bodies", () => {
  const event = scrubTouchlineSentryEvent({
    message: "Bearer secret-value",
    user: { id: "owner-uuid", email: "owner@example.com", ip_address: "127.0.0.1" },
    request: {
      method: "POST",
      url: "https://touchline.com.br/login?returnTo=/arena",
      headers: { authorization: "Bearer secret-value", cookie: "session=secret" },
      data: { password: "not-for-sentry" },
    },
    extra: {
      harmless: "kept",
      SUPABASE_SERVICE_ROLE_KEY: "not-for-sentry",
      nested: { accessToken: "not-for-sentry" },
    },
  });

  assert.deepEqual(event.user, { id: "owner-uuid" });
  assert.deepEqual(event.request, {
    method: "POST",
    url: "https://touchline.com.br/login",
  });
  assert.equal(event.extra?.harmless, "kept");
  assert.equal(event.extra?.SUPABASE_SERVICE_ROLE_KEY, "[Filtered]");
  assert.deepEqual(event.extra?.nested, { accessToken: "[Filtered]" });
  assert.equal(event.message, "[Filtered]");
});

test("Sentry integration is inactive without DSN and never embeds auth tokens", async () => {
  const [clientSource, serverSource, globalErrorSource, optionsSource, nextConfig, envExample] = await Promise.all([
    readFile(new URL("../instrumentation-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../sentry.server.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/global-error.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/sentry/options.ts", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(clientSource, /NEXT_PUBLIC_SENTRY_DSN/);
  assert.match(serverSource, /SENTRY_DSN/);
  assert.match(globalErrorSource, /Sentry\.captureException\(error\)/);
  assert.match(optionsSource, /enabled:\s*Boolean\(dsn\)/);
  assert.match(optionsSource, /sendDefaultPii:\s*false/);
  assert.match(optionsSource, /tracesSampleRate:\s*0/);
  assert.match(nextConfig, /disable:\s*!process\.env\.SENTRY_AUTH_TOKEN/);
  assert.match(nextConfig, /deleteSourcemapsAfterUpload:\s*true/);
  assert.match(envExample, /^SENTRY_AUTH_TOKEN=$/m);
  assert.doesNotMatch(
    [clientSource, serverSource, globalErrorSource, optionsSource, nextConfig, envExample].join("\n"),
    /sntrys_[A-Za-z0-9_\/+=.-]+/,
  );
});
