#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import {
  TOUCHLINE_QA_CANONICAL_ALIAS,
  TOUCHLINE_QA_CANONICAL_USER_ID,
} from "../../lib/touchlineArena/qa-canonical-persona.ts";

// Deliberately no environment defaults, login, cookie extraction, Supabase
// credentials, existing browser attachment, screenshots or storage-state writes.
const ARGUMENTS = new Set(["base-url", "persona", "storage-state", "expected-user-id", "club-path", "player-path", "coach-path", "browser", "locale", "allow-production-read"]);
// An allowlisted GET is not proof of a side-effect-free server implementation.
const ALLOWED_GET_APIS = new Set([
  "/api/qa/environment-precheck", "/api/touchline-arena/state", "/api/touchline-arena/roster",
  "/api/touchline-arena/coach", "/api/touchline-arena/market/inventory", "/api/touchline-arena/rumours",
  "/api/touchline-arena/card-ranking/active", "/api/touchline-arena/live-presentation-state",
  "/api/touchline-arena/card-layout-master", "/api/touchline-arena/coach-card-layout",
  "/api/notifications/preferences",
  "/api/football-data/premier-squad", "/api/football-data/fixture-schedule",
  "/api/football-data/fantasy/capabilities", "/api/football-data/fantasy/events",
  "/api/football-data/fantasy/fixture", "/api/football-data/fantasy/livescores",
  "/api/admin/social-publications/studio/video",
]);
// Query keys are inventoried from the read handlers and their current callers.
// An unlisted key is a boundary failure, even if a handler currently ignores it.
const ALLOWED_API_QUERIES = new Map([
  ["/api/touchline-arena/market/inventory", ["teamId"]],
  ["/api/football-data/premier-squad", ["teamId", "clubName", "clubShortCode", "clubLogoUrl"]],
  ["/api/football-data/fantasy/fixture", ["fixtureId", "id"]],
  ["/api/football-data/fantasy/livescores", ["snapshot"]],
  ["/api/admin/social-publications/studio/video", ["artId", "placement", "identity"]],
]);
// These GET/SSR reads reach loadTouchlineFantasySnapshot, which can synchronize
// Gameweeks, prepare a user XI and reconcile its state. HTTP-method filtering
// cannot contain those server-side effects. No runtime override is provided.
const SERVER_EFFECT_PATHS = new Set([
  "/api/touchline-fantasy/state", "/my-club", "/market-transfer", "/fantasy", "/club-owner/me",
]);
// Public directories verified in this repository, not an arbitrary same-origin
// GET allowance. Keep new routes/resources fail-closed until separately reviewed.
const PUBLIC_ASSET_PREFIXES = ["/icons/", ...[
  "arena", "backgrounds", "brand", "card-layouts", "cards", "club-owner", "clubs",
  "frames", "live", "masks", "my-club", "pitch", "players", "ranking", "shared",
  "social-media", "stadiums", "trophies",
].map((directory) => `/touchlineArena/${directory}/`)];
const PUBLIC_ASSET_FILES = new Set([
  "/apple-touch-icon.png", "/apple-touch-icon-precomposed.png", "/touchline-push-sw.js",
  "/touchlineArena/asset-manifest.json", "/favicon.ico", "/manifest.webmanifest", "/robots.txt", "/sitemap.xml",
]);
const PUBLIC_ASSET_EXTENSION = /\.(?:avif|jpg|png|svg|webp|mp4|json|md)$/i;
const NEXT_STATIC_EXTENSION = /\.(?:js|css|map|woff2?|ttf|otf|avif|jpe?g|png|svg|webp|ico)$/i;
const SENSITIVE_QUERY = /^(?:code|token|access_token|refresh_token|secret|password|authorization|api_key)$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failure = (code) => Object.assign(new Error(`TL_SMOKE_${code}`), { code: `TL_SMOKE_${code}` });

function dynamicPath(value, prefix, baseUrl, locale) {
  if (typeof value !== "string" || !value.startsWith(`${prefix}/`) || /\\|\.\.|%2e|%2f|%5c/i.test(value)) throw failure("DYNAMIC_PATH_REQUIRED");
  const url = new URL(value, baseUrl);
  if (url.origin !== baseUrl || url.hash || !new RegExp(`^${prefix}/[^/]+$`).test(url.pathname)) throw failure("DYNAMIC_PATH_INVALID");
  const allowed = new Set(["playerId", "coachId", "teamId", "name", "clubName", "position", "shirtNumber", "countryCode3", "lang"]);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) throw failure("DYNAMIC_QUERY_INVALID");
  url.searchParams.set("lang", locale);
  return `${url.pathname}${url.search}`;
}

export function parseSmokeConfig(argv) {
  const args = new Map();
  for (const argument of argv) {
    const match = /^--([^=]+)=(.+)$/.exec(argument);
    if (!match || !ARGUMENTS.has(match[1]) || args.has(match[1])) throw failure("ARGUMENT_INVALID");
    args.set(match[1], match[2]);
  }
  if (!args.has("base-url") || !args.has("persona")) throw failure("EXPLICIT_TARGET_AND_PERSONA_REQUIRED");
  let target;
  try { target = new URL(args.get("base-url")); } catch { throw failure("ORIGIN_INVALID"); }
  if (target.username || target.password || target.pathname !== "/" || target.search || target.hash
    || ![target.origin, `${target.origin}/`].includes(args.get("base-url"))) throw failure("ORIGIN_INVALID");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) && target.protocol === "http:";
  const environment = local ? "local" : target.origin === TOUCHLINE_QA_CANONICAL_ALIAS ? "qa"
    : target.origin === "https://touchline.com.br" ? "production" : null;
  if (!environment) throw failure("ORIGIN_NOT_ALLOWLISTED");
  if (environment === "production" && args.get("allow-production-read") !== "true") throw failure("PRODUCTION_READ_ACK_REQUIRED");
  const persona = args.get("persona");
  if (!["public", "customer", "admin"].includes(persona)) throw failure("PERSONA_INVALID");
  const browser = args.get("browser") ?? "chromium";
  const locale = args.get("locale") ?? "pt-BR";
  if (!["chromium", "webkit", "firefox"].includes(browser) || !["pt-BR", "en-GB"].includes(locale)) throw failure("BROWSER_OR_LOCALE_INVALID");
  const storageState = args.get("storage-state");
  const expectedUserId = args.get("expected-user-id")?.toLowerCase();
  if (persona === "public") {
    if (storageState || expectedUserId) throw failure("PUBLIC_MUST_HAVE_NO_SESSION");
  } else {
    if (!storageState?.startsWith("/") || !UUID.test(expectedUserId ?? "")) throw failure("EXPLICIT_SESSION_AND_IDENTITY_REQUIRED");
    if (persona === "customer" && environment !== "production" && expectedUserId !== TOUCHLINE_QA_CANONICAL_USER_ID) throw failure("CANONICAL_QA_CUSTOMER_REQUIRED");
    if (persona === "admin" && expectedUserId === TOUCHLINE_QA_CANONICAL_USER_ID) throw failure("CUSTOMER_IS_NOT_ADMIN");
  }
  const config = { baseUrl: target.origin, environment, persona, browser, locale, storageState, expectedUserId };
  if (persona !== "admin") {
    config.clubPath = dynamicPath(args.get("club-path"), "/touchline-clubs", target.origin, locale);
    config.playerPath = dynamicPath(args.get("player-path"), "/touchline-players", target.origin, locale);
    config.coachPath = dynamicPath(args.get("coach-path"), "/touchline-coaches", target.origin, locale);
  } else if (["club-path", "player-path", "coach-path"].some((key) => args.has(key))) throw failure("ADMIN_ROUTE_SET_IS_SEPARATE");
  return Object.freeze(config);
}

export function buildSmokeRoutes(config) {
  const lang = `?lang=${config.locale}`;
  const route = (id, path, expected = path, selector = "h1") => ({ id, path, expected, selector });
  if (config.persona === "admin") return [
    "", "/analytics", "/cards", "/card-engine", "/finance", "/football-data",
    "/formation-calibration", "/manual-card-editorial", "/market-values", "/promotions",
    "/social-publications", "/social-publications/studio",
  ].map((area) => route(`admin${area.replaceAll("/", "-")}`, `/admin${area}${lang}`));
  const routes = [
    route("root-alias", `/${lang}`, `/arena${lang}`, ".arena-stage"),
    route("coming-soon-alias", `/coming-soon${lang}`, `/arena${lang}`, ".arena-stage"),
    route("arena", `/arena${lang}`, `/arena${lang}`, ".arena-stage"),
    route("clubs", `/touchline-clubs${lang}`), route("club", config.clubPath),
    route("player", config.playerPath), route("coach", config.coachPath),
    route("ranking", `/touchline-player-card-rankings${lang}`),
    route("tables", `/touchline-tables${lang}`), route("live", `/live${lang}`),
  ];
  if (config.persona === "public") return routes.concat([
    "login", "register", "forgot-password", "reset-password", "admin/login",
  ].map((path) => route(path, `/${path}${lang}`)));
  if (config.persona !== "customer") throw failure("PERSONA_INVALID");
  return routes.concat([
    route("my-club", `/my-club${lang}`, `/my-club${lang}`, "#my-club-squad"),
    route("market-alias", `/market-transfer${lang}`, `/my-club${lang}&tab=market#my-club-squad`, "#my-club-squad"),
    route("fantasy-alias", `/fantasy${lang}`, `/my-club${lang}&tab=market#my-club-squad`, "#my-club-squad"),
    route("self-alias", `/club-owner/me${lang}`, `/my-club${lang}`, "#my-club-squad"),
    ...["inbox", "notifications", "football-search"].map((path) => route(path, `/${path}${lang}`)),
  ]);
}

function onlyQueryKeys(target, allowed) {
  const keys = [...target.searchParams.keys()];
  return new Set(keys).size === keys.length && keys.every((key) => allowed.includes(key));
}

function isPublicAsset(target) {
  if (target.username || target.password || /\/\/|%2f|%5c|%00|%25/i.test(target.pathname)) return false;
  const nextStatic = target.pathname.startsWith("/_next/static/") && NEXT_STATIC_EXTENSION.test(target.pathname);
  const publicFile = PUBLIC_ASSET_FILES.has(target.pathname)
    || (PUBLIC_ASSET_PREFIXES.some((prefix) => target.pathname.startsWith(prefix)) && PUBLIC_ASSET_EXTENSION.test(target.pathname));
  if (!nextStatic && !publicFile) return false;
  // Card/video version keys and Next deployment cache keys are read-only asset
  // selectors; never pass action/query payloads through a broad static prefix.
  return onlyQueryKeys(target, nextStatic ? ["v", "dpl"] : ["v"])
    && [...target.searchParams.values()].every((value) => /^[A-Za-z0-9._-]{1,160}$/.test(value));
}

function isLocalOptimizedImage(target, baseUrl) {
  if (target.pathname !== "/_next/image" || !onlyQueryKeys(target, ["url", "w", "q"])) return false;
  const source = target.searchParams.get("url");
  if (!source?.startsWith("/") || source.startsWith("//") || /\\/.test(source)) return false;
  if (!/^[1-9]\d{0,3}$/.test(target.searchParams.get("w") ?? "")
    || !/^(?:[1-9]\d?|100)$/.test(target.searchParams.get("q") ?? "")) return false;
  const asset = new URL(source, baseUrl);
  return asset.origin === baseUrl && isPublicAsset(asset) && /\.(?:avif|jpe?g|png|svg|webp|ico)$/i.test(asset.pathname);
}

export function classifySmokeRequest(config, { method, url, resourceType }) {
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) return "MUTATION_BLOCKED";
  let target;
  try { target = new URL(url); } catch { return "INVALID_REQUEST_BLOCKED"; }
  if (target.origin !== config.baseUrl) return "EXTERNAL_REQUEST_BLOCKED";
  if (target.username || target.password || /\/\/|%2f|%5c|%00|%25/i.test(target.pathname)) return "NON_CANONICAL_PATH_BLOCKED";
  if ([...target.searchParams.keys()].some((key) => SENSITIVE_QUERY.test(key))) return "AUTH_ACTION_BLOCKED";
  if (/^\/(?:auth\/callback|logout|signout|login\/submit)(?:\/|$)/.test(target.pathname)) return "AUTH_ACTION_BLOCKED";
  if (SERVER_EFFECT_PATHS.has(target.pathname.replace(/\/$/, ""))) return "SERVER_SIDE_EFFECT_AUTHORIZATION_REQUIRED";
  if (target.pathname.startsWith("/api/")) {
    if (!ALLOWED_GET_APIS.has(target.pathname)) return "NON_ALLOWLISTED_API_BLOCKED";
    if (resourceType === "document") return "UNEXPECTED_NAVIGATION_BLOCKED";
    return onlyQueryKeys(target, ALLOWED_API_QUERIES.get(target.pathname) ?? []) ? null : "REQUEST_QUERY_BLOCKED";
  }
  const routes = buildSmokeRoutes(config).flatMap((route) => [route.path, route.expected]);
  const routeRequest = new URL(target);
  routeRequest.hash = ""; // Fragments never cross the network boundary.
  if (["fetch", "xhr", "other"].includes(resourceType) && routeRequest.searchParams.has("_rsc")) {
    if (routeRequest.searchParams.getAll("_rsc").length !== 1
      || !/^[A-Za-z0-9_-]{1,160}$/.test(routeRequest.searchParams.get("_rsc"))) return "REQUEST_QUERY_BLOCKED";
    routeRequest.searchParams.delete("_rsc");
  }
  const declaredRoute = routes.some((path) => {
    const allowed = new URL(path, config.baseUrl);
    allowed.hash = "";
    return normalizedUrl(allowed.href, config.baseUrl) === normalizedUrl(routeRequest.href, config.baseUrl);
  });
  if (declaredRoute) return null;
  if (resourceType === "document") return "UNEXPECTED_NAVIGATION_BLOCKED";
  if (isPublicAsset(target) || isLocalOptimizedImage(target, config.baseUrl)) return null;
  return "NON_ALLOWLISTED_RESOURCE_BLOCKED";
}

function normalizedUrl(value, origin) {
  const url = new URL(value, origin);
  url.searchParams.sort();
  return url.href;
}

function normalizedNetworkUrl(value, origin) {
  const url = new URL(value, origin);
  url.hash = "";
  return normalizedUrl(url.href, origin);
}

// Pure URL comparison only; this never authorizes a route blocked by the guard.
export function isExpectedSmokeDocument(config, route, url) {
  return [route.path, route.expected].some((path) => normalizedNetworkUrl(path, config.baseUrl) === normalizedNetworkUrl(url, config.baseUrl));
}

function safePath(value) {
  try { return new URL(value).pathname; } catch { return "invalid-url"; }
}

export function assessVisit(config, route, evidence) {
  const errors = [...evidence.issues];
  if (evidence.status !== 200) errors.push("HTTP_NOT_200");
  if (normalizedUrl(evidence.finalUrl, config.baseUrl) !== normalizedUrl(route.expected, config.baseUrl)) errors.push("UNEXPECTED_DESTINATION");
  if (!evidence.mainReady) errors.push("RENDER_TARGET_MISSING");
  if (evidence.bodyError) errors.push("ERROR_PAGE_RENDERED");
  return { id: route.id, requestedPath: safePath(new URL(route.path, config.baseUrl).href), finalPath: safePath(evidence.finalUrl),
    status: evidence.status, ok: errors.length === 0, errors: [...new Set(errors)] };
}

async function provePersona(context, config) {
  if (config.persona === "public") return;
  // These two fixed GETs deliberately do not follow redirects. They are the
  // only APIRequestContext requests, which do not use browser routing hooks.
  const state = await context.request.get(`${config.baseUrl}/api/touchline-arena/state`, { maxRedirects: 0, timeout: 15_000 });
  if (state.status() !== 200) throw failure("IDENTITY_READ_FAILED");
  const payload = await state.json();
  if (payload?.ok !== true || payload.userId !== config.expectedUserId) throw failure("IDENTITY_MISMATCH");
  const role = await context.request.get(`${config.baseUrl}/admin?lang=${config.locale}`, { maxRedirects: 0, timeout: 15_000 });
  if (config.persona === "admin") {
    if (role.status() !== 200) throw failure("ADMIN_ACCESS_NOT_PROVEN");
  } else {
    const location = role.headers().location;
    if (![301, 302, 303, 307, 308].includes(role.status()) || !location
      || normalizedUrl(location, config.baseUrl) !== normalizedUrl(`/arena?lang=${config.locale}`, config.baseUrl)) throw failure("CUSTOMER_MUST_NOT_BE_ADMIN");
  }
}

async function launchBrowser(name) {
  const playwright = await import("@playwright/test");
  return playwright[name].launch({ headless: true });
}

export async function runRouteSmoke(config, { launch = launchBrowser } = {}) {
  const routes = buildSmokeRoutes(config);
  const report = { version: 1, scope: "BOUNDED_ROUTE_SMOKE_NOT_FULL_PRODUCT_ACCEPTANCE", baseUrl: config.baseUrl,
    environment: config.environment, persona: config.persona, browser: config.browser,
    serverSideEffects: "NOT_PROVEN_ABSENT",
    viewport: { width: 844, height: 390 }, expectedRoutes: routes.length, identityProven: config.persona === "public",
    ok: false, errors: [], routes: [] };
  // Stop before Playwright import/launch, storage-state consumption, persona
  // probes or SSR. Customer execution needs a separately approved, narrowly
  // controlled server-effect plan; --allow-production-read cannot grant it.
  if (config.persona === "customer") {
    report.errors.push("TL_SMOKE_CUSTOMER_SIDE_EFFECT_AUTHORIZATION_REQUIRED");
    return report;
  }
  if (!routes.length) { report.errors.push("TL_SMOKE_EMPTY_ROUTE_SET"); return report; }
  let browser;
  let context;
  let currentIssues = [];
  let currentRoute = null;
  const boundaryFailures = [];
  try {
    browser = await launch(config.browser);
    context = await browser.newContext({ viewport: report.viewport, locale: config.locale,
      serviceWorkers: "block", acceptDownloads: false,
      ...(config.storageState ? { storageState: config.storageState } : {}) });
    await context.route("**/*", async (intercepted) => {
      const request = intercepted.request();
      let blocked = classifySmokeRequest(config, { method: request.method(), url: request.url(), resourceType: request.resourceType() });
      if (!blocked && currentRoute && request.resourceType() === "document"
        && !isExpectedSmokeDocument(config, currentRoute, request.url())) {
        blocked = "UNEXPECTED_NAVIGATION_BLOCKED";
      }
      if (blocked) {
        currentIssues.push(blocked);
        boundaryFailures.push(blocked);
        await intercepted.abort("blockedbyclient");
      } else await intercepted.continue();
    });
    await context.routeWebSocket("**/*", (socket) => {
      currentIssues.push("WEBSOCKET_BLOCKED");
      boundaryFailures.push("WEBSOCKET_BLOCKED");
      socket.close();
    });
    await provePersona(context, config);
    report.identityProven = true;
    for (const route of routes) {
      currentIssues = [];
      currentRoute = route;
      const page = await context.newPage();
      let status = null;
      let mainReady = false;
      let bodyError = false;
      page.on("pageerror", () => currentIssues.push("PAGE_ERROR"));
      page.on("console", (message) => {
        const expectedAnonymous = config.persona === "public" && /\b401\b/.test(message.text())
          && safePath(message.location().url) === "/api/touchline-arena/state";
        if (message.type() === "error" && !expectedAnonymous) currentIssues.push("CONSOLE_ERROR");
      });
      page.on("requestfailed", () => currentIssues.push("REQUEST_FAILED"));
      page.on("response", (response) => {
        // Anonymous Arena state is a deliberately protected read. All other
        // HTTP failures (including stale/degraded service 503s) remain failures.
        const expectedAnonymous = config.persona === "public" && response.status() === 401
          && safePath(response.url()) === "/api/touchline-arena/state";
        if (response.status() >= 400 && !expectedAnonymous) currentIssues.push("RESOURCE_HTTP_ERROR");
      });
      try {
        const response = await page.goto(new URL(route.path, config.baseUrl).href, { waitUntil: "domcontentloaded", timeout: 30_000 });
        status = response?.status() ?? null;
        await page.locator(route.selector).first().waitFor({ state: "visible", timeout: 15_000 });
        mainReady = true;
        // Bounded observation of immediate hydration/network/navigation; this
        // is not a promise to test every late poll or interactive state.
        await page.waitForTimeout(750);
        bodyError = await page.evaluate(() => /Application error|This page could not be found|Página não encontrada|Internal Server Error/i.test(document.body.innerText));
      } catch { currentIssues.push("NAVIGATION_OR_RENDER_FAILED"); }
      report.routes.push(assessVisit(config, route, { status, finalUrl: page.url(), mainReady, bodyError, issues: currentIssues }));
      await page.close();
    }
  } catch (error) {
    report.errors.push(typeof error?.code === "string" && error.code.startsWith("TL_SMOKE_") ? error.code : "TL_SMOKE_RUNTIME_FAILED");
  } finally {
    try { await context?.close(); } catch { report.errors.push("TL_SMOKE_CONTEXT_CLEANUP_FAILED"); }
    try { await browser?.close(); } catch { report.errors.push("TL_SMOKE_BROWSER_CLEANUP_FAILED"); }
  }
  report.errors.push(...new Set(boundaryFailures));
  report.ok = report.identityProven && report.errors.length === 0 && report.routes.length === routes.length
    && report.routes.every((route) => route.ok);
  return report;
}

export async function routeSmokeMain(argv, { launch = launchBrowser, write = (text) => process.stdout.write(text) } = {}) {
  try {
    const config = parseSmokeConfig(argv);
    const report = await runRouteSmoke(config, { launch });
    write(`${JSON.stringify(report, null, 2)}\n`);
    return report.ok ? 0 : 1;
  } catch (error) {
    const code = typeof error?.code === "string" && error.code.startsWith("TL_SMOKE_") ? error.code : "TL_SMOKE_CONFIGURATION_FAILED";
    write(`${JSON.stringify({ ok: false, errors: [code] })}\n`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await routeSmokeMain(process.argv.slice(2));
}
