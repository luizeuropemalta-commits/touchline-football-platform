import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as kickoff from "../lib/touchlineArena/local-kickoff.ts";
import * as profile from "../lib/touchlineArena/profile-timestamp.ts";
import { normalizeTouchlineMatchCentreTimeZone } from "../lib/touchlineArena/match-centre.ts";
import { resolveClubHubFixtureRail, clubHubFixtureRailRefreshMs } from "../lib/touchlineArena/club-hub-fixture-rail.ts";
import { getTouchlineClubHubFixtureCopy } from "../lib/touchlineArena/club-hub-fixture-i18n.ts";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { getTouchlinePlayerPerformanceCopy } from "../lib/touchlineArena/player-performance-i18n.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true };
const compiled = new Map<string, string>();
function load<T>(path: string, replacements: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const url = new URL(path, import.meta.url);
  if (!compiled.has(path)) compiled.set(path, ts.transpileModule(readFileSync(url, "utf8"), { compilerOptions: options }).outputText);
  const exports = {};
  const nativeRequire = createRequire(url);
  runInNewContext(compiled.get(path)!, { ...globals, exports, require: (name: string) => Object.hasOwn(replacements, name) ? replacements[name] : nativeRequire(name) });
  return exports as T;
}
type Call = { locale: string; options: Intl.DateTimeFormatOptions; resolved: Intl.ResolvedDateTimeFormatOptions; timestamp: number };

// Real helpers, locale resolver and Intl; the resolver spy only records input.
function fixture() {
  const requested: unknown[] = [], calls: Call[] = [];
  const replacements = { "./catalogue-locale.ts": { resolveTouchlineCatalogueLocale: (locale: string, enabled = false) => {
    requested.push(locale);
    return resolveTouchlineCatalogueLocale(locale, enabled);
  } } };
  const globals = { Intl: { DateTimeFormat: function (locale: string, options: Intl.DateTimeFormatOptions) {
    const native = new Intl.DateTimeFormat(locale, options);
    const record = (date: Date) => calls.push({ locale, options, resolved: native.resolvedOptions(), timestamp: date.getTime() });
    return {
      format(date: Date) { record(date); return native.format(date); },
      formatToParts(date: Date) { record(date); return native.formatToParts(date); },
    };
  } } };
  return {
    kickoff: load<typeof kickoff>("../lib/touchlineArena/local-kickoff.ts", replacements, globals),
    profile: load<typeof profile>("../lib/touchlineArena/profile-timestamp.ts", replacements, globals),
    requested, calls,
  };
}
const startsAt = "2026-09-06T15:30:00Z";
const monthNames = {
  "en-GB": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  "pt-BR": ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
};

test("all twelve manual EN/PT months and exact existing kickoff/profile output remain unchanged", () => {
  for (const locale of ["en-GB", "pt-BR"] as const) {
    for (let month = 1; month <= 12; month++) {
      const value = `2026-${String(month).padStart(2, "0")}-06T15:30:00Z`;
      const result = kickoff.formatTouchlineLocalKickoff(value, "UTC", locale)!;
      assert.equal(result.date, `6 ${monthNames[locale][month - 1]}`);
      assert.equal(result.time, "15:30"); assert.equal(result.timeZone, "UTC");
    }
    assert.deepEqual(kickoff.formatTouchlineLocalKickoff(startsAt, "Europe/Malta", locale), {
      date: locale === "pt-BR" ? "6 set" : "6 Sep", time: "17:30", timeZone: "Europe/Malta", zoneName: locale === "pt-BR" ? "GMT+2" : "CEST",
    });
    assert.equal(profile.formatTouchlineProfileTimestamp("2026-09-20T13:00:00Z", locale), locale === "pt-BR" ? "20 de set. de 2026, 13:00 UTC" : "20 Sept 2026, 13:00 UTC");
  }
});

test("both helpers delegate full locale to the public gate; drafts and malformed locales safely fall back to English", () => {
  const actual = fixture();
  for (const locale of [...locales, "", "invalid_locale", "en-GB-u-ca-islamic", "pt"]) {
    actual.requested.length = 0;
    const local = actual.kickoff.formatTouchlineLocalKickoff(startsAt, "Europe/Malta", locale);
    const timestamp = actual.profile.formatTouchlineProfileTimestamp(startsAt, locale);
    assert.deepEqual(actual.requested, [locale, locale]);
    const expectedLocale = locale === "pt-BR" ? "pt-BR" : "en-GB";
    assert.equal(JSON.stringify(local), JSON.stringify(kickoff.formatTouchlineLocalKickoff(startsAt, "Europe/Malta", expectedLocale)));
    assert.equal(timestamp, profile.formatTouchlineProfileTimestamp(startsAt, expectedLocale));
    assert.equal(JSON.stringify(kickoff.formatTouchlineLocalKickoff(startsAt, "Europe/Malta", locale)), JSON.stringify(local));
  }
  for (const locale of locales.slice(2)) assert.equal(isTouchLineLocaleComplete(locale), false);
});

test("eight review locales use Gregorian native formatting without deriving any timezone from language", () => {
  const actual = fixture();
  for (const locale of locales) for (const zone of ["Europe/Malta", "America/Sao_Paulo", "UTC"]) {
    actual.calls.length = 0;
    const local = actual.kickoff.formatTouchlineLocalKickoff(startsAt, zone, locale, true)!;
    assert.equal(local.timeZone, zone);
    for (const call of actual.calls) {
      assert.equal(call.options.timeZone, zone);
      assert.equal(call.options.calendar, "gregory"); assert.equal(call.resolved.calendar, "gregory");
      assert.equal(call.timestamp, Date.parse(startsAt));
      assert.equal(call.locale, call.options.month === "numeric" ? "en-CA" : locale);
    }
    const time = actual.calls.find((call) => call.options.minute)!;
    assert.equal(time.options.hour12, false); assert.equal(time.resolved.hour12, false);
    if (locale !== "en-GB" && locale !== "pt-BR") {
      assert.equal(local.date, new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", calendar: "gregory", timeZone: zone }).format(new Date(startsAt)));
    }
    actual.calls.length = 0;
    actual.profile.formatTouchlineProfileTimestamp(startsAt, locale, true);
    assert.equal(actual.calls.length, 1);
    const [call] = actual.calls;
    assert.equal(call.locale, locale); assert.equal(call.options.timeZone, "UTC");
    assert.equal(call.options.calendar, "gregory"); assert.equal(call.resolved.calendar, "gregory");
    assert.equal(call.options.hourCycle, "h23"); assert.equal(call.resolved.hourCycle, "h23");
    assert.equal(call.timestamp, Date.parse(startsAt));
    const parts = new Intl.DateTimeFormat(locale, call.options).formatToParts(new Date(startsAt));
    assert.equal(parts.find((part) => part.type === "year")?.value, new Intl.NumberFormat(locale, { useGrouping: false }).format(2026));
  }
});

test("kickoff preserves local DST and date rollover while profile preserves UTC and equivalent instants", () => {
  for (const [instant, date, time] of [
    ["2026-03-29T00:30:00Z", "29 Mar", "01:30"], ["2026-03-29T01:30:00Z", "29 Mar", "03:30"],
    ["2026-10-25T00:30:00Z", "25 Oct", "02:30"], ["2026-10-25T01:30:00Z", "25 Oct", "02:30"],
    ["2026-01-15T23:30:00Z", "16 Jan", "00:30"], ["2026-09-20T22:30:00Z", "21 Sep", "00:30"],
  ]) {
    const result = kickoff.formatTouchlineLocalKickoff(instant, "Europe/Malta")!;
    assert.equal(result.date, date); assert.equal(result.time, time);
  }
  assert.equal(kickoff.formatTouchlineLocalKickoff(startsAt, "America/Sao_Paulo")?.time, "12:30");
  assert.equal(profile.formatTouchlineProfileTimestamp("2026-10-01T00:30:00+02:00", "en-GB"), "30 Sept 2026, 22:30 UTC");
  assert.equal(profile.formatTouchlineProfileTimestamp("2026-10-01T00:00:00Z", "en-GB"), "01 Oct 2026, 00:00 UTC");
  const actual = fixture();
  for (const locale of locales) {
    assert.equal(JSON.stringify(actual.kickoff.formatTouchlineLocalKickoff(startsAt, "Europe/Malta", locale, true)), JSON.stringify(actual.kickoff.formatTouchlineLocalKickoff("2026-09-06T17:30:00+02:00", "Europe/Malta", locale, true)));
    assert.equal(actual.profile.formatTouchlineProfileTimestamp(startsAt, locale, true), actual.profile.formatTouchlineProfileTimestamp("2026-09-06T17:30:00+02:00", locale, true));
    assert.equal(actual.profile.formatTouchlineProfileTimestamp(startsAt, locale, true), actual.profile.formatTouchlineProfileTimestamp("2026-09-06T15:30:00.000000Z", locale, true));
  }
});

test("invalid zones still fall back to UTC; invalid data stays null and the two parsing contracts remain distinct", () => {
  for (const zone of ["", "Invalid/Zone", "x".repeat(101)]) {
    assert.deepEqual(kickoff.formatTouchlineLocalKickoff(startsAt, zone), kickoff.formatTouchlineLocalKickoff(startsAt, "UTC"));
  }
  assert.equal(kickoff.formatTouchlineLocalKickoff(startsAt, " Europe/Malta ")?.timeZone, "Europe/Malta");
  for (const value of ["", "bad", "2026-99-99T99:99:00Z"]) for (const locale of locales) {
    assert.equal(kickoff.formatTouchlineLocalKickoff(value, "UTC", locale), null);
    assert.equal(profile.formatTouchlineProfileTimestamp(value, locale), null);
  }
  for (const value of [null, undefined, "2026-09-20", "2026-09-20T13:00:00"]) assert.equal(profile.formatTouchlineProfileTimestamp(value, "en-GB"), null);
  // Local kickoff keeps its existing Date.parse acceptance; this slice does
  // not silently impose profile's stricter offset requirement on callers.
  assert.ok(kickoff.formatTouchlineLocalKickoff("2026-09-20", "UTC"));
  const zoneLess = "2026-09-20T13:00:00";
  assert.deepEqual(kickoff.formatTouchlineLocalKickoff(zoneLess, "UTC"), kickoff.formatTouchlineLocalKickoff(new Date(zoneLess).toISOString(), "UTC"));
});

function fixtureCard(api: typeof kickoff, locale: string, mode: "server" | "browser", value = startsAt, draftLocalesEnabled = false) {
  const now = Date.parse("2026-09-01T00:00:00Z");
  const modules: Record<string, unknown> = {
    react: { ...React, useSyncExternalStore: (_subscribe: unknown, client: () => string, server: () => string) => mode === "server" ? server() : client() },
    "react/jsx-runtime": jsxRuntime,
    "next/image": { default: (props: React.ComponentProps<"img">) => React.createElement("img", props), __esModule: true },
    "next/link": { default: (props: React.ComponentProps<"a">) => React.createElement("a", props), __esModule: true },
    "next/navigation": { useRouter: () => ({ refresh: () => { throw new Error("No refresh in SSR fixture"); } }) },
    "lucide-react": { CalendarDays: () => null, MapPin: () => null },
    "@/lib/touchlineArena/local-kickoff": api,
    "@/lib/touchlineArena/match-centre": { normalizeTouchlineMatchCentreTimeZone },
    "@/lib/touchlineArena/club-hub-fixture-rail": {
      resolveClubHubFixtureRail: (...args: Parameters<typeof resolveClubHubFixtureRail>) => resolveClubHubFixtureRail(args[0], args[1], now, args[3]),
      clubHubFixtureRailRefreshMs: (...args: Parameters<typeof clubHubFixtureRailRefreshMs>) => clubHubFixtureRailRefreshMs(args[0], args[1], now),
    },
    "@/lib/touchlineArena/club-hub-fixture-i18n": { getTouchlineClubHubFixtureCopy },
    "./ClubHubPremiumPrototype.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }), __esModule: true },
  };
  const component = load<{ default: React.ComponentType<Record<string, unknown>> }>("../components/touchline/club-hub/ClubHubNextFixtureCard.tsx", modules, {
    Intl: { DateTimeFormat: function () { return { resolvedOptions: () => ({ timeZone: "America/Sao_Paulo" }) }; } },
  });
  const props = {
    locale, draftLocalesEnabled, startsAt: value, initialTimeZone: "Europe/Malta", status: "NS", roundName: "Canonical round",
    homeTeam: { teamId: "1", name: "Canonical Home", shortCode: "HOM", logoUrl: "/home.svg" }, homePosition: null,
    awayTeam: { teamId: "2", name: "Canonical Away", shortCode: "AWY", logoUrl: "/away.svg" }, awayPosition: null,
    venueName: "Canonical Venue", previewHref: "/canonical-preview?id=123",
  };
  const before = JSON.stringify(props);
  const html = renderToStaticMarkup(React.createElement(component.default, props));
  assert.equal(JSON.stringify(props), before);
  return html;
}

test("real fixture component keeps SSR Malta/browser timezone handoff, datetime, identity and link while consuming real formatter", () => {
  for (const review of [false, true]) for (const locale of locales) for (const mode of ["server", "browser"] as const) {
    const actual = fixture();
    const html = fixtureCard(actual.kickoff, locale, mode, startsAt, review);
    assert.deepEqual(actual.requested, [locale]);
    const zone = mode === "server" ? "Europe/Malta" : "America/Sao_Paulo";
    const formatted = actual.kickoff.formatTouchlineLocalKickoff(startsAt, zone, locale, review)!;
    assert.ok(html.includes(`dateTime="${startsAt}"`));
    assert.ok(html.includes(`${formatted.date} · ${formatted.time}`)); assert.ok(html.includes(formatted.zoneName));
    assert.ok(html.includes('href="/canonical-preview?id=123"'));
    for (const name of ["Canonical Home", "Canonical Away", "Canonical Venue", "Canonical round"]) assert.ok(html.includes(name));
    assert.ok(actual.calls.every((call) => call.options.timeZone === zone));
  }
  assert.equal(fixtureCard(kickoff, "en-GB", "server", "bad"), "");
});

test("actual profile expressions retain UTC formatting, unavailable fallback and original datetime attributes", () => {
  const source = ts.createSourceFile("Profile.tsx", readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const times: ts.Node[] = [], expressions: ts.Node[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "time" && node.getText(source).includes("formatOfficialSyncTime")) times.push(node);
    if (ts.isCallExpression(node) && node.expression.getText(source) === "formatOfficialSyncTime") expressions.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source); assert.equal(times.length, 2); assert.equal(expressions.length, 6);
  for (const review of [false, true]) for (const locale of locales) for (const value of [startsAt, "bad"]) {
    const actual = fixture();
    const expected = actual.profile.formatTouchlineProfileTimestamp(value, locale, review);
    const input = { latestSyncAt: value, fixtureStartsAt: value, fetchedAt: value, rating: 0, minutes: 0 };
    const before = JSON.stringify(input);
    const context = {
      locale, draftLocalesEnabled: review, formatOfficialSyncTime: actual.profile.formatTouchlineProfileTimestamp,
      performanceCopy: getTouchlinePlayerPerformanceCopy(locale),
      statistics: input, fixture: input, current: input, official: input,
      playerStatistics: { previousCompletedSeason: input }, text: { updatedAt: "UPDATED", unavailable: "UNAVAILABLE" },
    };
    for (const node of [...times, ...expressions]) {
      const exports: Record<string, unknown> = {};
      const js = ts.transpileModule(`export const value = (${node.getText(source)});`, { compilerOptions: options }).outputText;
      runInNewContext(js, { ...context, exports, require: (name: string) => { assert.equal(name, "react/jsx-runtime"); return jsxRuntime; } });
      if (times.includes(node)) {
        const html = renderToStaticMarkup(exports.value as React.ReactElement);
        assert.ok(html.includes(`dateTime="${value}"`));
        if (expected) assert.ok(html.includes(expected));
        else if (node.getText(source).includes("?? text.unavailable")) assert.ok(html.includes("UNAVAILABLE"));
      } else assert.equal(exports.value, expected);
    }
    assert.equal(JSON.stringify(input), before);
  }
});
