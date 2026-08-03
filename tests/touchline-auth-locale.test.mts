import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  getTouchLineAuthCopy,
  normalizeTouchLineAuthLocale,
  normalizeTouchLineAuthReturnTo,
  touchLineAuthEntryHref,
  touchLineAuthHref,
  touchLinePostAuthHref,
} from "../lib/touchlineArena/auth-i18n.ts";
import { touchlineArenaFirstEntryHref } from "../lib/touchlineArena/arena-intro.ts";

const loginSource = fs.readFileSync(new URL("../app/(auth)/login/page.tsx", import.meta.url), "utf8");
const registerSource = fs.readFileSync(new URL("../app/(auth)/register/page.tsx", import.meta.url), "utf8");
const forgotSource = fs.readFileSync(new URL("../app/(auth)/forgot-password/page.tsx", import.meta.url), "utf8");
const resetSource = fs.readFileSync(new URL("../app/(auth)/reset-password/page.tsx", import.meta.url), "utf8");
const formSource = fs.readFileSync(new URL("../components/auth-form.tsx", import.meta.url), "utf8");
const layoutSource = fs.readFileSync(new URL("../components/auth-layout.tsx", import.meta.url), "utf8");
const languageSwitcherSource = fs.readFileSync(new URL("../components/auth-language-switcher.tsx", import.meta.url), "utf8");
const globalStylesSource = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const adminEntrySources = [
  ["../app/(app)/admin/page.tsx", "/admin"],
  ["../app/(app)/admin/cards/page.tsx", "/admin/cards"],
  ["../app/(app)/admin/finance/page.tsx", "/admin/finance"],
  ["../app/(app)/admin/football-data/page.tsx", "/admin/football-data"],
  ["../app/(app)/admin/promotions/page.tsx", "/admin/promotions"],
] as const;

test("authentication copy is Portuguese for pt-BR and English for unsupported locales", () => {
  assert.equal(normalizeTouchLineAuthLocale("pt-BR"), "pt-BR");
  assert.equal(normalizeTouchLineAuthLocale("fr-FR"), "en-GB");
  assert.equal(getTouchLineAuthCopy("pt-BR").login.title, "Entre na Arena");
  assert.equal(getTouchLineAuthCopy("pt-BR").form.password, "Senha");
  assert.equal(getTouchLineAuthCopy("pt-BR").reset.title, "Defina uma nova senha.");
  assert.equal(getTouchLineAuthCopy("en-GB").login.title, "Enter the arena");
});

test("authentication destinations preserve the normalized locale", () => {
  assert.equal(touchLineAuthHref("/arena", "pt-BR"), "/arena?lang=pt-BR");
  assert.equal(touchlineArenaFirstEntryHref("pt-BR"), "/arena?lang=pt-BR&intro=first");
  assert.equal(touchLineAuthHref("/login?error=1", "pt-BR"), "/login?error=1&lang=pt-BR");
  assert.equal(touchLineAuthHref("/arena", "unknown"), "/arena?lang=en-GB");
  assert.equal(
    touchLinePostAuthHref("/market-transfer?contractPlayer=10&lang=en-GB", "pt-BR"),
    "/market-transfer?contractPlayer=10&lang=pt-BR",
  );
  assert.equal(
    touchLineAuthEntryHref("/login", "pt-BR", "/admin/finance?lang=pt-BR"),
    "/login?lang=pt-BR&returnTo=%2Fadmin%2Ffinance%3Flang%3Dpt-BR",
  );
  assert.equal(normalizeTouchLineAuthReturnTo("https://evil.example/steal"), null);
  assert.equal(normalizeTouchLineAuthReturnTo("/login?lang=pt-BR"), null);
  assert.equal(
    normalizeTouchLineAuthReturnTo("/club-owner/new-owner/substitution?lang=en-GB"),
    "/club-owner/new-owner/substitution?lang=en-GB",
  );
  assert.equal(normalizeTouchLineAuthReturnTo("/visual-qa/coach-card?lang=en-GB"), "/visual-qa/coach-card?lang=en-GB");
});

test("all authentication pages read lang and pass the locale to shared UI", () => {
  for (const source of [loginSource, registerSource, forgotSource]) {
    assert.match(source, /const \{ lang,[^}]*returnTo[^}]*\} = await searchParams/);
    assert.match(source, /normalizeTouchLineAuthLocale\(lang\)/);
    assert.match(source, /<AuthLayout[^>]*locale=\{locale\}/);
    assert.match(source, /<AuthForm[^>]*locale=\{locale\}/);
  }
  assert.match(resetSource, /const \{ lang \} = await searchParams/);
  assert.match(resetSource, /normalizeTouchLineAuthLocale\(lang\)/);
  assert.match(resetSource, /<AuthLayout[^>]*locale=\{locale\}/);
  assert.match(resetSource, /<ResetPasswordForm[^>]*locale=\{locale\}/);
});

test("form links and authentication callbacks retain the selected language", () => {
  assert.match(formSource, /const arenaHref = touchLinePostAuthHref\(normalizedReturnTo, normalizedLocale\)/);
  assert.match(formSource, /normalizeTouchLineAuthReturnTo\(returnTo\)/);
  assert.match(formSource, /touchLineAuthEntryHref\("\/forgot-password", normalizedLocale, normalizedReturnTo\)/);
  assert.match(formSource, /emailRedirectTo: buildTouchLineAuthCallbackUrl\(firstEntryHref\)/);
  assert.match(formSource, /const resetPasswordHref = touchLineAuthHref\("\/reset-password", normalizedLocale\)/);
  assert.match(formSource, /resetPasswordForEmail\([\s\S]*buildTouchLineAuthCallbackUrl\(resetPasswordHref\)/);
  assert.match(formSource, /signInWithOAuth\([\s\S]*mode === "register" \? firstEntryHref : arenaHref/);
  assert.match(formSource, /resolveTouchLineAuthOrigin/);
  assert.match(formSource, /NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN/);
  assert.doesNotMatch(formSource, /touchline-football-platform/);
  assert.match(layoutSource, /const publicArenaHref = touchLineAuthHref\("\/touchline-clubs\/manchester-united", normalizedLocale\)/);
  assert.match(layoutSource, /<Logo href=\{publicArenaHref\}/);
  assert.match(layoutSource, /<Link href=\{publicArenaHref\}/);
  assert.match(layoutSource, /<AuthLanguageSwitcher locale=\{normalizedLocale\}/);
  assert.match(languageSwitcherSource, /destination\.searchParams\.set\("lang", nextLocale\)/);
  assert.match(languageSwitcherSource, /TOUCHLINE_LOCALE_STORAGE_KEY/);
  assert.match(languageSwitcherSource, /"pt-BR"/);
  assert.match(languageSwitcherSource, /"en-GB"/);
});

test("public club exploration opens Manchester United in the selected language", () => {
  assert.match(formSource, /touchLineAuthHref\("\/touchline-clubs\/manchester-united", normalizedLocale\)/);
  assert.doesNotMatch(formSource, /touchline-clubs\/crystal-palace/);
});

test("login and registration clearly link to each other", () => {
  assert.match(formSource, /const loginHref = touchLineAuthEntryHref\("\/login", normalizedLocale, normalizedReturnTo\)/);
  assert.match(formSource, /const registerHref = touchLineAuthEntryHref\("\/register", normalizedLocale, normalizedReturnTo\)/);
  assert.match(formSource, /copy\.newToTouchLine/);
  assert.match(formSource, /copy\.alreadyRegistered/);
  assert.match(formSource, /href=\{registerHref\}/);
  assert.match(formSource, /href=\{loginHref\}/);
});

test("owner administration preserves its intended destination through login", () => {
  for (const [path, returnTo] of adminEntrySources) {
    const source = fs.readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /touchLineAuthEntryHref/);
    assert.ok(source.includes(`touchLineAuthEntryHref("/login", locale, touchLineAuthHref("${returnTo}", locale))`));
    assert.doesNotMatch(source, /href="\/login"/);
  }
});

test("owner administration keeps the selected locale for internal and login navigation", () => {
  const sources = [
    "../app/(app)/admin/page.tsx",
    "../app/(app)/admin/analytics/page.tsx",
    "../app/(app)/admin/cards/page.tsx",
    "../app/(app)/admin/finance/page.tsx",
    "../app/(app)/admin/football-data/page.tsx",
    "../app/(app)/admin/promotions/page.tsx",
  ];
  for (const path of sources) {
    const source = fs.readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /normalizeTouchLineAuthLocale/);
    assert.match(source, /touchLineAuthHref/);
  }
});

test("email registration becomes a dedicated confirmation screen", () => {
  assert.match(formSource, /const \[registrationConfirmationEmail, setRegistrationConfirmationEmail\]/);
  assert.match(formSource, /setRegistrationConfirmationEmail\(normalizedEmail\)/);
  assert.match(formSource, /mode === "register" && registrationConfirmationEmail/);
  assert.match(formSource, /copy\.registrationCompleteTitle/);
  assert.match(formSource, /copy\.registrationCompleteHint/);
  assert.match(formSource, /supabase\.auth\.resend\(/);
  assert.match(formSource, /type: "signup"/);
  assert.match(formSource, /copy\.resendConfirmation/);
  assert.match(formSource, /copy\.confirmationResent/);
  assert.match(formSource, /buildTouchLineAuthCallbackUrl\(firstEntryHref\)/);
  assert.match(formSource, /copy\.useAnotherEmail/);
  assert.match(getTouchLineAuthCopy("pt-BR").form.registrationCompleteTitle, /Confira seu e-mail/);
  assert.match(getTouchLineAuthCopy("pt-BR").form.resendConfirmation, /Reenviar/);
});

test("email, Google, Apple and Facebook access are supported and social buttons stay gated", () => {
  assert.match(formSource, /type SocialAuthProvider = "google" \| "apple" \| "facebook"/);
  assert.match(formSource, /NEXT_PUBLIC_ENABLE_GOOGLE_AUTH/);
  assert.match(formSource, /NEXT_PUBLIC_ENABLE_APPLE_AUTH/);
  assert.match(formSource, /NEXT_PUBLIC_ENABLE_FACEBOOK_AUTH/);
  assert.match(formSource, /enabledSocialProviders/);
  assert.match(formSource, /provider,\s*options:/);
  assert.match(formSource, /copy\.continueWithGoogle/);
  assert.match(formSource, /copy\.continueWithApple/);
  assert.match(formSource, /copy\.continueWithFacebook/);
});

test("login remains a returning entry while every registration continuation requests first entry", () => {
  const loginFlow = formSource.slice(
    formSource.indexOf('if (mode === "login")'),
    formSource.indexOf('} else if (mode === "register")'),
  );
  const registrationFlow = formSource.slice(
    formSource.indexOf('} else if (mode === "register")'),
    formSource.indexOf("} else {", formSource.indexOf('} else if (mode === "register")') + 1),
  );

  assert.match(loginFlow, /await enterArena\(arenaHref\)/);
  assert.doesNotMatch(loginFlow, /enterArena\(firstEntryHref\)/);
  assert.match(registrationFlow, /emailRedirectTo: buildTouchLineAuthCallbackUrl\(firstEntryHref\)/);
  assert.match(registrationFlow, /await enterArena\(firstEntryHref\)/);
  assert.match(formSource, /mode === "register" \? firstEntryHref : arenaHref/);
});

test("invalid or expired confirmation callbacks show a clear localized recovery message", () => {
  assert.match(loginSource, /error === "auth_callback" \? "auth_callback" : null/);
  assert.match(formSource, /initialError === "auth_callback" \? copy\.confirmationLinkError/);
  assert.match(getTouchLineAuthCopy("pt-BR").form.confirmationLinkError, /inválido ou expirou/);
});

test("Arena navigation uses a short accessible route transition before changing pages", () => {
  const transitionStart = formSource.indexOf("async function enterArena");
  const transitionEnd = formSource.indexOf("async function submit", transitionStart);
  const transitionFlow = formSource.slice(transitionStart, transitionEnd);

  assert.ok(transitionStart >= 0 && transitionEnd > transitionStart);
  assert.match(transitionFlow, /window\.matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(transitionFlow, /setIsArenaTransitioning\(true\)/);
  assert.match(transitionFlow, /reducedMotion \? 40 : 280/);
  assert.ok(transitionFlow.indexOf("setIsArenaTransitioning(true)") < transitionFlow.indexOf("router.push(href)"));
  assert.match(formSource, /auth-route-transition\$\{isArenaTransitioning \? " is-active" : ""\}/);
  assert.match(formSource, /aria-hidden="true"/);
  assert.match(globalStylesSource, /\.auth-route-transition \{[\s\S]*?pointer-events: none;[\s\S]*?transition: opacity 280ms/);
  assert.match(globalStylesSource, /\.auth-route-transition\.is-active \{[\s\S]*?opacity: 1;/);
  assert.match(globalStylesSource, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.auth-route-transition \{ transition-duration: 1ms; \}/);
});
