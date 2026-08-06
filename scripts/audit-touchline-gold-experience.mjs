import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, webkit } from "../node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs";

const baseUrl = String(process.env.TOUCHLINE_AUDIT_BASE_URL || "http://127.0.0.1:3137").replace(/\/$/, "");
const outputDirectory = path.resolve(process.env.TOUCHLINE_AUDIT_OUTPUT || "docs/touchline-arena/audit/2026-08-05/gold-product-experience/evidence");

const allViewports = [
  { id: "mobile-portrait", width: 390, height: 844 },
  { id: "mobile-landscape", width: 844, height: 390 },
  { id: "tablet", width: 768, height: 1024 },
  { id: "tablet-landscape", width: 1024, height: 768 },
  { id: "desktop", width: 1440, height: 900 },
  { id: "large-desktop", width: 1920, height: 1080 },
];

const allRoutes = [
  { id: "home", path: "/?lang=pt-BR" },
  { id: "login", path: "/login?lang=pt-BR" },
  { id: "register", path: "/register?lang=pt-BR" },
  { id: "recovery", path: "/forgot-password?lang=pt-BR" },
  { id: "reset-password", path: "/reset-password?lang=pt-BR" },
  { id: "market", path: "/market-transfer?lang=pt-BR" },
  { id: "arena", path: "/arena?skipIntro=1&lang=pt-BR" },
  { id: "match-centre", path: "/live?lang=pt-BR" },
  { id: "player-profile", path: "/touchline-players/erling-haaland?lang=pt-BR" },
  { id: "coach-profile", path: "/touchline-coaches/michael-carrick?lang=pt-BR" },
  { id: "club-hub", path: "/touchline-clubs/manchester-united?lang=pt-BR" },
  { id: "tables", path: "/touchline-tables?lang=pt-BR" },
  { id: "top-11", path: "/touchline-tables?tab=top11&lang=pt-BR" },
  { id: "rankings", path: "/touchline-player-card-rankings?lang=pt-BR" },
  { id: "inbox", path: "/inbox?lang=pt-BR" },
  { id: "notifications", path: "/notifications?lang=pt-BR" },
  { id: "football-search", path: "/football-search?lang=pt-BR" },
  { id: "club-owner", path: "/club-owner/luiz-lopez?lang=pt-BR" },
  { id: "club-owner-history", path: "/club-owner/luiz-lopez/history?lang=pt-BR" },
  { id: "club-owner-renewals", path: "/club-owner/luiz-lopez/renewals?lang=pt-BR" },
  { id: "training-centre", path: "/club-owner/luiz-lopez/substitution?lang=pt-BR" },
  { id: "admin", path: "/admin?lang=pt-BR" },
  { id: "admin-analytics", path: "/admin/analytics?lang=pt-BR" },
  { id: "admin-cards", path: "/admin/cards?lang=pt-BR" },
  { id: "admin-finance", path: "/admin/finance?lang=pt-BR" },
  { id: "admin-football-data", path: "/admin/football-data?lang=pt-BR" },
  { id: "admin-market-values", path: "/admin/market-values?lang=pt-BR" },
  { id: "admin-promotions", path: "/admin/promotions?lang=pt-BR" },
];

const screenshotRoutes = new Set(["market", "arena", "match-centre", "club-hub", "notifications", "football-search"]);
const requestedRoutes = new Set(String(process.env.TOUCHLINE_AUDIT_ROUTES || "").split(",").map((value) => value.trim()).filter(Boolean));
const requestedViewports = new Set(String(process.env.TOUCHLINE_AUDIT_VIEWPORTS || "").split(",").map((value) => value.trim()).filter(Boolean));
const requestedBrowsers = new Set(String(process.env.TOUCHLINE_AUDIT_BROWSERS || "").split(",").map((value) => value.trim()).filter(Boolean));
const routes = requestedRoutes.size ? allRoutes.filter((route) => requestedRoutes.has(route.id)) : allRoutes;
const viewports = requestedViewports.size ? allViewports.filter((viewport) => requestedViewports.has(viewport.id)) : allViewports;

function safeFileName(value) {
  return value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function inspectPage(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const allInteractive = [...document.querySelectorAll("a[href], button, input, select, textarea, [role='button'], [tabindex]")];
    const visibleInteractive = allInteractive.filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const excludedByState = Boolean(element.closest("[aria-hidden='true'],[inert]"));
      return !excludedByState && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    });
    const undersized = visibleInteractive.map((element) => {
      const rect = element.getBoundingClientRect();
      const label = element.closest("label");
      const labelRect = label?.getBoundingClientRect();
      const effectiveWidth = labelRect && labelRect.width >= rect.width ? labelRect.width : rect.width;
      const effectiveHeight = labelRect && labelRect.height >= rect.height ? labelRect.height : rect.height;
      return {
        tag: element.tagName.toLowerCase(),
        label: (element.getAttribute("aria-label") || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 90),
        width: Math.round(effectiveWidth),
        height: Math.round(effectiveHeight),
      };
    }).filter((entry) => entry.width < 44 || entry.height < 44).slice(0, 30);

    const resourceEntries = performance.getEntriesByType("resource");
    const navigation = performance.getEntriesByType("navigation")[0];
    return {
      lang: document.documentElement.lang,
      title: document.title,
      h1: document.querySelector("h1")?.textContent?.trim() || null,
      bodyText: (document.querySelector("main")?.textContent || body.textContent || "").trim().replace(/\s+/g, " ").slice(0, 1200),
      documentWidth: root.scrollWidth,
      viewportWidth: window.innerWidth,
      horizontalOverflow: root.scrollWidth > window.innerWidth + 2,
      bodyHeight: Math.max(body.scrollHeight, root.scrollHeight),
      domNodes: document.querySelectorAll("*").length,
      interactiveCount: visibleInteractive.length,
      undersized,
      cardProducts: document.querySelectorAll("[aria-label*='TouchLine market card']").length,
      progressiveLabel: [...document.querySelectorAll("span")].map((item) => item.textContent?.trim()).find((text) => /\d+ (de|of) \d+ (jogadores|players)/i.test(text || "")) || null,
      resources: resourceEntries.length,
      transferredBytes: resourceEntries.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
      domContentLoadedMs: navigation ? Math.round(navigation.domContentLoadedEventEnd) : null,
      loadMs: navigation ? Math.round(navigation.loadEventEnd) : null,
    };
  });
}

async function inspectStablePage(page) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await inspectPage(page);
    } catch (error) {
      lastError = error;
      if (!/Execution context was destroyed|navigation/i.test(String(error))) throw error;
      await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(350);
    }
  }
  throw lastError;
}

async function runBrowser(browserName, browserType) {
  const browser = await browserType.launch({ headless: true });
  const results = [];
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, locale: "pt-BR", reducedMotion: "reduce" });
      for (const route of routes) {
        const page = await context.newPage();
        const consoleErrors = [];
        const pageErrors = [];
        const networkErrors = [];
        page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
        page.on("pageerror", (error) => pageErrors.push(error.message));
        page.on("requestfailed", (request) => {
          const failure = request.failure()?.errorText || "request failed";
          if (!/aborted|cancelled/i.test(failure)) networkErrors.push(`${request.method()} ${request.url()} — ${failure}`);
        });

        let responseStatus = null;
        let navigationError = null;
        const startedAt = Date.now();
        try {
          const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
          responseStatus = response?.status() ?? null;
          if (route.id === "market") {
            await page.getByTestId("arena-coach-bootstrap").waitFor({ state: "detached", timeout: 15_000 }).catch(() => undefined);
          }
          await page.waitForTimeout(route.id === "club-hub" ? 1_800 : 800);
        } catch (error) {
          navigationError = error instanceof Error ? error.message : String(error);
        }

        let inspection = null;
        try { inspection = await inspectStablePage(page); } catch (error) { navigationError ||= error instanceof Error ? error.message : String(error); }

        if (screenshotRoutes.has(route.id) && ["mobile-portrait", "mobile-landscape", "tablet", "tablet-landscape", "desktop", "large-desktop"].includes(viewport.id)) {
          const screenshotPath = path.join(outputDirectory, `${safeFileName(browserName)}-${route.id}-${viewport.id}.jpg`);
          await page.screenshot({ path: screenshotPath, type: "jpeg", quality: 58, fullPage: false, timeout: 20_000 }).catch(() => {});
        }

        results.push({
          browser: browserName,
          viewport,
          route,
          finalUrl: page.url(),
          responseStatus,
          elapsedMs: Date.now() - startedAt,
          navigationError,
          consoleErrors: [...new Set(consoleErrors)].slice(0, 20),
          pageErrors: [...new Set(pageErrors)].slice(0, 20),
          networkErrors: [...new Set(networkErrors)].slice(0, 20),
          inspection,
        });
        console.log(`${browserName} · ${viewport.id} · ${route.id} · ${navigationError ? "FAIL" : responseStatus ?? "OK"}`);
        await page.close();
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return results;
}

await mkdir(outputDirectory, { recursive: true });
const startedAt = new Date().toISOString();
const chromiumResults = requestedBrowsers.size && !requestedBrowsers.has("chromium") ? [] : await runBrowser("chromium", chromium);
const webkitResults = requestedBrowsers.size && !requestedBrowsers.has("webkit") ? [] : await runBrowser("webkit", webkit);
const results = [...chromiumResults, ...webkitResults];
const summary = {
  baseUrl,
  startedAt,
  completedAt: new Date().toISOString(),
  checks: results.length,
  navigationFailures: results.filter((item) => item.navigationError).length,
  serverErrors: results.filter((item) => (item.responseStatus || 0) >= 500).length,
  overflowFailures: results.filter((item) => item.inspection?.horizontalOverflow).length,
  consoleErrorChecks: results.filter((item) => item.consoleErrors.length || item.pageErrors.length).length,
  networkErrorChecks: results.filter((item) => item.networkErrors.length).length,
  results,
};

const outputPath = path.join(outputDirectory, "gold-product-browser-matrix.json");
await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, checks: summary.checks, navigationFailures: summary.navigationFailures, serverErrors: summary.serverErrors, overflowFailures: summary.overflowFailures, consoleErrorChecks: summary.consoleErrorChecks, networkErrorChecks: summary.networkErrorChecks }, null, 2));
