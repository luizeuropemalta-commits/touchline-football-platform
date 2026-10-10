import assert from 'node:assert/strict';

// Mandatory native sibling, not a replacement for the PGlite/default gate.
assert.ok(process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME, 'Native local PostgreSQL runtime required; no skip or PGlite fallback.');
await import('../touchline-account-locale-composition.test.mts');
