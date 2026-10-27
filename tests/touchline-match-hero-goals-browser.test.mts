import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium, webkit, expect, type Locator } from "@playwright/test";

import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";

const root = fileURLToPath(new URL("../", import.meta.url));
test("real MatchCentre goals: five authors per column, grouped balls and long names without frame growth", {
  skip: process.env.TOUCHLINE_RUN_HERO_GOALS_BROWSER_TESTS !== "1", timeout: 120_000,
}, async t => {
  const capacity = () => requireBrowserCapacity(root, { darwinFreePercent: true });
  capacity();
  // Synthetic browser evidence only. Keep screenshots outside the repository;
  // print exact generated paths for human inspection, including failing cases.
  const screenshotDirectory = mkdtempSync("/private/tmp/touchline-hero-goals-");
  t.diagnostic(`Screenshot directory: ${screenshotDirectory}`);
  // Wait for close: compiler/AST caches must be gone before browser launch.
  t.signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types",
      path.join(root, "tests/helpers/touchline-hero-goals-compile-worker.mts"), screenshotDirectory], {
      cwd: root, stdio: "ignore",
    });
    let failure: Error | undefined;
    const abort = () => { failure = new Error("Hero goals fixture compilation aborted"); child.kill("SIGKILL"); };
    const timeout = setTimeout(() => { failure = new Error("Hero goals fixture compilation exceeded 30 seconds"); child.kill("SIGKILL"); }, 30_000);
    t.signal.addEventListener("abort", abort, { once: true });
    child.once("error", () => { failure = new Error("Hero goals compiler could not start"); });
    child.once("close", code => {
      clearTimeout(timeout); t.signal.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`Hero goals compiler exited with code ${code}`));
      else resolve();
    });
    if (t.signal.aborted) abort();
  });
  t.signal.throwIfAborted();
  const script = readFileSync(path.join(screenshotDirectory, "fixture.js"), "utf8");
  const css = readFileSync(path.join(screenshotDirectory, "fixture.css"), "utf8");
  const receipt = JSON.parse(readFileSync(path.join(screenshotDirectory, "fixture-sources.json"), "utf8")) as { sources: string[]; sha256: Record<string, string> };
  assert.ok(script.length > 0 && css.length > 0 && Array.isArray(receipt.sources) && receipt.sources.length > 0);
  for (const source of receipt.sources) {
    assert.ok(typeof source === "string" && !path.isAbsolute(source) && !source.split("/").includes(".."), "repository-relative source required");
    assert.equal(createHash("sha256").update(readFileSync(path.join(root, source))).digest("hex"), receipt.sha256[source], "compiled source must match current source");
  }
  for (const required of ["components/touchline/match-centre/TouchlineMatchCentre.tsx", "components/touchline/match-centre/touchline-match-centre.module.css", "lib/touchlineArena/match-hero-goals.ts", "app/globals.css"]) {
    assert.ok(receipt.sources.includes(required), required);
  }
  t.diagnostic(`Compiler exited before browser launch; source receipt: ${path.join(screenshotDirectory, "fixture-sources.json")}`);
  const publicRoot = realpathSync(path.join(root, "public")), origin = "https://hero-goals.test";
  const revealInsideGoalList = async (target: Locator, heroClass: string) => {
    // Move only the real list scrollport, never document/scrollIntoView. Check
    // the entire name/moment, not just its row or DOM presence.
    await target.evaluate(node => {
      const list = node.closest("ul")!, frame = list.getBoundingClientRect(), item = node.getBoundingClientRect();
      const left = frame.left + list.clientLeft, top = frame.top + list.clientTop;
      const right = left + list.clientWidth, bottom = top + list.clientHeight;
      list.scrollBy({ behavior: "instant", left: item.right > right ? item.right - right : item.left < left ? item.left - left : 0,
        top: item.bottom > bottom ? item.bottom - bottom : item.top < top ? item.top - top : 0 });
    });
    await expect.poll(() => target.evaluate((node, heroClass) => {
      const list = node.closest("ul")!, frame = list.getBoundingClientRect(), item = node.getBoundingClientRect();
      const hero = node.closest<HTMLElement>(`.${heroClass}`)!;
      const heroFrame = hero.getBoundingClientRect();
      // The list may fit its own contents while itself being clipped by the
      // real hero's overflow:hidden. Require both clientboxes, not viewport:
      // vertical document scrolling remains intentional on short screens.
      const left = Math.max(frame.left + list.clientLeft, heroFrame.left + hero.clientLeft);
      const top = Math.max(frame.top + list.clientTop, heroFrame.top + hero.clientTop);
      const right = Math.min(frame.left + list.clientLeft + list.clientWidth, heroFrame.left + hero.clientLeft + hero.clientWidth);
      const bottom = Math.min(frame.top + list.clientTop + list.clientHeight, heroFrame.top + hero.clientTop + hero.clientHeight);
      return item.width > 0 && item.height > 0 && item.left >= left - 1 && item.right <= right + 1
        && item.top >= top - 1 && item.bottom <= bottom + 1;
    }, heroClass)).toBe(true);
  };
  // Capacity-limited runs can select a case without changing the default matrix.
  // Report these as partial evidence, never as the full browser/viewport suite.
  const requestedEngine = process.env.TOUCHLINE_HERO_GOALS_BROWSER;
  const requestedWidth = process.env.TOUCHLINE_HERO_GOALS_WIDTH;
  const requestedScenario = process.env.TOUCHLINE_HERO_GOALS_SCENARIO;
  const scenarios = ["five", "six", "one-seven", "long-names"];
  assert.ok(requestedScenario === undefined || scenarios.includes(requestedScenario), "invalid hero goals scenario filter");
  // Frame stability always compares against five authors. Keep that prerequisite
  // even in a single-scenario run; otherwise filtering would skip the oracle.
  const selectedScenarios = requestedScenario === undefined ? scenarios
    : requestedScenario === "five" ? ["five"] : ["five", requestedScenario];
  const engines = [chromium, webkit];
  const viewports = [{ width: 1280, height: 800 }, { width: 844, height: 390 }, { width: 667, height: 375 }];
  assert.ok(!requestedEngine || engines.some(engine => engine.name() === requestedEngine));
  assert.ok(!requestedWidth || viewports.some(viewport => String(viewport.width) === requestedWidth));
  t.diagnostic(`Selected browsers=${requestedEngine ?? 'all'} width=${requestedWidth ?? 'all'} scenario=${requestedScenario ?? 'all'} executedScenarios=${selectedScenarios.join(',')} (five-author baseline retained)`);
  for (const engine of engines.filter(engine => !requestedEngine || engine.name() === requestedEngine)) {
    capacity(); assert.ok(existsSync(engine.executablePath()), "use installed browser only");
    const browser = await engine.launch({ headless: true });
    const abort = () => { void browser.close(); }; t.signal.addEventListener("abort", abort, { once: true });
    try {
      for (const viewport of viewports.filter(viewport => !requestedWidth || String(viewport.width) === requestedWidth)) {
        capacity();
        const context = await browser.newContext({ viewport, reducedMotion: "reduce", serviceWorkers: "block" });
        try {
          const page = await context.newPage(); page.setDefaultTimeout(8000);
          const errors: string[] = [], forbidden: string[] = [], api: string[] = [];
          page.on("pageerror", error => errors.push(error.message));
          await context.route("**/*", async route => {
            const request = route.request(), url = new URL(request.url());
            if (request.method() !== "GET" || url.origin !== origin) { forbidden.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
            if (url.pathname === "/live") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div></body></html>` });
            if (url.pathname.startsWith("/api/")) { api.push(url.pathname); return route.fulfill({ status: 503, json: { ok: false, error: "Isolated layout" } }); }
            const asset = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
            if (asset.startsWith(publicRoot + path.sep) && existsSync(asset) && statSync(asset).isFile() && realpathSync(asset).startsWith(publicRoot + path.sep)) return route.fulfill({ path: asset });
            forbidden.push(url.pathname); return route.abort();
          });
          await page.goto(`${origin}/live?lang=en-GB`); await page.addScriptTag({ content: `(()=>{${script}})()` });
          const classes = await page.evaluate(() => (window as unknown as { goalStyles: Record<string, string> }).goalStyles);
          let baseline: { height: number; teams: number; score: number } | null = null;
          for (const scenario of selectedScenarios) {
            capacity();
            await page.evaluate(scenario => (window as unknown as { renderGoalScenario(s: string): void }).renderGoalScenario(scenario), scenario);
            assert.deepEqual(errors, []);
            const hero = page.locator(`.${classes.hero}`), lists = hero.locator(`.${classes.heroGoals} > ul`);
            await expect(hero).toBeVisible(); await expect(lists).toHaveCount(2);
            await page.evaluate(() => document.fonts.ready);
            for (const image of await hero.locator("img").all()) await expect.poll(() => image.evaluate(node =>
              (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
            // Keep human-inspectable evidence for every selected engine/case,
            // including the five-author baseline; geometry alone is not visual approval.
            {
              const screenshot = path.join(screenshotDirectory, `${engine.name()}-${viewport.width}x${viewport.height}-${scenario}.png`);
              await hero.screenshot({ path: screenshot, animations: "disabled" });
              t.diagnostic(`Screenshot: ${screenshot}`);
            }
            const frame = await hero.evaluate((node, classes) => {
              const b = node.getBoundingClientRect(); return { height: b.height,
                teams: node.querySelector(`.${classes.heroTeams}`)!.getBoundingClientRect().top - b.top,
                score: node.querySelector(`.${classes.score}`)!.getBoundingClientRect().top - b.top };
            }, classes);
            if (baseline) { assert.ok(Math.abs(frame.height - baseline.height) < 1, "goals never enlarge frame"); assert.ok(Math.abs(frame.teams - baseline.teams) < 1); assert.ok(Math.abs(frame.score - baseline.score) < 1); }
            else baseline = frame;
            for (const [sideIndex, list] of (await lists.all()).entries()) {
              const side = sideIndex === 0 ? "Home" : "Away";
              const minuteStart = sideIndex === 0 ? 5 : 8;
              await expect(list).toHaveAttribute("aria-label", `Synthetic ${side}`);
              const ownGoal = list.locator(`.${classes.ownGoalMark}`);
              await expect(ownGoal).toHaveCount(1);
              await expect(ownGoal).toHaveText("OG");
              await expect(ownGoal).toHaveAttribute("title", "Own goal");
              await expect(ownGoal).toBeVisible();
              const authors = list.locator(":scope > li");
              const authorCount = scenario === "one-seven" ? 1 : scenario === "five" ? 5 : 6;
              await expect(authors).toHaveCount(authorCount);
              // Independent expected values by club: rendering the home goals
              // in both columns must fail, even if geometry/counts are equal.
              for (let index = 0; index < authorCount; index++) {
                const author = authors.nth(index);
                const expectedName = scenario === "one-seven" ? `Synthetic ${side} Seven Goals` : scenario === "long-names"
                  ? `Synthetic ${side} Very Long Compound Footballer Name ${index + 1}` : `Synthetic ${side} Scorer ${index + 1}`;
                await expect(author.locator("strong")).toHaveText(expectedName);
                assert.deepEqual(await author.locator("time").allTextContents(), scenario === "one-seven"
                  ? Array.from({ length: 7 }, (_, goal) => `${minuteStart + goal * 12}′`) : [`${minuteStart + index * 12}′`]);
              }
              if (scenario === "six" || scenario === "long-names") {
                const boxes = await authors.evaluateAll(nodes => nodes.map(node => { const b = node.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right }; }));
                for (let i = 1; i < 5; i++) { assert.ok(Math.abs(boxes[i].left - boxes[0].left) < 1); assert.ok(boxes[i].top > boxes[i - 1].top); }
                assert.ok(boxes[5].left >= boxes[0].right + 1, "sixth author starts the next column"); assert.ok(Math.abs(boxes[5].top - boxes[0].top) < 1);
                const dimensions = await list.evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth, overflow: getComputedStyle(node).overflowX }));
                if (dimensions.scroll > dimensions.width + 1) {
                  assert.equal(dimensions.overflow, "auto");
                  await list.evaluate(node => { node.scrollLeft = node.scrollWidth; });
                  await expect.poll(() => list.evaluate(node => node.scrollLeft > 0)).toBe(true);
                  assert.equal(await authors.last().evaluate(node => { const b = node.getBoundingClientRect(), p = node.parentElement!.getBoundingClientRect(); return b.left >= p.left - 1 && b.right <= p.right + 1; }), true);
                }
              }
              if (scenario === "one-seven") {
                const moments = authors.locator(`.${classes.goalMoment}`); await expect(moments).toHaveCount(7);
                assert.deepEqual(await moments.locator("time").allTextContents(), Array.from({ length: 7 }, (_, goal) => `${minuteStart + goal * 12}′`));
                for (const moment of await moments.all()) assert.equal(await moment.evaluate(node => {
                  const time = node.querySelector("time")!.getBoundingClientRect(), ball = node.querySelector("span")!.getBoundingClientRect();
                  return time.bottom < ball.top && Math.abs((time.left + time.right - ball.left - ball.right) / 2) < 1;
                }), true, "minute stays above and centered over its ball");
                const beforeReveal = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
                await revealInsideGoalList(moments.last(), classes.hero);
                assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), beforeReveal, "seventh goal reached without moving document");
              }
              {
                const beforeReveal = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
                for (const name of await authors.locator("strong").all()) await revealInsideGoalList(name, classes.hero);
                assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), beforeReveal, "every full name reachable inside its list and hero without moving document");
              }
              assert.equal(await authors.first().locator("strong").evaluate(node => getComputedStyle(node).fontSize), "12px", "name size preserved");
            }
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, "overflow stays within lists");
            t.diagnostic(JSON.stringify({ engine: engine.name(), viewport, scenario, frame, scope: "synthetic full MatchCentre; no live provider/account/persistence proof" }));
          }
          assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
          assert.equal(api.some(url => url.includes("/football-data/fantasy/fixture")), false, "no detail fetch can replace the supplied goal evidence");
        } finally { await context.close(); }
      }
    } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
  }
});
