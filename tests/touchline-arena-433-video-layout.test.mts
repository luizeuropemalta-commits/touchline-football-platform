import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ARENA_433_VIDEO_COORDINATES,
  ARENA_433_VIDEO_LOOP_CAMERA_BOUNDARIES,
  ARENA_433_VIDEO_LOOP_IDS,
  ARENA_VIDEO_VIEWPORTS,
  arena433VideoLoopIdForPlayback,
  arena433VideoLoopIndexForPlayback,
  arena433VideoLoopStartTime,
  arenaQaManualLayoutCameraId,
  arenaVideoViewportForDimensions,
  isArenaQaManualLayoutCameraId,
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
          assert.ok(slot.landmark.length > 0);
          assert.ok(slot.x >= 0 && slot.x <= 100);
          assert.ok(slot.y >= 0 && slot.y <= 100);
          assert.ok(slot.heightVh > 0);
        }
      }
    }
  }
});

test("each camera anchors 4-3-3 cards to filmed field landmarks instead of vertical lineup columns", () => {
  for (const loopId of ARENA_433_VIDEO_LOOP_IDS) {
    for (const viewport of ARENA_VIDEO_VIEWPORTS) {
      const layout = ARENA_433_VIDEO_COORDINATES[loopId][viewport];
      const fieldLines = [layout.defender, layout.midfielder, layout.forward];

      for (const line of fieldLines) {
        assert.ok(new Set(line.map((slot) => slot.x)).size > 1, `${loopId} ${viewport} has a lineup column`);
        assert.ok(new Set(line.map((slot) => slot.heightVh)).size > 1, `${loopId} ${viewport} has no depth scale`);
      }

      assert.equal(layout.goalkeeper[0]?.landmark, "left-goal-mouth");
      assert.equal(layout.goalkeeper[0]?.x, 12.5, `${loopId} ${viewport} goalkeeper remains centred in the goal mouth`);
      assert.ok(layout.goalkeeper[0]!.x < layout.defender[0]!.x, `${loopId} ${viewport} goalkeeper is behind defence`);
      assert.ok(layout.defender[0]!.x < layout.midfielder[0]!.x, `${loopId} ${viewport} defence is behind midfield`);
      assert.ok(layout.midfielder[0]!.x < layout.forward[0]!.x, `${loopId} ${viewport} midfield is behind attack`);
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

test("the media clock enters each canonical camera profile at its exact boundary", () => {
  const duration = 21;
  const [wide, lower, side] = ARENA_433_VIDEO_LOOP_CAMERA_BOUNDARIES;

  assert.equal(arena433VideoLoopIdForPlayback(0, duration), "wide-touchline");
  assert.equal(arena433VideoLoopIdForPlayback((wide.until * duration) - 0.001, duration), "wide-touchline");
  assert.equal(arena433VideoLoopIdForPlayback(wide.until * duration, duration), "lower-stand");
  assert.equal(arena433VideoLoopIdForPlayback((lower.until * duration) - 0.001, duration), "lower-stand");
  assert.equal(arena433VideoLoopIdForPlayback(lower.until * duration, duration), "side-sweep");
  assert.equal(arena433VideoLoopIdForPlayback((side.until * duration) - 0.001, duration), "side-sweep");
});

test("manual seeks and a media-loop wrap resolve a fresh profile instead of retaining the preceding one", () => {
  const duration = 21;
  assert.equal(arena433VideoLoopIndexForPlayback(15.75, duration), 2);
  assert.equal(arena433VideoLoopIndexForPlayback(10.08, duration), 1);
  assert.equal(arena433VideoLoopIndexForPlayback(duration, duration), 0);
  assert.equal(arena433VideoLoopIdForPlayback((duration * 2) + 0.01, duration), "wide-touchline");
});

test("the human QA editor has a separate, viewport-specific camera key and starts each selected camera at its local zero", () => {
  const duration = 21;
  assert.equal(arenaQaManualLayoutCameraId("wide-touchline", "desktop"), "qa-manual-wide-touchline-desktop");
  assert.equal(isArenaQaManualLayoutCameraId("qa-manual-side-sweep-phone-landscape"), true);
  assert.equal(isArenaQaManualLayoutCameraId("qa-manual-wide-touchline-desktop-extra"), false);
  assert.equal(arena433VideoLoopStartTime("wide-touchline", duration), 0);
  assert.equal(arena433VideoLoopStartTime("lower-stand", duration), 10.08);
  assert.equal(arena433VideoLoopStartTime("side-sweep", duration), 15.54);
});

test("Arena accepts a user-approved QA layout only in the specific QA editor pathway", () => {
  assert.match(arenaSource, /resolveArena433VideoSlots\([\s\S]*?arenaFieldPlayersForRendering[\s\S]*?arenaVideoViewport/);
  assert.match(arenaSource, /const qaManualCameraLayout = isStableQaArenaHost && selectedFormationKey === "4-3-3"/);
  assert.match(arenaSource, /const fieldPlayerPositions = new Map\(lockedCameraPositions \?\? canonical433VideoPositions \?\? projectedFieldPlayerPositions\)/);
  assert.match(arenaSource, /if \(cameraEditPositions && \(!canonical433VideoPositions \|\| isQaVisualEditor\)\)/);
  assert.match(arenaSource, /Save Arena QA standard/);
  assert.match(arenaSource, /Pause camera/);
  assert.match(arenaSource, /handleFieldPlayerKeyDown/);
  assert.match(arenaSource, /arena433VideoLoopStartTime/);
  assert.match(arenaSource, /pendingQaCameraSelectionRef/);
  assert.match(arenaSource, /applyPendingQaArenaCamera/);
  assert.match(arenaSource, /const baseHeight = fieldPosition\.heightVh \?\? arenaLoopCameraProfile\(loopCameraIndex\)\.cardHeightVh/);
  assert.match(arenaSource, /onLoadedMetadata=\{handleCardLoopTimelineEvent\}/);
  assert.match(arenaSource, /onSeeking=\{handleCardLoopTimelineEvent\}/);
  assert.match(arenaSource, /onSeeked=\{handleCardLoopTimelineEvent\}/);
  assert.match(arenaSource, /requestVideoFrameCallback/);
});
