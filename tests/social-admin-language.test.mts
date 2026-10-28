import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { socialAdminLanguage, socialAdminDate, socialAdminState, socialAdminError } from "../lib/touchlineArena/social-admin-language.ts";

test("social administration uses the canonical two-locale normalizer", () => {
  assert.equal(socialAdminLanguage("pt-BR").locale, "pt-BR");
  assert.equal(socialAdminLanguage("pt").locale, "en-GB");
  assert.equal(socialAdminLanguage("en").locale, "en-GB");
  assert.equal(socialAdminLanguage("unsupported").locale, "en-GB");
  assert.equal(socialAdminLanguage("pt-BR").t("Publicações sociais"), "Publicações sociais");
  assert.equal(socialAdminLanguage("en-GB").t("Publicações sociais"), "Social publications");
});

test("known API rejection messages have PT/EN presentation without changing server contracts", () => {
  const fallback = "A revisão não pôde ser registrada.";
  for (const file of ["review", "template-policy"]) {
    const source = ts.createSourceFile(`${file}.ts`, readFileSync(`app/api/admin/social-publications/${file}/route.ts`, "utf8"), ts.ScriptTarget.Latest, true);
    let messages = 0;
    function visit(node: ts.Node) {
      if (ts.isPropertyAssignment(node) && node.name.getText(source) === "error") {
        function strings(value: ts.Node) {
          if (ts.isStringLiteral(value)) {
            assert.notEqual(socialAdminError(value.text, "pt-BR", fallback), value.text);
            assert.equal(socialAdminError(value.text, "en-GB", fallback), value.text);
            messages++;
          }
          ts.forEachChild(value, strings);
        }
        strings(node.initializer);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(messages > 10, `${file}: real denial/error messages inspected`);
  }
});

test("social dates never render Invalid Date and use a fixed timezone", () => {
  for (const locale of ["pt-BR", "en-GB"] as const) {
    assert.equal(socialAdminDate(null, locale), "—");
    assert.equal(socialAdminDate("invalid", locale), "—");
    assert.equal(socialAdminDate("", locale), "—");
    assert.doesNotMatch(socialAdminDate("2026-10-27T12:00:00Z", locale), /Invalid Date/);
    assert.match(socialAdminDate("2026-10-27T12:00:00Z", locale), /13:00/);
  }
});

test("states and errors are localized without exposing unknown backend diagnostics", () => {
  assert.equal(socialAdminState("REVIEW_REQUIRED", "pt-BR"), "Revisão necessária");
  assert.equal(socialAdminState("REVIEW_REQUIRED", "en-GB"), "Review required");
  assert.equal(socialAdminError("Owner access required.", "pt-BR", "A revisão não pôde ser registrada."), "Acesso do proprietário necessário.");
  assert.equal(socialAdminError("PRIVATE_FAILURE_SENTINEL", "en-GB", "A revisão não pôde ser registrada."), "The review could not be recorded. Check its history before trying again.");
});
