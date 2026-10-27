import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { chromium, webkit, expect } from "@playwright/test";
import sharp from "sharp";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";

const root = path.resolve(import.meta.dirname, "..");
const origin = "https://crest-calibration.invalid";
const filterId = "touchline-proportional-crest-outline";
const diagnosticId = "touchline-diagnostic-crest-outline";
// Independent vector reference: transparent outside, opaque rectangle/circle,
// diagonal and thin bars. No product pixels are copied or resampled into it.
const referenceSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><path fill="#e00000" d="M96 80h128v160H96z"/><circle fill="#888888" cx="344" cy="156" r="76"/><path fill="#ffffff" d="M88 352l108-96 76 120-112 72zM304 272h8v176h-8zM328 272h16v176h-16zM368 272h32v176h-32z"/></svg>';

// Independently authored raster reference, not a conversion/copy of the crest.
// Pixel-centre signed distances produce deterministic one-source-pixel AA; an
// explicit alpha ladder supplies all 256 levels, including partially red pixels.
async function pngReference() {
  const width = 512, height = 512, pixels = Buffer.alloc(width * height * 4);
  const colors = [[224, 0, 0], [136, 136, 136], [255, 255, 255]] as const;
  const rectangle = (x: number, y: number, left: number, top: number, right: number, bottom: number) => Math.min(x - left, right - x, y - top, bottom - y);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const px = x + .5, py = y + .5, dx = px - 180, dy = py - 352;
    const distances = [rectangle(px, py, 96.25, 80.25, 224.75, 240.75), 76 - Math.hypot(px - 344, py - 156),
      Math.min(85 - Math.abs((dx + dy) / Math.SQRT2), 40 - Math.abs((-dx + dy) / Math.SQRT2)),
      rectangle(px, py, 304, 272, 312, 448), rectangle(px, py, 328, 272, 344, 448), rectangle(px, py, 368, 272, 400, 448)];
    const distance = Math.max(...distances), alpha = Math.round(255 * Math.max(0, Math.min(1, .5 + distance)));
    if (alpha === 0) continue;
    const shape = distances.indexOf(distance), color = colors[shape < 2 ? shape : 2], at = (y * width + x) * 4;
    pixels[at] = color[0]; pixels[at + 1] = color[1]; pixels[at + 2] = color[2]; pixels[at + 3] = alpha;
  }
  for (let alpha = 0; alpha < 256; alpha++) for (let y = 464; y < 472; y++) {
    const at = (y * width + 128 + alpha) * 4;
    pixels[at] = 224; pixels[at + 1] = 0; pixels[at + 2] = 0; pixels[at + 3] = alpha;
  }
  const png = await sharp(pixels, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9, palette: false }).toBuffer();
  const decoded = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.width, width); assert.equal(decoded.info.height, height); assert.equal(decoded.info.channels, 4);
  assert.deepEqual(decoded.data, pixels, "reference encoding must be lossless RGBA");
  const alphaCounts = Array.from({ length: 256 }, () => 0);
  for (let at = 3; at < pixels.length; at += 4) alphaCounts[pixels[at]]++;
  assert.ok(alphaCounts.every(count => count > 0), "known reference contains every alpha level");
  return { png, dataUrl: `data:image/png;base64,${png.toString("base64")}`, metadata: { kind: "png", width, height,
    channels: 4, depth: 8, sha256: createHash("sha256").update(png).digest("hex"), bytes: png.length,
    alphaCounts, colors, algorithm: "pixel-centre signed-distance AA plus explicit256-level red-alpha ladder; no product pixels" } };
}

if (process.argv[2] === "--compile-fixture") {
  const output = realpathSync(process.argv[3]);
  assert.equal(path.dirname(output), "/private/tmp"); assert.match(path.basename(output), /^touchline-crest-calibration-[A-Za-z0-9]+$/);
  const { bundleIsolatedBrowserFixture } = await import("./helpers/touchline-isolated-browser-bundle.mts");
  const ts = (await import("typescript")).default;
  const { runInNewContext } = await import("node:vm");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const jsx = await import("react/jsx-runtime");
  const fragment = readFileSync(path.join(root, "app/layout.tsx"), "utf8").match(/<filter id="touchline-proportional-crest-outline"[\s\S]*?<\/filter>/)?.[0];
  assert.ok(fragment);
  const compiled = ts.transpileModule(`exports.render=()=> <svg width="0" height="0" aria-hidden="true"><defs>${fragment}</defs></svg>`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {} as { render: () => import("react").ReactElement };
  runInNewContext(compiled, { exports, require(name: string) { assert.equal(name, "react/jsx-runtime"); return jsx; } });
  const bundle = bundleIsolatedBrowserFixture({ entryPath: "tests/fixtures/CrestOutlineCalibrationBrowserFixture.tsx", cssPrefix: "calibration",
    requiredSources: ["components/touchline/cards/TouchlineEliteExactCard.tsx"],
    mountScript: "flushSync(()=>root.render(React.createElement(loadEntry().default)));" });
  const globals = readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "");
  const css = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8") + globals + bundle.css
    + readFileSync(path.join(root, "app/touchline-crest-visibility.css"), "utf8");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${renderToStaticMarkup(exports.render())}<div id="root"></div><script>${bundle.script.replaceAll("</script", "<\\/script")}</script></body></html>`;
  const sources = [...new Set([...bundle.sources, "app/layout.tsx", "app/globals.css", "app/touchline-crest-visibility.css"])].sort();
  writeFileSync(path.join(output, "fixture.html"), html, { flag: "wx" });
  writeFileSync(path.join(output, "sources.json"), JSON.stringify(Object.fromEntries(sources.map(source => [source,
    createHash("sha256").update(readFileSync(path.join(root, source))).digest("hex")]))), { flag: "wx" });
} else test("independent subpixel crest calibration records neutral ramp and negative controls without approving T12", {
  skip: process.env.TOUCHLINE_RUN_CREST_CALIBRATION_BROWSER !== "1", timeout: 120_000,
}, async t => {
  const referenceKind = process.env.TOUCHLINE_CREST_CALIBRATION_REFERENCE ?? "svg";
  assert.ok(["svg", "png"].includes(referenceKind), "explicit reference kind must be svg or png");
  const engineName = process.env.TOUCHLINE_CREST_CALIBRATION_ENGINE ?? "webkit";
  assert.ok(["webkit", "chromium"].includes(engineName));
  const engine = engineName === "webkit" ? webkit : chromium;
  const capacity = () => requireBrowserCapacity(root, { darwinFreePercent: true });
  capacity();
  const output = mkdtempSync("/private/tmp/touchline-crest-calibration-");
  const raster = referenceKind === "png" ? await pngReference() : null;
  const referenceDataUrl = raster?.dataUrl ?? `data:image/svg+xml,${encodeURIComponent(referenceSvg)}`;
  const referenceMetadata = raster?.metadata ?? { kind: "svg", width: 512, height: 512, source: referenceSvg };
  if (raster) writeFileSync(path.join(output, "synthetic-reference.png"), raster.png);
  writeFileSync(path.join(output, "reference.json"), JSON.stringify(referenceMetadata, null, 2));
  t.diagnostic(`Diagnostic evidence only: ${output}; reference ${referenceKind}; one Forest160 renderer at DPR2; no T12 acceptance or sharpness approval.`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", import.meta.filename, "--compile-fixture", output], { cwd: root, stdio: "ignore" });
    let failure: Error | undefined;
    const abort = () => { failure = new Error("Calibration compile aborted"); child.kill("SIGKILL"); };
    const timer = setTimeout(() => { failure = new Error("Calibration compile exceeded 30s"); child.kill("SIGKILL"); }, 30_000);
    t.signal.addEventListener("abort", abort, { once: true });
    child.once("error", error => { failure = error; });
    child.once("close", code => { clearTimeout(timer); t.signal.removeEventListener("abort", abort); if (failure) reject(failure); else if (code !== 0) reject(new Error(`Compiler exit ${code}`)); else resolve(); });
    if (t.signal.aborted) abort();
  });
  t.signal.throwIfAborted(); capacity();
  const html = readFileSync(path.join(output, "fixture.html"), "utf8");
  const publicRoot = realpathSync(path.join(root, "public"));
  assert.ok(existsSync(engine.executablePath()));
  const browser = await engine.launch({ headless: true, timeout: 15_000 });
  const abort = () => { void browser.close(); }; t.signal.addEventListener("abort", abort, { once: true });
  const errors: string[] = [], denied: string[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 600, height: 450 }, deviceScaleFactor: 2, reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await context.newPage(); page.setDefaultTimeout(5000);
    page.on("pageerror", error => errors.push(error.message));
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || route.request().method() !== "GET") { denied.push(route.request().url()); await route.abort(); return; }
      if (url.pathname === "/fixture") { await route.fulfill({ contentType: "text/html", body: html }); return; }
      const file = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
      if (file.startsWith(publicRoot + path.sep) && existsSync(file) && statSync(file).isFile() && realpathSync(file).startsWith(publicRoot + path.sep)) { await route.fulfill({ path: file }); return; }
      denied.push(url.pathname); await route.abort();
    });
    await page.goto(`${origin}/fixture`); await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
    await page.evaluate(() => document.fonts.ready);
    const crest = page.locator('[data-calibration-card] img[data-touchline-card-crest="true"]');
    await expect(crest).toHaveCount(1); await expect(crest).toBeVisible();
    const fingerprint = () => crest.evaluate(image => {
      const chain = []; let node: Element | null = image;
      while (node) { const s = getComputedStyle(node), r = node.getBoundingClientRect(); chain.push({ tag: node.tagName,
        box: [r.x, r.y, r.width, r.height], transform: s.transform, zoom: s.zoom, opacity: s.opacity,
        filter: node === image ? "target-filter-verified-separately" : s.filter, isolation: s.isolation,
        blend: s.mixBlendMode, overflow: s.overflow, objectFit: s.objectFit, imageRendering: s.imageRendering }); node = node.parentElement; }
      return chain;
    });
    assert.ok((await crest.evaluate(image => getComputedStyle(image).filter)).includes(filterId), "actual source filter must be active before calibration");
    const originalFingerprint = await fingerprint();
    const bounds = await crest.boundingBox(); assert.ok(bounds);
    assert.ok(Math.abs(bounds.width - 30) < .1 && Math.abs(bounds.height - 30) < .1, "same Forest160 geometry as T12");
    const clip = { x: bounds.x - 4, y: bounds.y - 4, width: bounds.width + 8, height: bounds.height + 8 };
    const original = await page.screenshot({ clip, animations: "disabled" });
    writeFileSync(path.join(output, `${engineName}-original.png`), original);
    const actualFilter = await page.locator(`#${filterId}`).evaluate(node => node.outerHTML);
    const screenshots = new Map<string, Buffer>();
    const contracts: Record<string, unknown> = {};
    let installed = false;
    try {
      await page.evaluate(({ referenceDataUrl, filterId, diagnosticId }) => {
        const original = document.querySelector('[data-calibration-card]')!;
        const clone = original.cloneNode(true) as HTMLElement;
        const filter = document.getElementById(filterId)!.cloneNode(true) as Element; filter.id = diagnosticId;
        document.getElementById(filterId)!.parentElement!.append(filter);
        const image = clone.querySelector('img[data-touchline-card-crest="true"]') as HTMLImageElement;
        image.src = referenceDataUrl; image.removeAttribute("srcset");
        image.style.setProperty("filter", `url("#${diagnosticId}")`, "important");
        (window as unknown as { crestCalibration: unknown }).crestCalibration = { original, clone, filter };
        original.replaceWith(clone);
      }, { referenceDataUrl, filterId, diagnosticId });
      installed = true;
      await crest.evaluate(image => (image as HTMLImageElement).decode());
      assert.deepEqual(await fingerprint(), originalFingerprint, "reference must preserve the complete transform/compositing chain and geometry");
      const diagnosticFilter = page.locator(`#${diagnosticId}`);
      const pristine = await diagnosticFilter.evaluate(node => node.innerHTML);
      const capture = async (name: string, gray: number, control: "neutral" | "red" | "zero-offset" | "blur" | "off" = "neutral") => {
        capacity();
        await diagnosticFilter.evaluate((node, { pristine, gray, control }) => {
          node.innerHTML = pristine;
          node.querySelector("feFlood")!.setAttribute("flood-color", control === "red" ? "#ff0000" : `rgb(${gray}, ${gray}, ${gray})`);
          if (control === "zero-offset") for (const offset of node.querySelectorAll("feOffset")) { offset.setAttribute("dx", "0"); offset.setAttribute("dy", "0"); }
          if (control === "blur") { const blur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur"); blur.setAttribute("stdDeviation", "0.025"); node.append(blur); }
        }, { pristine, gray, control });
        await crest.evaluate((image, { control, diagnosticId }) => (image as HTMLElement).style.setProperty("filter", control === "off" ? "none" : `url("#${diagnosticId}")`, "important"), { control, diagnosticId });
        const contract = await diagnosticFilter.evaluate(node => ({ units: node.getAttribute("primitiveUnits"), interpolation: node.getAttribute("color-interpolation-filters"),
          flood: getComputedStyle(node.querySelector("feFlood")!).floodColor, opacity: node.querySelector("feFlood")!.getAttribute("flood-opacity"),
          offsets: [...node.querySelectorAll("feOffset")].map(n => [Number(n.getAttribute("dx")), Number(n.getAttribute("dy"))]),
          blurCount: node.querySelectorAll("feGaussianBlur").length }));
        contracts[name] = contract;
        writeFileSync(path.join(output, `${engineName}-capture-contracts.json`), JSON.stringify({ status: "diagnostic-in-progress", originalFingerprint, bounds, contracts }, null, 2));
        const png = await page.screenshot({ clip, animations: "disabled" }); screenshots.set(name, png);
        writeFileSync(path.join(output, `${engineName}-${name}.png`), png);
        return contract;
      };
      for (const gray of [0, 85, 170, 255]) await capture(`gray-${gray}`, gray);
      await capture("gray-255-repeat", 255); await capture("off", 255, "off");
      const strictContract = (value: Awaited<ReturnType<typeof capture>>) => value.units === "objectBoundingBox" && value.interpolation === "sRGB"
        && value.flood === "rgb(255, 255, 255)" && value.opacity === "1" && value.blurCount === 0
        && JSON.stringify(value.offsets) === JSON.stringify([[.006, 0], [-.006, 0], [0, .006], [0, -.006]]);
      assert.ok(strictContract(contracts["gray-255"] as Awaited<ReturnType<typeof capture>>));
      for (const control of ["red", "zero-offset", "blur"] as const) assert.equal(strictContract(await capture(control, 255, control)), false, `negative ${control} must fail the unchanged white/no-blur/offset contract`);
    } finally {
      if (installed) await page.evaluate(() => {
        const state = (window as unknown as { crestCalibration: { original: Element; clone: Element; filter: Element } }).crestCalibration;
        state.clone.replaceWith(state.original); state.filter.remove();
        delete (window as unknown as { crestCalibration?: unknown }).crestCalibration;
      });
    }
    assert.equal(await page.locator(`#${filterId}`).evaluate(node => node.outerHTML), actualFilter);
    assert.deepEqual(await fingerprint(), originalFingerprint);
    const restored = await page.screenshot({ clip, animations: "disabled" });
    writeFileSync(path.join(output, `${engineName}-restored.png`), restored);
    const decode = (png: Buffer) => sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const first = await decode(original), last = await decode(restored);
    assert.deepEqual(last.data, first.data, "original product pixels must be restored exactly");
    const frames = new Map<string, Awaited<ReturnType<typeof decode>>>();
    for (const [name, png] of screenshots) frames.set(name, await decode(png));
    const white = frames.get("gray-255")!, black = frames.get("gray-0")!, repeat = frames.get("gray-255-repeat")!, off = frames.get("off")!;
    for (const frame of frames.values()) assert.deepEqual(frame.info, white.info);
    let repeatNoise = 0, negativePixels = 0, monotonicityViolations = 0, maxLinearityResidual = 0, onOffVisiblePixels = 0, farEdgeChanges = 0;
    const spreadHistogram: Record<number, number> = {}, residualHistogram: Record<number, number> = {};
    const negativeDifferences: Record<string, number> = { red: 0, "zero-offset": 0, blur: 0 };
    for (let k = 0; k < white.data.length; k += 3) {
      const delta = [0, 1, 2].map(c => white.data[k + c] - black.data[k + c]);
      const pixel = k / 3, x = pixel % white.info.width, y = Math.floor(pixel / white.info.width);
      if ((x < 2 || y < 2 || x >= white.info.width - 2 || y >= white.info.height - 2) && Math.max(...delta.map(Math.abs)) > 2) farEdgeChanges++;
      const spread = Math.max(...delta) - Math.min(...delta); spreadHistogram[spread] = (spreadHistogram[spread] ?? 0) + 1;
      if (Math.min(...delta) < 0) negativePixels++;
      if (Math.max(...[0, 1, 2].map(c => Math.abs(white.data[k + c] - off.data[k + c]))) >= 20) onOffVisiblePixels++;
      for (const name of Object.keys(negativeDifferences)) if (Math.max(...[0, 1, 2].map(c => Math.abs(white.data[k + c] - frames.get(name)!.data[k + c]))) >= 20) negativeDifferences[name]++;
      for (const c of [0, 1, 2]) {
        repeatNoise = Math.max(repeatNoise, Math.abs(white.data[k + c] - repeat.data[k + c]));
        const samples = [0, 85, 170, 255].map(gray => frames.get(`gray-${gray}`)!.data[k + c]);
        if (samples.some((value, i) => i > 0 && value < samples[i - 1])) monotonicityViolations++;
        for (const step of [1, 2]) { const residual = Math.abs(samples[step] - (samples[0] + (samples[3] - samples[0]) * step / 3));
          maxLinearityResidual = Math.max(maxLinearityResidual, residual); const bin = Math.ceil(residual); residualHistogram[bin] = (residualHistogram[bin] ?? 0) + 1; }
      }
    }
    writeFileSync(path.join(output, `${engineName}-diagnostic.json`), JSON.stringify({ status: "diagnostic-only-not-T12-acceptance", engineName, referenceMetadata,
      bounds, dpr: 2, deviceOffset: .006 * bounds.width * 2, originalFingerprint, contracts, repeatNoise, negativePixels,
      monotonicityViolations, maxLinearityResidual, spreadHistogram, residualHistogram, onOffVisiblePixels, farEdgeChanges, negativeDifferences, errors, denied,
      note: "No quantization threshold is learned or changed. Negative controls are contract-rejected; pixel sensitivity counts require review. No proof of all-card sharpness or WebKit internals." }, null, 2));
    assert.equal(repeatNoise, 0, "unstable captures cannot calibrate quantization");
    assert.equal(farEdgeChanges, 0, "reference contribution must not reach the crop boundary");
    assert.ok(onOffVisiblePixels > 0, "reference must exercise the unchanged 20-level visible-effect threshold");
    assert.deepEqual(errors, []); assert.deepEqual(denied, []);
    t.diagnostic(`Calibration recorded, T12 remains independently gated: ${output}`);
  } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
});
