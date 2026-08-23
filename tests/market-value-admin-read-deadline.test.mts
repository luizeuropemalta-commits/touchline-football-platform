import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/(app)/admin/market-values/page.tsx", import.meta.url);

test("Market Value Admin bounds auth and all protected reads without demo data", async () => {
  const source = await readFile(pageUrl, "utf8");

  assert.match(source, /const MARKET_VALUE_ADMIN_READ_TIMEOUT_MS = 8_000/);
  assert.match(
    source,
    /resolveServerReadWithin\(\s*supabase\.auth\.getUser\(\)\.then\(\(\{ data \}\) => data\.user\),\s*null,\s*MARKET_VALUE_ADMIN_READ_TIMEOUT_MS/,
  );
  assert.equal(
    source.match(/resolveServerReadWithin\(/g)?.length,
    5,
    "auth plus the four Supabase page reads must all have a deadline",
  );
  assert.match(source, /MARKET_VALUE_ADMIN_READ_UNAVAILABLE/);
  assert.match(source, /No editorial value or publication state was changed/);
  assert.doesNotMatch(source, /demo|cookie/i);
});
