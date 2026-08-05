import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const authFormSource = fs.readFileSync(new URL("../components/auth-form.tsx", import.meta.url), "utf8");
const authCopySource = fs.readFileSync(new URL("../lib/touchlineArena/auth-i18n.ts", import.meta.url), "utf8");
const loginSubmitSource = fs.readFileSync(new URL("../app/(auth)/login/submit/route.ts", import.meta.url), "utf8");
const loginApiSource = fs.readFileSync(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8");
const browserClientSource = fs.readFileSync(new URL("../lib/supabase/client.ts", import.meta.url), "utf8");
const serverClientSource = fs.readFileSync(new URL("../lib/supabase/server.ts", import.meta.url), "utf8");

test("authentication configuration failures are reported instead of simulating success", () => {
  assert.doesNotMatch(authFormSource, /await new Promise\([^)]*setTimeout/);
  assert.doesNotMatch(authFormSource, /if \(!supabase\)\s*\{\s*router\.push\("\/arena"\)/);
  assert.equal(authFormSource.match(/setMessage\(copy\.authenticationUnavailable\)/g)?.length, 2);
  assert.match(authCopySource, /Authentication service is unavailable\. Please try again later\./);
  assert.match(authCopySource, /O serviço de autenticação está indisponível\. Tente novamente mais tarde\./);
});

test("password sign-in uses one same-origin native redirect with an API compatibility guard", () => {
  assert.doesNotMatch(authFormSource, /supabase\.auth\.setSession\(session\)/);
  assert.match(authFormSource, /action=\{mode === "login" \? "\/login\/submit" : undefined\}/);
  assert.match(authFormSource, /method="post"/);
  assert.match(authFormSource, /onSubmit=\{mode === "login" \? submitNativeLogin : submit\}/);
  assert.match(authFormSource, /window\.requestAnimationFrame/);
  assert.match(authFormSource, /window\.setTimeout\(\(\) => form\.submit\(\), 140\)/);
  assert.match(authFormSource, /copy\.signingIn/);
  assert.doesNotMatch(authFormSource, /fetch\("\/api\/auth\/login"/);
  assert.match(loginSubmitSource, /export \{ POST \} from "@\/app\/api\/auth\/login\/route"/);
  assert.match(loginApiSource, /NextResponse\.redirect\(new URL\(destination, request\.url\), 303\)/);
  assert.match(loginApiSource, /encode: "tokens-only"/);
  assert.match(browserClientSource, /encode: "tokens-only"/);
  assert.match(serverClientSource, /encode: "tokens-only"/);
  assert.doesNotMatch(loginApiSource, /window\.location\.replace/);
});
