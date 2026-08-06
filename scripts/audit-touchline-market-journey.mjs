import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, webkit } from "../node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs";

const baseUrl = String(process.env.TOUCHLINE_AUDIT_BASE_URL || "http://127.0.0.1:3137").replace(/\/$/, "");
const outputDirectory = path.resolve(process.env.TOUCHLINE_AUDIT_OUTPUT || "docs/touchline-arena/audit/2026-08-05/gold-product-experience/evidence/market-journey");
const allViewports = [
  { id: "mobile", width: 390, height: 844 },
  { id: "landscape", width: 844, height: 390 },
  { id: "desktop", width: 1440, height: 900 },
];
const requestedViewports = new Set(String(process.env.TOUCHLINE_AUDIT_VIEWPORTS || "").split(",").map((value) => value.trim()).filter(Boolean));
const requestedBrowsers = new Set(String(process.env.TOUCHLINE_AUDIT_BROWSERS || "").split(",").map((value) => value.trim()).filter(Boolean));
const captureScreenshots = process.env.TOUCHLINE_AUDIT_SCREENSHOTS === "1";
const viewports = requestedViewports.size ? allViewports.filter((viewport) => requestedViewports.has(viewport.id)) : allViewports;

async function run(browserName, browserType) {
  const browser = await browserType.launch({ headless: true });
  const results = [];
  try {
    for (const viewport of viewports) {
      console.log(`[market-journey] ${browserName}/${viewport.id}: opening`);
      const context = await browser.newContext({ viewport, locale: "pt-BR", reducedMotion: "reduce" });
      const page = await context.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const response = await page.goto(`${baseUrl}/market-transfer?lang=pt-BR`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      console.log(`[market-journey] ${browserName}/${viewport.id}: DOM ready (${response?.status() ?? "no response"})`);
      // The heading is server-rendered. Wait for the client bundle to finish
      // hydrating before measuring a real interaction; otherwise Playwright can
      // click the visible SSR button before React has attached its handler.
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
      await page.getByTestId("arena-coach-bootstrap").waitFor({ state: "detached", timeout: 15_000 }).catch(() => undefined);
      await page.waitForSelector("h1", { timeout: 20_000 });
      console.log(`[market-journey] ${browserName}/${viewport.id}: client ready`);
      const coachGatePresent = await page.getByTestId("arena-coach-first-gate").count() > 0;
      if (!coachGatePresent) {
        const emptyGoalkeeper = page.getByRole("button", { name: "Adicionar Goleiro", exact: true });
        await emptyGoalkeeper.click({ timeout: 10_000 });
        await page.waitForTimeout(600);
        console.log(`[market-journey] ${browserName}/${viewport.id}: slot selected`);
      } else {
        console.log(`[market-journey] ${browserName}/${viewport.id}: coach-first gate verified`);
      }

      const inspection = await page.evaluate(() => ({
        heading: document.querySelector("h1#touchline-squad-builder-title")?.textContent?.trim() ?? null,
        coachGateHeading: document.querySelector("[data-testid='arena-coach-first-gate'] h1")?.textContent?.trim() ?? null,
        currentStep: document.querySelector("[aria-current='step']")?.textContent?.trim().replace(/\s+/g, " ") ?? null,
        selectedPosition: document.querySelector(".team-builder-position-filters .is-active")?.textContent?.trim() ?? null,
        selectedSlot: document.querySelector("[aria-label='Adicionar Goleiro']")?.getAttribute("aria-pressed") ?? null,
        coachGateVisible: Boolean(document.querySelector("[data-testid='arena-coach-first-gate']")),
        coachGateBlocksSquad: (() => {
          const slot = document.querySelector("[aria-label='Adicionar Goleiro']");
          if (!(slot instanceof HTMLElement)) return Boolean(document.querySelector("[data-testid='arena-coach-first-gate']"));
          if (slot.closest("[inert],[aria-hidden='true']")) return true;
          const rect = slot.getBoundingClientRect();
          const topElement = document.elementFromPoint(rect.left + (rect.width / 2), rect.top + (rect.height / 2));
          return Boolean(topElement?.closest("[data-testid='arena-coach-first-gate']"));
        })(),
        startingSlots: document.querySelectorAll("[aria-label^='Adicionar']").length,
        coachInsidePitch: Boolean(document.querySelector("[aria-label*='Time titular'] [aria-label*='treinador' i]")),
        benchSlots: document.querySelectorAll("[aria-label='Banco da partida'] > div > span").length,
        remainingSquadVisible: Boolean(document.querySelector("[aria-label='Elenco restante']")),
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        scrollHeight: document.documentElement.scrollHeight,
        interactiveUnder40: [...document.querySelectorAll("a[href],button,input,select")].filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const excludedByGatedAncestor = Boolean(element.closest("[aria-hidden='true'],[inert]"));
          return !excludedByGatedAncestor && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 && (rect.width < 40 || rect.height < 40);
        }).length,
      }));

      if (captureScreenshots) {
        const screenshotPath = path.join(outputDirectory, `${browserName}-market-slot-selected-${viewport.id}.jpg`);
        await page.screenshot({ path: screenshotPath, type: "jpeg", quality: 58, fullPage: false });
      }
      results.push({ browser: browserName, viewport, status: response?.status() ?? null, consoleErrors, pageErrors, ...inspection });
      await context.close();
      console.log(`[market-journey] ${browserName}/${viewport.id}: complete`);
    }
  } finally {
    await browser.close();
  }
  return results;
}

await mkdir(outputDirectory, { recursive: true });
const results = [
  ...(requestedBrowsers.size && !requestedBrowsers.has("chromium") ? [] : await run("chromium", chromium)),
  ...(requestedBrowsers.size && !requestedBrowsers.has("webkit") ? [] : await run("webkit", webkit)),
];
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  checks: results.length,
  passed: results.every((result) => result.status === 200
    && ((result.coachGateVisible
      && result.coachGateHeading === "Escolha seu treinador"
      && result.coachGateBlocksSquad
      && result.selectedPosition !== "GK")
      || (!result.coachGateVisible
        && result.heading === "Monte seu time TouchLine"
        && result.selectedPosition === "GK"
        && result.selectedSlot === "true"
        && result.startingSlots === 11
        && result.benchSlots === 9
        && result.remainingSquadVisible))
    && !result.coachInsidePitch
    && !result.horizontalOverflow
    && !result.consoleErrors.length
    && !result.pageErrors.length),
  results,
};
await writeFile(path.join(outputDirectory, "market-human-journey.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ checks: report.checks, passed: report.passed, outputDirectory }, null, 2));
