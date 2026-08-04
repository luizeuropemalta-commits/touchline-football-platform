import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/(app)/inbox/page.tsx", import.meta.url), "utf8");
const receiptRoute = readFileSync(new URL("../app/api/touchline-central/inbox/read/route.ts", import.meta.url), "utf8");
const inboxList = readFileSync(new URL("../components/touchline/TouchlineInboxList.tsx", import.meta.url), "utf8");

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

test("a read receipt accepts only a canonical message id and the authenticated message audience", () => {
  assert.match(receiptRoute, /parseTouchlineCentralReadIntent/);
  assert.match(receiptRoute, /hasTouchLineArenaAccess/);
  assert.match(receiptRoute, /isCentralAudienceForEngland/);
  assert.match(receiptRoute, /message_id: intent\.messageId, user_id: user\.id/);
  assert.doesNotMatch(receiptRoute, /requested_user_id|body\.userId/);
});

test("opening a Central notice waits for its durable receipt before navigation", () => {
  assert.match(inboxList, /await markRead\(item\.id\)/);
  assert.match(inboxList, /window\.location\.assign/);
  assert.doesNotMatch(inboxList, /<Link/);
});
