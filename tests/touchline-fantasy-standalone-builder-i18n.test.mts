import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import {
  TOUCHLINE_FANTASY_STANDALONE_BUILDER_CATALOGUES as catalogues,
  TOUCHLINE_FANTASY_STANDALONE_BUILDER_DRAFT_LOCALES as drafts,
  TOUCHLINE_FANTASY_STANDALONE_BUILDER_DRAFT_STATUS as draftStatus,
  formatTouchlineFantasyStandaloneAlert,
  getTouchlineFantasyStandaloneBuilderCopy,
} from "../lib/touchlineFantasy/standalone-builder-i18n.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("standalone consumer uses the gated catalogue rather than a Portuguese/English branch", () => {
  const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
  assert.match(source, /getTouchlineFantasyStandaloneBuilderCopy\(locale, draftLocalesEnabled\)/);
  assert.doesNotMatch(source, /\bpt\s*\?/);
  assert.match(source, /formatTouchlineFantasyStandaloneAlert\(builderCopy, currentAlerts.length, editable\)/);
  const keys = [...source.matchAll(/builderCopy\.(\w+)/g)].map(match => match[1]);
  assert.ok(new Set(keys).size >= 70);
  for (const key of keys) assert.ok(key in catalogues["en-GB"], key);
  assert.doesNotMatch(source, />STEP [1-5]</);
});

test("standalone Fantasy builder has a complete authored draft for every approved locale", () => {
  assert.deepEqual(Object.keys(catalogues), locales);
  const keys = Object.keys(catalogues["en-GB"]);
  assert.equal(keys.length, 78);
  for (const locale of locales) {
    const copy = catalogues[locale];
    assert.deepEqual(Object.keys(copy), keys, locale);
    for (const [key, value] of Object.entries(copy)) {
      assert.ok(value.trim(), `${locale}.${key}`);
      assert.doesNotMatch(value, /TODO|FIXME|TBD/, `${locale}.${key}`);
      assert.equal(value.includes("{count}"), key === "absentPlayers", `${locale}.${key} count placeholder`);
      assert.equal(value.includes("{action}"), key === "absentPlayers", `${locale}.${key} action placeholder`);
    }
  }
  assert.equal(catalogues["ar-SA"].technicalArea, "المنطقة الفنية");
  assert.equal(catalogues["ar-SA"].selectPlayerFor, "اختر لاعبًا للمركز");
});

test("EN source and corrected Portuguese builder wording are pinned byte-for-byte", () => {
  assert.equal(digest(catalogues["en-GB"]), "fd4dcbcecae9fa1d63e2ffa29fd9a12d893c29b14bf21ab645544c18d6d41784");
  assert.equal(digest(catalogues["pt-BR"]), "d93a2d87db86e9f93129fb7e535297b31345af9708897c9efb28756ffc75fe11");
  assert.equal(catalogues["pt-BR"].lockedSnapshot, "ESCALAÇÃO BLOQUEADA");
  assert.equal(catalogues["pt-BR"].gameweek, "Rodada");
  assert.equal(catalogues["pt-BR"].rank, "POSIÇÃO");
  assert.equal(catalogues["pt-BR"].rulesKicker, "REGRAS DA RODADA TOUCHLINE");
  for (const step of [1, 2, 3, 4, 5] as const) {
    assert.equal(catalogues["pt-BR"][`step${step}`], `ETAPA ${step}`);
  }
  assert.equal(catalogues["en-GB"].heroTitle, "Build Your TouchLine Team");
  assert.equal(catalogues["pt-BR"].heroTitle, "Monte seu time TouchLine");
  assert.equal(catalogues["pt-BR"].deadlineRule, "Fecha no início da primeira partida; reabre após o apito final confirmado da última.");
  assert.equal(formatTouchlineFantasyStandaloneAlert(catalogues["pt-BR"], 2, false), "2 jogador(es) selecionado(s) não aparece(m) entre titulares ou banco. O prazo encerrou; a equipe permanece imutável.");
});

test("six additional locale drafts remain unavailable without the server-owned release gate", () => {
  assert.deepEqual(drafts, locales.slice(2));
  assert.equal(draftStatus, "draft");
  for (const locale of locales.slice(2)) {
    assert.equal(isTouchLineLocaleComplete(locale), false);
    assert.equal(getTouchlineFantasyStandaloneBuilderCopy(locale), catalogues["en-GB"]);
    assert.equal(getTouchlineFantasyStandaloneBuilderCopy(locale, true), catalogues[locale]);
  }
  assert.equal(getTouchlineFantasyStandaloneBuilderCopy("pt-BR"), catalogues["pt-BR"]);
  for (const locale of ["__proto__", "constructor", "ar-SA-extra", "", null, undefined]) {
    assert.equal(getTouchlineFantasyStandaloneBuilderCopy(locale), catalogues["en-GB"]);
  }
});

test("official-lineup alert placeholders resolve without punctuation or locale leakage", () => {
  for (const locale of locales) {
    const copy = catalogues[locale];
    const editable = formatTouchlineFantasyStandaloneAlert(copy, 3, true);
    const locked = formatTouchlineFantasyStandaloneAlert(copy, 3, false);
    for (const value of [editable, locked]) {
      assert.match(value, /3/);
      assert.doesNotMatch(value, /\{(?:count|action)\}/);
    }
    assert.ok(editable.endsWith(copy.canStillEdit), locale);
    assert.ok(locked.endsWith(copy.immutableAfterDeadline), locale);
  }
});
