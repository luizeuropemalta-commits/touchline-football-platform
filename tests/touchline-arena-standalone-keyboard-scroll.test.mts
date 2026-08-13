import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const source = await readFile(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");

describe("TouchLine standalone panel keyboard scrolling", () => {
  it("routes vertical keyboard navigation to the actual Market/Quick Sub scroll container", () => {
    assert.match(source, /const actionLayerRef = useRef<HTMLElement \| null>\(null\)/);
    assert.match(source, /ref=\{actionLayerRef\} className="arena-action-layer"/);
    assert.match(source, /scrollStandalonePanelWithKeyboard/);
    assert.match(source, /event\.key === "ArrowDown"/);
    assert.match(source, /event\.key === "ArrowUp"/);
    assert.match(source, /event\.key === "PageDown"/);
    assert.match(source, /event\.key === "PageUp"/);
    assert.match(source, /scrollContainer\.scrollTo\(\{ top: nextTop, behavior: "smooth" \}\)/);
    assert.match(source, /window\.addEventListener\("keydown", scrollStandalonePanelWithKeyboard, true\)/);
  });

  it("does not take keyboard control away from editable fields", () => {
    assert.match(source, /event\.target instanceof HTMLInputElement/);
    assert.match(source, /event\.target instanceof HTMLSelectElement/);
    assert.match(source, /event\.target instanceof HTMLTextAreaElement/);
  });

  it("keeps a mixed-club Market cart when the club browser changes", () => {
    const marketClubHandlerStart = source.indexOf("if (club.teamId === selectedBuilderClubKey) return;");
    const marketClubClick = marketClubHandlerStart >= 0
      ? source.slice(marketClubHandlerStart, marketClubHandlerStart + 1_500)
      : "";
    assert.ok(marketClubClick, "expected the Market club-switch handler");
    assert.match(marketClubClick, /setSelectedBuilderClubKey\(club\.teamId\)/);
    assert.doesNotMatch(marketClubClick, /setMarketCartPlayers\(\[\]\)/);
  });
});
