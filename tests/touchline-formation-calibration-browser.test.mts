import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import ts from "typescript";
import { chromium, webkit, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import { TOUCHLINE_CALIBRATED_FORMATION_CODES, TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY as registry } from "../lib/touchlineArena/formation-geometry.ts";

const enabled = process.env.TOUCHLINE_RUN_FORMATION_CALIBRATION_BROWSER_TESTS === "1";
const engineName = process.env.TOUCHLINE_FORMATION_CALIBRATION_BROWSER_ENGINE ?? "webkit";
assert.ok(["chromium", "webkit"].includes(engineName));

async function fixtureStyles(sources: string[], modules: string) {
  const require = createRequire(import.meta.url);
  const packageRoot = dirname(dirname(require.resolve("tailwindcss")));
  const candidates = new Set<string>();
  for (const file of sources.filter(file => file.endsWith(".tsx"))) {
    const ast = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        for (const token of node.text.split(/\s+/)) if (token) candidates.add(token);
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  const compiler = await require("tailwindcss").compile(readFileSync(join(packageRoot, "theme.css"), "utf8") + "\n@tailwind utilities;");
  const globals = readFileSync("app/globals.css", "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "");
  return readFileSync(join(packageRoot, "preflight.css"), "utf8") + compiler.build([...candidates]) + globals + modules;
}

test(`formation calibration (${engineName}): every code-default XI fits landscape and desktop with original coordinates`, { skip: !enabled, timeout: 150_000 }, async () => {
  requireBrowserCapacity(process.cwd(), { darwinFreePercent: true, allowModerateDarwinPressure: process.env.TOUCHLINE_LOCAL_ALLOW_MODERATE_PRESSURE === "1" });
  const bundle = bundleIsolatedBrowserFixture({ entryPath: "tests/fixtures/FormationCalibrationBrowserFixture.tsx", cssPrefix: "calibration",
    requiredSources: ["components/arena-admin-shell.tsx", "components/touchline/admin/FormationCalibrationStudio.tsx", "components/touchline/admin/FormationCalibrationStudio.module.css", "components/touchline/pitch/TouchlinePitchSurface.tsx", "components/touchline/TouchlineLandscapeBoundary.tsx"],
    mountScript: "flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(loadEntry().default))));",
  });
  const css = await fixtureStyles(bundle.sources, bundle.css);
  const evidence = mkdtempSync(join(tmpdir(), `touchline-formation-calibration-${engineName}-`));
  console.info("Synthetic editor evidence:", evidence);
  const records: unknown[] = [];
  const browser = await (engineName === "webkit" ? webkit : chromium).launch({ headless: true });
  try {
    for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 375 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
      const mobile = viewport.width < 1000;
      const context = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1, serviceWorkers: "block" });
      try {
        const page = await context.newPage(); const errors: string[] = []; const writes: string[] = [];
        // Chromium's headless viewport resize may drop the coarse-pointer override.
        // Reassert the intended device input explicitly instead of changing product CSS.
        const touchSession = mobile && engineName === "chromium" ? await context.newCDPSession(page) : null;
        const restoreTouch = async () => { if (touchSession) await touchSession.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 }); };
        await restoreTouch();
        page.on("pageerror", error => errors.push(error.message));
        await page.route("**/*", route => {
          const request = route.request();
          if (request.method() !== "GET") { writes.push(request.method()); return route.abort(); }
          if (!request.isNavigationRequest()) {
            const path = new URL(request.url()).pathname;
            if (["/touchlineArena/shared/club-logos/2026-27/ui-512/arsenal.png", "/touchlineArena/live/official-live-pitch-960.webp", "/touchlineArena/brand/tl-shield-lime.svg"].includes(path)) {
              return route.fulfill({ path: join(process.cwd(), "public", path) });
            }
            return route.abort();
          }
          return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><div id="root" data-touchline-orientation-root></div><script>${bundle.script.replace(/<\/script/gi, "<\\/script")}</script></html>` });
        });
        await page.goto("https://formation-calibration.invalid/admin/formation-calibration?lang=pt-BR");
        const formation = page.getByRole("combobox", { name: "Formação", exact: true });
        await expect(formation).toBeVisible();
        const pitch = page.getByRole("group", { name: /calibration preview$/ });
        for (const code of TOUCHLINE_CALIBRATED_FORMATION_CODES) {
          await formation.selectOption(code);
          await expect(pitch).toHaveAttribute("aria-label", `${code} calibration preview`);
          const measurement = await pitch.evaluate(element => {
            const rect = (node: Element) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
            const slots = [...element.querySelectorAll("button")].map(node => ({ id: node.querySelector("b")!.textContent!, label: node.getAttribute("aria-label"), left: node.style.left, top: node.style.top, touch: getComputedStyle(node).touchAction, bounds: rect(node), textBounds: [...node.querySelectorAll("b, small")].map(rect) }));
            return { pitch: rect(element), shell: rect(element.parentElement!), preview: rect(element.parentElement!.parentElement!), touch: getComputedStyle(element.parentElement!).touchAction, slots, viewport: innerWidth, documentWidth: document.documentElement.scrollWidth };
          });
          records.push({ engine: engineName, deviceViewport: viewport, code, ...measurement });
          writeFileSync(join(evidence, "geometry.json"), JSON.stringify(records, null, 2));
          const label = `${engineName}/${viewport.width}/${code}`;
          const box = measurement.pitch;
          assert.ok(measurement.documentWidth <= viewport.width, `${label}: document overflow`);
          assert.ok(box.left >= measurement.preview.left && box.right <= measurement.preview.right, `${label}: pitch exceeds preview`);
          assert.ok(Math.abs(box.width / box.height - 105 / 68) < .004, `${label}: pitch ratio changed`);
          assert.deepEqual(measurement.shell, box, `${label}: pointer coordinate container differs from pitch`);
          assert.equal(measurement.touch, "auto", `${label}: blank grass must allow pan and pinch`);
          assert.equal(measurement.slots.length, 11);
          for (const slot of measurement.slots) {
            const original = registry[code].slots.find(entry => entry.id === slot.id)!;
            assert.equal(slot.left, `${original.x}%`); assert.equal(slot.top, `${original.y}%`);
            assert.equal(slot.label, `${original.id} X ${original.x} Y ${original.y}`);
            assert.equal(slot.touch, "none", "only the draggable slot captures touch");
            assert.ok(slot.bounds.left >= box.left && slot.bounds.right <= box.right && slot.bounds.top >= box.top && slot.bounds.bottom <= box.bottom, `${label}: ${slot.id} clipped ${JSON.stringify({ slot: slot.bounds, box })}`);
            assert.ok(slot.bounds.width >= 44 && slot.bounds.height >= 44, `${label}: touch target too small`);
            if (mobile) assert.ok(slot.bounds.left >= 44 && slot.bounds.right <= viewport.width - 44, `${label}: ${slot.id} enters simulated 44px notch margins`);
          }
          for (let i = 0; i < measurement.slots.length; i++) for (let j = i + 1; j < measurement.slots.length; j++) {
            const a = measurement.slots[i], b = measurement.slots[j];
            // Rounded slot borders may meet by less than half a CSS pixel after
            // percentage rounding. Visible label/coordinate content has no tolerance.
            const intersection = (first: typeof a.bounds, second: typeof b.bounds, tolerance: number) => Math.min(first.right, second.right) - Math.max(first.left, second.left) > tolerance && Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > tolerance;
            assert.equal(intersection(a.bounds, b.bounds, .5), false, `${label}: ${a.id} overlaps ${b.id}`);
            for (const first of a.textBounds) for (const second of b.textBounds) assert.equal(intersection(first, second, 0), false, `${label}: ${a.id}/${b.id} text collides`);
          }
          if (code === "4-3-3" || code === "5-4-1") {
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: join(evidence, `editor-${viewport.width}-${code}.png`), fullPage: true });
          }
        }
        if (mobile) {
          await page.setViewportSize({ width: viewport.height, height: viewport.width });
          await restoreTouch();
          await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
          await expect(page.locator("[data-touchline-orientation-gate]")).toBeVisible();
          await expect(formation).not.toBeVisible();
          await page.setViewportSize(viewport); await restoreTouch(); await expect(formation).toBeVisible();
        }
        // A real pointer drag changes only the editor's local draft; reset restores
        // exact code-default coordinates. Save/Preview are deliberately untouched.
        await formation.selectOption("4-3-3");
        const keeper = pitch.getByRole("button", { name: /^GK X / });
        await keeper.scrollIntoViewIfNeeded();
        const bounds = (await keeper.boundingBox())!;
        const before = await keeper.getAttribute("aria-label");
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 + 8, bounds.y + bounds.height / 2 + 8, { steps: 3 }); await page.mouse.up();
        await expect(keeper).not.toHaveAttribute("aria-label", before!);
        await page.getByRole("button", { name: "Restaurar publicada atual", exact: true }).click();
        await expect(keeper).toHaveAttribute("aria-label", before!);
        assert.deepEqual(errors, []); assert.deepEqual(writes, [], "no calibration/account requests may be written");
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
});
