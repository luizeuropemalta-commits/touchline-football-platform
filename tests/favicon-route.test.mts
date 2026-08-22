import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(new URL("../app/favicon.ico/route.ts", import.meta.url), "utf8");

test("favicon route redirects to the existing public icon instead of returning 404", () => {
  assert.match(routeSource, /NextResponse\.redirect\(new URL\("\/apple-touch-icon\.png", request\.url\)\)/);
});
