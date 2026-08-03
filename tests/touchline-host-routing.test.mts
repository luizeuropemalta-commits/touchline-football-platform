import assert from "node:assert/strict";
import test from "node:test";

import {
  isTouchLinePublicHost,
  isTouchLinePublicWwwHost,
  isTouchLineVercelHost,
  resolveTouchLineRequestHostname,
} from "../lib/server/touchline-host-routing.ts";

test("the Brazilian root domain is public and www is only a canonical redirect source", () => {
  assert.equal(isTouchLinePublicHost("touchline.com.br"), true);
  assert.equal(isTouchLinePublicHost("touchline.com.br:443"), true);
  assert.equal(isTouchLinePublicHost("www.touchline.com.br"), false);
  assert.equal(isTouchLinePublicWwwHost("www.touchline.com.br"), true);
  assert.equal(isTouchLinePublicWwwHost("touchline.com.br.evil.example"), false);
  assert.equal(isTouchLinePublicHost("touchline-arena-official.vercel.app"), false);
});

test("Vercel production and preview hosts expose the application", () => {
  assert.equal(isTouchLineVercelHost("touchline-arena-official.vercel.app"), true);
  assert.equal(isTouchLineVercelHost("touchline-arena-official-git-main-touchline.vercel.app"), true);
  assert.equal(isTouchLineVercelHost("touchline.com.br"), false);
  assert.equal(isTouchLineVercelHost("vercel.app.evil.example"), false);
});

test("forwarded host takes precedence and is normalized safely", () => {
  assert.equal(
    resolveTouchLineRequestHostname("WWW.TOUCHLINE.COM.BR:443, proxy.internal", "ignored.test", "fallback.test"),
    "www.touchline.com.br",
  );
  assert.equal(resolveTouchLineRequestHostname(null, "LOCALHOST:4319", "fallback.test"), "localhost");
  assert.equal(resolveTouchLineRequestHostname(null, null, "127.0.0.1"), "127.0.0.1");
});
