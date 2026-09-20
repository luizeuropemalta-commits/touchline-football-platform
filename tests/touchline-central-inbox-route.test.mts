import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
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

test("opening a notice preserves its anchor and replaces the locale before the hash", async () => {
  const handlerSource = inboxList.slice(inboxList.indexOf("  async function openDestination("), inboxList.indexOf("\n  return <ol>"));
  for (const [deepLink, expected] of [
    ["/arena#touchline-main-content", "/arena?lang=pt-BR#touchline-main-content"],
    ["/my-club?lang=en-GB&lang=en-GB#my-club-squad", "/my-club?lang=pt-BR#my-club-squad"],
    ["/live?fixture=sportmonks%3A123#teamsheets", "/live?fixture=sportmonks%3A123&lang=pt-BR#teamsheets"],
  ]) {
    const events: string[] = [];
    const handler = runInNewContext(`${stripTypeScriptTypes(handlerSource)}\nopenDestination;`, {
      URL, locale: "pt-BR",
      markRead: async (id: string) => { events.push(`read:${id}`); return true; },
      window: { location: { origin: "https://touchline.test", assign: (href: string) => events.push(href) } },
    }) as (item: { id: string; deepLink: string }) => Promise<void>;
    await handler({ id: "notice", deepLink });
    assert.deepEqual(events, ["read:notice", expected]);
  }
});
