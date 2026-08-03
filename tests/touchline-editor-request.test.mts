import assert from "node:assert/strict";
import test from "node:test";

import { isLocalTouchlineEditorEnabled } from "../lib/touchlineArena/editor-request.ts";

const development = { nodeEnv: "development", vercel: undefined, allowLocalEditor: "1" };

test("allows local editor writes only after an explicit server-side development opt-in", () => {
  assert.equal(isLocalTouchlineEditorEnabled(development), true);
  assert.equal(isLocalTouchlineEditorEnabled({ nodeEnv: "development", vercel: undefined }), false);
  assert.equal(isLocalTouchlineEditorEnabled({ nodeEnv: "development", vercel: undefined, allowLocalEditor: "0" }), false);
});

test("rejects editor writes in production and Vercel even when the opt-in exists", () => {
  assert.equal(isLocalTouchlineEditorEnabled({ nodeEnv: "production", allowLocalEditor: "1" }), false);
  assert.equal(isLocalTouchlineEditorEnabled({ nodeEnv: "development", vercel: "1", allowLocalEditor: "1" }), false);
});
