import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const files = [
  "components/admin-promotions-actions.tsx",
  "components/admin-card-inventory-actions.tsx",
];

test("admin action components keep state language-neutral for PT to EN rerender", () => {
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    // A translated label must be derived in render. Storing it in useState
    // leaves stale PT text after the same mounted component receives EN props.
    assert.doesNotMatch(source, /useState\(pt\s*\?/);
    assert.match(source, /locale === "pt-BR"/);
    assert.match(source, /busy|success|error/);
  }
});

test("admin action contracts preserve one request per action", () => {
  const promotions = readFileSync(files[0], "utf8");
  const cards = readFileSync(files[1], "utf8");
  assert.equal((promotions.match(/fetch\("\/api\/admin\/promotions"/g) ?? []).length, 3);
  assert.equal((cards.match(/fetch\("\/api\/admin\/cards"/g) ?? []).length, 2);
  assert.match(promotions, /action: "create_promotion"/);
  assert.match(promotions, /action: "grant_credit"/);
  assert.match(cards, /method: "PATCH"/);
});
