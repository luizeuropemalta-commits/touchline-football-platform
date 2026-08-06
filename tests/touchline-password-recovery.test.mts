import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  createTouchLinePasswordRecoveryGrant,
  TOUCHLINE_PASSWORD_RECOVERY_MAX_AGE_SECONDS,
  touchLinePasswordRecoveryCookieOptions,
  verifyTouchLinePasswordRecoveryGrant,
} from "../lib/server/password-recovery.ts";

const formSource = fs.readFileSync(new URL("../components/auth-form.tsx", import.meta.url), "utf8");
const resetFormSource = fs.readFileSync(new URL("../components/reset-password-form.tsx", import.meta.url), "utf8");
const resetPageSource = fs.readFileSync(new URL("../app/(auth)/reset-password/page.tsx", import.meta.url), "utf8");
const callbackSource = fs.readFileSync(new URL("../app/auth/callback/route.ts", import.meta.url), "utf8");
const proxySource = fs.readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
const recoveryRouteSource = fs.readFileSync(new URL("../app/api/auth/recovery/route.ts", import.meta.url), "utf8");

test("forgot-password email returns through the callback to the dedicated reset page", () => {
  assert.match(formSource, /const resetPasswordHref = touchLineAuthHref\("\/reset-password", normalizedLocale\)/);
  assert.match(
    formSource,
    /resetPasswordForEmail\([\s\S]*buildTouchLineAuthCallbackUrl\(resetPasswordHref\)/,
  );
});

test("recovery callback exchanges the code into a session without running onboarding writes", () => {
  assert.match(callbackSource, /const isPasswordRecovery = redirectType === "recovery"/);
  assert.match(callbackSource, /exchangeCodeForSession\(code\)/);
  assert.match(callbackSource, /if \(isPasswordRecovery\) \{[\s\S]*createTouchLinePasswordRecoveryGrant\(data\.user\.id\)/);
  assert.match(callbackSource, /TOUCHLINE_PASSWORD_RECOVERY_COOKIE/);

  const exchangeIndex = callbackSource.indexOf("exchangeCodeForSession(code)");
  const recoveryGuardIndex = callbackSource.indexOf('redirectType === "recovery"');
  assert.ok(exchangeIndex >= 0 && exchangeIndex < recoveryGuardIndex);
});

test("new password is written only after the recovery user is revalidated", () => {
  assert.match(resetFormSource, /fetch\("\/api\/auth\/recovery"/);
  assert.match(recoveryRouteSource, /supabase\.auth\.getUser\(\)/);
  assert.match(recoveryRouteSource, /verifyTouchLinePasswordRecoveryGrant\(recoveryGrant, user\.id\)/);
  assert.match(recoveryRouteSource, /recovery\.supabase\.auth\.updateUser\(\{ password \}\)/);
  assert.match(resetFormSource, /password !== confirmation/);
  assert.match(resetFormSource, /minLength=\{8\}/);

  assert.ok(
    recoveryRouteSource.indexOf("supabase.auth.getUser()")
      < recoveryRouteSource.indexOf("recovery.supabase.auth.updateUser({ password })"),
  );
});

test("an absent recovery grant renders an expired-link state without a noisy browser 401", () => {
  assert.match(recoveryRouteSource, /recovery\.error === "unavailable" \? 503 : 200/);
  assert.match(resetFormSource, /payload\?\.ok !== true/);
  assert.match(recoveryRouteSource, /export async function POST[\s\S]*recovery\.error === "unavailable" \? 503 : 401/);
});

test("password recovery grants are signed, user-bound and short-lived", () => {
  const previousSecret = process.env.TOUCHLINE_AUTH_RECOVERY_SECRET;
  process.env.TOUCHLINE_AUTH_RECOVERY_SECRET = "test-only-password-recovery-secret";
  try {
    const now = 1_800_000_000_000;
    const grant = createTouchLinePasswordRecoveryGrant("user-1", now);
    assert.equal(verifyTouchLinePasswordRecoveryGrant(grant, "user-1", now + 1_000), true);
    assert.equal(verifyTouchLinePasswordRecoveryGrant(grant, "user-2", now + 1_000), false);
    assert.equal(verifyTouchLinePasswordRecoveryGrant(`${grant}tampered`, "user-1", now + 1_000), false);
    assert.equal(
      verifyTouchLinePasswordRecoveryGrant(
        grant,
        "user-1",
        now + TOUCHLINE_PASSWORD_RECOVERY_MAX_AGE_SECONDS * 1000,
      ),
      false,
    );
    assert.deepEqual(touchLinePasswordRecoveryCookieOptions("https://touchline.example/auth/callback"), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: TOUCHLINE_PASSWORD_RECOVERY_MAX_AGE_SECONDS,
    });
  } finally {
    if (previousSecret === undefined) delete process.env.TOUCHLINE_AUTH_RECOVERY_SECRET;
    else process.env.TOUCHLINE_AUTH_RECOVERY_SECRET = previousSecret;
  }
});

test("reset UI is localized and preserves language after completion or an expired link", () => {
  assert.match(resetPageSource, /normalizeTouchLineAuthLocale\(lang\)/);
  assert.match(resetPageSource, /<ResetPasswordForm locale=\{locale\}/);
  assert.match(resetFormSource, /touchLineAuthHref\("\/forgot-password", normalizedLocale\)/);
  assert.match(resetFormSource, /touchLineAuthHref\("\/arena", normalizedLocale\)/);
});

test("proxy permits the recovery page while keeping ordinary authenticated entry redirects", () => {
  assert.match(proxySource, /authPaths\s*=\s*\["\/login", "\/register", "\/forgot-password", "\/reset-password", "\/auth\/callback"\]/);
  assert.match(proxySource, /authEntryPaths\s*=\s*\["\/login", "\/register", "\/forgot-password"\]/);
  assert.match(proxySource, /user && !isAdmin && !isAuth/);
  assert.match(proxySource, /user && hasArenaAccess && isAuthEntry/);
});
