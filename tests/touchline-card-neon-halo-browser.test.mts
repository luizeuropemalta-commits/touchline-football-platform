import { CARD_ART_PERIMETER_PATHS, resolvePlayerCardArtPerimeterPath } from "../lib/touchlineArena/card-art-perimeter-paths.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { chromium, webkit, expect, type Locator } from "@playwright/test";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";

const root = path.resolve(import.meta.dirname, "..");
const enabled = process.env.TOUCHLINE_RUN_CARD_NEON_HALO_BROWSER_TESTS === "1";
const engineName = process.env.TOUCHLINE_CARD_NEON_HALO_BROWSER_ENGINE ?? "webkit";
assert.ok(["webkit", "chromium"].includes(engineName), "unknown halo browser shard");
const traceSelector = '[data-touchline-card-neon-trace="true"]';
const runSelector = '[data-touchline-card-neon-trace-run="true"]';
const haloSelector = '[data-touchline-card-neon-trace-halo]';

async function traceState(trace: Locator) {
  return trace.evaluate(node => {
    const runner = node.querySelector('[data-touchline-card-neon-trace-run="true"]')!;
    const core = node.querySelector('[data-touchline-card-neon-trace-run-core="true"]') ?? runner;
    const base = node.querySelector('[data-touchline-card-neon-trace-base="true"]')!;
    return {
      filter: getComputedStyle(node).filter, opacity: getComputedStyle(node).opacity,
      interactionActive: node.closest('.touchline-card-surface')?.matches(':hover, :focus-within, [data-neon-active="true"]') ?? false,
      baseWidth: Number(getComputedStyle(base).strokeWidth.replace('px', '')),
      coreWidth: Number(getComputedStyle(core).strokeWidth.replace('px', '')),
      groupOpacity: getComputedStyle(runner).opacity, coreOpacity: getComputedStyle(core).opacity,
      dash: getComputedStyle(runner).strokeDasharray, duration: getComputedStyle(runner).animationDuration,
      color: getComputedStyle(node).color, coreStroke: getComputedStyle(core).stroke,
      basePath: base.getAttribute("d"), corePath: core.getAttribute("d"),
      halos: [...node.querySelectorAll('[data-touchline-card-neon-trace-halo]')].map(halo => ({
        role: halo.getAttribute("data-touchline-card-neon-trace-halo"), path: halo.getAttribute("d"),
        display: getComputedStyle(halo).display, opacity: getComputedStyle(halo).opacity,
        stroke: getComputedStyle(halo).stroke, width: Number(getComputedStyle(halo).strokeWidth.replace("px", "")),
        filter: getComputedStyle(halo).filter, dash: getComputedStyle(halo).strokeDasharray,
      })),
      animations: node.getAnimations({ subtree: true }).map(animation => ({
        name: (animation as CSSAnimation).animationName, state: animation.playState, pending: animation.pending,
      })),
    };
  });
}

async function freezeTrace(trace: Locator) {
  await trace.evaluate(node => {
    for (const animation of node.getAnimations({ subtree: true })) {
      animation.pause(); animation.currentTime = 650;
    }
  });
  await expect.poll(() => trace.evaluate(node => node.getAnimations({ subtree: true }).every(animation => animation.playState === "paused" && !animation.pending && animation.currentTime === 650))).toBe(true);
}


function withoutPaths(state: Awaited<ReturnType<typeof traceState>>) {
  return { ...state, basePath: null, corePath: null, halos: state.halos.map(halo => ({ ...halo, path: null })) };
}

// This function is serialized into the page. No synthetic card geometry:
// record real shell, img object-fit area, SVG CTM and sampled lower point.
function measureCardArtwork(nodes: Element[]) {
  const box = (element: Element) => { const r = element.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,bottom:r.bottom }; };
  return nodes.map(shell => {
    const image = shell.querySelector<HTMLImageElement>('img[data-touchline-card-frame="true"]');
    const svg = shell.querySelector<SVGSVGElement>('[data-touchline-card-neon-trace="true"]');
    const path = svg?.querySelector<SVGPathElement>('[data-touchline-card-neon-trace-base="true"]');
    const imageBox = image ? box(image) : null, style = image ? getComputedStyle(image) : null;
    let painted = imageBox;
    if (image && imageBox && style?.objectFit === 'contain') {
      const scale = Math.min(imageBox.width / image.naturalWidth, imageBox.height / image.naturalHeight);
      const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
      painted={x:imageBox.x+(imageBox.width-width)/2,y:imageBox.y+(imageBox.height-height)/2,width,height,
        top:imageBox.y+(imageBox.height-height)/2,bottom:imageBox.y+(imageBox.height+height)/2};
    }
    const ctm = path?.getScreenCTM();
    const local = path?.getBBox();
    const map = (x:number,y:number) => ctm ? {x:ctm.a*x+ctm.c*y+ctm.e,y:ctm.b*x+ctm.d*y+ctm.f} : null;
    let sampledLowerPoint: {x:number;y:number}|null=null;
    if (path && ctm) for(let index=0,length=path.getTotalLength();index<=512;index++) {
      const p=path.getPointAtLength(length*index/512),mapped=map(p.x,p.y)!;
      if(!sampledLowerPoint||mapped.y>sampledLowerPoint.y) sampledLowerPoint=mapped;
    }
    return { shell:box(shell), motion:shell.getAttribute('data-card-motion'),
      frame:image&&style?{src:image.currentSrc,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,box:imageBox,
        objectFit:style.objectFit,objectPosition:style.objectPosition,painted,
        assumption:'Centered contain on these unrotated fixtures; not an alpha silhouette.'}:null,
      svg:svg&&path?{box:box(svg),viewBox:svg.getAttribute('viewBox'),preserveAspectRatio:svg.getAttribute('preserveAspectRatio'),
        ctm:ctm?{a:ctm.a,b:ctm.b,c:ctm.c,d:ctm.d,e:ctm.e,f:ctm.f}:null,
        pathBox:local?{x:local.x,y:local.y,width:local.width,height:local.height}:null,
        transformedPathCorners:local?[map(local.x,local.y),map(local.x+local.width,local.y),map(local.x,local.y+local.height),map(local.x+local.width,local.y+local.height)]:[],
        sampledLowerPoint,sampleSegments:512}:null };
  });
}

// Real player/coach components and artwork; fixture identities are synthetic.
// Reference screenshots change only d to the previous polygon on all five paths
// at the same phase, preserving current halos and effects. They compare geometry,
// not an old application build. No account, provider or remote network is used.
// Automated geometry/style assertions do not establish physical Safari/pinch
// stability or perceptual equivalence: inspect the paired rendered screenshots.
test(`card halo (${engineName}): measured artwork contour, persistent glow and composed sizing`, { skip: !enabled, timeout: 360_000 }, async t => {
  assert.notEqual(process.env.TOUCHLINE_LOCAL_IGNORE_MEMORY_GATE, "1", "this visual gate must not bypass memory controls");
  const capacity = () => requireBrowserCapacity(root, { darwinFreePercent: true,
    allowModerateDarwinPressure: process.env.TOUCHLINE_LOCAL_ALLOW_MODERATE_PRESSURE === "1" && !process.env.CI });
  capacity();
  const output = mkdtempSync(path.join(tmpdir(), "touchline-card-neon-halo-"));
  t.diagnostic(`Card halo comparisons: ${output}`);
  execFileSync(process.execPath, ["--max-old-space-size=1536", "--experimental-strip-types", "--input-type=module", "-e", `
    import { writeFileSync, readFileSync } from 'node:fs';
    import { createHash } from 'node:crypto';
    import { bundleIsolatedBrowserFixture } from './tests/helpers/touchline-isolated-browser-bundle.mts';
    const bundle=bundleIsolatedBrowserFixture({ entryPath:'tests/helpers/card-hover-neon-fixture.tsx', cssPrefix:'neonhalo',
      requiredSources:['components/touchline/cards/TouchlineCardPerimeterTrace.tsx','components/touchline/cards/TouchlineEliteExactCard.tsx',
        'components/touchline/cards/TouchlineCoachCard.tsx','components/touchline/cards/TouchlineCardZoom.tsx',
        'components/touchline/TouchlineDecorationMotion.tsx','lib/touchlineArena/visible-decoration-motion.ts'],
      mountScript:'flushSync(()=>root.render(React.createElement(loadEntry().default)));' });
    writeFileSync(process.argv[1]+'/bundle.json',JSON.stringify(bundle));
    writeFileSync(process.argv[1]+'/sources.json',JSON.stringify(Object.fromEntries([...bundle.sources,'app/globals.css',
      'node_modules/tailwindcss/preflight.css'].map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')])),null,2));
  `, output], { cwd: root, timeout: 40_000, stdio: "pipe" });
  const bundle = JSON.parse(readFileSync(path.join(output, "bundle.json"), "utf8")) as { script: string; css: string };
  const css = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8")
    + readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "") + bundle.css;
  const engine = engineName === "webkit" ? webkit : chromium;
  capacity(); assert.ok(existsSync(engine.executablePath()), "browser must already be installed");
  const browser = await engine.launch({ headless: true });
  let closing: Promise<void> | undefined;
  const closeBrowser = () => closing ??= browser.close();
  const abort = () => { void closeBrowser().catch(() => undefined); };
  t.signal.addEventListener("abort", abort, { once: true });
  const reports: unknown[] = [], assets = new Set<string>(), errors: string[] = [], forbidden: string[] = [];
  const origin = "https://neon-halo.test", publicRoot = realpathSync(path.join(root, "public"));
  const writeReport = () => writeFileSync(path.join(output, "results.json"), JSON.stringify({ engineName, syntheticOnly: true,
    reports, assets: [...assets], errors, forbidden, limit: 'Local isolated composition; not QA or native iPhone; sizing diagnostics are measurements only.' }, null, 2));
  try {
    t.signal.throwIfAborted();
    const scenarios = [
      { touch: true, viewport: { width: 844, height: 390 }, allTiers: true, coachOnly: false },
      { touch: false, viewport: { width: 1280, height: 900 }, allTiers: false, coachOnly: false },
      { touch: true, viewport: { width: 667, height: 375 }, allTiers: false, coachOnly: true },
      { touch: false, viewport: { width: 1440, height: 900 }, allTiers: false, coachOnly: true },
    ];
    for (const { touch, viewport, allTiers, coachOnly } of scenarios) {
      capacity();
      const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 3 : 1,
        reducedMotion: "no-preference", serviceWorkers: "block" });
      try {
        const page = await context.newPage(); page.setDefaultTimeout(8000);
        // As in the auth rotation fixture, keep the Chromium touch session
        // until context.close; detaching clears its coarse-pointer override.
        const touchSession = touch && engineName === "chromium" ? await context.newCDPSession(page) : null;
        page.on("pageerror", error => errors.push(error.message));
        await context.route("**/*", async route => {
          const url = new URL(route.request().url());
          if (route.request().method() !== "GET" || url.origin !== origin) { forbidden.push(url.origin + url.pathname); return route.abort(); }
          if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{background:#07120e;color:white}</style><div id="root"></div><div style="height:1100px" aria-hidden="true"></div>` });
          if (url.pathname === "/favicon.ico") return route.fulfill({ status: 204 });
          if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { ok: false, error: "Isolated visual boundary" } });
          const file = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
          if (file.startsWith(publicRoot + path.sep) && existsSync(file) && statSync(file).isFile() && realpathSync(file).startsWith(publicRoot + path.sep)) {
            assets.add(url.pathname); return route.fulfill({ path: file });
          }
          return route.abort();
        });
        const tiers = allTiers ? ["ruby-red", "sapphire-blue", "amethyst-purple", "radiant-gold", "emerald-green", "clear-diamond", "diamond-gold"] : ["sapphire-blue"];
        for (const tier of tiers) {
          t.signal.throwIfAborted(); capacity();
          await page.goto(`${origin}/?tier=${tier}&club=Arsenal`);
          await page.addScriptTag({ content: `(()=>{${bundle.script}})()` });
          await expect(page.locator(`main ${traceSelector}`)).toHaveCount(2);
          await expect.poll(() => page.locator('main img[data-touchline-card-frame="true"]').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
          const savePair = async (scope: Locator, label: string) => {
            const traces = scope.locator(traceSelector);
            for (const trace of await traces.all()) {
              await expect.poll(async () => (await traceState(trace)).animations.some(animation => animation.state === "running" && !animation.pending)).toBe(true);
              const state = await traceState(trace);
              assert.equal(state.animations.length, 1, "halo and sharp core share one animation");
              assert.equal(state.groupOpacity, "1", "the moving SVG group does not request alpha flattening");
              assert.equal(state.opacity, "1", "visible without mouse hover");
              assert.equal(state.corePath, state.basePath); assert.equal(state.coreStroke, state.color);
              assert.equal(state.duration, "2s"); assert.match(state.dash, /^16(?:px)?[, ]+84(?:px)?$/);
              assert.equal(state.halos.length, 3);
              assert.equal(state.baseWidth, .55, "fine stationary contour remains readable at every scale");
              assert.equal(state.coreWidth, 1.1, "travelling LED retains its fine non-scaling width");
              if (touch) assert.equal(state.filter, "none"); else assert.match(state.filter, /drop-shadow/);
              for (const halo of state.halos) {
                assert.equal(halo.path, state.basePath); assert.equal(halo.stroke, state.color); assert.equal(halo.filter, "none");
                assert.equal(halo.display !== "none", touch || (halo.role === "base" && state.interactionActive));
                assert.ok(Number(halo.opacity) > 0 && Number(halo.opacity) < .25);
                if (halo.role === "base" && state.interactionActive) {
                  assert.equal(halo.width, 3); assert.equal(Number(halo.opacity), .2);
                }
                if (halo.role?.startsWith("run-")) assert.equal(halo.dash, state.dash, "runner halo inherits the original dash pattern");
              }
              await freezeTrace(trace);
              const offsets = await trace.evaluate(node => [...node.querySelectorAll('[data-touchline-card-neon-trace-run="true"], [data-touchline-card-neon-trace-run="true"] path')].map(part => getComputedStyle(part).strokeDashoffset));
              assert.equal(new Set(offsets).size, 1, "all travelling strokes remain exactly in phase");
              reports.push({ touch, viewport, tier, label, state, offsets });
            }
            const frames = await scope.locator('img[data-touchline-card-frame="true"]').evaluateAll(nodes => nodes.map(node => {
              const image = node as HTMLImageElement, box = image.getBoundingClientRect();
              return { src: image.currentSrc, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, width: box.width, height: box.height };
            }));
            assert.ok(frames.length > 0 && frames.every(frame => frame.naturalWidth > 0 && frame.width > 0 && frame.height > 0));
            const prefix = `${touch ? "touch" : "desktop"}-${viewport.width}x${viewport.height}-${tier}-${label}`;
            await page.screenshot({ path: path.join(output, `${prefix}-art-contour.png`) });
            const measuredStates = await Promise.all((await traces.all()).map(trace => traceState(trace)));
            const correspondence = await scope.locator('.touchline-card-surface').evaluateAll(measureCardArtwork);
            const savedPaths = await traces.evaluateAll(nodes => nodes.map(node => [...node.querySelectorAll('path')].map(part => part.getAttribute('d'))));
            // Compare restored original rails with the previous measured artwork contour.
            // Keep all five strokes, effects, art and animation phase unchanged.
            const referencePaths = await Promise.all((await traces.all()).map(async trace => {
              const variant = await trace.getAttribute('data-touchline-card-neon-trace-variant');
              if (variant === 'coach') return CARD_ART_PERIMETER_PATHS.coach[tier as keyof typeof CARD_ART_PERIMETER_PATHS.coach];
              const src = await trace.evaluate(node => node.closest('.touchline-card-surface')?.querySelector('img[data-touchline-card-frame="true"]')?.getAttribute('src'));
              return resolvePlayerCardArtPerimeterPath(src);
            }));
            assert.ok(referencePaths.every(Boolean), 'Every comparison uses verified original artwork');
            try {
              await traces.evaluateAll((nodes, references) => nodes.forEach((node, index) => {
                const reference = references[index]!;
                const paths = [...node.querySelectorAll('path')];
                if (paths.length !== 5 || paths.some(part => part.getAttribute('d') === reference)) throw new Error('Expected five restored original rail strokes');
                paths.forEach(part => part.setAttribute('d', reference));
              }), referencePaths);
              for (const trace of await traces.all()) await freezeTrace(trace);
              const polygonStates = await Promise.all((await traces.all()).map(trace => traceState(trace)));
              assert.deepEqual(polygonStates.map(withoutPaths), measuredStates.map(withoutPaths), 'Only path geometry changes in the comparison');
              await page.screenshot({ path: path.join(output, `${prefix}-previous-measured-contour.png`) });
            } finally {
              await traces.evaluateAll((nodes, paths) => nodes.forEach((node,index) => [...node.querySelectorAll('path')]
                .forEach((part,pathIndex) => part.setAttribute('d', paths[index][pathIndex]!))), savedPaths);
            }
            assert.deepEqual(await Promise.all((await traces.all()).map(trace => traceState(trace))), measuredStates, 'Restoration retains all effects and exact phase');
            const referenceFrames = await scope.locator('img[data-touchline-card-frame="true"]').evaluateAll(nodes => nodes.map(node => {
              const image = node as HTMLImageElement, box = image.getBoundingClientRect();
              return { src: image.currentSrc, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, width: box.width, height: box.height };
            }));
            assert.deepEqual(referenceFrames, frames, "reference and vector rendering use identical original image bytes and geometry");
            reports.push({ touch, viewport, tier, label, frames, correspondence,
              reference: "Previous measured contour d only; same5paths, effects, art and650ms phase" });
            writeReport();
          };
          await savePair(page.locator("main"), "compact");
          for (const subject of (coachOnly ? ["coach"] : ["player", "coach"])) {
            capacity();
            await page.goto(`${origin}/?tier=${tier}&club=Arsenal`);
            await page.addScriptTag({ content: `(()=>{${bundle.script}})()` });
            const trigger = page.locator(`[data-fixture-kind="${subject}"] [data-touchline-card-zoom="trigger"] > [role="button"]`);
            await trigger.focus(); await page.keyboard.press("Enter");
            const dialog = page.locator('[data-touchline-card-zoom="dialog"]'); await expect(dialog).toBeVisible();
            await expect.poll(() => dialog.locator('img[data-touchline-card-frame="true"]').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
            const backdrop = await dialog.evaluate(node => ({ background: getComputedStyle(node).backgroundColor,
              filter: getComputedStyle(node).backdropFilter, opacity: getComputedStyle(node).opacity }));
            assert.equal(backdrop.background, 'rgb(2, 8, 9)'); assert.equal(backdrop.filter, 'none'); assert.equal(backdrop.opacity, '1');
            await savePair(dialog, `${subject}-zoom`);
            await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
          }
        }
        if (touch && viewport.width === 844) for (const diagnostic of ['editable', 'removal']) {
          capacity();
          await page.goto(`${origin}/?tier=sapphire-blue&club=Arsenal&diagnostic=${diagnostic}`);
          await page.addScriptTag({ content: `(()=>{${bundle.script}})()` });
          const fixture = page.locator(`[data-fixture-kind="${diagnostic}"]`);
          const shell = fixture.locator('.touchline-card-surface');
          await expect(shell).toHaveCount(1);
          await expect.poll(() => fixture.locator('img[data-touchline-card-frame="true"]').evaluateAll(images => images.length === 1 && images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
          await expect.poll(() => shell.evaluateAll(measureCardArtwork).then(rows => rows.every(row => (row.frame?.box?.width ?? 0) > 0 && (row.frame?.box?.height ?? 0) > 0))).toBe(true);
          const measurements = await shell.evaluateAll(measureCardArtwork);
          assert.equal(measurements.length, 1); assert.ok(measurements[0].frame?.naturalWidth);
          const measurement = measurements[0], frame = measurement.frame, svg = measurement.svg;
          assert.ok(frame?.painted && svg?.ctm, 'Actual artwork rectangle and SVG screen transform required');
          for (const key of ['x', 'y', 'width', 'height'] as const) {
            assert.ok(Math.abs(svg.box[key] - frame.painted[key]) <= .25, `Neon must match artwork ${key}, excluding controls`);
          }
          assert.ok(Math.abs(svg.ctm.a - svg.ctm.d) <= .000001, 'Extra controls must not stretch the neon vertically');
          assert.equal(svg.ctm.b, 0); assert.equal(svg.ctm.c, 0);
          assert.equal(measurement.shell.height - frame.box!.height, diagnostic === 'editable' ? 302 : 72,
            'Editor/removal controls retain their original shell allocation');
          assert.equal(await shell.getAttribute('data-card-motion'), diagnostic === 'editable' ? 'false' : 'true');
          reports.push({ touch, viewport, tier: 'sapphire-blue', diagnostic, measurements,
            interpretation: 'SVG rectangle matches original artwork; control area remains outside the neon.' });
          await page.screenshot({ path: path.join(output, `${diagnostic}-sizing.png`) });
          // Record geometry first: oversized element capture may temporarily
          // change browser emulation and is visual evidence, not a new viewport.
          const mediaBefore = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
            coarse: matchMedia('(pointer:coarse)').matches, noHover: matchMedia('(hover:none)').matches,
            landscape: matchMedia('(orientation:landscape)').matches }));
          await shell.screenshot({ path: path.join(output, `${diagnostic}-sizing-full-shell.png`) });
          const rawMediaAfterCapture = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
            coarse: matchMedia('(pointer:coarse)').matches, noHover: matchMedia('(hover:none)').matches,
            landscape: matchMedia('(orientation:landscape)').matches }));
          // Oversized Chromium capture can clear touch during its internal
          // viewport restoration. Preserve that observation, then restore the
          // intended device exactly as the existing auth resize fixture does.
          if (touchSession) await touchSession.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
          const mediaAfter = touchSession ? await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
            coarse: matchMedia('(pointer:coarse)').matches, noHover: matchMedia('(hover:none)').matches,
            landscape: matchMedia('(orientation:landscape)').matches })) : rawMediaAfterCapture;
          reports.push({ diagnostic, fullShellCaptureMedia: { before: mediaBefore, rawAfterCapture: rawMediaAfterCapture,
            touchRestoredViaExistingAuthPattern: Boolean(touchSession), after: mediaAfter },
            limit: 'Element screenshot is secondary visual evidence; raw emulation during oversized capture may differ. Geometry was measured before capture; final media must match before continuing.' });
          writeReport();
          assert.deepEqual(mediaAfter, mediaBefore, 'Full-shell capture must restore emulation before further assertions');
        }
        // Exercise untouched product DOM after the comparison-only transformation.
        await page.goto(`${origin}/?tier=sapphire-blue&club=Arsenal`);
        await page.addScriptTag({ content: `(()=>{${bundle.script}})()` });
        const runner = page.locator(`main ${runSelector}`).first();
        await expect.poll(() => runner.evaluate(node => node.getAnimations().some(animation => animation.playState === "running" && !animation.pending))).toBe(true);
        await page.evaluate(() => scrollTo(0, 900));
        await expect.poll(() => runner.evaluate(node => node.getAnimations().every(animation => animation.playState === "paused" && !animation.pending))).toBe(true);
        await page.evaluate(() => scrollTo(0, 0));
        await expect.poll(() => runner.evaluate(node => node.getAnimations().some(animation => animation.playState === "running" && !animation.pending))).toBe(true);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect.poll(() => runner.evaluate(node => node.getAnimations().length)).toBe(0);
        assert.equal(await runner.evaluate(node => getComputedStyle(node).opacity), "0");
        assert.equal(await page.locator('main [data-touchline-card-neon-trace-base="true"]').first().evaluate(node => getComputedStyle(node).opacity), "0.4");
        if (touch) assert.notEqual(await page.locator(`main ${haloSelector}`).first().evaluate(node => getComputedStyle(node).display), "none");
        assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
      } finally { await context.close(); }
    }
    writeReport();
    writeFileSync(path.join(output, "test-source.sha256"), createHash("sha256").update(readFileSync(import.meta.filename)).digest("hex") + "\n");
    t.diagnostic(`${reports.length} style/geometry reports; no physical Safari or perceptual-equivalence claim`);
  } finally {
    try { writeReport(); } finally { t.signal.removeEventListener("abort", abort); await closeBrowser(); }
  }
});
