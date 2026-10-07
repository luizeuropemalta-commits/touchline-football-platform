import assert from "node:assert/strict";
import test from "node:test";
import {
  TOUCHLINE_APPROVED_LOCALES, TOUCHLINE_COMPLETE_LOCALES, isTouchLineLocaleComplete,
  normalizeTouchLineLocale, touchLineT, type TouchLineTranslationKey,
} from "../lib/touchlineArena/i18n.ts";
import {
  TOUCHLINE_PRESENTATION_LOCALES, resolveTouchLinePresentationLocale,
  resolveTouchLineSavedPresentationLocale, resolveTouchLineRootLocale,
  touchlineLocaleRequestNeedsCanonicalRedirect, touchlineDocumentDirection,
} from "../lib/touchlineArena/root-locale.ts";
import {
  TOUCHLINE_CORE_DRAFT_STATE, TOUCHLINE_DRAFT_LOCALES, touchlineCoreDrafts,
} from "../lib/touchlineArena/locale-catalogues/core-drafts.ts";

const expectedLocales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;

test("central opt-in accepts exactly eight without changing the public completeness contract", () => {
  assert.deepEqual(TOUCHLINE_COMPLETE_LOCALES,["en-GB","pt-BR"]);
  assert.deepEqual(TOUCHLINE_PRESENTATION_LOCALES,["en-GB","pt-BR"]);
  assert.deepEqual(TOUCHLINE_APPROVED_LOCALES.map(({code})=>code),expectedLocales);
  assert.equal(TOUCHLINE_CORE_DRAFT_STATE,"draft");
  for(const code of expectedLocales) {
    const publiclyComplete=code==="en-GB"||code==="pt-BR";
    const publicLocale=code==="pt-BR"?"pt-BR":"en-GB";
    assert.equal(isTouchLineLocaleComplete(code),publiclyComplete);
    assert.equal(normalizeTouchLineLocale(code),publicLocale);
    assert.equal(normalizeTouchLineLocale(code,false),publicLocale);
    assert.equal(normalizeTouchLineLocale(code,true),code);
    assert.equal(resolveTouchLinePresentationLocale(code),publicLocale);
    assert.equal(resolveTouchLinePresentationLocale(code,false),publicLocale);
    assert.equal(resolveTouchLinePresentationLocale(code,true),code);
    assert.equal(resolveTouchLineRootLocale(code),publicLocale);
    assert.equal(resolveTouchLineRootLocale(code,true),code);
    assert.equal(resolveTouchLineSavedPresentationLocale(code),publiclyComplete?code:null);
    assert.equal(resolveTouchLineSavedPresentationLocale(code,true),code);
    assert.equal(touchlineLocaleRequestNeedsCanonicalRedirect(code),!publiclyComplete);
    assert.equal(touchlineLocaleRequestNeedsCanonicalRedirect(code,true),false);
  }
});

test("opt-in reuses every authored core draft string verbatim; omitted flag still renders public English", () => {
  for(const locale of TOUCHLINE_DRAFT_LOCALES) {
    const catalogue=touchlineCoreDrafts[locale];
    for(const key of Object.keys(catalogue) as TouchLineTranslationKey[]) {
      assert.equal(touchLineT(locale,key,true),catalogue[key],`${locale}/${key}`);
      assert.equal(touchLineT(locale,key),touchLineT("en-GB",key),`default ${locale}/${key}`);
      assert.equal(touchLineT(locale,key,false),touchLineT("en-GB",key));
      for(const publicLocale of ["en-GB","pt-BR"] as const) {
        assert.equal(touchLineT(publicLocale,key,true),touchLineT(publicLocale,key));
      }
    }
  }
});

test("invalid inputs stay safe and first query value alone owns the coordinated resolution", () => {
  for(const value of [undefined,null,"","ar","AR-SA"," ar-SA","ar-SA ","pt-br","constructor","__proto__","unknown"]) {
    for(const enabled of [false,true]) {
      assert.equal(normalizeTouchLineLocale(value,enabled),"en-GB");
      assert.equal(resolveTouchLinePresentationLocale(value,enabled),"en-GB");
      assert.equal(resolveTouchLineSavedPresentationLocale(value,enabled),null);
      assert.equal(touchlineLocaleRequestNeedsCanonicalRedirect(value,enabled),value!==undefined&&value!==null);
      assert.equal(touchLineT(value,"language",enabled),touchLineT("en-GB","language"));
    }
  }
  assert.equal(resolveTouchLinePresentationLocale(["ar-SA","pt-BR"],true),"ar-SA");
  assert.equal(resolveTouchLinePresentationLocale(["ar-SA","pt-BR"]),"en-GB");
  assert.equal(resolveTouchLineRootLocale(["unknown","pt-BR"],true),"en-GB");
  assert.equal(resolveTouchLinePresentationLocale([],true),"en-GB");
  assert.equal(touchlineLocaleRequestNeedsCanonicalRedirect([],true),false);
  assert.equal(touchlineLocaleRequestNeedsCanonicalRedirect(["ar-SA","invalid"],true),false);
  assert.equal(touchlineDocumentDirection("ar-SA"),"rtl","text direction is unchanged, not permission to mirror layout");
  assert.equal(touchlineDocumentDirection("pt-BR"),"ltr");
});
