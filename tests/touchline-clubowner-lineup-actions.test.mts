import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gameweek = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const card = readFileSync(new URL("../components/touchline/fantasy/TouchlineGameweekCard.tsx", import.meta.url), "utf8");
const zoom = readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.module.css", import.meta.url), "utf8");

test("ClubOwner card details retain replace and remove controls while the market is locked", () => {
  assert.match(gameweek, /replacementAction=\{selection \? \{ label: `\$\{workflowCopy\.replace\} · \$\{card\.name\}`, disabled: !editable \|\| saving/);
  assert.match(gameweek, /removalAction=\{selection \? \{ label: `\$\{workflowCopy\.remove\} · \$\{card\.name\}`, disabled: !editable \|\| saving \|\| \(collectionEnabled && !collectionSlotsEditable\), onSelect: \(\) => removePlayer\(selection\.playerId\)/);
  assert.match(gameweek, /lockedReason=\{selection && !editable \? lockedZoomReason : undefined\}/);
  assert.match(card, /removalAction\?: \{ label: string; onSelect: \(\) => void; disabled\?: boolean \}/);
  assert.match(card, /removalAction=\{removalAction\}/);
  assert.match(card, /lockedReason=\{lockedReason\}/);
  assert.match(zoom, /flushSync\(\(\) => setIsOpen\(false\)\);\s*triggerRef\.current\?\.focus\(\{ preventScroll: true \}\);\s*removalAction\.onSelect\(\)/);
  assert.match(zoom, /lockedReason \? <p className=\{styles\.lineupLockReason\} role="status"/);
  assert.match(styles, /\.lineupActions \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.lineupActions \.contractAction:disabled/);
  assert.match(styles, /\.removalAction \{[^}]*border-color: rgba\(255, 124, 133, \.58\)/);
});
