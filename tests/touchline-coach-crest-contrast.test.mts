import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Tottenham coach crest keeps transparency with only a fine silhouette outline', () => {
  const component = readFileSync(new URL('../components/touchline/cards/TouchlineCoachCard.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../components/touchline/cards/TouchlineCoachCard.module.css', import.meta.url), 'utf8');
  assert.match(component, /data-crest-contrast=\{runtimeClubLogoUrl\.includes\("\/tottenham-hotspur\."\) \? "light" : undefined\}/);
  assert.match(component, /src=\{runtimeClubLogoUrl\}/);
  assert.doesNotMatch(component, /WebkitMaskImage:/);
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /primitiveUnits="objectBoundingBox"/);
  assert.match(layout, /dx="0.006"/);
  assert.match(layout, /dy="-0.006"/);
  assert.match(layout, /floodColor="#ffffff" floodOpacity="1"/);
  assert.match(layout, /feFuncA type="discrete" tableValues="0 1"/);
  const filter = layout.split('id="touchline-proportional-crest-outline"')[1].split('</filter>')[0];
  assert.doesNotMatch(filter, /feGaussianBlur|feDropShadow/);
  assert.doesNotMatch(component, /drop-shadow\(1px 0 0 white\)/);
  assert.doesNotMatch(css, /\[data-crest-contrast="light"\][^{]*\{[^}]*(?:background|border-radius|padding):/s);
});
