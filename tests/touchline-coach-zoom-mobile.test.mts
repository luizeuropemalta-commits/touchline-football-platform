import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("coach zoom keeps its crest inside the authored layer on a phone", () => {
  const zoom = readFileSync(new URL("../components/touchline/cards/TouchlineCoachCardZoom.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.module.css", import.meta.url), "utf8");
  assert.match(zoom, /expandedContent=\{\s*<TouchlineCoachCard/);
  assert.match(css, /\.expandedCard :global\(\[data-coach-card-display="default"\]\) :global\(\[data-touchline-card-crest-host="true"\]\) \{[^}]*width: min\(100%, var\(--coach-crest-size, 132px\)\);[^}]*aspect-ratio: 1;/s);
  assert.match(css, /\.expandedCard :global\(\[data-coach-card-display="default"\]\) :global\(\[data-touchline-card-crest-host="true"\] > img\) \{[^}]*width: 100%;[^}]*height: 100%;[^}]*max-width: 100%;/s);
  assert.match(css, /@media \(max-width: 720px\) \{[\s\S]*?\.panelWithDetails \{[^}]*width: min\(390px, calc\(100vw - 28px\)\)/);
});
