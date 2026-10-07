import assert from "node:assert/strict";
import test from "node:test";
import { touchlineRegistrationEntryHref } from "../lib/touchlineArena/arena-onboarding.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"];

test("registration preserves all eight locales when site-wide presentation is explicitly enabled", () => {
  for (const locale of locales) {
    const destination = new URL(touchlineRegistrationEntryHref(null, locale, true), "https://touchline.test");
    assert.equal(destination.pathname, "/intro");
    assert.equal(destination.searchParams.get("lang"), locale);
    assert.equal(destination.searchParams.get("intro"), "first");
    assert.equal(destination.searchParams.get("onboarding"), "market");
  }
});

test("registration stays EN/PT without release opt-in, including forged URL flags", () => {
  for (const locale of locales) {
    const expected = locale === "pt-BR" ? "pt-BR" : "en-GB";
    for (const enabled of [undefined, false]) {
      const destination = new URL(touchlineRegistrationEntryHref("/intro?draftLocalesEnabled=true", locale, enabled), "https://touchline.test");
      assert.equal(destination.searchParams.get("lang"), expected);
    }
  }
});

test("registration release does not widen administration languages or trust external destinations", () => {
  for (const locale of locales) {
    for (const path of ["/admin", "/admin/finance", "/visual-qa/cards"]) {
      const destination = new URL(touchlineRegistrationEntryHref(path, locale, true), "https://touchline.test");
      assert.equal(destination.pathname, path);
      assert.equal(destination.searchParams.get("lang"), locale === "pt-BR" ? "pt-BR" : "en-GB");
    }
    const destination = new URL(touchlineRegistrationEntryHref("https://evil.test/", locale, true), "https://touchline.test");
    assert.equal(destination.origin, "https://touchline.test");
    assert.equal(destination.pathname, "/intro");
  }
});
