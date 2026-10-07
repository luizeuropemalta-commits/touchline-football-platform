import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

import {
  normalizeTouchLineAuthReturnTo,
  touchLineAuthHref,
  touchLinePostAuthHref,
} from "../lib/touchlineArena/auth-i18n.ts";
import {
  touchlineRegistrationEntryHref,
} from "../lib/touchlineArena/arena-onboarding.ts";

const authFormSource = readFileSync(new URL("../components/auth-form.tsx", import.meta.url), "utf8");

function registrationEntry(returnTo?: string, locale = "en-GB") {
  const statement = authFormSource.match(/const firstEntryHref = [\s\S]*?;/)?.[0];
  assert.ok(statement, "exercise the registration destination used by the real form");
  return new URL(runInNewContext(`${statement}\nfirstEntryHref`, {
    normalizedReturnTo: normalizeTouchLineAuthReturnTo(returnTo),
    normalizedLocale: locale,
    publicSiteLocalesEnabled: false,
    touchLineAuthHref,
    touchLinePostAuthHref,
    touchlineRegistrationEntryHref,
  }), "https://touchline.local");
}

test("new registration starts the complete official intro with an explicit onboarding marker", () => {
  const url = registrationEntry(undefined, "pt-BR");
  assert.equal(url.pathname, "/intro");
  assert.equal(url.searchParams.get("intro"), "first");
  assert.equal(url.searchParams.get("onboarding"), "market");
  assert.equal(url.searchParams.has("skipIntro"), false);
  assert.equal(url.searchParams.get("lang"), "pt-BR");
});

test("an ordinary registration return does not bypass the complete onboarding", () => {
  for (const returnTo of ["/my-club#squad", "/clubowner?team=123", "/arena?skipIntro=1", "/inbox"]) {
    const url = registrationEntry(returnTo);
    assert.equal(url.pathname, "/intro", returnTo);
    assert.equal(url.searchParams.get("intro"), "first", returnTo);
    assert.equal(url.searchParams.get("onboarding"), "market", returnTo);
    assert.equal(url.searchParams.has("skipIntro"), false, returnTo);
    assert.equal(url.hash, "", returnTo);
  }
});

test("reserved administrative and QA returns retain their existing destinations", () => {
  for (const returnTo of ["/admin?tab=owners#accounts", "/visual-qa/cards?club=123"]) {
    const url = registrationEntry(returnTo);
    assert.equal(`${url.pathname}${url.search}${url.hash}`, touchLinePostAuthHref(returnTo, "en-GB"));
  }
});

test("registration normalization cannot introduce an external redirect or an administrative prefix lookalike", () => {
  for (const returnTo of ["https://example.com", "//example.com/admin", "/admin-other", "/visual-qa-other"]) {
    assert.equal(touchlineRegistrationEntryHref(returnTo, "en-GB"), "/intro?intro=first&onboarding=market&lang=en-GB");
  }
});

test("login, signup confirmation/OAuth and recovery keep their distinct existing continuations", () => {
  assert.match(authFormSource, /const arenaHref = touchLinePostAuthHref\(normalizedReturnTo, normalizedLocale, "\/clubowner", publicSiteLocalesEnabled\)/);
  assert.match(authFormSource, /name="return_to" value=\{arenaHref\}/);
  assert.match(authFormSource, /emailRedirectTo: buildTouchLineAuthCallbackUrl\(firstEntryHref\)/);
  assert.match(authFormSource, /mode === "register" \? firstEntryHref : arenaHref/);
  assert.match(authFormSource, /const resetPasswordHref = touchLineAuthHref\("\/reset-password", normalizedLocale, publicSiteLocalesEnabled\)/);
  assert.match(authFormSource, /resetPasswordForEmail\([\s\S]*buildTouchLineAuthCallbackUrl\(resetPasswordHref\)/);
});
