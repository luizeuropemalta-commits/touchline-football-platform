import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/(app)/inbox/page.tsx", import.meta.url), "utf8");

test("ClubOwner Inbox is a protected read consumer of canonical Central messages", () => {
  assert.match(source, /createClient\(\)/);
  assert.match(source, /createAdminClient\(\)/);
  assert.match(source, /touchline_central_messages/);
  assert.match(source, /touchline_central_inbox_receipts/);
  assert.match(source, /resolveTouchlineCentralInbox/);
  assert.match(source, /competition: "england"/);
});

test("ClubOwner Inbox never falls back to demo messages when the migration is unavailable", () => {
  assert.match(source, /No notice is simulated/);
  assert.match(source, /messagesResult\.error \|\| receiptsResult\.error/);
  assert.doesNotMatch(source, /TouchlineAuditStudio/);
});
