import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const script = ts.transpileModule(readFileSync(new URL('../lib/touchlineArena/visible-decoration-motion.ts', import.meta.url), 'utf8').replace('export function', 'function'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

test('nested decoration ownership preserves the child visibility state when only its parent re-enters', () => {
  let intersect: (entries: unknown[]) => void = () => {};
  class Element {
    isConnected = true;
    parent: Element | null;
    constructor(parent: Element | null = null) { this.parent = parent; }
    closest(): Element { return this; }
    matches() { return true; }
    querySelectorAll() { return []; }
    getAnimations(_options?: unknown): unknown[] { return []; }
  }
  const pitch = new Element();
  const card = new Element(pitch);
  const path = new Element(card);
  path.closest = () => card;
  const animation = {
    animationName: 'touchline-card-perimeter-trace', playState: 'running',
    effect: { target: path },
    play() { this.playState = 'running'; },
    pause() { this.playState = 'paused'; },
  };
  pitch.getAnimations = card.getAnimations = () => [animation];
  const root = { hidden: false, documentElement: {}, querySelectorAll: () => [pitch, card], addEventListener() {}, removeEventListener() {} };
  const context = vm.createContext({ Element, document: root,
    IntersectionObserver: class { constructor(callback: typeof intersect) { intersect = callback; } observe() {} unobserve() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} },
  });
  vm.runInContext(`${script}; observeVisibleDecorationMotion();`, context);
  intersect([{ target: pitch, isIntersecting: true }, { target: card, isIntersecting: true }]);
  assert.equal(animation.playState, 'running');
  intersect([{ target: pitch, isIntersecting: false }, { target: card, isIntersecting: false }]);
  assert.equal(animation.playState, 'paused');
  intersect([{ target: pitch, isIntersecting: true }]);
  assert.equal(animation.playState, 'paused', 'visible parent must not override an offscreen child');
  intersect([{ target: card, isIntersecting: true }]);
  assert.equal(animation.playState, 'running');
});
