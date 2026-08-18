import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ARENA_433_VIDEO_COORDINATES,
  ARENA_433_VIDEO_LOOP_IDS,
  ARENA_VIDEO_VIEWPORTS,
  arenaVideoViewportForDimensions,
  resolveArena433VideoSlots,
} from "../lib/touchlineArena/arena-formation-video-layout.ts";

const arenaSource = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");

const expectedRoleCounts = {
  goalkeeper: 1,
  defender: 4,
  midfielder: 3,
  forward: 3,
} as const;

test("the cinematic 4-3-3 has one canonical source for every loop and landscape viewport", () => {
  for (const loopId of ARENA_433_VIDEO_LOOP_IDS) {
    for (const viewport of ARENA_VIDEO_VIEWPORTS) {
      const layout = ARENA_433_VIDEO_COORDINATES[loopId][viewport];
      for (const [role, count] of Object.entries(expectedRoleCounts)) {
        const slots = layout[role as keyof typeof expectedRoleCounts];
        assert.equal(slots.length, count, `${loopId} ${viewport} ${role}`);
        for (const slot of slots) {
          assert.ok(slot.x >= 0 && slot.x <= 100);
          assert.ok(slot.y >= 0 && slot.y <= 100);
          assert.ok(slot.heightVh > 0);
        }
      }
    }
  }
});

test("the video resolver keeps the 1-4-3-3 player order without sharing a prior-loop slot", () => {
  const players = [
    { id: "gk", role: "goalkeeper" as const },
    ...Array.from({ length: 4 }, (_, index) => ({ id: `def-${index}`, role: "defender" as const })),
    ...Array.from({ length: 3 }, (_, index) => ({ id: `mid-${index}`, role: "midfielder" as const })),
    ...Array.from({ length: 3 }, (_, index) => ({ id: `fwd-${index}`, role: "forward" as const })),
  ];
  const wide = resolveArena433VideoSlots(players, "wide-touchline", "desktop");
  const sweep = resolveArena433VideoSlots(players, "side-sweep", "phone-landscape");

  assert.equal(wide.size, 11);
  assert.equal(sweep.size, 11);
  assert.deepEqual(wide.get("gk"), ARENA_433_VIDEO_COORDINATES["wide-touchline"].desktop.goalkeeper[0]);
  assert.deepEqual(sweep.get("fwd-2"), ARENA_433_VIDEO_COORDINATES["side-sweep"]["phone-landscape"].forward[2]);
  assert.notDeepEqual(wide.get("def-0"), sweep.get("def-0"));
});

test("real landscape dimensions select their explicit video viewport profile", () => {
  assert.equal(arenaVideoViewportForDimensions(1280, 800), "desktop");
  assert.equal(arenaVideoViewportForDimensions(1024, 768), "tablet-landscape");
  assert.equal(arenaVideoViewportForDimensions(844, 390), "phone-landscape");
});

test("Arena renders the protected 4-3-3 from the video layout instead of a saved camera drag", () => {
  assert.match(arenaSource, /resolveArena433VideoSlots\([\s\S]*?arenaFieldPlayersForRendering[\s\S]*?arenaVideoViewport/);
  assert.match(arenaSource, /const fieldPlayerPositions = new Map\(canonical433VideoPositions \?\? lockedCameraPositions \?\? projectedFieldPlayerPositions\)/);
  assert.match(arenaSource, /if \(cameraEditPositions && !canonical433VideoPositions\)/);
  assert.match(arenaSource, /const baseHeight = fieldPosition\.heightVh \?\? arenaLoopCameraProfile\(loopCameraIndex\)\.cardHeightVh/);
});
