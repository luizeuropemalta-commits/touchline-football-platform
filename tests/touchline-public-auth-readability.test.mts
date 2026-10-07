import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Rendered baseline 5d6131f: slate-600 back links and slate-500 descriptions
// have maximum contrast against black of about 2.78:1 and 4.41:1 respectively.
// These are source regressions, not a substitute for composed browser contrast.
for (const route of ["forgot-password", "reset-password", "register"] as const) {
  test(`${route} back action has a readable foreground and font while preserving its geometry and destination`, () => {
    const page = source(`app/(auth)/${route}/page.tsx`);
    const backLink = page.match(/<Link\s[\s\S]*?<\/Link>/)?.[0];
    assert.ok(backLink, "back link must remain available");
    assert.match(backLink, /(?:\s)text-sm(?:\s)/);
    assert.match(backLink, /min-h-11/);
    assert.match(backLink, route === "register" ? /text-slate-300/ : /text-slate-200/);
    assert.match(backLink, /\{copy\.back\}/);
    assert.doesNotMatch(backLink, /text-slate-[456]00|text-\[9px\]|opacity-|onClick=/);
    assert.ok(backLink.includes(route === "reset-password"
      ? 'href={touchLineAuthHref("/login", locale, publicRelease)}'
      : 'href={touchLineAuthEntryHref("/login", locale, returnTo, siteLocalesEnabled)}'));
    assert.ok(backLink.includes(route === "register" ? "mb-4" : "mb-8"));
    if (route === "register") {
      assert.match(backLink, /rounded-full border border-white\/10 bg-black\/20 px-3 py-2/);
      assert.match(backLink, /hover:border-\[#a3ff12\]\/30 hover:text-\[#c5ff6d\]/);
    } else assert.match(backLink, /rounded-xl px-2/);
    assert.doesNotMatch(page, /navigationStyles|style=\{\{ fontSize:/);
  });

  test(`${route} description has an opaque readable foreground without changing form composition`, () => {
    const page = source(`app/(auth)/${route}/page.tsx`);
    const description = page.match(/<p className="([^"]+)">\{copy\.description\}<\/p>/)?.[1];
    assert.ok(description, "localized description must remain present");
    assert.match(description, /(?:^| )text-slate-300(?: |$)/);
    assert.doesNotMatch(description, /text-slate-[456]00|opacity-|text-slate-300\//);
    assert.match(page, /normalizeTouchLineAuthLocale\(lang, (?:siteLocalesEnabled|publicRelease)\)/);
    assert.match(page, /draftLocalesEnabled = false/);
    if (route === "reset-password") assert.match(page, /<ResetPasswordForm locale=\{locale\} draftLocaleEnabled=\{draftLocalesEnabled\} siteLocalesEnabled=\{publicRelease\} \/>/);
    else assert.ok(page.includes(`<AuthForm mode="${route === "register" ? "register" : "forgot"}" locale={locale} returnTo={returnTo} draftLocaleEnabled={draftLocalesEnabled} siteLocalesEnabled={siteLocalesEnabled} />`));
    assert.ok(page.includes(route === "register" ? "<AuthLayout cinematic locale={locale} accountLocaleContext={accountLocaleContext}" : "<AuthLayout locale={locale} accountLocaleContext={accountLocaleContext}"));
    assert.match(page, /showArenaHomeLink=\{false\} draftLocalesEnabled=\{draftLocalesEnabled\} siteLocalesEnabled=\{(?:siteLocalesEnabled|publicRelease)\} keepLoginLayoutStable/);
  });
}
