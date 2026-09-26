import assert from "node:assert/strict";
import test from "node:test";
import { touchlineAmbientAudioRoute } from "../lib/touchlineArena/ambient-audio-policy.ts";

test("only explicit public and entry routes can inherit opted-in audio", () => {
  for (const path of ["/login", "/register", "/forgot-password", "/reset-password"]) assert.equal(touchlineAmbientAudioRoute(path), "entry");
  assert.equal(touchlineAmbientAudioRoute("/arena"), "arena");
  assert.equal(touchlineAmbientAudioRoute("/arena/live"), "arena");
  for (const path of ["/touchline-players/123", "/touchline-coaches/456", "/touchline-tables", "/live", "/my-club"]) assert.equal(touchlineAmbientAudioRoute(path), "public");
  for (const path of [null, "/admin", "/admin/login", "/visual-qa/touchline-card-studio", "/preview", "/arena-unknown", "/touchline-players-unknown", "/unavailable"]) assert.equal(touchlineAmbientAudioRoute(path), "silent");
});
