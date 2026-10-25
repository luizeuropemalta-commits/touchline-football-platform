import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const marketPagePath = fileURLToPath(new URL("../app/clubowner/page.tsx", import.meta.url));

test("Market server auth is bounded and fails closed before loading or rendering the customer game", async () => {
  const source = await readFile(marketPagePath, "utf8");

  assert.match(source, /resolveServerReadWithin\(\(async \(\) => \{[\s\S]*?createClient\(\)[\s\S]*?if \(!authenticationReadActive \|\| !supabase\) return null;[\s\S]*?return supabase\.auth\.getUser\(\);[\s\S]*?\}\)\(\), null, 8_000\)/);
  assert.match(source, /authenticationReadActive = false;\s*if \(!authentication\)/);
  assert.match(source, /if \(!user\) redirect\(touchLineAuthEntryHref\("\/login", locale, destination, draftLocalesEnabled\)\)/);
  assert.match(source, /if \(isOwnerEmail\(user\.email\)\) redirect\(touchLineAuthEntryHref\("\/admin", locale\)\)/);
  const authGate = source.indexOf("if (!user) redirect(");
  const ownerGate = source.indexOf('if (isOwnerEmail(user.email)) redirect(touchLineAuthEntryHref("/admin", locale))');
  const snapshotRead = source.indexOf("resolveServerReadWithin(loadTouchlineFantasyReadSnapshot(user)");
  const render = source.indexOf("<FantasyGameweekClient");
  assert.ok(authGate >= 0 && ownerGate > authGate && snapshotRead > ownerGate && render > snapshotRead);
  assert.doesNotMatch(source, /canEditCardEngine|demoLineup|initialQaVisualEditor/);
});
