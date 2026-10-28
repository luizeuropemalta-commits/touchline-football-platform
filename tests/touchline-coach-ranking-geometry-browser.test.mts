import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, realpathSync, statSync, statfsSync } from "node:fs";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webkit } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";

const root = fileURLToPath(new URL("../", import.meta.url));
test("real ranking panel contains seven synthetic coach rows without internal scrolling", {
  skip: process.env.TOUCHLINE_RUN_COACH_GEOMETRY_BROWSER_TESTS !== "1", timeout: 60_000,
}, async t => {
  const capacity = () => {
    requireBrowserCapacity(root, { darwinFreePercent: true });
    const disk = statfsSync(root), freeBytes = disk.bavail * disk.bsize;
    return { freeBytes, policy: "shared-browser-capacity" };
  };
  const before = capacity();
  const bundle = bundleIsolatedBrowserFixture({
    entryPath: "tests/fixtures/CoachRankingGeometryFixture.tsx", cssPrefix: "coachGeometry",
    requiredSources: ["app/rankings/touchline-tables-client.tsx", "app/rankings/touchline-tables.module.css", "lib/touchlineArena/tables-presentation-i18n.ts"],
    mountScript: "flushSync(()=>root.render(React.createElement(loadEntry().default,window.fixtureProps)));",
  });
  capacity();
  const globalCss = readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "");
  const preflight = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8");
  const publicRoot = realpathSync(path.join(root, "public"));
  assert.ok(existsSync(webkit.executablePath()), "installed WebKit only");
  const browser = await webkit.launch({ headless: true });
  t.signal.addEventListener("abort", () => { void browser.close(); }, { once: true });
  const reports: unknown[] = [];
  try {
    for (const locale of ["en-GB", "pt-BR", "ar-SA"]) for (const [width, height] of [[1280, 800], [844, 390]]) {
      capacity();
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", serviceWorkers: "block" });
      const errors: string[] = [], unexpected: string[] = [];
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      const safe = (s: string) => s.replace(/<\/script/gi, "<\\/script");
      const html = `<!doctype html><html lang="${locale}" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}\n${globalCss}\n${bundle.css}</style></head><body><div id="root"></div><script>window.fixtureProps=${safe(JSON.stringify({ locale }))};</script><script>${safe(bundle.script)}</script></body></html>`;
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (request.method() === "GET" && url.origin === "https://coach-geometry.test") {
          if (url.pathname === "/fixture") { await route.fulfill({ contentType: "text/html", body: html }); return; }
          if (/\.(png|webp|svg|woff2?)$/i.test(url.pathname)) {
            const file = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
            if (file.startsWith(`${publicRoot}${path.sep}`) && existsSync(file) && statSync(file).isFile() && realpathSync(file).startsWith(`${publicRoot}${path.sep}`)) {
              await route.fulfill({ path: file }); return;
            }
          }
        }
        unexpected.push(`${request.method()} ${url.pathname}`); await route.abort();
      });
      try {
        await page.goto("https://coach-geometry.test/fixture", { waitUntil: "domcontentloaded" });
        await page.locator('[data-coach-rank="7"]').waitFor();
        const geometry = await page.locator("#coach-rankings").evaluate(panel => {
          const box = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; };
          const list = panel.querySelector("ol")!;
          return { panel: box(panel), list: box(list), scrollHeight: list.scrollHeight, clientHeight: list.clientHeight, overflow: getComputedStyle(list).overflowY,
            rows: [...list.children].map(row => ({ bounds: box(row), cells: [...row.children].map(box),
              identityContent: row.children[2] ? [...row.children[2].children].map(box) : [],
              clubContent: row.children[2]?.children[1] ? [...row.children[2].children[1].children].map(box) : [],
            })) };
        });
        assert.equal(geometry.rows.length, 7);
        assert.ok(!["auto", "scroll"].includes(geometry.overflow));
        assert.ok(geometry.scrollHeight <= geometry.clientHeight + 1);
        type Box = typeof geometry.panel;
        const contains = (outer: Box, inner: Box) => inner.x >= outer.x - 1 && inner.right <= outer.right + 1
          && inner.y >= outer.y - 1 && inner.bottom <= outer.bottom + 1;
        const disjoint = (a: Box, b: Box) => a.right <= b.x + 1 || b.right <= a.x + 1
          || a.bottom <= b.y + 1 || b.bottom <= a.y + 1;
        for (const row of geometry.rows) {
          assert.ok(row.bounds.y >= geometry.panel.y - 1 && row.bounds.bottom <= geometry.panel.bottom + 1);
          assert.ok(row.bounds.x >= geometry.panel.x - 1 && row.bounds.right <= geometry.panel.right + 1);
          assert.ok(row.bounds.y >= geometry.list.y - 1 && row.bounds.bottom <= geometry.list.bottom + 1);
          assert.equal(row.cells.length, 5, "rank, gem, identity, record and points structure");
          for (const cell of row.cells) assert.ok(contains(row.bounds, cell), "every cell remains inside its row");
          const [identity, record, points] = row.cells.slice(2);
          assert.ok(disjoint(identity, record) && disjoint(identity, points) && disjoint(record, points), "identity, record and points do not overlap in either row or stacked layout");
          assert.equal(row.identityContent.length, 2, "name and club identity");
          for (const content of row.identityContent) assert.ok(contains(identity, content), "name/club block stays in identity cell; name ellipsis allowed");
          for (const content of row.clubContent) assert.ok(contains(row.identityContent[1], content), "wrapped club contents stay in club block");
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
        if (process.env.TOUCHLINE_COACH_GEOMETRY_CAPTURE_PREFIX) await page.screenshot({ path: `${process.env.TOUCHLINE_COACH_GEOMETRY_CAPTURE_PREFIX}-${locale}-${width}.png`, fullPage: true });
        reports.push({ locale, width, height, geometry });
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify({ before, after: capacity(), cssHash: createHash("sha256").update(bundle.css).digest("hex"), sources: bundle.sources, reports }));
});
