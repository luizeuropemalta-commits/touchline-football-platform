import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const proxySource = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");

test("public product requests do not invoke Supabase Auth in the proxy", () => {
  assert.match(
    proxySource,
    /const requiresIdentityLookup = isProtectedArenaRoute \|\| pathname\.startsWith\("\/club-owner\/"\);/,
  );
  assert.match(proxySource, /if \(!requiresIdentityLookup\) return response;/);
  assert.ok(
    proxySource.indexOf("if (!requiresIdentityLookup) return response;")
      < proxySource.indexOf("supabase.auth.getUser()"),
  );
});

test("the middleware matcher excludes image and media assets including AVIF", () => {
  assert.match(proxySource, /webp\|avif\|svg/);
  assert.match(proxySource, /mp4\|webm\|mp3\|wav/);
});
