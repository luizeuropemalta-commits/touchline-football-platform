import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  assessVisit,
  buildSmokeRoutes,
  classifySmokeRequest,
  isExpectedSmokeDocument,
  parseSmokeConfig,
  runRouteSmoke,
  routeSmokeMain,
} from "../scripts/qa/run-touchline-route-smoke.mjs";

const customerId = "072900f3-27fc-41a5-9881-6913a486754e";
const adminId = "22222222-2222-4222-8222-222222222222";
const publicArgs = ["--base-url=http://127.0.0.1:3019", "--persona=public",
  "--club-path=/touchline-clubs/manchester-city", "--player-path=/touchline-players/test-player?playerId=123",
  "--coach-path=/touchline-coaches/test-coach"];
const customerArgs = [...publicArgs.filter((arg) => !arg.startsWith("--persona=")), "--persona=customer",
  "--storage-state=/private/tmp/explicit-authorized-customer-state.json", `--expected-user-id=${customerId}`];
const adminArgs = ["--base-url=http://127.0.0.1:3019", "--persona=admin",
  "--storage-state=/private/tmp/explicit-authorized-admin-state.json", `--expected-user-id=${adminId}`];

test("configuration requires explicit target/persona and never silently reads environment credentials", () => {
  for (const args of [[], [publicArgs[0]], ["--persona=public"], publicArgs.slice(0, 2),
    [...publicArgs, "--storage-state=/private/tmp/forbidden.json"],
    [...publicArgs, "--persona=admin"], [...publicArgs, "--unknown=true"],
    customerArgs.filter((arg) => !arg.startsWith("--storage-state=")),
    customerArgs.filter((arg) => !arg.startsWith("--expected-user-id=")),
    adminArgs.map((arg) => arg.startsWith("--expected-user-id=") ? `--expected-user-id=${customerId}` : arg),
  ]) assert.throws(() => parseSmokeConfig(args), /TL_SMOKE_/);
});

test("origins and dynamic identities fail closed against credentials, arbitrary hosts and action URLs", () => {
  for (const base of ["https://example.com", "http://touchline.com.br", "https://user:secret@touchline.com.br",
    "http://127.0.0.1:3019/arena", "http://127.0.0.1:3019/?token=private"]) {
    assert.throws(() => parseSmokeConfig(publicArgs.map((arg) => arg.startsWith("--base-url=") ? `--base-url=${base}` : arg)), /TL_SMOKE_/);
  }
  for (const path of ["//example.com/steal", "/auth/callback?code=private", "/touchline-players/a/../../admin",
    "/touchline-players/a?token=secret", "/touchline-players/a#fragment", "/touchline-players/a\\b"]) {
    assert.throws(() => parseSmokeConfig(publicArgs.map((arg) => arg.startsWith("--player-path=") ? `--player-path=${path}` : arg)), /TL_SMOKE_/);
  }
  const production = publicArgs.map((arg) => arg.startsWith("--base-url=") ? "--base-url=https://touchline.com.br" : arg);
  assert.throws(() => parseSmokeConfig(production), /PRODUCTION_READ_ACK_REQUIRED/);
  assert.equal(parseSmokeConfig([...production, "--allow-production-read=true"]).environment, "production");
});

test("current explicit route lists include My Club/social, preserve aliases and separate Admin from customers", () => {
  const customer = buildSmokeRoutes(parseSmokeConfig(customerArgs));
  assert.ok(customer.some((route) => route.path === "/my-club?lang=pt-BR"));
  assert.ok(customer.some((route) => route.path === "/market-transfer?lang=pt-BR"
    && route.expected === "/my-club?lang=pt-BR&tab=market#my-club-squad"));
  assert.ok(customer.some((route) => route.path === "/fantasy?lang=pt-BR"));
  assert.ok(customer.some((route) => route.path === "/club-owner/me?lang=pt-BR"));
  assert.equal(customer.some((route) => route.path.startsWith("/admin")), false);
  const admin = buildSmokeRoutes(parseSmokeConfig(adminArgs));
  assert.ok(admin.some((route) => route.path.startsWith("/admin/social-publications?")));
  assert.ok(admin.some((route) => route.path.startsWith("/admin/social-publications/studio?")));
  assert.ok(admin.every((route) => route.path.startsWith("/admin")));
  const publicRoutes = buildSmokeRoutes(parseSmokeConfig(publicArgs));
  assert.ok(publicRoutes.some((route) => route.path === "/touchline-clubs?lang=pt-BR"));
  assert.equal(publicRoutes.some((route) => route.path.startsWith("/my-club")), false);
  assert.equal(new Set(customer.map((route) => route.id)).size, customer.length);
});

test("write methods, action GETs, remote origins, callback credentials and unknown APIs are blocked", () => {
  const config = parseSmokeConfig(publicArgs);
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "CONNECT", "TRACE"]) {
    assert.notEqual(classifySmokeRequest(config, { method, url: `${config.baseUrl}/api/touchline-arena/state`, resourceType: "fetch" }), null);
  }
  for (const path of ["/auth/callback?code=private", "/api/football-data/live-sync", "/api/football-data/provider-diagnostic",
    "/api/admin/social-publications/review", "/api/unknown-read", "/logout", "/api/touchline-arena/state?code=private",
    "/api%2Ffootball-data%2Flive-sync", "//auth/callback"]) {
    assert.notEqual(classifySmokeRequest(config, { method: "GET", url: config.baseUrl + path, resourceType: "fetch" }), null, path);
  }
  assert.notEqual(classifySmokeRequest(config, { method: "GET", url: "https://external.invalid/image.png", resourceType: "image" }), null);
  for (const path of ["/api/touchline-arena/state", "/api/football-data/fixture-schedule", "/_next/static/chunk.js", "/touchlineArena/cards/card.webp"]) {
    assert.equal(classifySmokeRequest(config, { method: "GET", url: config.baseUrl + path, resourceType: "fetch" }), null, path);
  }
});

test("all same-origin resource types deny arbitrary GET destinations, not only API or document requests", () => {
  const config = parseSmokeConfig(publicArgs);
  for (const resourceType of ["document", "fetch", "xhr", "image", "script", "other"]) {
    for (const path of ["/admin/rebuild", "/maintenance/reset", "/arbitrary/image.png", "/touchlineArena-not-public/card.png",
      "/touchlineArena/unknown/card.png", "/_next/unknown", "/touchlineArena/cards/action", "/icons-not-public/icon.png"]) {
      assert.notEqual(classifySmokeRequest(config, { method: "GET", url: config.baseUrl + path, resourceType }), null, `${resourceType} ${path}`);
    }
  }
});

test("RSC and prefetch requests only read exact declared routes and query values", () => {
  const config = parseSmokeConfig(publicArgs);
  for (const path of ["/arena?lang=pt-BR&_rsc=hash123", "/touchline-clubs/manchester-city?lang=pt-BR&_rsc=hash123",
    "/touchline-players/test-player?playerId=123&lang=pt-BR&_rsc=hash123"]) {
    assert.equal(classifySmokeRequest(config, { method: "GET", url: config.baseUrl + path, resourceType: "fetch" }), null, path);
  }
  for (const path of ["/touchline-clubs/unlisted?lang=pt-BR&_rsc=hash123", "/admin?lang=pt-BR&_rsc=hash123",
    "/touchline-players/test-player?playerId=999&lang=pt-BR&_rsc=hash123", "/arena?lang=en-GB&_rsc=hash123",
    "/arena?lang=pt-BR&_rsc=a&_rsc=b", "/arena?lang=pt-BR&action=reset", "/arena?lang=pt-BR&unexpected=1"]) {
    assert.notEqual(classifySmokeRequest(config, { method: "GET", url: config.baseUrl + path, resourceType: "fetch" }), null, path);
  }
  assert.notEqual(classifySmokeRequest(config, { method: "GET", url: `${config.baseUrl}/arena?lang=pt-BR&_rsc=hash123`, resourceType: "document" }), null);
});

test("inventoried public static assets and same-origin optimized images remain readable without proxying arbitrary targets", () => {
  const config = parseSmokeConfig(publicArgs);
  for (const path of ["/_next/static/chunks/app.js", "/_next/static/css/app.css", "/_next/static/media/font.woff2",
    "/touchlineArena/cards/templates/zoom/players/card.webp?v=20260920", "/touchlineArena/arena/loop.mp4?v=202607170155",
    "/touchlineArena/asset-manifest.json", "/icons/touchline-192.png", "/apple-touch-icon.png", "/favicon.ico", "/manifest.webmanifest",
    "/_next/image?url=%2Ficons%2Ftouchline-192.png&w=256&q=75"]) {
    assert.equal(classifySmokeRequest(config, { method: "GET", url: config.baseUrl + path, resourceType: "image" }), null, path);
  }
  for (const path of ["/icons/touchline-192.png?action=reset", "/icons/touchline-192.png?unknown=1",
    "/_next/image?url=%2Fapi%2Ffootball-data%2Flive-sync&w=256&q=75",
    "/_next/image?url=https%3A%2F%2Fexternal.invalid%2Fimage.png&w=256&q=75",
    "/_next/image?url=%2Ficons%2Ftouchline-192.png%3Faction%3Dreset&w=256&q=75",
    "/_next/image?url=%2Ficons%2Ftouchline-192.png&w=256&q=75&action=reset"]) {
    assert.notEqual(classifySmokeRequest(config, { method: "GET", url: config.baseUrl + path, resourceType: "image" }), null, path);
  }
});

test("read APIs accept only inventoried query keys and never action or duplicate parameters", () => {
  const config = parseSmokeConfig(publicArgs);
  for (const path of ["/api/football-data/fantasy/fixture?fixtureId=19722167", "/api/football-data/fantasy/livescores?snapshot=1",
    "/api/football-data/premier-squad?teamId=9&clubName=Manchester+City&clubShortCode=MCI&clubLogoUrl=",
    "/api/touchline-arena/market/inventory?teamId=9"]) {
    assert.equal(classifySmokeRequest(config, { method: "GET", url: config.baseUrl + path, resourceType: "fetch" }), null, path);
  }
  for (const path of ["/api/touchline-arena/state?action=reset", "/api/football-data/fantasy/livescores?sync=1",
    "/api/football-data/fantasy/fixture?fixtureId=19722167&rebuild=true", "/api/touchline-arena/state?unknown=1",
    "/api/touchline-arena/market/inventory?teamId=9&teamId=8"]) {
    assert.notEqual(classifySmokeRequest(config, { method: "GET", url: config.baseUrl + path, resourceType: "fetch" }), null, path);
  }
});

test("HTTP 200/login or altered locale/hash/query never counts as a successful authenticated visit", () => {
  const config = parseSmokeConfig(customerArgs);
  const route = buildSmokeRoutes(config).find((entry) => entry.id === "market-alias")!;
  const healthy = { status: 200, finalUrl: `${config.baseUrl}${route.expected}`, mainReady: true, bodyError: false, issues: [] };
  assert.equal(assessVisit(config, route, healthy).ok, true);
  for (const change of [
    { finalUrl: `${config.baseUrl}/login?lang=pt-BR` },
    { finalUrl: `${config.baseUrl}/admin?lang=pt-BR` },
    { finalUrl: `${config.baseUrl}/my-club?lang=en-GB&tab=market#my-club-squad` },
    { finalUrl: `${config.baseUrl}/my-club?lang=pt-BR&tab=market` },
    { finalUrl: `${config.baseUrl}${route.expected.replace("#", "&unexpected=1#")}` },
    { status: 404 }, { status: 503 }, { mainReady: false }, { bodyError: true }, { issues: ["MUTATION_BLOCKED"] },
  ]) assert.equal(assessVisit(config, route, { ...healthy, ...change }).ok, false, JSON.stringify(change));
});

function browserHarness(options: {
  userId?: string; admin?: boolean; stateStatus?: number; loginRoute?: string;
  failRoute?: string; mutation?: boolean; renderFails?: boolean; transientRedirect?: boolean;
  consoleStatus?: number; websocket?: boolean; cleanupFails?: boolean;
  subresource?: { path: string; resourceType: string };
  documentRequests?: boolean;
} = {}) {
  const calls: string[] = [];
  let routeGuard: ((route: unknown) => Promise<void>) | undefined;
  let closed = 0;
  let contextOptions: Record<string, unknown> = {};
  const browser = {
    async newContext(input: Record<string, unknown>) {
      contextOptions = input;
      return {
        request: { async get(url: string, settings: Record<string, unknown>) {
          calls.push(`GET ${new URL(url).pathname}`);
          assert.equal(settings.maxRedirects, 0);
          const adminProbe = new URL(url).pathname === "/admin";
          return {
            status: () => adminProbe ? (options.admin ? 200 : 307) : (options.stateStatus ?? 200),
            headers: () => adminProbe && !options.admin ? { location: "/arena?lang=pt-BR" } : {},
            json: async () => ({ ok: true, userId: options.userId ?? customerId, state: { private: "NEVER_REPORT" } }),
          };
        } },
        async route(_pattern: string, callback: (route: unknown) => Promise<void>) { routeGuard = callback; },
        async routeWebSocket(_pattern: string, callback: (socket: { close: () => void }) => void) {
          assert.equal(typeof callback, "function");
          if (options.websocket) callback({ close: () => { calls.push("WEBSOCKET_CLOSED"); } });
        },
        async newPage() {
          let current = "";
          const listeners = new Map<string, (event: unknown) => void>();
          return {
            on(name: string, listener: (event: unknown) => void) { listeners.set(name, listener); },
            async goto(url: string) {
              calls.push(`PAGE ${new URL(url).pathname}`);
              current = url;
              const parsed = new URL(url);
              if (options.consoleStatus) {
                listeners.get("console")?.({ type: () => "error", text: () => `Failed to load resource: ${options.consoleStatus}`,
                  location: () => ({ url: `${parsed.origin}/api/touchline-arena/state` }) });
                listeners.get("response")?.({ status: () => options.consoleStatus,
                  url: () => `${parsed.origin}/api/touchline-arena/state` });
              }
              if (options.loginRoute === parsed.pathname) current = `${parsed.origin}/login?lang=pt-BR&token=DO_NOT_PRINT`;
              else if (parsed.pathname === "/" || parsed.pathname === "/coming-soon") current = `${parsed.origin}/arena?lang=pt-BR`;
              else if (["/market-transfer", "/fantasy"].includes(parsed.pathname)) current = `${parsed.origin}/my-club?lang=pt-BR&tab=market#my-club-squad`;
              else if (parsed.pathname === "/club-owner/me") current = `${parsed.origin}/my-club?lang=pt-BR`;
              if (options.documentRequests) {
                assert.ok(routeGuard);
                const networkUrl = new URL(current);
                networkUrl.hash = "";
                await routeGuard({
                  request: () => ({ method: () => "GET", url: () => networkUrl.href, resourceType: () => "document" }),
                  abort: async () => { calls.push("ABORTED_DOCUMENT"); },
                  continue: async () => { calls.push("SENT_DOCUMENT"); },
                });
              }
              if (options.transientRedirect) {
                assert.ok(routeGuard);
                await routeGuard({
                  request: () => ({ method: () => "GET", url: () => `${parsed.origin}/login?lang=pt-BR`, resourceType: () => "document" }),
                  abort: async () => { calls.push("ABORTED_REDIRECT"); },
                  continue: async () => { calls.push("UNEXPECTED_REDIRECT_SENT"); },
                });
              }
              if (options.mutation) {
                assert.ok(routeGuard);
                await routeGuard({
                  request: () => ({ method: () => "POST", url: () => `${parsed.origin}/api/touchline-fantasy/lineup`, resourceType: () => "fetch" }),
                  abort: async () => { calls.push("ABORTED_WRITE"); },
                  continue: async () => { calls.push("FORBIDDEN_WRITE"); },
                });
              }
              if (options.subresource) {
                assert.ok(routeGuard);
                await routeGuard({
                  request: () => ({ method: () => "GET", url: () => `${parsed.origin}${options.subresource!.path}`, resourceType: () => options.subresource!.resourceType }),
                  abort: async () => { calls.push("ABORTED_SUBRESOURCE"); },
                  continue: async () => { calls.push("SENT_SUBRESOURCE"); },
                });
              }
              return { status: () => options.failRoute === parsed.pathname ? 503 : 200 };
            },
            url: () => current,
            locator: () => ({ first: () => ({ waitFor: async () => { if (options.renderFails) throw new Error("private-detail"); } }) }),
            evaluate: async () => false,
            async waitForTimeout() {},
            async close() { calls.push("PAGE_CLOSED"); },
          };
        },
        async close() {
          calls.push("CONTEXT_CLOSED");
          if (options.cleanupFails) throw new Error("sensitive-cleanup-path");
        },
      };
    },
    async close() { closed += 1; },
  };
  return { calls, launch: async () => browser, closed: () => closed, contextOptions: () => contextOptions };
}

test("real runner executes the separate Admin route set in a fresh no-service-worker context and proves identity", async () => {
  const config = parseSmokeConfig(adminArgs);
  const harness = browserHarness({ admin: true, userId: adminId });
  const result = await runRouteSmoke(config, { launch: harness.launch });
  assert.equal(result.ok, true);
  assert.equal(result.routes.length, buildSmokeRoutes(config).length);
  assert.deepEqual(harness.calls.slice(0, 2), ["GET /api/touchline-arena/state", "GET /admin"]);
  assert.equal(harness.contextOptions().serviceWorkers, "block");
  assert.equal(harness.contextOptions().storageState, config.storageState);
  assert.equal(harness.closed(), 1);
  assert.ok(harness.calls.includes("CONTEXT_CLOSED"));
  assert.equal(JSON.stringify(result).includes("NEVER_REPORT"), false);
  assert.equal(JSON.stringify(result).includes(customerId), false);
  assert.equal(JSON.stringify(result).includes(adminId), false);
  assert.equal(JSON.stringify(result).includes(config.storageState), false);
});

test("wrong/missing identity or missing Admin role still fails before authenticated navigation", async () => {
  for (const options of [{ userId: adminId }, { admin: true, userId: customerId },
    { admin: true, userId: adminId, stateStatus: 401 }, { admin: true, userId: adminId, stateStatus: 503 }]) {
    const harness = browserHarness(options);
    const result = await runRouteSmoke(parseSmokeConfig(adminArgs), { launch: harness.launch });
    assert.equal(result.ok, false);
    assert.equal(result.routes.length, 0);
    assert.equal(harness.calls.some((call) => call.startsWith("PAGE ")), false);
    assert.equal(harness.closed(), 1);
  }
});

test("Admin smoke has independent identity/access and never visits the customer journey", async () => {
  const harness = browserHarness({ admin: true, userId: adminId });
  const result = await runRouteSmoke(parseSmokeConfig(adminArgs), { launch: harness.launch });
  assert.equal(result.ok, true);
  assert.ok(harness.calls.filter((call) => call.startsWith("PAGE ")).every((call) => call.startsWith("PAGE /admin")));
  const customer = browserHarness({ userId: adminId });
  assert.equal((await runRouteSmoke(parseSmokeConfig(adminArgs), { launch: customer.launch })).ok, false);
});

test("mutation blocking is installed before navigation and any attempt makes the report fail", async () => {
  const harness = browserHarness({ mutation: true });
  const result = await runRouteSmoke(parseSmokeConfig(publicArgs), { launch: harness.launch });
  assert.equal(result.ok, false);
  assert.ok(harness.calls.includes("ABORTED_WRITE"));
  assert.equal(harness.calls.includes("FORBIDDEN_WRITE"), false);
});

test("real runner aborts arbitrary read subresources and exits1 while legitimate assets continue", async () => {
  for (const resourceType of ["fetch", "image", "other"]) {
    const harness = browserHarness({ subresource: { path: "/maintenance/rebuild", resourceType } });
    assert.equal(await routeSmokeMain(publicArgs, { launch: harness.launch, write: () => {} }), 1);
    assert.ok(harness.calls.includes("ABORTED_SUBRESOURCE"));
    assert.equal(harness.calls.includes("SENT_SUBRESOURCE"), false);
  }
  const assets = browserHarness({ subresource: { path: "/icons/touchline-192.png", resourceType: "image" } });
  assert.equal(await routeSmokeMain(publicArgs, { launch: assets.launch, write: () => {} }), 0);
  assert.ok(assets.calls.includes("SENT_SUBRESOURCE"));
  assert.equal(assets.calls.includes("ABORTED_SUBRESOURCE"), false);
});

test("real runner rejects login, server error and incomplete rendering, preserving cleanup and redaction", async () => {
  for (const options of [{ loginRoute: "/admin/cards" }, { failRoute: "/admin/cards" }, { renderFails: true }]) {
    const harness = browserHarness({ admin: true, userId: adminId, ...options });
    const result = await runRouteSmoke(parseSmokeConfig(adminArgs), { launch: harness.launch });
    assert.equal(result.ok, false);
    assert.equal(harness.closed(), 1);
    assert.equal(JSON.stringify(result).includes("DO_NOT_PRINT"), false);
    assert.equal(JSON.stringify(result).includes("private-detail"), false);
  }
});

test("even a transient unexpected redirect is blocked and fails when the final URL appears correct", async () => {
  const harness = browserHarness({ admin: true, userId: adminId, transientRedirect: true });
  const result = await runRouteSmoke(parseSmokeConfig(adminArgs), { launch: harness.launch });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("UNEXPECTED_NAVIGATION_BLOCKED"));
  assert.ok(harness.calls.includes("ABORTED_REDIRECT"));
  assert.equal(harness.calls.includes("UNEXPECTED_REDIRECT_SENT"), false);
});

test("alias network requests omit fragments but the final browser destination must retain the required squad hash", async () => {
  const config = parseSmokeConfig(customerArgs);
  const alias = buildSmokeRoutes(config).find((route) => route.id === "market-alias")!;
  // Customer execution is now blocked. Preserve this URL invariant through
  // the real pure comparator, without bypassing the server-effect boundary.
  assert.equal(isExpectedSmokeDocument(config, alias, `${config.baseUrl}/my-club?lang=pt-BR&tab=market`), true);
  assert.equal(isExpectedSmokeDocument(config, alias, `${config.baseUrl}/login?lang=pt-BR`), false);
  const harness = browserHarness({ documentRequests: true });
  const result = await runRouteSmoke(parseSmokeConfig(publicArgs), { launch: harness.launch });
  assert.equal(result.ok, true);
  assert.equal(harness.calls.includes("ABORTED_DOCUMENT"), false);
  assert.ok(harness.calls.includes("SENT_DOCUMENT"));
  assert.equal(assessVisit(config, alias, {
    status: 200, finalUrl: `${config.baseUrl}/my-club?lang=pt-BR&tab=market`,
    mainReady: true, bodyError: false, issues: [],
  }).ok, false);
});

test("only the documented anonymous-state 401 is expected, never authenticated401 or server503", async () => {
  const publicState = browserHarness({ consoleStatus: 401 });
  assert.equal((await runRouteSmoke(parseSmokeConfig(publicArgs), { launch: publicState.launch })).ok, true);
  const adminState = browserHarness({ admin: true, userId: adminId, consoleStatus: 401 });
  assert.equal((await runRouteSmoke(parseSmokeConfig(adminArgs), { launch: adminState.launch })).ok, false);
  const unavailable = browserHarness({ consoleStatus: 503 });
  assert.equal((await runRouteSmoke(parseSmokeConfig(publicArgs), { launch: unavailable.launch })).ok, false);
});

test("entry point returns exit1 on failures instead of merely printing a report", async () => {
  const output: string[] = [];
  const failed = browserHarness({ failRoute: "/live" });
  assert.equal(await routeSmokeMain(publicArgs, { launch: failed.launch, write: (value: string) => { output.push(value); } }), 1);
  assert.equal(JSON.parse(output[0]).ok, false);
  const passed = browserHarness();
  assert.equal(await routeSmokeMain(publicArgs, { launch: passed.launch, write: () => {} }), 0);
  assert.equal(await routeSmokeMain([], { launch: () => { throw new Error("must not launch"); }, write: () => {} }), 1);
});

test("WebSocket attempts are closed and cleanup failures cannot leave a green report", async () => {
  const socket = browserHarness({ websocket: true });
  const socketResult = await runRouteSmoke(parseSmokeConfig(publicArgs), { launch: socket.launch });
  assert.equal(socketResult.ok, false);
  assert.ok(socketResult.errors.includes("WEBSOCKET_BLOCKED"));
  assert.ok(socket.calls.includes("WEBSOCKET_CLOSED"));
  const cleanup = browserHarness({ cleanupFails: true });
  const cleanupResult = await runRouteSmoke(parseSmokeConfig(publicArgs), { launch: cleanup.launch });
  assert.equal(cleanupResult.ok, false);
  assert.ok(cleanupResult.errors.includes("TL_SMOKE_CONTEXT_CLEANUP_FAILED"));
  assert.equal(cleanup.closed(), 1, "browser cleanup still runs if context cleanup rejects");
  assert.equal(JSON.stringify(cleanupResult).includes("sensitive-cleanup-path"), false);
});

test("actual CLI exits1 before loading a browser when configuration is absent", () => {
  const result = spawnSync(process.execPath, [new URL("../scripts/qa/run-touchline-route-smoke.mjs", import.meta.url).pathname], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /TL_SMOKE_/);
  assert.equal(result.stderr, "");
});

test("customer smoke requires a scoped server-effect plan before browser launch or identity requests", async () => {
  let launches = 0;
  const launch = async () => { launches += 1; throw new Error("must not launch"); };
  const config = parseSmokeConfig(customerArgs);
  const report = await runRouteSmoke(config, { launch });
  assert.equal(report.ok, false);
  assert.deepEqual(report.errors, ["TL_SMOKE_CUSTOMER_SIDE_EFFECT_AUTHORIZATION_REQUIRED"]);
  assert.equal(report.routes.length, 0);
  assert.equal(report.identityProven, false);
  assert.equal(launches, 0);
  assert.equal(await routeSmokeMain([...customerArgs, "--allow-production-read=true"], { launch, write: () => {} }), 1);
  assert.equal(launches, 0, "the production-read acknowledgement must not authorize customer server effects");
  assert.throws(() => parseSmokeConfig([...customerArgs, "--allow-side-effects=true"]), /ARGUMENT_INVALID/);
  const cli = spawnSync(process.execPath, [new URL("../scripts/qa/run-touchline-route-smoke.mjs", import.meta.url).pathname, ...customerArgs], { encoding: "utf8" });
  assert.equal(cli.status, 1);
  assert.deepEqual(JSON.parse(cli.stdout).errors, ["TL_SMOKE_CUSTOMER_SIDE_EFFECT_AUTHORIZATION_REQUIRED"]);
  assert.equal(cli.stderr, "");
});

test("known mutating GET/SSR paths and their aliases are blocked independently of persona or resource type", () => {
  for (const args of [publicArgs, customerArgs, adminArgs]) {
    const config = parseSmokeConfig(args);
    for (const resourceType of ["document", "fetch", "image", "other"]) {
      for (const path of ["/api/touchline-fantasy/state", "/my-club?lang=pt-BR", "/my-club?lang=pt-BR&_rsc=123",
        "/market-transfer?lang=pt-BR", "/fantasy?lang=pt-BR", "/club-owner/me?lang=pt-BR"]) {
        assert.equal(classifySmokeRequest(config, { method: "GET", url: config.baseUrl + path, resourceType }), "SERVER_SIDE_EFFECT_AUTHORIZATION_REQUIRED", `${config.persona} ${resourceType} ${path}`);
      }
    }
  }
});

test("public and Admin reports never infer zero server-side writes from GET while known effects abort", async () => {
  for (const args of [publicArgs, adminArgs]) {
    const harness = browserHarness(args === adminArgs ? { admin: true, userId: adminId } : {});
    const result = await runRouteSmoke(parseSmokeConfig(args), { launch: harness.launch });
    assert.equal(result.ok, true);
    assert.equal(result.serverSideEffects, "NOT_PROVEN_ABSENT");
  }
  const harness = browserHarness({ admin: true, userId: adminId, subresource: { path: "/api/touchline-fantasy/state", resourceType: "fetch" } });
  const result = await runRouteSmoke(parseSmokeConfig(adminArgs), { launch: harness.launch });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("SERVER_SIDE_EFFECT_AUTHORIZATION_REQUIRED"));
  assert.ok(harness.calls.includes("ABORTED_SUBRESOURCE"));
  assert.equal(harness.calls.includes("SENT_SUBRESOURCE"), false);
});
