import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const marketPagePath = fileURLToPath(new URL("../app/market-transfer/page.tsx", import.meta.url));

test("Market server auth is bounded and fails closed before loading or rendering the customer game", async () => {
  const source = await readFile(marketPagePath, "utf8");

  assert.match(source, /resolveServerReadWithin\(\s*supabase\.auth\.getUser\(\)\.then\(\(\{ data \}\) => data\.user\),\s*null,\s*8_000/);
  assert.match(source, /if \(!user\) redirect\(touchLineAuthEntryHref\("\/login", locale, destination\)\)/);
  assert.match(source, /if \(isOwnerEmail\(user\.email\)\) notFound\(\)/);
  const authGate = source.indexOf("if (!user) redirect(");
  const ownerGate = source.indexOf("if (isOwnerEmail(user.email)) notFound()");
  const snapshotRead = source.indexOf("resolveServerReadWithin(loadTouchlineFantasySnapshot(user)");
  const render = source.indexOf("<FantasyGameweekClient");
  assert.ok(authGate >= 0 && ownerGate > authGate && snapshotRead > ownerGate && render > snapshotRead);
  assert.doesNotMatch(source, /canEditCardEngine|demoLineup|initialQaVisualEditor/);
});
