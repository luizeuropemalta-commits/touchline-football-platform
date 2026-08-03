import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeTouchlineCountryCode3,
  touchlineCountryCode3FromName,
  touchlineCountryFlagUrl,
} from "../lib/touchlineArena/country-flags.ts";

describe("TouchLine country flags", () => {
  it("normalizes provider ISO codes to the card codes", () => {
    assert.equal(normalizeTouchlineCountryCode3("CHE"), "SUI");
    assert.equal(normalizeTouchlineCountryCode3("URY"), "URU");
    assert.equal(normalizeTouchlineCountryCode3("WLS"), "WAL");
    assert.equal(normalizeTouchlineCountryCode3("DZA"), "ALG");
  });

  it("keeps the four UK football nationalities separate", () => {
    assert.equal(touchlineCountryFlagUrl("ENG"), "/touchlineArena/shared/country-flags-4x3/gb-eng.svg");
    assert.equal(touchlineCountryFlagUrl("SCO"), "/touchlineArena/shared/country-flags-4x3/gb-sct.svg");
    assert.equal(touchlineCountryFlagUrl("WAL"), "/touchlineArena/shared/country-flags-4x3/gb-wls.svg");
    assert.equal(touchlineCountryFlagUrl("NIR"), "/touchlineArena/shared/country-flags-4x3/gb-nir.svg");
  });

  it("maps football codes that differ from ISO alpha-3 to the local flag bank", () => {
    assert.equal(touchlineCountryFlagUrl("NED"), "/touchlineArena/shared/country-flags-4x3/nl.svg");
    assert.equal(touchlineCountryFlagUrl("GER"), "/touchlineArena/shared/country-flags-4x3/de.svg");
    assert.equal(touchlineCountryFlagUrl("POR"), "/touchlineArena/shared/country-flags-4x3/pt.svg");
    assert.equal(touchlineCountryFlagUrl("SUI"), "/touchlineArena/shared/country-flags-4x3/ch.svg");
  });

  it("resolves countries outside the original Premier roster from the local world bank", () => {
    assert.equal(normalizeTouchlineCountryCode3("ZA"), "ZAF");
    assert.equal(touchlineCountryFlagUrl("ZAF"), "/touchlineArena/shared/country-flags-4x3/za.svg");
    assert.equal(touchlineCountryFlagUrl("PHL"), "/touchlineArena/shared/country-flags-4x3/ph.svg");
    assert.equal(touchlineCountryFlagUrl("IND"), "/touchlineArena/shared/country-flags-4x3/in.svg");
  });

  it("derives codes from provider nationality names", () => {
    assert.equal(touchlineCountryCode3FromName("Republic of Ireland"), "IRL");
    assert.equal(touchlineCountryCode3FromName("Bosnia and Herzegovina"), "BIH");
    assert.equal(touchlineCountryCode3FromName("Trinidad and Tobago"), "TRI");
  });
});
