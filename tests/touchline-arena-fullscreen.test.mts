import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import type { MetadataRoute } from "next";
import { test } from "node:test";

import {
  exitTouchlineFullscreen,
  requestTouchlineFullscreen,
  touchlineFullscreenElement,
} from "../lib/touchlineArena/fullscreen.ts";


test("installed TouchLine starts with the preserved intro and keeps every product page inside the app", () => {
  const manifest: MetadataRoute.Manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));

  assert.equal(manifest.start_url, "/intro");
  assert.equal(manifest.id, "/arena", "Existing installations keep their identity independently of the start page");
  assert.equal(manifest.name, "TouchLine");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "fullscreen");
  // Owner rule, 2026-09-19: mobile gameplay is landscape-only. Browsers that
  // ignore the PWA preference are protected by the shared orientation gate.
  assert.equal(manifest.orientation, "landscape");
  assert.ok(manifest.icons?.some((icon) => icon.purpose === "maskable"));
  assert.deepEqual(manifest, {
    "id": "/arena",
    "name": "TouchLine",
    "short_name": "TouchLine",
    "description": "TouchLine football cards, Market and live points.",
    "start_url": "/intro",
    "scope": "/",
    "display": "fullscreen",
    "orientation": "landscape",
    "background_color": "#020708",
    "theme_color": "#07110b",
    "icons": [
      {
        "src": "/icons/touchline-192.png",
        "sizes": "192x192",
        "type": "image/png",
        "purpose": "any"
      },
      {
        "src": "/icons/touchline-512.png",
        "sizes": "512x512",
        "type": "image/png",
        "purpose": "any"
      },
      {
        "src": "/icons/touchline-maskable-512.png",
        "sizes": "512x512",
        "type": "image/png",
        "purpose": "maskable"
      }
    ]
  });
  assert.equal(existsSync(new URL("../app/manifest.ts", import.meta.url)), false, "No dynamic metadata route should compete with the static manifest");
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  for (const icon of manifest.icons ?? []) {
    assert.equal(existsSync(new URL(`../public${icon.src}`, import.meta.url)), true, icon.src);
  }
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

test("fullscreen helper reports native fullscreen unavailability", async () => {
  const documentTarget = { fullscreenElement: null } as unknown as Document;
  const element = {} as HTMLElement;
  assert.equal(await requestTouchlineFullscreen(element, documentTarget), false);
});
