import assert from "node:assert/strict";
import test from "node:test";

import {
  isSafeTouchlineCentralDeepLink,
  parseTouchlineCentralReadIntent,
  resolveTouchlineCentralInbox,
  type TouchlineCentralMessage,
} from "../lib/touchlineArena/central-inbox.ts";

const message = (overrides: Partial<TouchlineCentralMessage> = {}): TouchlineCentralMessage => ({
  id: "11111111-1111-4111-8111-111111111111",
  origin: "ADMIN",
  publication: "PUBLISHED",
  lifecycleState: "ACTIVE",
  category: "MAINTENANCE",
  priority: "NORMAL",
  audience: { kind: "GLOBAL" },
  publishedAt: "2026-08-02T12:00:00.000Z",
  localizations: [{ locale: "en", title: "Maintenance", body: "Scheduled maintenance", deepLink: "/arena" }],
  ...overrides,
});

test("Central is the single admin-origin source and Inbox filters scope without exposing drafts", () => {
  const inbox = resolveTouchlineCentralInbox({
    userId: "user-a",
    competition: "england",
    locale: "en",
    messages: [
      message({ id: "11111111-1111-4111-8111-111111111111" }),
      message({ id: "22222222-2222-4222-8222-222222222222", audience: { kind: "COMPETITION", competition: "brazil" } }),
      message({ id: "33333333-3333-4333-8333-333333333333", publication: "DRAFT" }),
      message({ id: "44444444-4444-4444-8444-444444444444", audience: { kind: "USER", userId: "user-b", competition: "england" } }),
    ],
    readAtByMessageId: { "11111111-1111-4111-8111-111111111111": "2026-08-02T12:01:00.000Z" },
  });
  assert.deepEqual(inbox, [{
    id: "11111111-1111-4111-8111-111111111111",
    title: "Maintenance",
    body: "Scheduled maintenance",
    deepLink: "/arena",
    category: "MAINTENANCE",
    lifecycleState: "ACTIVE",
    priority: "NORMAL",
    readAt: "2026-08-02T12:01:00.000Z",
  }]);
});

test("Central supports localization, lifecycle state and deterministic priority", () => {
  const inbox = resolveTouchlineCentralInbox({
    userId: "user-a",
    competition: "england",
    locale: "pt-BR",
    messages: [
      message({ id: "11111111-1111-4111-8111-111111111111", priority: "LOW" }),
      message({
        id: "22222222-2222-4222-8222-222222222222",
        priority: "CRITICAL",
        lifecycleState: "COMING_SOON",
        category: "FUTURE_LEAGUE",
        localizations: [
          { locale: "en", title: "League", body: "League update", deepLink: "/rankings" },
          { locale: "pt-BR", title: "Liga", body: "Atualização de liga", deepLink: "/rankings" },
        ],
      }),
    ],
    readAtByMessageId: {},
  });
  assert.equal(inbox[0].id, "22222222-2222-4222-8222-222222222222");
  assert.equal(inbox[0].title, "Liga");
  assert.equal(inbox[0].lifecycleState, "COMING_SOON");
});

test("unsafe deep links and client-controlled receipt fields are rejected", () => {
  assert.equal(isSafeTouchlineCentralDeepLink("https://example.com"), false);
  assert.equal(isSafeTouchlineCentralDeepLink("//example.com"), false);
  assert.equal(isSafeTouchlineCentralDeepLink("/market-transfer?card=x"), true);
  assert.deepEqual(parseTouchlineCentralReadIntent({ messageId: "11111111-1111-4111-8111-111111111111", userId: "spoofed" }), {
    messageId: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(parseTouchlineCentralReadIntent({ messageId: "not-a-uuid" }), null);
});
