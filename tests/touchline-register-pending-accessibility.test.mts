import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../components/auth-form.tsx', import.meta.url), 'utf8');

test('register keeps a localized accessible action while busy', () => {
  assert.match(source, /mode === "login" \? copy\.signingIn : mode === "register" \? copy\.createAccount : copy\.sendReset/);
  assert.match(source, /<Loader2[^>]*aria-hidden="true"/);
});

test('register errors are announced without changing other auth message semantics', () => {
  assert.match(source, /messageTone === "error" && mode !== "login" \? "alert"/);
  assert.match(source, /\{message\}/);
});

test('recovery success is announced without altering login messages', () => {
  assert.match(source, /messageTone === "success" && mode === "forgot" \? "status" : undefined/);
});
