import assert from "node:assert/strict";
import test from "node:test";

import {
  TOUCHLINE_PUBLIC_ORIGIN,
  TOUCHLINE_QA_ORIGIN,
  TOUCHLINE_TECHNICAL_ORIGIN,
  resolveTouchLineAuthOrigin,
  resolveTouchLineConfiguredAuthOrigin,
} from "../lib/touchlineArena/public-origin.ts";

test("production callbacks are bound to the approved public or technical origin", () => {
  assert.equal(resolveTouchLineConfiguredAuthOrigin(undefined), TOUCHLINE_PUBLIC_ORIGIN);
  assert.equal(resolveTouchLineConfiguredAuthOrigin("https://touchline.com.br/"), TOUCHLINE_PUBLIC_ORIGIN);
  assert.equal(resolveTouchLineConfiguredAuthOrigin(TOUCHLINE_TECHNICAL_ORIGIN), TOUCHLINE_TECHNICAL_ORIGIN);
  assert.equal(resolveTouchLineConfiguredAuthOrigin("https://preview-unsafe.vercel.app"), TOUCHLINE_PUBLIC_ORIGIN);
  assert.equal(resolveTouchLineConfiguredAuthOrigin("http://touchline.com.br"), TOUCHLINE_PUBLIC_ORIGIN);
});

test("browser auth callbacks allow only the dedicated configured QA hostname", () => {
  assert.equal(resolveTouchLineAuthOrigin({
    currentOrigin: TOUCHLINE_QA_ORIGIN,
    hostname: "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app",
    configuredOrigin: TOUCHLINE_QA_ORIGIN,
  }), TOUCHLINE_QA_ORIGIN);
  assert.equal(resolveTouchLineAuthOrigin({
    currentOrigin: TOUCHLINE_QA_ORIGIN,
    hostname: "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app",
  }), TOUCHLINE_PUBLIC_ORIGIN);
  assert.equal(resolveTouchLineAuthOrigin({
    currentOrigin: "https://preview-unsafe.vercel.app",
    hostname: "preview-unsafe.vercel.app",
    configuredOrigin: TOUCHLINE_QA_ORIGIN,
  }), TOUCHLINE_PUBLIC_ORIGIN);
  assert.equal(resolveTouchLineAuthOrigin({
    currentOrigin: "https://preview-unsafe.vercel.app",
    hostname: "preview-unsafe.vercel.app",
  }), TOUCHLINE_PUBLIC_ORIGIN);
  assert.equal(resolveTouchLineAuthOrigin({
    currentOrigin: "https://touchline-arena-official.vercel.app",
    hostname: "touchline-arena-official.vercel.app",
  }), TOUCHLINE_TECHNICAL_ORIGIN);
  assert.equal(resolveTouchLineAuthOrigin({
    currentOrigin: "http://localhost:3000",
    hostname: "localhost",
  }), "http://localhost:3000");
});
