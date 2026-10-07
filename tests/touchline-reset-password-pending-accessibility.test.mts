import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source=readFileSync(new URL('../components/reset-password-form.tsx',import.meta.url),'utf8');

test('reset action retains its localized accessible name while pending',()=>{
  assert.match(source,/loading \? <><Loader2[^>]*aria-hidden="true"[^>]*\/>\{copy\.updatePassword\}<\/>/);
  assert.match(source,/<Button type="submit" disabled=\{loading\}/);
});
