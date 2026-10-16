import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/touchlineArena/visible-decoration-motion.ts', import.meta.url), 'utf8');

test('shared decorative motion pauses offscreen/hidden, resumes, discovers streamed cards and cleans up', () => {
  class Element {
    isConnected = true;
    state = 'paused';
    style = { setProperty: () => { throw new Error('React-owned markup must not be mutated'); }, removeProperty: () => { throw new Error('React-owned markup must not be mutated'); } };
    getAnimations() { return [
      { animationName: 'touchline-card-perimeter-trace', play: () => { this.state = 'running'; }, pause: () => { this.state = 'paused'; } },
      { animationName: 'page-in', play: () => { throw new Error('Content animation must remain untouched'); }, pause: () => { throw new Error('Content animation must remain untouched'); } },
    ]; }
    querySelectorAll() { return []; }
    matches() { return true; }
  }
  class SVGElement extends Element {}
  const first = new SVGElement(), later = new Element();
  const observed = new Set<Element>();
  let intersect: (entries: unknown[]) => void = () => {};
  let mutate: (records: unknown[]) => void = () => {};
  let visibility: (() => void) | undefined;
  let disconnected = 0;
  const document = {
    hidden: false, documentElement: {}, querySelectorAll: () => [first],
    addEventListener: (_: string, cb: () => void) => { visibility = cb; },
    removeEventListener: () => { visibility = undefined; },
  };
  const code = ts.transpileModule(source.replace('export function', 'function') + '\nobserveVisibleDecorationMotion(document);', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const cleanup = vm.runInNewContext(code, {
    document, Element, SVGElement,
    IntersectionObserver: class {
      constructor(cb: typeof intersect) { intersect = cb; }
      observe(node: Element) { observed.add(node); }
      unobserve(node: Element) { observed.delete(node); }
      disconnect() { observed.clear(); disconnected++; }
    },
    MutationObserver: class {
      constructor(cb: typeof mutate) { mutate = cb; }
      observe() {}
      disconnect() { disconnected++; }
    },
  });
  const state = (node: Element) => node.state;
  assert.equal(state(first), 'paused');
  intersect([{ target: first, isIntersecting: true }]);
  assert.equal(state(first), 'running', 'positive control: visible animation must run');
  document.hidden = true; visibility?.(); assert.equal(state(first), 'paused');
  document.hidden = false; visibility?.(); assert.equal(state(first), 'running');
  intersect([{ target: first, isIntersecting: false }]); assert.equal(state(first), 'paused');
  mutate([{ addedNodes: [later] }]); assert.ok(observed.has(later)); assert.equal(state(later), 'paused');
  intersect([{ target: later, isIntersecting: true }]); assert.equal(state(later), 'running');
  first.isConnected = false; mutate([{ addedNodes: [] }]);
  assert.ok(!observed.has(first)); assert.equal(state(first), 'paused');
  cleanup(); assert.equal(disconnected, 2); assert.equal(visibility, undefined); assert.equal(state(later), 'paused');
  intersect([{ target: later, isIntersecting: true }]); mutate([{ addedNodes: [later] }]);
  assert.equal(observed.size, 0); assert.equal(state(later), 'paused');
});

test('all shared decorations including pitch consume the motion gate; reduced-motion rules remain', () => {
  for (const path of ['app/globals.css', 'components/touchline/TouchlineClubPerimeterTrace.module.css', 'components/touchline/social/TouchlineSocial.module.css', 'components/touchline/pitch/TouchlinePitchSurface.module.css']) {
    const css = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(css, /animation-play-state: var\(--touchline-decoration-motion, paused\)/);
    assert.match(css, /prefers-reduced-motion: reduce/);
  }
});
