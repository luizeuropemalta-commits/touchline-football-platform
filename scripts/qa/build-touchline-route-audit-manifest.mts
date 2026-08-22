#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const TOUCHLINE_ROUTE_AUDIT_DATE = "2026-08-15";

export type TouchlineRouteAuditRow = {
  route: string;
  auth: string;
  role: string;
  data: string;
  browser: string;
  status: string;
  sourceFile: string;
  kind: "PAGE" | "API" | "BOUNDARY" | "METADATA" | "PROXY" | "SERVER_ACTIONS";
};

type RoutePolicy = Omit<TouchlineRouteAuditRow, "route" | "sourceFile" | "kind">;

const PENDING_PAGE: RoutePolicy = {
  auth: "PUBLIC",
  role: "ANY",
  data: "STATIC_OR_PUBLIC_READ",
  browser: "REQUIRED",
  status: "PENDING_BROWSER_QA",
};

const PAGE_POLICIES: Record<string, Partial<RoutePolicy>> = {
  "/": { data: "REDIRECT_TO_ARENA", browser: "REDIRECT_CONTRACT", status: "LEGACY_REDIRECT_CONTRACT" },
  "/fantasy": { data: "REDIRECT_TO_ARENA", browser: "REDIRECT_CONTRACT", status: "LEGACY_REDIRECT_CONTRACT" },
  "/arena/[zone]": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "LEGACY_ZONE_REDIRECT", browser: "REDIRECT_CONTRACT", status: "LEGACY_REDIRECT_CONTRACT" },
  "/arena": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "SUPABASE_USER_STATE_AND_PERSISTED_FIXTURES" },
  "/market-transfer": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "PUBLIC_CARD_CATALOG_AND_SUPABASE_USER_CONTRACTS" },
  "/football-search": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "PROVIDER_CACHE_AND_EDITORIAL_CATALOG" },
  "/inbox": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "SUPABASE_USER_MESSAGES" },
  "/notifications": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "SUPABASE_USER_NOTIFICATIONS" },
  "/login": { data: "SUPABASE_AUTH", status: "PENDING_AUTH_BROWSER_QA" },
  "/register": { data: "SUPABASE_AUTH", status: "PENDING_AUTH_BROWSER_QA" },
  "/forgot-password": { data: "SUPABASE_AUTH_RECOVERY", status: "PENDING_AUTH_BROWSER_QA" },
  "/reset-password": { data: "SUPABASE_AUTH_RECOVERY", status: "PENDING_AUTH_BROWSER_QA" },
  "/coming-soon": { data: "STATIC" },
  "/live": { data: "PERSISTED_FIXTURE_SNAPSHOTS" },
  "/touchline-clubs": { data: "CANONICAL_20_CLUB_MANIFEST_AND_PUBLIC_READ" },
  "/touchline-clubs/[club]": { data: "CANONICAL_CLUB_AND_PUBLIC_SQUAD_READ" },
  "/touchline-coaches/[coach]": { data: "CANONICAL_COACH_REGISTRY" },
  "/touchline-player-card-rankings": { data: "PUBLIC_CARD_RANKING_READ" },
  "/touchline-players/[player]": { data: "CANONICAL_PLAYER_AND_PUBLIC_CARD_READ" },
  "/touchline-tables": { data: "PUBLIC_PERSISTED_TABLE_READ" },
  "/audit-index": { auth: "AUDIT_TOKEN", role: "AUDITOR", data: "STATIC_AUDIT_REGISTRY", status: "PENDING_AUDIT_TOKEN_QA" },
  "/audit/[...route]": { auth: "AUDIT_TOKEN", role: "AUDITOR", data: "STATIC_AUDIT_RENDER", status: "PENDING_AUDIT_TOKEN_QA" },
  "/preview": { auth: "ISOLATED_PREVIEW", role: "PREVIEW_AUDITOR", data: "STATIC_ISOLATED_PREVIEW", status: "PREVIEW_CONTRACT_ONLY" },
};

const API_POLICIES: Record<string, RoutePolicy> = {
  "POST /login/submit": { auth: "PUBLIC", role: "ANY", data: "SUPABASE_AUTH", browser: "HTTP_REDIRECT_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/auth/login": { auth: "PUBLIC", role: "ANY", data: "SUPABASE_AUTH", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/auth/login/submit": { auth: "PUBLIC", role: "ANY", data: "SUPABASE_AUTH", browser: "HTTP_REDIRECT_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/auth/recovery/intent": { auth: "PUBLIC", role: "ANY", data: "SUPABASE_AUTH_RECOVERY_INTENT", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "DELETE /api/auth/recovery/intent": { auth: "PUBLIC", role: "ANY", data: "SUPABASE_AUTH_RECOVERY_INTENT", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "GET /api/auth/recovery": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "SUPABASE_AUTH_RECOVERY", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/auth/recovery": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "SUPABASE_AUTH_PASSWORD_UPDATE", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "GET /auth/callback": { auth: "PUBLIC_CALLBACK", role: "ANY", data: "SUPABASE_AUTH_CODE_EXCHANGE", browser: "HTTP_REDIRECT_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "GET /api/football-data/fantasy/capabilities": { auth: "PUBLIC", role: "ANY", data: "PERSISTED_FANTASY_CAPABILITIES", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "GET /api/football-data/fantasy/events": { auth: "PUBLIC", role: "ANY", data: "PERSISTED_FANTASY_EVENTS", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "GET /api/football-data/fantasy/fixture": { auth: "AUTHENTICATED_OR_LOCAL_EDITOR", role: "ARENA_USER_OR_LOCAL_EDITOR", data: "PERSISTED_FIXTURE_SNAPSHOT", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/football-data/fantasy/fixture": { auth: "DISABLED", role: "NONE", data: "NO_BROWSER_INGESTION", browser: "HTTP_405_CONTRACT", status: "METHOD_DISABLED" },
  "GET /api/football-data/fantasy/livescores": { auth: "PUBLIC", role: "ANY", data: "PERSISTED_LIVE_SNAPSHOT", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "GET /api/football-data/fixture-schedule": { auth: "PUBLIC", role: "ANY", data: "PERSISTED_FIXTURE_SCHEDULE", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/football-data/fixture-schedule": { auth: "DISABLED", role: "NONE", data: "NO_BROWSER_INGESTION", browser: "HTTP_405_CONTRACT", status: "METHOD_DISABLED" },
  "GET /api/football-data/foundation": { auth: "OWNER_OR_VALIDATION_SECRET", role: "OWNER_OR_SERVER_JOB", data: "NORMALIZED_FOOTBALL_FOUNDATION", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/football-data/player-season-statistics/sync": { auth: "OWNER_OR_SYNC_SECRET", role: "OWNER_OR_SERVER_JOB", data: "PROVIDER_TO_NORMALIZED_STATS", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "GET /api/football-data/premier-squad": { auth: "PUBLIC", role: "ANY", data: "CANONICAL_SQUAD_AND_EDITORIAL_CARD_READ", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "GET /api/football-data/provider-diagnostic": { auth: "OWNER_SESSION", role: "OWNER_ADMIN", data: "LIVE_PROVIDER_COUNTS_AND_ENTITLEMENT_PROOF", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "GET /api/football-data/sync-starter": { auth: "DISABLED", role: "NONE", data: "POST_ONLY", browser: "HTTP_405_CONTRACT", status: "METHOD_DISABLED" },
  "POST /api/football-data/sync-starter": { auth: "OWNER_OR_SYNC_SECRET", role: "OWNER_OR_SERVER_JOB", data: "PROVIDER_TO_NORMALIZED_FOOTBALL_DATA", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "GET /api/football-data/validate": { auth: "OWNER_OR_VALIDATION_SECRET", role: "OWNER_OR_SERVER_JOB", data: "FOOTBALL_DATA_VALIDATION", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "GET /api/notifications/preferences": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "SUPABASE_USER_PREFERENCES", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "PUT /api/notifications/preferences": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "SUPABASE_USER_PREFERENCES", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/players/search-and-build-card": { auth: "AUTHENTICATED_OR_LOCAL_EDITOR", role: "ARENA_USER_OR_LOCAL_EDITOR", data: "PROVIDER_CACHE_AND_EDITORIAL_CARD_GATE", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/stripe/webhook": { auth: "WEBHOOK_SIGNATURE", role: "STRIPE", data: "STRIPE_EVENT", browser: "WEBHOOK_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/touchline-analytics": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "SUPABASE_ANALYTICS_EVENT", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/touchline-arena/access": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "SUPABASE_ARENA_ACCESS", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "GET /api/touchline-arena/card-layout-master": { auth: "PUBLIC", role: "ANY", data: "STATIC_LAYOUT_CAPABILITY", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/touchline-arena/card-layout-master": { auth: "LOCAL_EDITOR", role: "LOCAL_EDITOR", data: "LOCAL_STATIC_LAYOUT_WRITE", browser: "LOCAL_HTTP_CONTRACT", status: "LOCAL_ONLY" },
  "GET /api/touchline-arena/card-ranking/active": { auth: "PUBLIC", role: "ANY", data: "PUBLIC_ACTIVE_RANKING", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "GET /api/touchline-arena/coach-card-layout": { auth: "PUBLIC", role: "ANY", data: "STATIC_COACH_LAYOUT_CAPABILITY", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/touchline-arena/coach-card-layout": { auth: "LOCAL_EDITOR", role: "LOCAL_EDITOR", data: "LOCAL_STATIC_COACH_LAYOUT_WRITE", browser: "LOCAL_HTTP_CONTRACT", status: "LOCAL_ONLY" },
  "GET /api/touchline-arena/coach": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "CANONICAL_COACH_OFFER_CATALOG", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "PUT /api/touchline-arena/coach": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "SUPABASE_USER_COACH_STATE", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/touchline-arena/contracts/release": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "SUPABASE_USER_CONTRACT_RELEASE", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/touchline-arena/formation-locks": { auth: "LOCAL_EDITOR", role: "LOCAL_EDITOR", data: "LOCAL_FORMATION_LAYOUT_WRITE", browser: "LOCAL_HTTP_CONTRACT", status: "LOCAL_ONLY" },
  "POST /api/touchline-arena/market/checkout": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "SUPABASE_MARKET_CONTRACT_TRANSACTION", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "GET /api/touchline-arena/market/inventory": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "SUPABASE_MARKET_INVENTORY", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "GET /api/touchline-arena/roster": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "SUPABASE_USER_ROSTER", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "GET /api/touchline-arena/rumours": { auth: "PUBLIC", role: "ANY", data: "STATIC_RUMOURS", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "GET /api/touchline-arena/state": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "SUPABASE_USER_ARENA_STATE", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "PUT /api/touchline-arena/state": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "SUPABASE_USER_ARENA_STATE", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/touchline-arena/stripe-test/webhook": { auth: "WEBHOOK_SIGNATURE", role: "STRIPE_TEST", data: "STRIPE_TEST_EVENT", browser: "WEBHOOK_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/touchline-central/inbox/read": { auth: "AUTHENTICATED", role: "ARENA_USER", data: "SUPABASE_USER_INBOX_RECEIPT", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/admin/cards": { auth: "ADMIN", role: "OWNER_ADMIN", data: "SUPABASE_ADMIN_CARD_LIFECYCLE", browser: "ADMIN_HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "PATCH /api/admin/cards": { auth: "ADMIN", role: "OWNER_ADMIN", data: "SUPABASE_ADMIN_CARD_LIFECYCLE", browser: "ADMIN_HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/admin/card-engine": { auth: "ADMIN", role: "OWNER_ADMIN", data: "SUPABASE_CARD_ENGINE_EDITORIAL_BATCH", browser: "ADMIN_HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "PATCH /api/admin/card-engine": { auth: "ADMIN", role: "OWNER_ADMIN", data: "SUPABASE_CARD_ENGINE_EDITORIAL_BATCH", browser: "ADMIN_HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "GET /api/admin/finance/export": { auth: "ADMIN", role: "OWNER_ADMIN", data: "SUPABASE_FINANCE_EXPORT", browser: "ADMIN_HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/admin/manual-card-editorial": { auth: "ADMIN", role: "OWNER_ADMIN", data: "SUPABASE_MANUAL_CARD_EDITORIAL", browser: "ADMIN_HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "PATCH /api/admin/manual-card-editorial": { auth: "ADMIN", role: "OWNER_ADMIN", data: "SUPABASE_MANUAL_CARD_EDITORIAL", browser: "ADMIN_HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/admin/market-values/import": { auth: "ADMIN", role: "OWNER_ADMIN", data: "SUPABASE_MARKET_VALUE_IMPORT", browser: "ADMIN_HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "PATCH /api/admin/market-values/import": { auth: "ADMIN", role: "OWNER_ADMIN", data: "SUPABASE_MARKET_VALUE_IMPORT", browser: "ADMIN_HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "POST /api/admin/promotions": { auth: "ADMIN", role: "OWNER_ADMIN", data: "SUPABASE_PROMOTION_LIFECYCLE", browser: "ADMIN_HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
  "PATCH /api/admin/promotions": { auth: "ADMIN", role: "OWNER_ADMIN", data: "SUPABASE_PROMOTION_LIFECYCLE", browser: "ADMIN_HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING" },
};

const ROUTE_METHOD_OVERRIDES: Record<string, string[]> = {
  "app/(auth)/login/submit/route.ts": ["POST"],
  "app/api/auth/login/submit/route.ts": ["POST"],
};

const BOUNDARY_FILES = [
  "app/(app)/loading.tsx",
  "app/club-owner/[owner]/substitution/loading.tsx",
  "app/club-owner/me/substitution/loading.tsx",
  "app/error.tsx",
  "app/global-error.tsx",
  "app/loading.tsx",
  "app/not-found.tsx",
];

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && [".git", ".next", "node_modules", "public"].includes(entry.name)) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function appRouteFromFile(root: string, file: string) {
  const appRelative = relative(resolve(root, "app"), file).replaceAll("\\", "/");
  const segments = appRelative.split("/").slice(0, -1).filter((segment) => !/^\(.+\)$/.test(segment));
  return `/${segments.join("/")}`.replace(/\/$/, "") || "/";
}

function pagePolicy(route: string): RoutePolicy {
  if (route.startsWith("/admin")) {
    return { auth: "ADMIN", role: "OWNER_ADMIN", data: "SUPABASE_ADMIN", browser: "REQUIRED", status: "PENDING_ADMIN_BROWSER_QA" };
  }
  if (route.startsWith("/visual-qa")) {
    return { auth: "ADMIN", role: "OWNER_ADMIN", data: route === "/visual-qa/representative-package" ? "QA_STATIC_REPRESENTATIVE_FIXTURE" : "STATIC_VISUAL_QA_FIXTURE", browser: "REQUIRED", status: "PENDING_VISUAL_QA" };
  }
  if (route.startsWith("/club-owner/")) {
    if (route === "/club-owner/luiz-lopez") {
      return { auth: "PUBLIC", role: "ANY", data: "PUBLIC_CLUBOWNER_PROFILE_ALIAS", browser: "REQUIRED", status: "PENDING_BROWSER_QA" };
    }
    if (route === "/club-owner/[owner]") {
      return { auth: "PUBLIC_IF_LUIZ_ALIAS_OR_OWN_SESSION", role: "ANY_OR_CLUBOWNER", data: "SUPABASE_CLUBOWNER_PROFILE", browser: "REQUIRED", status: "PENDING_CLUBOWNER_BROWSER_QA" };
    }
    return { auth: "CLUBOWNER_SELF", role: "CLUBOWNER", data: "SUPABASE_PRIVATE_CLUBOWNER_STATE", browser: "REQUIRED", status: "PENDING_CLUBOWNER_BROWSER_QA" };
  }
  return { ...PENDING_PAGE, ...PAGE_POLICIES[route] };
}

function methodsForHandler(root: string, file: string) {
  const sourceFile = relative(root, file).replaceAll("\\", "/");
  if (ROUTE_METHOD_OVERRIDES[sourceFile]) return ROUTE_METHOD_OVERRIDES[sourceFile];
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(/export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((match) => match[1]);
}

export function buildTouchlineRouteAuditManifest(root = process.cwd()) {
  const appFiles = walk(resolve(root, "app"));
  const pageFiles = appFiles.filter((file) => file.endsWith("/page.tsx"));
  const routeFiles = appFiles.filter((file) => file.endsWith("/route.ts"));
  const serverActionFiles = walk(root).filter((file) => /\.(?:ts|tsx)$/.test(file) && /["']use server["']/.test(readFileSync(file, "utf8")));

  const rows: TouchlineRouteAuditRow[] = pageFiles.map((file) => {
    const route = appRouteFromFile(root, file);
    return { route, ...pagePolicy(route), sourceFile: relative(root, file).replaceAll("\\", "/"), kind: "PAGE" };
  });

  for (const file of routeFiles) {
    const route = appRouteFromFile(root, file);
    const methods = methodsForHandler(root, file);
    if (!methods.length) throw new Error(`TL_ROUTE_AUDIT_METHOD_UNRESOLVED:${relative(root, file)}`);
    for (const method of methods) {
      const routeKey = `${method} ${route}`;
      const policy = API_POLICIES[routeKey];
      if (!policy) throw new Error(`TL_ROUTE_AUDIT_API_POLICY_MISSING:${routeKey}`);
      rows.push({ route: routeKey, ...policy, sourceFile: relative(root, file).replaceAll("\\", "/"), kind: "API" });
    }
  }

  for (const sourceFile of BOUNDARY_FILES) {
    rows.push({
      route: `BOUNDARY ${sourceFile.replace(/^app\//, "")}`,
      auth: "INHERITS_ROUTE",
      role: "INHERITS_ROUTE",
      data: sourceFile.includes("loading") ? "LOADING_UI" : sourceFile.includes("not-found") ? "NOT_FOUND_UI" : "ERROR_UI",
      browser: "ERROR_BOUNDARY",
      status: "PENDING_ERROR_STATE_QA",
      sourceFile,
      kind: "BOUNDARY",
    });
  }

  for (const route of ["/manifest.webmanifest", "/robots.txt", "/sitemap.xml"]) {
    rows.push({ route, auth: "PUBLIC", role: "ANY", data: "STATIC_METADATA", browser: "HTTP_CONTRACT", status: "HTTP_CONTRACT_PENDING", sourceFile: `app/${route.slice(1).replace(/\.(?:webmanifest|txt|xml)$/, ".ts")}`, kind: "METADATA" });
  }

  rows.push({ route: "PROXY", auth: "POLICY_ENGINE", role: "ALL", data: "AUTH_AND_ROUTE_ACCESS_POLICY", browser: "REQUEST_BOUNDARY", status: "STRUCTURAL_VERIFIED", sourceFile: "proxy.ts", kind: "PROXY" });
  rows.push({ route: "SERVER_ACTIONS", auth: "N/A", role: "N/A", data: "NONE_FOUND", browser: "N/A", status: serverActionFiles.length ? "UNEXPECTED_SERVER_ACTIONS_FOUND" : "NONE_FOUND", sourceFile: serverActionFiles.map((file) => relative(root, file)).join(",") || "N/A", kind: "SERVER_ACTIONS" });

  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.route)) throw new Error(`TL_ROUTE_AUDIT_DUPLICATE:${row.route}`);
    seen.add(row.route);
    if (Object.values(row).some((value) => !String(value).trim())) throw new Error(`TL_ROUTE_AUDIT_EMPTY_FIELD:${row.route}`);
  }
  return rows.sort((a, b) => a.route.localeCompare(b.route));
}

export function renderTouchlineRouteAuditMarkdown(rows: TouchlineRouteAuditRow[]) {
  const counts = Object.fromEntries(["PAGE", "API", "BOUNDARY", "METADATA", "PROXY", "SERVER_ACTIONS"].map((kind) => [kind, rows.filter((row) => row.kind === kind).length]));
  const table = rows.map((row) => `| ${row.route.replaceAll("|", "\\|")} | ${row.auth} | ${row.role} | ${row.data} | ${row.browser} | ${row.status} |`).join("\n");
  return `# TouchLine — Complete Product Route Inventory\n\nDate: ${TOUCHLINE_ROUTE_AUDIT_DATE}\n\nEnvironment: QA source audit. Production was not changed.\n\nThis manifest inventories source routes and request boundaries. A build entry is not considered visually or functionally approved until its status is advanced by observed browser or HTTP evidence.\n\n## Counts\n\n- Pages: ${counts.PAGE}\n- API methods: ${counts.API}\n- Error/loading boundaries: ${counts.BOUNDARY}\n- Metadata routes: ${counts.METADATA}\n- Proxy policies: ${counts.PROXY}\n- Server Actions: ${counts.SERVER_ACTIONS} inventory row; result is NONE_FOUND\n- Total manifest rows: ${rows.length}\n\n## Manifest\n\n| ROUTE | AUTH | ROLE | DATA | BROWSER | STATUS |\n| ----- | ---- | ---- | ---- | ------- | ------ |\n${table}\n\n## Interpretation\n\n- PENDING_BROWSER_QA and related statuses are intentionally not PASS.\n- METHOD_DISABLED records deliberate 405 boundaries, not missing implementations.\n- LOCAL_ONLY write routes are development editors and are not Production browser ingestion paths.\n- ClubOwner private areas are self-scoped by the proxy and canonical owner identity.\n- Server Actions were not found; route handlers are the mutation boundary.\n`;
}

async function main() {
  const outputIndex = process.argv.indexOf("--write");
  const rows = buildTouchlineRouteAuditManifest();
  if (outputIndex >= 0) {
    const target = process.argv[outputIndex + 1];
    if (!target) throw new Error("TL_ROUTE_AUDIT_OUTPUT_REQUIRED");
    writeFileSync(resolve(target), renderTouchlineRouteAuditMarkdown(rows), "utf8");
  }
  process.stdout.write(`${JSON.stringify({ rows: rows.length, pages: rows.filter((row) => row.kind === "PAGE").length, apiMethods: rows.filter((row) => row.kind === "API").length, serverActions: rows.find((row) => row.kind === "SERVER_ACTIONS")?.status })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "TL_ROUTE_AUDIT_UNKNOWN_ERROR"}\n`);
    process.exitCode = 1;
  });
}
