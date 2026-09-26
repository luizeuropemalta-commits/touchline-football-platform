import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { buildMatchEventNotification } from "../lib/touchlineArena/match-event-notification.ts";
import { hasTouchlineMatchCentreFixture, selectTouchlineMatchCentreFixture } from "../lib/touchlineArena/match-centre.ts";

const verifiedEvent = {
  ok: true,
  data: {
    sourceProvenance: "PERSISTED_VERIFIED_CONFIRMED_EVENT", fixtureId: "123", eventId: "456",
    home: { name: "Arsenal" }, away: { name: "Chelsea" }, score: { home: 1, away: 0 },
    event: { kind: "goal", scoringTeamId: "19", playerTeamId: "19", playerProviderId: "101", playerName: "Saka", minute: 23, extraMinute: null },
    matchRating: 8.2, touchlinePoints: 5,
  },
} as const;

test("verified goal copy reaches receiver with match points, not an invented goal award", async () => {
  const payload = buildMatchEventNotification(verifiedEvent, "pt-BR");
  assert.ok(payload);
  const worker = receiver();
  await worker.emit("push", { data: { json: () => payload } });
  assert.equal(worker.shown[0][0], "GOL — Arsenal 1 × 0 Chelsea");
  assert.equal(worker.shown[0][1].body, "Saka · 23′ · TouchLine Points (na partida): +5");
  assert.equal(worker.shown[0][1].tag, "fixture:123:event:456");
  assert.equal(worker.shown[0][1].icon, "/icons/touchline-event-goal.png");
  assert.equal(worker.shown[0][1].badge, "/icons/touchline-192.png");
});

test("red-card copy preserves rating points and added time rather than imposing a card penalty", () => {
  const payload = buildMatchEventNotification({ ok: true, data: { ...verifiedEvent.data,
    event: { ...verifiedEvent.data.event, kind: "second-yellow-red", minute: 90, extraMinute: 3 },
    matchRating: 7.2, touchlinePoints: 2,
  } }, "en-GB", true);
  assert.equal(payload?.title, "RED CARD — Arsenal 1 × 0 Chelsea");
  assert.equal(payload?.body, "Saka · 90+3′ · TouchLine Points (match): +2");
  assert.equal(payload?.tag, "fixture:123:event:456");
  assert.equal(payload?.update, true);
  assert.equal(payload?.eventIcon, "red-card");
});

test("formatted notification click resolves the provider identity to the intended canonical match", async () => {
  // Deliberately put a different live match first: a broken deep link must not
  // silently pass by choosing the ordinary live-fixture fallback.
  const fixtures = [
    { id: "canonical-other", providerId: "999", status: "LIVE", startsAt: "2026-09-26T12:00:00Z" },
    { id: "canonical-target", providerId: "123", status: "LIVE", startsAt: "2026-09-26T12:00:00Z" },
  ];
  for (const locale of ["pt-BR", "en-GB"] as const) {
    const payload = buildMatchEventNotification(verifiedEvent, locale);
    assert.ok(payload);
    const worker = receiver();
    await worker.emit("push", { data: { json: () => payload } });
    let closed = false;
    await worker.emit("notificationclick", { notification: {
      data: worker.shown[0][1].data,
      close: () => { closed = true; },
    } });
    assert.equal(closed, true);
    assert.equal(worker.opened.length, 1);
    const destination = new URL(worker.opened[0], "https://arena.example");
    assert.equal(destination.pathname, "/live");
    assert.equal(destination.searchParams.get("lang"), locale);
    const providerId = destination.searchParams.get("fixture");
    assert.equal(providerId, "123");
    assert.equal(hasTouchlineMatchCentreFixture(fixtures, providerId), true);
    assert.equal(selectTouchlineMatchCentreFixture(fixtures, providerId)?.id, "canonical-target");
  }
});

test("event artwork accepts only local TouchLine icon keys, never arbitrary image URLs", async () => {
  for (const eventIcon of ["red-card", "goal", "https://foreign.test/track.png", "../private", "toString", null]) {
    const worker = receiver();
    await worker.emit("push", { data: { json: () => ({ eventIcon, icon: "https://foreign.test/track.png" }) } });
    assert.equal(worker.shown[0][1].icon, eventIcon === "goal" || eventIcon === "red-card"
      ? `/icons/touchline-event-${eventIcon}.png` : "/icons/touchline-192.png");
  }
});

test("unverified reader results or mismatched rating points cannot form a notice", () => {
  assert.equal(buildMatchEventNotification({ ok: false, reason: "event-pending" }, "pt-BR"), null);
  for (const changes of [{ matchRating: null }, { touchlinePoints: -3 }, { eventId: "" }, { score: { home: -1, away: 0 } }]) {
    assert.equal(buildMatchEventNotification({ ok: true, data: { ...verifiedEvent.data, ...changes } }, "pt-BR"), null);
  }
});

function receiver(windows: Array<{ url: string; focus: () => Promise<void> }> = []) {
  type WorkerEvent = Record<string, unknown> & { waitUntil: (value: Promise<void>) => void };
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const shown: Array<[string, NotificationOptions]> = [];
  const opened: string[] = [];
  const context = {
    URL,
    self: {
      location: { origin: "https://arena.example" },
      addEventListener: (name: string, handler: (event: WorkerEvent) => void) => handlers.set(name, handler),
      registration: { showNotification: async (title: string, options: NotificationOptions) => { shown.push([title, options]); } },
    },
    clients: { matchAll: async () => windows, openWindow: async (href: string) => { opened.push(href); } },
  };
  vm.runInNewContext(readFileSync(new URL("../public/touchline-push-sw.js", import.meta.url), "utf8"), context);
  async function emit(name: string, data: Record<string, unknown>) {
    let pending = Promise.resolve();
    handlers.get(name)!({ ...data, waitUntil: (value: Promise<void>) => { pending = value; } });
    await pending;
  }
  return { shown, opened, emit };
}

test("receiver survives malformed, missing and non-object push payloads", async () => {
  for (const data of [undefined, { json: () => { throw new SyntaxError("invalid"); } }, { json: () => null }, { json: () => [] }]) {
    const worker = receiver();
    await worker.emit("push", { data });
    assert.equal(worker.shown.length, 1);
    assert.equal(worker.shown[0][0], "TouchLine");
    assert.equal(worker.shown[0][1].data.href, "/notifications");
  }
});

test("push displays server copy and preserves a same-origin match destination", async () => {
  const worker = receiver();
  await worker.emit("push", { data: { json: () => ({ title: "Golo confirmado", body: "Arsenal 1–0 Leeds", href: "/live?fixture=123&lang=pt-BR", tag: "fixture:123:event:456" }) } });
  assert.equal(worker.shown[0][0], "Golo confirmado");
  assert.equal(worker.shown[0][1].body, "Arsenal 1–0 Leeds");
  assert.equal(worker.shown[0][1].data.href, "/live?fixture=123&lang=pt-BR");
  assert.equal(worker.shown[0][1].tag, "fixture:123:event:456");
});

test("an author or points update keeps the event tag and requests no second sound", async () => {
  const worker = receiver();
  const event = { title: "GOL — Arsenal 1 × 0 Chelsea", body: "Autor aguardando confirmação", tag: "fixture:123:event:456", href: "/live?fixture=123" };
  await worker.emit("push", { data: { json: () => event } });
  await worker.emit("push", { data: { json: () => ({ ...event, body: "Saka · 23′ · TouchLine Points: +5", update: true }) } });
  assert.equal(worker.shown[0][1].tag, worker.shown[1][1].tag);
  assert.equal(worker.shown[0][1].renotify, false);
  assert.equal(worker.shown[0][1].silent, undefined);
  assert.equal(worker.shown[1][1].renotify, false);
  assert.equal(worker.shown[1][1].silent, true);
  assert.equal(worker.shown[1][1].body, "Saka · 23′ · TouchLine Points: +5");
  assert.equal(worker.shown[1][1].vibrate, undefined);
});

test("event tags must be nonempty and bounded; payload cannot request repeated sound", async () => {
  for (const tag of ["", "   ", "x".repeat(161), 4, null]) {
    const worker = receiver();
    await worker.emit("push", { data: { json: () => ({ tag, renotify: true, vibrate: [100] }) } });
    assert.equal(worker.shown[0][1].tag, undefined);
    assert.equal(worker.shown[0][1].renotify, false);
    assert.equal(worker.shown[0][1].vibrate, undefined);
  }
});

test("click cannot open foreign origins or executable URLs even from stale notifications", async () => {
  for (const href of ["https://foreign.test/", "//foreign.test", "javascript:alert(1)", "data:text/html,hello", "https://user:pass@arena.example/live", "https://arena.example//foreign.test/"]) {
    const worker = receiver();
    let closed = false;
    await worker.emit("notificationclick", { notification: { data: { href }, close: () => { closed = true; } } });
    assert.equal(closed, true);
    assert.deepEqual(worker.opened, ["/notifications"]);
  }
});

test("click opens the validated match and closes the notification", async () => {
  const worker = receiver();
  await worker.emit("notificationclick", { notification: { data: { href: "https://arena.example/live?fixture=123" }, close() {} } });
  assert.deepEqual(worker.opened, ["/live?fixture=123"]);
});

test("click focuses only an exact existing destination, preserving unrelated pages", async () => {
  let focused = 0;
  const worker = receiver([
    { url: "https://arena.example/my-club", focus: async () => { throw new Error("must not touch unrelated page"); } },
    { url: "https://arena.example/live?fixture=123", focus: async () => { focused += 1; } },
  ]);
  await worker.emit("notificationclick", { notification: { data: { href: "/live?fixture=123" }, close() {} } });
  assert.equal(focused, 1);
  assert.deepEqual(worker.opened, []);
});

test("a closed matching window falls back to opening the validated destination", async () => {
  const worker = receiver([{ url: "https://arena.example/live?fixture=123", focus: async () => { throw new Error("closed"); } }]);
  await worker.emit("notificationclick", { notification: { data: { href: "/live?fixture=123" }, close() {} } });
  assert.deepEqual(worker.opened, ["/live?fixture=123"]);
});
