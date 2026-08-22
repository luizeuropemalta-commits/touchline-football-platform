import assert from "node:assert/strict";
import test from "node:test";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const globalLoadingPath = fileURLToPath(new URL("../app/loading.tsx", import.meta.url));

test("the App Router has no global loading boundary that can mask an already-ready route", async () => {
  await assert.rejects(access(globalLoadingPath), { code: "ENOENT" });
});
