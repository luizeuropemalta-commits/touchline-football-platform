import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  createResilientBrowserId,
  getOrCreateBrowserSessionId,
  safeStorageRead,
  safeStorageRemove,
  safeStorageWrite,
} from "../lib/touchlineArena/browser-storage.ts";

const localeSyncSource = fs.readFileSync(
  new URL("../components/touchline/DocumentLocaleSync.tsx", import.meta.url),
  "utf8",
);
const activityTrackerSource = fs.readFileSync(
  new URL("../components/touchline-activity-tracker.tsx", import.meta.url),
  "utf8",
);
const arenaSource = fs.readFileSync(
  new URL("../app/arena/ArenaClient.tsx", import.meta.url),
  "utf8",
);

function throwingStorage() {
  return {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
    removeItem() {
      throw new Error("SecurityError");
    },
  };
}

test("storage operations fail closed when Safari blocks or exhausts storage", () => {
  const blockedStorage = throwingStorage();

  assert.equal(safeStorageRead(blockedStorage, "key"), null);
  assert.equal(safeStorageWrite(blockedStorage, "key", "value"), false);
  assert.equal(safeStorageRemove(blockedStorage, "key"), false);
  assert.equal(safeStorageRead(null, "key"), null);
  assert.equal(safeStorageWrite(undefined, "key", "value"), false);
});

test("storage helpers preserve the normal browser behavior", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };

  assert.equal(safeStorageWrite(storage, "locale", "pt-BR"), true);
  assert.equal(safeStorageRead(storage, "locale"), "pt-BR");
  assert.equal(safeStorageRemove(storage, "locale"), true);
  assert.equal(safeStorageRead(storage, "locale"), null);
});

test("session ids remain stable in memory when sessionStorage is unavailable", () => {
  const key = `touchline-test-session-${Date.now()}`;
  const first = getOrCreateBrowserSessionId(key, "touchline-test");
  const second = getOrCreateBrowserSessionId(key, "touchline-test");

  assert.ok(first.startsWith("touchline-test-") || first.length >= 16);
  assert.equal(second, first);
});

test("id generation falls back when Web Crypto is missing or throws", () => {
  const fallback = createResilientBrowserId("touchline-fallback", () => {
    throw new Error("crypto unavailable");
  });

  assert.match(fallback, /^touchline-fallback-\d+-[a-z0-9]+$/);
});

test("locale, analytics and Arena bootstrap use resilient browser boundaries", () => {
  assert.match(localeSyncSource, /writeBrowserStorage\("localStorage"/);
  assert.match(localeSyncSource, /requestedLocale === null \? initialLocale : requestedLocale/);
  assert.doesNotMatch(localeSyncSource, /readBrowserStorage\("localStorage"/);
  assert.match(activityTrackerSource, /getOrCreateIdentityBoundBrowserSessionId/);
  assert.match(activityTrackerSource, /void start\(\)\.catch/);
  assert.match(activityTrackerSource, /readBrowserStorage\("sessionStorage"/);
  assert.match(activityTrackerSource, /writeBrowserStorage\(\s*"sessionStorage"/);
  assert.match(arenaSource, /queueResilientAsyncTask\(async \(\) =>/);
  assert.match(arenaSource, /const randomKey = createResilientBrowserId\(\)/);
  assert.doesNotMatch(localeSyncSource, /window\.localStorage|window\.sessionStorage/);
  assert.doesNotMatch(activityTrackerSource, /window\.localStorage|window\.sessionStorage|\bcrypto\.randomUUID\b/);
  assert.doesNotMatch(arenaSource, /window\.localStorage|window\.sessionStorage|\bcrypto\.randomUUID\b/);
});
