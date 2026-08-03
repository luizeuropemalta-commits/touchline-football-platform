import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  exitTouchlineFullscreen,
  requestTouchlineFullscreen,
  touchlineFullscreenElement,
} from "../lib/touchlineArena/fullscreen.ts";
import touchlineManifest from "../app/manifest.ts";

test("installed TouchLine starts in the Arena but keeps every product page inside the app", () => {
  const manifest = touchlineManifest();

  assert.equal(manifest.start_url, "/arena");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "fullscreen");
  assert.equal(manifest.orientation, "landscape");
  assert.ok(manifest.icons?.some((icon) => icon.purpose === "maskable"));
});

test("TouchLine viewport preserves safe areas without disabling browser zoom", () => {
  const rootLayout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

  assert.match(rootLayout, /width:\s*"device-width"/);
  assert.match(rootLayout, /initialScale:\s*1/);
  assert.match(rootLayout, /viewportFit:\s*"cover"/);
  assert.doesNotMatch(rootLayout, /maximumScale\s*:/);
  assert.doesNotMatch(rootLayout, /userScalable\s*:/);
});

test("Arena fullscreen uses the native browser API when it succeeds", async () => {
  const documentTarget = { fullscreenElement: null } as unknown as Document;
  const element = {
    requestFullscreen: async () => {
      Object.assign(documentTarget, { fullscreenElement: element });
    },
  } as unknown as HTMLElement;

  assert.equal(await requestTouchlineFullscreen(element, documentTarget), true);
  assert.equal(touchlineFullscreenElement(documentTarget), element);
});

test("Arena fullscreen supports the Safari-prefixed API", async () => {
  const documentTarget = { fullscreenElement: null, webkitFullscreenElement: null } as unknown as Document;
  const element = {
    requestFullscreen: async () => {
      throw new Error("standard fullscreen unavailable");
    },
    webkitRequestFullscreen: async () => {
      Object.assign(documentTarget, { webkitFullscreenElement: element });
    },
  } as unknown as HTMLElement;

  assert.equal(await requestTouchlineFullscreen(element, documentTarget), true);

  Object.assign(documentTarget, {
    webkitExitFullscreen: async () => {
      Object.assign(documentTarget, { webkitFullscreenElement: null });
    },
  });
  await exitTouchlineFullscreen(documentTarget);
  assert.equal(touchlineFullscreenElement(documentTarget), null);
});

test("Arena activates a full-viewport fallback when native fullscreen is unavailable", async () => {
  const documentTarget = { fullscreenElement: null } as unknown as Document;
  const element = {} as HTMLElement;
  assert.equal(await requestTouchlineFullscreen(element, documentTarget), false);

  const arenaClient = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");
  assert.match(arenaClient, /nativeFullscreenRemainedActive/);
  assert.match(arenaClient, /setIsArenaFallbackFullscreen\(mobileFullscreenShellIsRequired \|\| !nativeFullscreenRemainedActive\)/);
  assert.match(arenaClient, /arenaFullscreenRequestedRef/);
  assert.match(arenaClient, /nativeFullscreenIsStillActive/);
  assert.match(arenaClient, /mobileFullscreenShellIsRequired/);
  assert.match(arenaClient, /matchMedia\("\(max-width: 1100px\)"\)/);
  assert.match(arenaClient, /data-fullscreen-mode=/);
  assert.match(arenaClient, /\.arena-stage\.is-mobile-fullscreen-fallback/);
  assert.match(arenaClient, /100dvh !important/);
});
