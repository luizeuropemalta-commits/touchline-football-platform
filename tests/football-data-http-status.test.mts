import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  footballDataErrorHttpStatus,
  footballDataHttpResponseCanBeCached,
  resultOk,
} from "../lib/football-data/http.ts";

describe("football data HTTP error status", () => {
  it("keeps valid client and server error statuses", () => {
    assert.equal(footballDataErrorHttpStatus(401), 401);
    assert.equal(footballDataErrorHttpStatus(429), 429);
    assert.equal(footballDataErrorHttpStatus(503), 503);
  });

  it("replaces transport and malformed statuses with a valid gateway error", () => {
    assert.equal(footballDataErrorHttpStatus(0), 502);
    assert.equal(footballDataErrorHttpStatus(200), 502);
    assert.equal(footballDataErrorHttpStatus(700), 502);
    assert.equal(footballDataErrorHttpStatus(undefined), 502);
  });
});

describe("football data provider cache policy", () => {
  it("accepts successful HTTP responses", () => {
    assert.equal(footballDataHttpResponseCanBeCached({ ok: true, status: 200 }), true);
    assert.equal(footballDataHttpResponseCanBeCached({ ok: true, status: 204 }), true);
  });

  it("rejects authentication, rate-limit, server, and transport failures", () => {
    for (const status of [0, 401, 403, 429, 500, 503]) {
      assert.equal(footballDataHttpResponseCanBeCached({ ok: false, status }), false);
    }
    assert.equal(footballDataHttpResponseCanBeCached({ ok: false, status: 200 }), false);
    assert.equal(footballDataHttpResponseCanBeCached({ ok: true, status: 500 }), false);
  });

  it("keeps the original fetch time when building a cached provider result", () => {
    const fetchedAt = "2026-07-28T10:00:00.000Z";
    const result = resultOk("sportmonks", { id: 1 }, undefined, true, fetchedAt);
    assert.equal(result.cached, true);
    assert.equal(result.fetchedAt, fetchedAt);
  });
});
