import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gameweek = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const card = readFileSync(new URL("../components/touchline/fantasy/TouchlineGameweekCard.tsx", import.meta.url), "utf8");
const zoom = readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.module.css", import.meta.url), "utf8");

test("ClubOwner card details offer replace and local removal side by side while the market is editable", () => {
  assert.match(gameweek, /replacementAction=\{editable && selection \? \{ label: `\$\{workflowCopy\.replace\} · \$\{card\.name\}`/);
  assert.match(gameweek, /removalAction=\{editable && selection \? \{ label: `\$\{workflowCopy\.remove\} · \$\{card\.name\}`, disabled: saving, onSelect: \(\) => removePlayer\(selection\.playerId\)/);
  assert.match(card, /removalAction\?: \{ label: string; onSelect: \(\) => void; disabled\?: boolean \}/);
  assert.match(card, /removalAction=\{removalAction\}/);
  assert.match(zoom, /flushSync\(\(\) => setIsOpen\(false\)\);\s*removalAction\.onSelect\(\)/);
  assert.match(styles, /\.lineupActions \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.removalAction \{[^}]*border-color: rgba\(255, 124, 133, \.58\)/);
});
