import assert from "node:assert/strict";
import test from "node:test";

import { orderTouchlineBenchByPosition } from "../lib/touchlineArena/bench-presentation.ts";

test("bench presentation uses football positions and never market values or card prices", () => {
  const cards = [
    { name: "Forward", role: "forward" as const, position: "ST", marketValue: "€200M", price: 15 },
    { name: "Keeper", role: "goalkeeper" as const, position: "GK", marketValue: "€1M", price: 0 },
    { name: "Midfielder", role: "midfielder" as const, position: "CM", marketValue: "€150M", price: 10 },
    { name: "Defender", role: "defender" as const, position: "CB", marketValue: "€80M", price: 7 },
  ];

  assert.deepEqual(
    orderTouchlineBenchByPosition(cards).map((card) => card.name),
    ["Keeper", "Defender", "Midfielder", "Forward"],
  );
});
