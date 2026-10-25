import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('mobile navigation retains every primary link on one shared row', () => {
  const css = source('components/touchline/TouchlineGlobalNavigation.module.css');
  assert.match(css, /\.navigation \{ flex-wrap: nowrap;/);
  assert.match(css, /\.desktopOnly \{ display: inline-flex;/);
  assert.doesNotMatch(css, /\.more \{ display: block/);
  assert.doesNotMatch(css, /\.arena \{ width: 100%/);
});

test('customer navigation labels do not change with club context', () => {
  const nav = source('components/touchline/TouchlineGlobalNavigation.tsx');
  assert.match(nav, /surface === "auth" \? dictionary.admin : dictionary.backToArena/);
  assert.match(nav, /if \(key === "clubHub"\) return dictionary.clubHub;/);
});

test('Live removes decorative titles while retaining an accessible page heading', () => {
  const live = source('components/touchline/match-centre/TouchlineMatchCentre.tsx');
  assert.match(live, /<h1 className="sr-only">\{dictionary.title\}<\/h1>/);
  assert.doesNotMatch(live, /className=\{styles.pageTitle\}/);
  assert.match(live, /className=\{styles.selectionAnnouncement\}/);
});
