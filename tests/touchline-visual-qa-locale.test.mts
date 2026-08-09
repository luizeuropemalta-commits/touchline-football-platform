import assert from "node:assert/strict";
import test from "node:test";

import { resolveTouchlineVisualQaLocale } from "../lib/touchlineArena/visual-qa-locale.ts";

test("visual QA fixtures render only the reviewed EN/PT locales", () => {
  assert.equal(resolveTouchlineVisualQaLocale("en-GB"), "en-GB");
  assert.equal(resolveTouchlineVisualQaLocale("pt-BR"), "pt-BR");
  assert.equal(resolveTouchlineVisualQaLocale("es-ES"), "en-GB");
  assert.equal(resolveTouchlineVisualQaLocale(undefined), "en-GB");
});
