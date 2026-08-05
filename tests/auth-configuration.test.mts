import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const authFormSource = fs.readFileSync(new URL("../components/auth-form.tsx", import.meta.url), "utf8");
const authCopySource = fs.readFileSync(new URL("../lib/touchlineArena/auth-i18n.ts", import.meta.url), "utf8");

test("authentication configuration failures are reported instead of simulating success", () => {
  assert.doesNotMatch(authFormSource, /await new Promise\([^)]*setTimeout/);
  assert.doesNotMatch(authFormSource, /if \(!supabase\)\s*\{\s*router\.push\("\/arena"\)/);
  assert.equal(authFormSource.match(/setMessage\(copy\.authenticationUnavailable\)/g)?.length, 2);
  assert.match(authCopySource, /Authentication service is unavailable\. Please try again later\./);
  assert.match(authCopySource, /O serviço de autenticação está indisponível\. Tente novamente mais tarde\./);
});

test("password sign-in uses one first-party server-action hand-off", () => {
  assert.doesNotMatch(authFormSource, /supabase\.auth\.setSession\(session\)/);
  assert.match(authFormSource, /action=\{mode === "login" \? loginWithPassword : undefined\}/);
  assert.match(authFormSource, /onSubmit=\{mode === "login" \? undefined : submit\}/);
  assert.doesNotMatch(authFormSource, /action=\{mode === "login" \? "\/api\/auth\/login"/);
});
