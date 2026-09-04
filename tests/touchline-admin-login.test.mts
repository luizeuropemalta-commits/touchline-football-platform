import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  normalizeTouchLineAdminReturnTo,
  touchLineAuthEntryHref,
  touchLinePostAuthHref,
} from "../lib/touchlineArena/auth-i18n.ts";

const page = readFileSync(new URL("../app/(auth)/admin/login/page.tsx", import.meta.url), "utf8");
const accountAccess = readFileSync(new URL("../components/admin-account-access.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/arena-admin-shell.tsx", import.meta.url), "utf8");
const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
const loginRoute = readFileSync(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8");
const authI18n = readFileSync(new URL("../lib/touchlineArena/auth-i18n.ts", import.meta.url), "utf8");

test("Admin has a dedicated login surface that reuses the existing authentication flow", () => {
  assert.match(page, /Login do Administrador/);
  assert.match(page, /<AuthForm/);
  assert.match(page, /showPanelHeader=\{false\}/);
  assert.match(page, /normalizeTouchLineAdminReturnTo\(returnTo\)/);
  assert.match(page, /entryPath="\/admin\/login"/);
  assert.match(page, /returnTo=\{adminReturnTo\}/);
  assert.match(page, /createClient/);
  assert.match(page, /isOwnerEmail\(user\.email\)/);
  assert.match(proxy, /"\/admin\/login"/);
  assert.match(authI18n, /candidate\.pathname\.startsWith\("\/admin\/"\)/);
  assert.match(authI18n, /candidate\.pathname\.startsWith\("\/visual-qa\/"\)/);
  assert.match(loginRoute, /value === "\/admin\/login" \? "\/admin\/login" : "\/login"/);
  assert.match(loginRoute, /login_path: form\.get\("login_path"\)/);
  assert.doesNotMatch(page, /signUp|createUser|password\s*=/i);
});

test("an active Admin session can be ended locally and switched without clearing browser history", () => {
  assert.match(accountAccess, /signOut\(\{ scope: "local" \}\)/);
  assert.match(accountAccess, /Sair e usar outra conta/);
  assert.match(accountAccess, /window\.location\.replace/);
  assert.match(accountAccess, /authorized/);
  assert.match(accountAccess, /Conta sem permissão administrativa/);
  assert.match(accountAccess, /touchLinePostAuthHref\(returnTo, normalizedLocale, "\/admin"\)/);
  assert.match(accountAccess, /touchLineAuthEntryHref\("\/admin\/login", normalizedLocale, returnTo\)/);
  assert.match(shell, /switchAccount: "Trocar conta"/);
  assert.match(shell, /currentAdminDestination/);
  assert.match(shell, /touchLineAuthEntryHref\("\/admin\/login", locale, currentAdminDestination\)/);
  assert.match(shell, /onClick=\{signOut\}/);
});

test("switching Admin accounts preserves a normalized deep destination and its query string", () => {
  const returnTo = "/admin/social-publications?state=ready&channel=clubhub";
  const entry = new URL(touchLineAuthEntryHref("/admin/login", "pt-BR", returnTo), "https://touchline.local");
  assert.equal(entry.pathname, "/admin/login");
  assert.equal(entry.searchParams.get("lang"), "pt-BR");
  assert.equal(entry.searchParams.get("returnTo"), returnTo);
  const normalized = normalizeTouchLineAdminReturnTo(entry.searchParams.get("returnTo"));
  assert.equal(touchLinePostAuthHref(normalized, "pt-BR", "/admin"), `${returnTo}&lang=pt-BR`);
});
