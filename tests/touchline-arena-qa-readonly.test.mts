import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { isTouchlineQaReadOnlyMutationBlocked } from "../lib/touchlineArena/qa-canonical-persona.ts";

const arenaPageSource = fs.readFileSync(new URL("../app/arena/page.tsx", import.meta.url), "utf8");

test("retired Arena entry cannot expose a QA editor or mutation surface", () => {
  assert.ok(arenaPageSource.includes('redirect(`/intro?'));
  assert.doesNotMatch(arenaPageSource, /ArenaClient|qaEditor|qaReadOnly|loadTouchline|createClient/);
});

test("QA read-only mutation policy fails closed", () => {
  assert.equal(isTouchlineQaReadOnlyMutationBlocked(true), true);
  assert.equal(isTouchlineQaReadOnlyMutationBlocked(false), false);
});
