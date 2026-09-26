import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseNotificationQuietHours } from "../lib/touchlineArena/notification-quiet-hours.ts";
import * as quietHours from "../lib/touchlineArena/notification-quiet-hours.ts";

const valid = { enabled: true, start: "22:00", end: "07:00", timezone: "Europe/Malta" };

test("delivery quiet-hours gate uses local time, inclusive start and exclusive end", () => {
  assert.equal(typeof quietHours.evaluateNotificationQuietHours, "function");
  const evaluate = quietHours.evaluateNotificationQuietHours;
  for (const [instant, expected] of [
    ["2026-09-24T19:59:59Z", "outside"],
    ["2026-09-24T20:00:00Z", "quiet"],
    ["2026-09-24T22:00:00Z", "quiet"],
    ["2026-09-25T04:59:59Z", "quiet"],
    ["2026-09-25T05:00:00Z", "outside"],
  ]) assert.equal(evaluate(valid, new Date(instant)), expected);
  const daytime = { ...valid, start: "09:00", end: "17:00", timezone: "Asia/Kolkata" };
  assert.equal(evaluate(daytime, new Date("2026-09-25T03:30:00Z")), "quiet");
  assert.equal(evaluate(daytime, new Date("2026-09-25T11:30:00Z")), "outside");
});

test("quiet-hours gate follows daylight saving and never approves invalid preferences", () => {
  assert.equal(typeof quietHours.evaluateNotificationQuietHours, "function");
  const evaluate = quietHours.evaluateNotificationQuietHours;
  const london = { ...valid, timezone: "Europe/London", start: "01:00", end: "02:00" };
  // Both occurrences of 01:30 during the autumn clock change are quiet.
  assert.equal(evaluate(london, new Date("2026-10-25T00:30:00Z")), "quiet");
  assert.equal(evaluate(london, new Date("2026-10-25T01:30:00Z")), "quiet");
  assert.equal(evaluate(london, new Date("2026-10-25T02:00:00Z")), "outside");
  assert.equal(evaluate(london, new Date("2026-03-29T01:00:00Z")), "outside");
  const now = new Date("2026-09-25T12:00:00Z");
  assert.equal(evaluate({ ...valid, enabled: false }, now), "disabled");
  // Missing stored preferences are not permission to send (unlike input parser defaults).
  for (const value of [undefined, null, {}, { ...valid, timezone: "invalid" }, { ...valid, start: "22:00", end: "22:00" }]) {
    assert.equal(evaluate(value, now), "invalid");
  }
  assert.equal(evaluate(valid, new Date(NaN)), "invalid");
});

test("quiet hours preserve a valid local window and its time zone without server-zone conversion", () => {
  assert.deepEqual(parseNotificationQuietHours(valid), valid);
  for (const timezone of ["UTC", "Europe/London", "America/Sao_Paulo", "Asia/Kolkata"]) {
    assert.deepEqual(parseNotificationQuietHours({ ...valid, timezone }), { ...valid, timezone });
  }
  assert.deepEqual(parseNotificationQuietHours(undefined), { enabled: false, start: "22:00", end: "07:00", timezone: "UTC" });
  assert.deepEqual(parseNotificationQuietHours({ ...valid, start: "00:00", end: "23:59" }), { ...valid, start: "00:00", end: "23:59" });
});

test("invalid clocks, unknown zones and malformed objects cannot silently replace quiet hours", () => {
  for (const time of ["99:99", "24:00", "12:60", "7:00", "", 2200, null]) {
    for (const key of ["start", "end"]) assert.equal(parseNotificationQuietHours({ ...valid, [key]: time }), null);
  }
  for (const timezone of ["Europe/NotAPlace", "", "GMT+fake", 5, null]) {
    assert.equal(parseNotificationQuietHours({ ...valid, timezone }), null);
  }
  for (const input of [null, [], "22:00", {}, { enabled: true }, { ...valid, enabled: "false" }]) {
    assert.equal(parseNotificationQuietHours(input), null);
  }
  assert.equal(parseNotificationQuietHours({ ...valid, enabled: false, start: "99:99" }), null);
});

test("preferences reject invalid quiet hours before device lookup or persistence", () => {
  const source = readFileSync(new URL("../app/api/notifications/preferences/route.ts", import.meta.url), "utf8");
  const put = source.slice(source.indexOf("export async function PUT"));
  assert.match(put, /parseNotificationQuietHours\(payload\.quietHours\)/);
  assert.match(put, /if \(!quietHours\)/);
  assert.ok(put.indexOf("if (!quietHours)") < put.indexOf("userHasRegisteredPushDevice(supabase"));
  assert.ok(put.indexOf("if (!quietHours)") < put.indexOf(".upsert("));
});
