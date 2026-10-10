import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { chromium, webkit, expect } from '@playwright/test';

const source = readFileSync(new URL('../components/touchline/ClubTrophyCarousel.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('trophies.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const effects: string[] = [], callbacks: string[] = [];
const visit = (node: ts.Node) => {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') effects.push(node.arguments[0].getText(ast));
  if (ts.isVariableDeclaration(node) && ['clearTransition', 'movePage'].includes(node.name.getText(ast))) callbacks.push(node.getText(ast));
  ts.forEachChild(node, visit);
};
visit(ast);
const visibilityEffect = effects.find(x => x.includes('new IntersectionObserver'))!;
const autoplayEffect = effects.find(x => x.includes('AUTO_ADVANCE_DELAY_MS'))!;
assert.ok(visibilityEffect && autoplayEffect && callbacks.length === 2);
const transpile = (code: string) => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function fixture() {
  let intersect: (entries: { isIntersecting: boolean }[]) => void = () => {};
  const listeners = new Map<string, () => void>(), timers = new Map<number, () => void>(), frames = new Map<number, () => void>();
  let id = 0, disconnects = 0;
  const document = { hidden: false,
    addEventListener: (event: string, callback: () => void) => listeners.set(event, callback),
    removeEventListener: (event: string) => listeners.delete(event),
  };
  const context = vm.createContext({ document, rowRef: { current: {} }, autoAdvanceVisible: false,
    autoAdvanceVisibleRef: { current: false }, transitionOriginRef: { current: null },
    transitionGenerationRef: { current: 0 }, transitionTimersRef: { current: [] },
    transitionFrameRef: { current: null }, transitionInFlightRef: { current: false },
    setAutoAdvanceVisible: (value: boolean) => { context.autoAdvanceVisible = value; },
    setPhase: (value: string) => { context.phase = value; },
    setActivePage: (update: (current: number) => number) => { context.activePage = update(context.activePage); },
    useCallback: (fn: unknown) => fn, pages: [[], []], activePage: 0,
    isCarousel: true, prefersReducedMotion: false, phase: 'idle',
    AUTO_ADVANCE_DELAY_MS: 5600, EXIT_DURATION_MS: 220, EMPTY_GAP_MS: 90, ENTER_DURATION_MS: 220,
    IntersectionObserver: class {
      constructor(callback: typeof intersect) { intersect = callback; }
      observe() {}
      disconnect() { disconnects++; }
    },
    window: {
      setTimeout: (callback: () => void) => { timers.set(++id, callback); return id; },
      clearTimeout: (key: number) => timers.delete(key),
      requestAnimationFrame: (callback: () => void) => { frames.set(++id, callback); return id; },
      cancelAnimationFrame: (key: number) => frames.delete(key),
    },
  });
  vm.runInContext(transpile(callbacks.map(x => 'const ' + x + ';').join('\n')), context);
  const run = (effect: string) => vm.runInContext(transpile('(' + effect + ')()'), context) as (() => void) | undefined;
  const stopVisibility = run(visibilityEffect)!;
  const nextTimer = () => {
    const [key, callback] = timers.entries().next().value!;
    timers.delete(key); callback(); return callback;
  };
  return { context, document, listeners, timers, frames, run, nextTimer, stopVisibility,
    intersect: (visible: boolean) => intersect([{ isIntersecting: visible }]),
    disconnected: () => disconnects,
  };
}

test('real trophy callbacks stabilize interrupted autoplay in exit/empty/enter without blocking manual movement', () => {
  for (const phase of ['exit', 'empty', 'enter']) for (const hidden of [false, true]) {
    const f = fixture(); assert.equal(f.run(autoplayEffect), undefined);
    f.intersect(true); const stopAutoplay = f.run(autoplayEffect)!;
    const staleAutoplay = f.nextTimer(); assert.equal(f.context.phase, 'exit');
    let staleTransition: (() => void) | undefined;
    if (phase !== 'exit') staleTransition = f.nextTimer();
    if (phase === 'enter') staleTransition = f.nextTimer();
    assert.equal(f.context.phase, phase);
    const pageBeforePause = f.context.activePage;
    if (hidden) { f.document.hidden = true; f.listeners.get('visibilitychange')?.(); }
    else f.intersect(false);
    stopAutoplay(); assert.equal(f.context.phase, 'idle');
    assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0);
    assert.equal(f.context.activePage, pageBeforePause);
    staleAutoplay(); staleTransition?.();
    assert.equal(f.context.phase, 'idle'); assert.equal(f.context.activePage, pageBeforePause);
    assert.equal(f.run(autoplayEffect), undefined);
    f.document.hidden = false; f.intersect(true);
    assert.ok(f.run(autoplayEffect), 'visible recovery schedules autoplay again');
    f.timers.clear();
    vm.runInContext('movePage(1)', f.context);
    assert.equal(f.context.transitionOriginRef.current, 'manual');
    f.intersect(false);
    assert.equal(f.context.phase, 'exit', 'manual transition is not cancelled by autoplay visibility');
    f.nextTimer(); f.nextTimer();
    for (const callback of f.frames.values()) callback();
    f.frames.clear(); f.nextTimer();
    assert.equal(f.context.phase, 'idle'); assert.equal(f.context.activePage, 1 - pageBeforePause);
    f.context.prefersReducedMotion = true;
    vm.runInContext('movePage(-1)', f.context);
    assert.equal(f.context.phase, 'idle'); assert.equal(f.timers.size, 0);
    f.stopVisibility(); vm.runInContext('clearTransition()', f.context);
    assert.equal(f.disconnected(), 1); assert.equal(f.listeners.size, 0);
    staleAutoplay(); staleTransition?.(); assert.equal(f.timers.size, 0);
  }
});

function mountedHarness() {
  const require = createRequire(import.meta.url);
  const react = dirname(require.resolve('react')), dom = dirname(require.resolve('react-dom/client'));
  const scheduler = dirname(createRequire(require.resolve('react-dom/client')).resolve('scheduler'));
  const modules = {
    react: readFileSync(join(react, 'cjs/react.development.js'), 'utf8'),
    'react/jsx-runtime': readFileSync(join(react, 'cjs/react-jsx-runtime.development.js'), 'utf8'),
    'react-dom': readFileSync(join(dom, 'cjs/react-dom.development.js'), 'utf8'),
    'react-dom/client': readFileSync(join(dom, 'cjs/react-dom-client.development.js'), 'utf8'),
    scheduler: readFileSync(join(scheduler, 'cjs/scheduler.development.js'), 'utf8'),
    trophies: transpile(source),
  };
  const defs = Object.entries(modules).map(([name, code]) => JSON.stringify(name) + ':function(module,exports,require){' + code + '\n}').join(',');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1kAAAAASUVORK5CYII=';
  return '<style>body{margin:0}.space{height:1800px}.club-hub-honour-row{width:340px;min-height:160px}article{display:inline-block;width:78px}img{width:20px;height:20px}button{width:44px;height:44px}</style><div class="space"></div><div id="root"></div><script>const process={env:{NODE_ENV:"development"}},modules={' + defs + '},cache={};function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}const React=require("react"),png=' + JSON.stringify(png) + ';const honours=Array.from({length:12},(_,i)=>({id:String(i),label:"Trophy "+i,count:1,tone:"gold",imageUrl:png,imageSources:{avif:png,webp:png}}));require("react-dom/client").createRoot(document.getElementById("root")).render(React.createElement(require("trophies").default,{ariaLabel:"Trophies",honours,previousLabel:"Previous",nextLabel:"Next"}));</script>';
}

test('mounted trophy component stops offscreen, resumes autoplay, and keeps reduced-motion manual controls', { timeout: 60_000 }, async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 600 } });
      const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
      await page.clock.install();
      await page.setContent(mountedHarness());
      const labels = page.locator('article small');
      const region = page.getByRole('region', { name: 'Trophies' });
      await expect(labels.first()).toHaveText('Trophy 0');
      await expect(region).toHaveAttribute('data-auto-advance-enabled', 'false');
      const firstPage = await labels.allTextContents();
      await page.clock.runFor(6500); assert.deepEqual(await labels.allTextContents(), firstPage);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
      await expect(region).toHaveAttribute('data-auto-advance-enabled', 'true');
      await page.clock.runFor(6500);
      await expect(labels.first()).not.toHaveText('Trophy 0');
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(region).toHaveAttribute('data-auto-advance-enabled', 'false');
      const lastPage = await labels.allTextContents();
      await page.clock.runFor(6500); assert.deepEqual(await labels.allTextContents(), lastPage);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(region).toHaveAttribute('data-auto-advance-enabled', 'false');
      await page.clock.runFor(6500); assert.deepEqual(await labels.allTextContents(), lastPage);
      await page.getByRole('button', { name: 'Next' }).click();
      await expect(labels.first()).not.toHaveText(lastPage[0]);
      assert.deepEqual(errors, []); await page.close();
    } finally { await browser.close(); }
  }
});
