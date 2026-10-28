import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync, statSync, statfsSync, mkdirSync, writeFileSync } from "node:fs";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webkit, chromium, expect } from "@playwright/test";
import sharp from "sharp";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";

const root = fileURLToPath(new URL("../", import.meta.url));
const origin = "https://crest-outline.invalid";

function readFilterDefinition(node: Element) {
  type Primitive = { tag: string; attributes: Record<string, string>; children: Primitive[] };
  const tree = (element: Element): Primitive => ({
    tag: element.localName, attributes: Object.fromEntries(Array.from(element.attributes, attribute => [attribute.name, attribute.value])),
    children: Array.from(element.children, tree),
  });
  return {
    markup: node.outerHTML, units: node.getAttribute("primitiveUnits"),
    interpolation: node.getAttribute("color-interpolation-filters"),
    offsets: Array.from(node.querySelectorAll("feOffset")).map(offset => ({
      input: offset.getAttribute("in"), dx: Number(offset.getAttribute("dx")), dy: Number(offset.getAttribute("dy")),
    })),
    alpha: node.querySelector("feFuncA")?.getAttribute("tableValues"),
    composite: node.querySelector("feComposite")?.getAttribute("operator"),
    compositeInput: node.querySelector("feComposite")?.getAttribute("in"),
    compositeMask: node.querySelector("feComposite")?.getAttribute("in2"),
    floodColor: node.querySelector("feFlood")?.getAttribute("flood-color"),
    floodOpacity: node.querySelector("feFlood")?.getAttribute("flood-opacity"),
    floodComputed: getComputedStyle(node.querySelector("feFlood")!).floodColor,
    floodComputedOpacity: getComputedStyle(node.querySelector("feFlood")!).floodOpacity,
    topology: Array.from(node.children, tree),
    rootAttributes: Object.fromEntries(Array.from(node.attributes).filter(attribute => attribute.name !== "id").map(attribute => [attribute.name, attribute.value])),
  };
}

// Exact semantic graph: rejects extra primitives (including blur), rewired inputs,
// altered alpha transfer, changed offsets, flood opacity/color and output ordering.
function assertFilterContract(definition: ReturnType<typeof readFilterDefinition>) {
  const primitive = (tag: string, attributes: Record<string, string>, children: unknown[] = []) => ({ tag, attributes, children });
  assert.deepEqual(definition.rootAttributes, { primitiveUnits: "objectBoundingBox", x: "-5%", y: "-5%", width: "110%", height: "110%", "color-interpolation-filters": "sRGB" });
  assert.deepEqual(definition.topology, [
    primitive("feComponentTransfer", { in: "SourceAlpha", result: "solidSilhouette" }, [primitive("feFuncA", { type: "discrete", tableValues: "0 1" })]),
    primitive("feOffset", { in: "solidSilhouette", dx: "0.006", dy: "0", result: "rightEdge" }),
    primitive("feOffset", { in: "solidSilhouette", dx: "-0.006", dy: "0", result: "leftEdge" }),
    primitive("feOffset", { in: "solidSilhouette", dx: "0", dy: "0.006", result: "bottomEdge" }),
    primitive("feOffset", { in: "solidSilhouette", dx: "0", dy: "-0.006", result: "topEdge" }),
    primitive("feMerge", { result: "outline" }, ["rightEdge", "leftEdge", "bottomEdge", "topEdge"].map(input => primitive("feMergeNode", { in: input }))),
    primitive("feFlood", { "flood-color": "#ffffff", "flood-opacity": "1", result: "white" }),
    primitive("feComposite", { in: "white", in2: "outline", operator: "in", result: "whiteOutline" }),
    primitive("feMerge", {}, [primitive("feMergeNode", { in: "whiteOutline" }), primitive("feMergeNode", { in: "SourceGraphic" })]),
  ]);
  assert.equal(definition.floodComputed, "rgb(255, 255, 255)");
  assert.equal(definition.floodComputedOpacity, "1");
}

function realFilterMarkup() {
  const layout = readFileSync(path.join(root, "app/layout.tsx"), "utf8");
  const fragment = layout.match(/<filter id="touchline-proportional-crest-outline"[\s\S]*?<\/filter>/)?.[0];
  assert.ok(fragment, "Actual root filter required");
  const source = ts.transpileModule(`export default function Filter(){return <svg><defs>${fragment}</defs></svg>;}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {} as { default: () => ReactElement };
  runInNewContext(source, { exports, require(name: string) {
    assert.equal(name, "react/jsx-runtime"); return jsx;
  } });
  return renderToStaticMarkup(exports.default());
}

test("root crest SVG fragment is serialized by React with actual SVG attribute names", () => {
  const markup = realFilterMarkup();
  assert.match(markup, /flood-color="#ffffff"/);
  assert.match(markup, /flood-opacity="1"/);
  assert.match(markup, /color-interpolation-filters="sRGB"/);
  assert.doesNotMatch(markup, /floodColor=|floodOpacity=|colorInterpolationFilters=/);
  assert.match(markup, /primitiveUnits="objectBoundingBox"/);
});

test("real card crests have visible solid white contour at small and enlarged scales", {
  skip: process.env.TOUCHLINE_RUN_CREST_OUTLINE_BROWSER !== "1", timeout: 90_000,
}, async t => {
  const allCases = ["tottenham-160", "tottenham-430", "forest-160", "forest-430"];
  const selectedCases = process.env.TOUCHLINE_CREST_OUTLINE_CASES === undefined
    ? allCases : process.env.TOUCHLINE_CREST_OUTLINE_CASES.split(",");
  assert.ok(selectedCases.length > 0 && selectedCases.every(value => allCases.includes(value)), "explicit valid crest cases required");
  assert.equal(new Set(selectedCases).size, selectedCases.length, "duplicate crest cases rejected");
  const capacity = () => {
    requireBrowserCapacity(root, { darwinFreePercent: true });
    const disk = statfsSync(root), freeBytes = disk.bavail * disk.bsize;
    return { freeBytes, policy: "shared-browser-capacity" };
  };
  const initialCapacity = capacity();
  const engineName = process.env.TOUCHLINE_CREST_OUTLINE_ENGINE ?? "webkit";
  assert.ok(["webkit", "chromium"].includes(engineName));
  const engine = engineName === "webkit" ? webkit : chromium;
  assert.ok(existsSync(engine.executablePath()), "Installed browser required; never download implicitly");
  const output = process.env.TOUCHLINE_CREST_OUTLINE_EVIDENCE_DIR;
  assert.ok(output && path.isAbsolute(output), "Explicit absolute evidence directory required");
  const bundle = bundleIsolatedBrowserFixture({ entryPath: "tests/fixtures/CrestOutlineBrowserFixture.tsx", cssPrefix: "crest",
    requiredSources: ["components/touchline/cards/TouchlineCoachCard.tsx", "components/touchline/cards/TouchlineEliteExactCard.tsx"],
    mountScript: "flushSync(()=>root.render(React.createElement(loadEntry().default)));" });
  const svg = realFilterMarkup().replace('<svg>', '<svg width="0" height="0" aria-hidden="true">');
  const globals = readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "");
  const css = readFileSync(path.join(root, "app/touchline-crest-visibility.css"), "utf8");
  const preflight = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8");
  const publicRoot = realpathSync(path.join(root, "public"));
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${preflight}\n${globals}\n${bundle.css}\n${css}</style></head><body>${svg}<div id="root"></div><script>${bundle.script.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
  capacity();
  const browser = await engine.launch({ headless: true, timeout: 15_000 });
  t.signal.addEventListener("abort", () => { void browser.close(); }, { once: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1100, height: 1600 }, deviceScaleFactor: 2,
      reducedMotion: "reduce", serviceWorkers: "block" });
    const denied: string[] = [], errors: string[] = [];
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (route.request().method() !== "GET" || url.origin !== origin) { denied.push(route.request().url()); await route.abort(); return; }
      if (url.pathname === "/fixture") { await route.fulfill({ contentType: "text/html; charset=utf-8", body: html }); return; }
      const candidate = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
      if (candidate.startsWith(publicRoot + path.sep) && existsSync(candidate) && statSync(candidate).isFile()
        && realpathSync(candidate).startsWith(publicRoot + path.sep)) { await route.fulfill({ path: candidate }); return; }
      denied.push(route.request().url()); await route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${origin}/fixture`);
    assert.equal(await page.evaluate(() => document.characterSet), "UTF-8", "fixture HTML and inline bundle must decode as UTF-8");
    await expect(page.getByText("ISOLATED SYNTHETIC FIXTURE — NOT QA ACCEPTANCE", { exact: true })).toBeVisible();
    const evidence: unknown[] = [];
    mkdirSync(output, { recursive: true });
    for (const club of ["tottenham", "forest"]) for (const size of [160, 430]) {
      if (!selectedCases.includes(`${club}-${size}`)) continue;
      capacity();
      const card = page.locator(`[data-case="${club}-${size}"]`);
      const crest = card.locator('img[data-touchline-card-crest="true"]').first();
      await crest.waitFor({ state: "visible" });
      await page.waitForFunction(() => [...document.images].every(i => i.complete));
      assert.ok(await crest.evaluate(i => (i as HTMLImageElement).naturalWidth > 0));
      const bounds = await crest.boundingBox(); assert.ok(bounds && bounds.width > 0);
      const presentation = club === "tottenham" ? await card.locator("[data-coach-card-display]").getAttribute("data-coach-card-display") : "player";
      const shellBounds = await card.boundingBox();
      if (club === "tottenham") {
        assert.equal(presentation, size === 160 ? "compact" : "default");
        if (size === 160) assert.ok(bounds.width >= 9 && bounds.width <= 28.1, "real compact crest clamp");
        else assert.ok(bounds.width > 28.1, "default crest differs from compact presentation");
      }
      const clip = { x: Math.max(0, bounds.x - 4), y: Math.max(0, bounds.y - 4), width: bounds.width + 8, height: bounds.height + 8 };
      const filterNode = page.locator("#touchline-proportional-crest-outline");
      const flood = filterNode.locator("feFlood");
      await expect(flood).toHaveCount(1);
      const definition = await filterNode.evaluate(readFilterDefinition);
      assertFilterContract(definition);
      // Real DOM negative definitions exercise the SAME contract without changing
      // the source filter referenced by the product image. These are structural
      // controls, not claims of pixel-level sharpness detection.
      const negativeContracts: Record<string, { rejected: boolean; definition: ReturnType<typeof readFilterDefinition> }> = {};
      const negativeId = "touchline-outline-negative-contract";
      try {
        for (const mutation of ["red", "opacity", "zero-offset", "blur", "rewired", "alpha"] as const) {
          await filterNode.evaluate((node, { id, mutation }) => {
            document.getElementById(id)?.remove();
            const clone = node.cloneNode(true) as SVGElement;
            clone.id = id;
            if (mutation === "red") clone.querySelector("feFlood")!.setAttribute("flood-color", "#ff0000");
            if (mutation === "opacity") clone.querySelector("feFlood")!.setAttribute("flood-opacity", "0.5");
            if (mutation === "zero-offset") for (const offset of clone.querySelectorAll("feOffset")) { offset.setAttribute("dx", "0"); offset.setAttribute("dy", "0"); }
            if (mutation === "blur") { const blur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur"); blur.setAttribute("stdDeviation", "0.025"); clone.append(blur); }
            if (mutation === "rewired") clone.querySelector("feComposite")!.setAttribute("in2", "SourceAlpha");
            if (mutation === "alpha") clone.querySelector("feFuncA")!.setAttribute("type", "identity");
            node.after(clone);
          }, { id: negativeId, mutation });
          const negative = await page.locator(`#${negativeId}`).evaluate(readFilterDefinition);
          assert.throws(() => assertFilterContract(negative), { name: "AssertionError" }, `${mutation} must fail the exact source contract`);
          negativeContracts[mutation] = { rejected: true, definition: negative };
        }
      } finally { await page.locator(`#${negativeId}`).evaluateAll(nodes => nodes.forEach(node => node.remove())); }
      assert.equal(await filterNode.evaluate(node => node.outerHTML), definition.markup, "negative controls must preserve the source filter");
      const dpr = await page.evaluate(() => devicePixelRatio);
      assert.equal(dpr, 2);
      const deviceOffset = { x: .006 * bounds.width * dpr, y: .006 * bounds.height * dpr };
      const filtered = await crest.evaluate(i => getComputedStyle(i).filter);
      assert.ok(filtered.includes("touchline-proportional-crest-outline"), "real outline filter must be active");
      const prior = await crest.evaluate(i => ({ value: (i as HTMLElement).style.getPropertyValue("filter"), priority: (i as HTMLElement).style.getPropertyPriority("filter") }));
      // A repeated, unmodified ON capture measures temporal noise first. Do not
      // automatically relax color/visibility thresholds to accommodate motion.
      const before = await page.screenshot({ clip, animations: "disabled" });
      const repeated = await page.screenshot({ clip, animations: "disabled" });
      let black: Buffer | undefined, without: Buffer | undefined;
      try {
        // White-versus-black changes ONLY flood RGB. Alpha, offsets, SourceGraphic,
        // placement and backdrop remain identical: this isolates the white outline.
        await flood.evaluate(node => node.setAttribute("flood-color", "#000000"));
        await expect(flood).toHaveCSS("flood-color", "rgb(0, 0, 0)");
        assert.equal(await crest.evaluate(i => getComputedStyle(i).filter), filtered);
        black = await page.screenshot({ clip, animations: "disabled" });
        await flood.evaluate((node, color) => node.setAttribute("flood-color", color!), definition.floodColor);
        await expect(flood).toHaveCSS("flood-color", "rgb(255, 255, 255)");
        await crest.evaluate(i => (i as HTMLElement).style.setProperty("filter", "none", "important"));
        await expect(crest).toHaveCSS("filter", "none");
        without = await page.screenshot({ clip, animations: "disabled" });
      } finally {
        await flood.evaluate((node, color) => {
          if (color === null || color === undefined) node.removeAttribute("flood-color");
          else node.setAttribute("flood-color", color);
        }, definition.floodColor);
        await crest.evaluate((i, saved) => {
          const style = (i as HTMLElement).style;
          if (saved.value) style.setProperty("filter", saved.value, saved.priority);
          else style.removeProperty("filter");
        }, prior);
      }
      assert.ok(black && without);
      await expect(crest).toHaveCSS("filter", filtered);
      assert.equal(await filterNode.evaluate(node => node.outerHTML), definition.markup, "restore exact SVG definition after causal controls");
      const restoredBounds = await crest.boundingBox(); assert.ok(restoredBounds);
      for (const key of ["x", "y", "width", "height"] as const) assert.ok(Math.abs(restoredBounds[key] - bounds[key]) < .001, "controls must not alter geometry");
      const frames = await Promise.all([before, repeated, black, without].map(buffer => sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true })));
      const [a, repeat, dark, off] = frames;
      for (const frame of frames) {
        assert.equal(frame.info.width, a.info.width); assert.equal(frame.info.height, a.info.height); assert.equal(frame.info.channels, 3);
      }
      assert.ok(Math.abs(a.info.width - clip.width * dpr) <= 2 && Math.abs(a.info.height - clip.height * dpr) <= 2,
        "PNG dimensions must agree with actual CSS crop and DPR, allowing only crop pixel rounding");
      // Ideal sRGB source-over gives equal positive white-minus-black RGB.
      // Keep spread<=2 ONLY as a conservative selector of positive evidence.
      // A universal <=2 bound was not validated for the complete raster/filter/
      // transformed-compositing pipeline: independent SVG/PNG controls do not
      // explain the six spread3 Forest samples. Do not raise the threshold or
      // attribute those samples to an art defect/quantization cause. Record them.
      // Color, opacity, exact topology, offsets and no-blur are enforced above,
      // including rejected negative contracts. Pixel evidence still requires
      // stable ON/ON, real ON/OFF>=20, neutral positive overlap and crop isolation.
      // Absolute white>210 stays diagnostic: subpixel coverage need not be opaque.
      const quantization = 2;
      let noiseMax = 0, noisePixels = 0, noiseAlphaEquivalent = 0;
      let whiteGain = 0, visibleFilterChanges = 0, farEdgeChanges = 0;
      let causalPixels = 0, causalOnOffPixels = 0, causalFarEdgeChanges = 0, nonNeutralChanges = 0, alphaEquivalentArea = 0;
      const causalMask = new Uint8Array(a.info.width * a.info.height);
      for (let p = 0; p < causalMask.length; p++) {
        const k = p * 3;
        const noise = [0, 1, 2].map(c => Math.abs(a.data[k + c] - repeat.data[k + c]));
        noiseMax = Math.max(noiseMax, ...noise); if (Math.max(...noise) > 0) noisePixels++;
        noiseAlphaEquivalent += (noise[0] + noise[1] + noise[2]) / (3 * 255);
        const diff = Math.max(...[0, 1, 2].map(c => Math.abs(a.data[k + c] - off.data[k + c])));
        const x = p % a.info.width, y = Math.floor(p / a.info.width);
        const farEdge = x < 2 || y < 2 || x >= a.info.width - 2 || y >= a.info.height - 2;
        if (diff >= 20) {
          visibleFilterChanges++;
          if (Math.min(a.data[k], a.data[k + 1], a.data[k + 2]) > 210) whiteGain++;
          if (farEdge) farEdgeChanges++;
        }
        const delta = [0, 1, 2].map(c => a.data[k + c] - dark.data[k + c]);
        const min = Math.min(...delta), max = Math.max(...delta);
        if (Math.max(...delta.map(Math.abs)) <= quantization) continue;
        if (min < -quantization || max - min > quantization) { nonNeutralChanges++; continue; }
        if (min <= quantization) continue; // Ambiguous quantization-floor coverage is not positive evidence.
        causalMask[p] = 1; causalPixels++;
        alphaEquivalentArea += (delta[0] + delta[1] + delta[2]) / (3 * 255);
        if (diff >= 20) causalOnOffPixels++;
        if (farEdge) causalFarEdgeChanges++;
      }
      // Record spatial support rather than inventing a minimum component size:
      // a thin antialiased crest can legitimately have disconnected edge samples.
      let largestCausalComponent = 0, causalComponents = 0;
      const seen = new Uint8Array(causalMask.length);
      for (let p = 0; p < causalMask.length; p++) {
        if (!causalMask[p] || seen[p]) continue;
        const queue = [p]; seen[p] = 1; causalComponents++;
        for (let head = 0; head < queue.length; head++) {
          const at = queue[head], x = at % a.info.width, y = Math.floor(at / a.info.width);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= a.info.width || ny >= a.info.height) continue;
            const next = ny * a.info.width + nx;
            if (causalMask[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
          }
        }
        largestCausalComponent = Math.max(largestCausalComponent, queue.length);
      }
      writeFileSync(path.join(output, `${engineName}-${club}-${size}-outline.png`), before);
      writeFileSync(path.join(output, `${engineName}-${club}-${size}-outline-repeat.png`), repeated);
      writeFileSync(path.join(output, `${engineName}-${club}-${size}-black-control.png`), black);
      writeFileSync(path.join(output, `${engineName}-${club}-${size}-control.png`), without);
      evidence.push({ club, size, presentation, shellBounds, bounds, restoredBounds, dpr, deviceOffset, filtered,
        controlFilter: "none", definition, negativeContracts, quantization, noiseMax, noisePixels, noiseAlphaEquivalent,
        whiteGain, visibleFilterChanges, farEdgeChanges, causalPixels, causalOnOffPixels, causalFarEdgeChanges,
        nonNeutralChanges, alphaEquivalentArea, causalComponents, largestCausalComponent });
      writeFileSync(path.join(output, `${engineName}-evidence.json`), JSON.stringify({ selectedCases, evidence, denied, errors, sources: bundle.sources, initialCapacity, status: "in-progress" }, null, 2));
      assert.equal(noiseMax, 0, `${club}/${size}: identical ON captures moved; inspect noise before changing any tolerance`);
      assert.ok(visibleFilterChanges > 0, `${club}/${size}: real ON/OFF control has no visible effect at the retained 20-level threshold`);
      assert.ok(causalPixels > 0 && causalOnOffPixels > 0 && alphaEquivalentArea > noiseAlphaEquivalent,
        `${club}/${size}: no causal white contribution above quantization on the real ON/OFF effect`);
      assert.equal(farEdgeChanges, 0, `${club}/${size}: effect reaches crop border`);
      assert.equal(causalFarEdgeChanges, 0, `${club}/${size}: causal white silhouette reaches crop border`);
    }
    await page.screenshot({ path: path.join(output, `${engineName}-cards.png`), fullPage: true, animations: "disabled" });
    writeFileSync(path.join(output, `${engineName}-evidence.json`), JSON.stringify({ selectedCases, evidence, denied, errors, sources: bundle.sources, initialCapacity, finalCapacity: capacity() }, null, 2));
    assert.deepEqual(errors, []); assert.deepEqual(denied, []);
  } finally { await browser.close(); }
});
