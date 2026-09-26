import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";

test("notification ball retains the exact in-card ball paths", () => {
  const card = readFileSync(new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url), "utf8");
  const ball = card.slice(card.indexOf("function FootballBallStatIcon"), card.indexOf("function FootballBootStatIcon"));
  const svg = readFileSync(new URL("../public/icons/touchline-event-goal.svg", import.meta.url), "utf8");
  const paths = (text: string) => [...text.matchAll(/<path d="([^"]+)"/g)].map(match => match[1]);
  assert.equal(paths(ball).length, 2);
  assert.deepEqual(paths(svg), paths(ball));
  assert.match(svg, /<circle cx="16" cy="16" r="12.5" stroke-width="1.8"/);
});

test("native event PNGs match their local vector sources at192px", async () => {
  for (const name of ["goal", "red-card"]) {
    const svg = readFileSync(new URL(`../public/icons/touchline-event-${name}.svg`, import.meta.url));
    const png = readFileSync(new URL(`../public/icons/touchline-event-${name}.png`, import.meta.url));
    const metadata = await sharp(png).metadata();
    assert.equal(metadata.format, "png");
    assert.equal(metadata.width, 192);
    assert.equal(metadata.height, 192);
    assert.deepEqual(await sharp(png).ensureAlpha().raw().toBuffer(), await sharp(svg).ensureAlpha().raw().toBuffer());
    assert.doesNotMatch(svg.toString(), /<script|<foreignObject|(?:href|src)=/);
  }
});
