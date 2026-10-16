import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const card = read("components/touchline/cards/TouchlineEliteExactCard.tsx");

test("mixed player-card galleries reserve the same scaled award headroom without changing pitch defaults", () => {
  assert.ok(card.includes('max(${hasHeadAward ? 1 : 0}, var(--touchline-card-reserve-head-award, 0))'));
  assert.match(card, /margin: hasStaticRenderScale/);
  assert.match(card, /goldenBallRenderScale\} \* \$\{headAwardScale/);
  const leaders = read("components/touchline/ClubHubOfficialLineup.module.css");
  assert.match(leaders, /positionLeaders > \[data-clubhub-card-spotlight\^="position-"\] \{\s*--touchline-card-reserve-head-award: 1;\s*align-self: stretch;/);
  assert.match(read("components/touchline/ClubHubSquadGrid.module.css"), /--touchline-card-reserve-head-award: 1/);
});

test("awards remain visible and authority-controlled rather than removed to align cards", () => {
  assert.match(card, /const hasHeadAward = hasGoldenBall \|\| hasGoldenBoot/);
  assert.match(card, /data-touchline-player-golden-ball="true"/);
  assert.match(card, /overflow: "visible"/);
});
