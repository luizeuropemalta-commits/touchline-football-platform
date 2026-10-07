import assert from "node:assert/strict";
import test from "node:test";
import { TOUCHLINE_COMPLETE_LOCALES, isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { getTouchLineAuthCopy } from "../lib/touchlineArena/auth-i18n.ts";
import { TOUCHLINE_AUTH_DRAFT_STATE, touchlineAuthDrafts } from "../lib/touchlineArena/locale-catalogues/auth-drafts.ts";

function placeholders(value: string) {
  return [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort();
}

function assertAuthDraftIntegrity(source: unknown, translation: unknown, path: string): void {
  if (typeof source === "string") {
    assert.equal(typeof translation, "string", `${path}: expected string`);
    assert.ok(typeof translation === "string");
    assert.ok(translation.trim(), `${path}: empty translation`);
    assert.deepEqual(placeholders(translation), placeholders(source), `${path}: placeholder contract`);
    if (source.length > 40) assert.notEqual(translation, source, `${path}: accidental English fallback`);
    return;
  }
  if (Array.isArray(source)) {
    assert.ok(Array.isArray(translation), `${path}: expected array`);
    assert.equal(translation.length, source.length, `${path}: array length`);
    source.forEach((entry, index) => assertAuthDraftIntegrity(entry, translation[index], `${path}[${index}]`));
    return;
  }
  assert.ok(source && typeof source === "object" && !Array.isArray(source), `${path}: expected source group`);
  assert.ok(translation && typeof translation === "object" && !Array.isArray(translation), `${path}: expected translated group`);
  const sourceEntries = Object.entries(source as Record<string, unknown>);
  assert.deepEqual(Object.keys(translation as Record<string, unknown>).sort(), sourceEntries.map(([key]) => key).sort(), `${path}: key coverage`);
  sourceEntries.forEach(([key, value]) => assertAuthDraftIntegrity(value, (translation as Record<string, unknown>)[key], `${path}.${key}`));
}

test("tr-TR auth draft has Turkish copy, no empty or long English fallbacks, and preserves contracts", () => {
  const source = getTouchLineAuthCopy("en-GB");
  const copy = touchlineAuthDrafts["tr-TR"];

  assertAuthDraftIntegrity(source, copy, "tr-TR.auth");
  assert.match(copy.form.terms, /Koşulları ve Gizlilik Politikasını/);
  assert.match(copy.form.terms, /parolaları, mesajları veya yazılan içerikleri asla ölçmez/);
  assert.equal(copy.form.emailPlaceholder, "ad@example.com");
  assert.equal(copy.form.continueWithGoogle, "Google ile devam et");
  assert.equal(copy.layout.features[2], "ClubOwner ve canlı sıralamalar");
  const cinematicTitle = `${copy.layout.cinematicTitleTop} ${copy.layout.cinematicTitleBottom}`;
  assert.equal(cinematicTitle, "TouchLine’a giriş yapın");
  assert.equal(cinematicTitle.match(/TouchLine/g)?.length, 1);
});

test("tr-TR auth remains an unpublished draft", () => {
  assert.equal(TOUCHLINE_AUTH_DRAFT_STATE, "draft");
  assert.deepEqual([...TOUCHLINE_COMPLETE_LOCALES], ["en-GB", "pt-BR"]);
  assert.equal(isTouchLineLocaleComplete("tr-TR"), false);
});
