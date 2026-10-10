import assert from "node:assert/strict";

// Separate mandatory native gate; the normal PGlite entrypoint remains intact.
// Importing the shared body preserves every scenario and the completion count.
assert.ok(process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME, "Native local PostgreSQL runtime required; no skip or PGlite fallback.");
assert.notEqual(process.env.TOUCHLINE_V4_PUBLISHER_BASELINE, "1", "Native acceptance requires the current V4 publisher migration.");
await import("../touchline-player-rating-v4-publisher-pglite.test.mts");
