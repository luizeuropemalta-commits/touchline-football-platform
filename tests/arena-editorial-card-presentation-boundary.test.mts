import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const exactCard = readFileSync(
  new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url),
  "utf8",
);

test("the shared exact card renders a frozen contract tier without widening unpublished-card access", () => {
  const presentation = exactCard.slice(
    exactCard.indexOf("const editorialCard = player.editorialCard ?? null;"),
    exactCard.indexOf("const assignedVisualTemplateUrl"),
  );
  const renderGate = exactCard.slice(
    exactCard.indexOf("// Real football data is rendered"),
    exactCard.indexOf("return (", exactCard.indexOf("// Real football data is rendered")),
  );

  assert.match(presentation, /player\.cardPriceAuthority === "active-contract"/);
  assert.match(presentation, /const marketTier = editorialTier \?\? contractedTier \?\? inventoryPreviewTier/);
  assert.doesNotMatch(presentation, /marketValue|resolveTouchlineVerifiedPlayerEconomy/);
  assert.match(renderGate, /!editorialCard && !contractedTier && !allowVisualInventoryPreview/);
});
