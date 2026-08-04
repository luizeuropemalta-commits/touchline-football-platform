import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [layoutSource, shellSource, notificationsSource, footballSearchSource] = await Promise.all([
  readFile(new URL("../app/(app)/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/arena-admin-shell.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/(app)/notifications/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/(app)/football-search/page.tsx", import.meta.url), "utf8"),
]);

test("protected layout authenticates directly and no longer loads the professional workspace shell", () => {
  assert.match(layoutSource, /from ["']@\/components\/arena-admin-shell["']/);
  assert.match(layoutSource, /from ["']@\/lib\/supabase\/server["']/);
  assert.match(layoutSource, /supabase\.auth\.getUser\(\)/);
  assert.match(layoutSource, /isOwnerEmail\(user\.email\)/);
  assert.match(layoutSource, /redirect\(["']\/login["']\)/);

  assert.doesNotMatch(layoutSource, /components\/app-shell/);
  assert.doesNotMatch(layoutSource, /lib\/server\/current-workspace/);
  assert.doesNotMatch(layoutSource, /lib\/server\/workspace/);
  assert.doesNotMatch(layoutSource, /lib\/billing/);
  assert.doesNotMatch(layoutSource, /TouchlineActivityTracker/);
});

test("Arena admin shell exposes only official operational navigation", () => {
  for (const href of [
    "/arena",
    "/notifications",
    "/inbox",
    "/football-search",
    "/admin",
    "/admin/analytics",
    "/admin/cards",
    "/admin/promotions",
    "/admin/finance",
    "/admin/football-data",
  ]) {
    assert.match(shellSource, new RegExp(`href: "${href}"|href="${href}"`));
  }

  for (const legacyHref of [
    "/agencies",
    "/scouting",
    "/deals",
    "/contracts",
    "/documents",
    "/investors",
    "/academies",
    "/billing",
    "/upgrade",
  ]) {
    assert.doesNotMatch(shellSource, new RegExp(`href: "${legacyHref}"|href="${legacyHref}"`));
  }

  assert.doesNotMatch(shellSource, /lib\/billing|featureForPath|canAccess|planMap/);
  assert.doesNotMatch(shellSource, /\bXP\b|12,450|subscriptionStatus|planKey/);
  assert.match(shellSource, /supabase\.auth\.signOut\(\{ scope: "local" \}\)/);
  assert.match(shellSource, /Sign out/);
  assert.match(shellSource, /touchLineAuthHref\("\/login", locale\)/);
  assert.match(shellSource, /const locale = normalizeTouchLineAuthLocale\(searchParams\.get\("lang"\)\)/);
  assert.match(shellSource, /href=\{touchLineAuthHref\(item\.href, locale\)\}/);
});

test("Arena admin shell keeps the fixed rail off tablets and narrow laptops", () => {
  assert.match(shellSource, /w-\[272px\] max-w-\[calc\(100vw-2rem\)\].*overscroll-contain/);
  assert.match(shellSource, /fixed inset-y-0 left-0 z-40 hidden xl:block/);
  assert.match(shellSource, /fixed inset-0 z-50 flex xl:hidden/);
  assert.match(shellSource, /relative min-w-0 xl:ml-\[272px\]/);
  assert.match(shellSource, /text-slate-300 xl:hidden/);
  assert.doesNotMatch(shellSource, /hidden lg:block|lg:ml-\[272px\]/);
});

test("football search returns every authenticated user to the Arena", () => {
  assert.match(footballSearchSource, /searchParams: Promise<\{ lang\?: string \}>/);
  assert.match(footballSearchSource, /const locale = normalizeTouchLineAuthLocale\(lang\)/);
  assert.match(footballSearchSource, /href=\{touchLineAuthHref\("\/arena", locale\)\}/);
  assert.match(footballSearchSource, /Back to TouchLine Arena/);
  assert.doesNotMatch(footballSearchSource, /href="\/admin"/);
});

test("notification preferences use only the authenticated API contract and neutral UI", () => {
  assert.match(notificationsSource, /^"use client";/);
  assert.match(notificationsSource, /fetch\(["']\/api\/notifications\/preferences["']/);
  assert.match(notificationsSource, /method: ["']PUT["']/);

  assert.doesNotMatch(notificationsSource, /components\/game-ui/);
  assert.doesNotMatch(notificationsSource, /components\/workspace-state/);
  assert.doesNotMatch(notificationsSource, /lib\/server\/current-workspace/);
  assert.doesNotMatch(notificationsSource, /NotificationPreferencesCenter/);
});
