import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('player diagnostic remains QA owner-only and uses central factory without persistence', () => {
  const source = readFileSync(new URL('../app/api/football-data/provider-diagnostic/route.ts', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('if (scope === "player")'), source.indexOf('if (scope === "fixture")'));
  assert.ok(source.indexOf('if (!await authorizeOwner())') < source.indexOf('if (scope === "player")'));
  assert.match(block, /VERCEL_ENV === "production"/);
  assert.match(block, /TOUCHLINE_QA_SUPABASE_PROJECT_REF/);
  assert.match(block, /createFootballDataProvider\("sportmonks"\)\.getPlayerById\(playerId\)/);
  assert.match(block, /result\.data\.providerId !== playerId/);
  assert.match(block, /persisted: false/);
  assert.doesNotMatch(block, /\.upsert\(|\.insert\(|\.update\(|\.raw\b|fetch\(/);
});
