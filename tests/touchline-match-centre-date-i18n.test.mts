import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as copy from "../lib/touchlineArena/match-centre-i18n.ts";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { normalizeTouchlineMatchCentreTimeZone, touchlineFixtureRailDateLabel } from "../lib/touchlineArena/match-centre.ts";

const source = readFileSync(new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("consumer.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const instant = "2026-08-29T12:05:00Z";
const clock: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false };
const shortDate: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" };
const longDate: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" };
const helpers = ast.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && ["fixtureDate", "verificationLabel"].includes(node.name?.text ?? ""));
assert.equal(helpers.length, 2);
type DateCall = { locale: string; options: Intl.DateTimeFormatOptions; resolved: Intl.ResolvedDateTimeFormatOptions };
type API = {
  fixtureDate(fixture: { startsAt?: string }, locale: string, zone: string, options: Intl.DateTimeFormatOptions, draftLocalesEnabled?: boolean): string;
  verificationLabel(metadata: { fetchedAt?: string }, locale: string, zone: string, draftLocalesEnabled?: boolean): string | null;
};

function probe() {
  const calls: DateCall[] = [];
  function DateTimeFormat(locale: string, options: Intl.DateTimeFormatOptions) {
    const formatter = new Intl.DateTimeFormat(locale, options);
    calls.push({ locale, options, resolved: formatter.resolvedOptions() }); return formatter;
  }
  const context = { React, Intl: { DateTimeFormat }, resolveTouchlineCatalogueLocale,
    getTouchlineMatchCentreCopy: copy.getTouchlineMatchCentreCopy };
  const compiled = ts.transpileModule(helpers.map(node => node.getText(ast)).join("\n") + "\n({fixtureDate, verificationLabel});", {
    compilerOptions: { target: ts.ScriptTarget.ES2017 },
  }).outputText;
  const api = runInNewContext(compiled, context) as API;
  return { api, calls, copy: copy.getTouchlineMatchCentreCopy };
}

test("presentation date helpers remain pure while polling keeps its existing boundaries and cadence", () => {
  const helperText = helpers.map(node => node.getText(ast)).join("\n");
  assert.doesNotMatch(helperText, /\bfetch\s*\(|setInterval|setTimeout|\.sort\s*\(|\.push\s*\(/);
  const intervals: string[] = [];
  const pollingCallbacks: ts.Node[] = [];
  const clears: string[] = [];
  const fetches: string[] = [];
  const aborts: string[] = [];
  const deadlines: ts.CallExpression[] = [];
  const clearedDeadlines: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "window.setInterval") {
      intervals.push(node.arguments[1].getText(ast));
      if (node.arguments[1].getText(ast) === "45_000") pollingCallbacks.push(node.arguments[0]);
    }
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "window.clearInterval") clears.push(node.arguments[0].getText(ast));
    if (ts.isCallExpression(node) && node.expression.getText(ast).endsWith(".abort")) aborts.push(node.expression.getText(ast));
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "window.setTimeout") deadlines.push(node);
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "window.clearTimeout") clearedDeadlines.push(node.arguments[0].getText(ast));
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "fetch") {
      const endpoint = node.arguments[0].getText(ast);
      fetches.push(endpoint);
      assert.match(node.arguments[1].getText(ast), endpoint.includes("fixture?fixtureId=")
        ? /signal:\s*request\.controller\.signal/ : /signal:\s*controller\.signal/);
      assert.match(node.arguments[1].getText(ast), /cache:\s*"no-store"/);
    }
    node.forEachChild(visit);
  }
  visit(ast);
  assert.deepEqual(intervals, ["30_000", "60_000", "45_000"]);
  assert.deepEqual(clears, ["timer", "timer", "timer"], "every existing cadence retains teardown");
  assert.equal(pollingCallbacks.length, 1, "detail shares the only 45-second timer");
  const callbackCalls: string[] = [];
  function visitCallback(node: ts.Node) {
    if (ts.isCallExpression(node)) callbackCalls.push(node.expression.getText(ast));
    node.forEachChild(visitCallback);
  }
  visitCallback(pollingCallbacks[0]);
  assert.deepEqual(callbackCalls, ["load", "detailRefresh.current"], "one cadence dispatches snapshot and current selected detail exactly once");
  assert.equal(fetches.length, 2);
  assert.ok(fetches[0].includes("/api/football-data/fantasy/fixture?fixtureId=${encodeURIComponent(requestedFixtureId)}"));
  assert.equal(fetches[1], '"/api/football-data/fantasy/livescores?snapshot=1"');
  assert.deepEqual(aborts, ["request.controller.abort", "currentRequest.controller.abort", "controller.abort"], "detail deadline, detail cleanup and snapshot cleanup all abort their own controller");
  assert.equal(deadlines.length, 1, "only one request deadline; no retry timer");
  assert.equal(deadlines[0].arguments[1].getText(ast), "8_000");
  assert.match(deadlines[0].arguments[0].getText(ast), /request\.controller\.abort\(\)/);
  assert.match(deadlines[0].arguments[0].getText(ast), /if \(currentRequest === request\) currentRequest = null/);
  assert.deepEqual(clearedDeadlines, ["request.deadline", "currentRequest.deadline"], "settled request and effect teardown clear deadline");
});

test("date helpers keep exact EN/PT formats and do not impose a new hour cycle", () => {
  const { api, calls } = probe();
  const expected = {
    "en-GB": ["12:05", "Saturday, 29 August 2026", "29 Aug, 12:05", "Last verification · 29 Aug, 12:05"],
    "pt-BR": ["12:05", "sábado, 29 de agosto de 2026", "29 de ago., 12:05", "Última verificação · 29 de ago., 12:05"],
  };
  for (const locale of ["en-GB", "pt-BR"] as const) {
    assert.deepEqual([api.fixtureDate({ startsAt: instant }, locale, "UTC", clock), api.fixtureDate({ startsAt: instant }, locale, "UTC", longDate),
      api.fixtureDate({ startsAt: instant }, locale, "UTC", shortDate), api.verificationLabel({ fetchedAt: instant }, locale, "UTC")], expected[locale]);
    assert.equal(api.fixtureDate({ startsAt: "2026-08-29T00:00:00Z" }, locale, "UTC", clock), "00:00");
  }
  assert.ok(calls.every(call => call.options.calendar === "gregory"));
  assert.ok(calls.every(call => call.options.hourCycle === undefined));
  assert.equal(calls[2].options.hour12, undefined);
  assert.equal(calls[3].options.hour12, false);
});

test("date helpers gate six public drafts and invalid locales without changing invalid date guards", () => {
  const { api, calls } = probe();
  for (const locale of [...locales.slice(2), "bad_locale", "constructor", "", "pt-XX"]) {
    assert.equal(api.fixtureDate({ startsAt: instant }, locale, "UTC", longDate), "Saturday, 29 August 2026");
    assert.equal(api.verificationLabel({ fetchedAt: instant }, locale, "UTC"), "Last verification · 29 Aug, 12:05");
    assert.equal(calls.at(-1)?.locale, "en-GB");
  }
  for (const invalid of [undefined, "", "not-a-date", "2026-99-99T25:00:00Z"]) {
    calls.length = 0;
    assert.equal(api.fixtureDate({ startsAt: invalid }, "bad_locale", "bad/zone", clock), "—");
    assert.equal(api.verificationLabel({ fetchedAt: invalid }, "bad_locale", "bad/zone"), null);
    assert.equal(calls.length, 0);
  }
  assert.throws(() => api.fixtureDate({ startsAt: instant }, "en-GB", "bad/zone", clock), { name: "RangeError" }, "zone validation remains the caller's contract");
  assert.equal(api.fixtureDate({ startsAt: instant }, "en-GB", normalizeTouchlineMatchCentreTimeZone("bad/zone"), clock), "12:05");
});

test("isolated eight-locale dates are Gregorian while archive and lineup retain locale hour defaults", () => {
  const { api, calls } = probe();
  const months = ["August", "agosto", "agosto", "agosto", "août", "أغسطس", "Ağustos", "August"];
  for (const [index, locale] of locales.entries()) {
    calls.length = 0;
    const text = api.fixtureDate({ startsAt: instant }, locale, "Europe/Malta", longDate, true);
    assert.ok(text.includes(months[index]), `${locale}: ${text}`);
    assert.equal(calls[0].locale, locale); assert.equal(calls[0].resolved.calendar, "gregory");
    assert.equal(calls[0].options.calendar, "gregory");
    assert.equal(calls[0].options.timeZone, "Europe/Malta");
    api.fixtureDate({ startsAt: instant }, locale, "UTC", shortDate, true);
    api.verificationLabel({ fetchedAt: instant }, locale, "UTC", true);
    assert.equal(calls[1].options.hour12, undefined); assert.equal(calls[1].options.hourCycle, undefined);
    assert.equal(calls[2].options.hour12, false); assert.equal(calls[2].options.hourCycle, undefined);
    if (locale === "ar-SA") assert.equal(calls[1].resolved.hour12, true, "do not silently change archive/lineup to a 24-hour policy");
  }
  for (const locale of locales.slice(2)) assert.equal(i18n.isTouchLineLocaleComplete(locale), false);
});

test("received zones preserve DST, midnight rollover and equivalent offset instants", () => {
  const { api } = probe();
  const cases = [
    ["2026-03-29T00:30:00Z", "Europe/London", "00:30"], ["2026-03-29T01:30:00Z", "Europe/London", "02:30"],
    ["2026-10-25T00:30:00Z", "Europe/London", "01:30"], ["2026-10-25T01:30:00Z", "Europe/London", "01:30"],
    ["2026-01-02T23:30:00Z", "Europe/Malta", "00:30"], ["2026-07-02T23:30:00Z", "Europe/Malta", "01:30"],
    ["2026-03-08T06:30:00Z", "America/New_York", "01:30"], ["2026-03-08T07:30:00Z", "America/New_York", "03:30"],
    ["2026-08-29T12:05:00Z", "America/Sao_Paulo", "09:05"], ["2026-08-29T12:05:00Z", "UTC", "12:05"],
  ];
  for (const [startsAt, zone, expected] of cases) for (const locale of ["en-GB", "pt-BR"]) assert.equal(api.fixtureDate({ startsAt }, locale, zone, clock), expected);
  for (const locale of locales) for (const zone of ["UTC", "Europe/Malta", "America/New_York"]) {
    assert.equal(api.fixtureDate({ startsAt: instant }, locale, zone, longDate), api.fixtureDate({ startsAt: "2026-08-29T14:05:00+02:00" }, locale, zone, longDate));
    assert.equal(api.verificationLabel({ fetchedAt: instant }, locale, zone), api.verificationLabel({ fetchedAt: "2026-08-29T09:05:00-03:00" }, locale, zone));
  }
  assert.equal(api.fixtureDate({ startsAt: "2026-08-29T23:30:00Z" }, "en-GB", "Europe/Malta", longDate), "Sunday, 30 August 2026");
});

function realExpression(match: (text: string, node: ts.Node) => boolean) {
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node) => { if (match(node.getText(ast), node)) nodes.push(node); ts.forEachChild(node, visit); };
  visit(ast); assert.equal(nodes.length, 1); return nodes[0].getText(ast);
}
const expressions = {
  notice: realExpression((text, node) => ts.isConditionalExpression(node) && text.startsWith("readMetadata?.degraded ?")),
  archive: realExpression((text, node) => ts.isJsxElement(node) && text.startsWith("<article dir={textDirection}><span>{dictionary.archive}")),
  lineup: realExpression((text, node) => ts.isConditionalExpression(node) && text.startsWith("verifiedDetail.lineupAvailableAt ?")),
  selectedDate: realExpression((text, node) => ts.isJsxElement(node) && text.startsWith("<span><CalendarDays")),
  selectedTime: realExpression((text, node) => ts.isJsxElement(node) && text.startsWith("<strong><Clock3") && text.includes("fixtureDate")),
  hero: realExpression((text, node) => ts.isJsxElement(node) && text.startsWith("<time className={styles.heroKickoff}")),
  rail: realExpression((text, node) => ts.isJsxElement(node) && text.startsWith("<time") && text.includes("aria-label={fixtureDate")),
};
function render(expression: string, context: Record<string, unknown>) {
  const code = ts.transpileModule(`const element = (${expression}); element;`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2017 } }).outputText;
  const icon = () => React.createElement("i");
  return renderToStaticMarkup(runInNewContext(code, { React, Clock3: icon, CalendarDays: icon, UsersRound: icon,
    styles: { freshnessNotice: "notice" }, fixtureLabel: (fixture: { name: string }) => fixture.name, touchlineFixtureRailDateLabel, ...context }));
}

test("real JSX keeps dates, labels, original datetime and conditional rows across all eight isolated locales", () => {
  const probeValue = probe();
  for (const language of locales) {
    const dictionary = probeValue.copy(language, true);
    const context = { ...probeValue.api, language, dictionary, textDirection: language === "ar-SA" ? "rtl" : "ltr", draftLocalesEnabled: true, initialTimeZone: "Europe/Malta", now: Date.parse(instant), fixture: { startsAt: instant },
      selected: { name: "Official <&> $&", startsAt: instant, verifiedAt: instant },
      verifiedDetail: { lineupAvailableAt: "2026-08-29T14:05:00+02:00" },
      readMetadata: { degraded: true, state: "stale", fetchedAt: instant } };
    const before = JSON.stringify(context);
    const escaped = (value: string) => renderToStaticMarkup(React.createElement(React.Fragment, null, value));
    for (const key of ["selectedDate", "selectedTime", "archive", "lineup", "notice", "hero", "rail"] as const) {
      probeValue.calls.length = 0;
      const html = render(expressions[key], context);
      assert.ok(probeValue.calls.length > 0, `${key} calls real helper`);
      assert.ok(probeValue.calls.every(call => call.locale === language && call.options.calendar === "gregory" && call.options.timeZone === "Europe/Malta"));
      if (key === "selectedTime") assert.ok(html.includes("14:05") || language === "ar-SA");
      if (key === "archive") { assert.ok(html.includes(`dir="${context.textDirection}"`)); assert.ok(html.includes("Official &lt;&amp;&gt; $&")); assert.ok(html.includes(escaped(dictionary.provider))); }
      if (key === "lineup") { assert.ok(html.includes('dateTime="2026-08-29T14:05:00+02:00"')); assert.ok(html.includes(escaped(dictionary.lineupAvailable))); assert.equal(probeValue.calls[0].options.hour12, undefined); }
      if (key === "notice") { assert.ok(html.includes(escaped(dictionary.lastVerifiedAt))); assert.equal(probeValue.calls[0].options.hour12, false); }
      if (key === "hero" || key === "rail") assert.ok(html.includes(`dateTime="${instant}"`));
      if (key === "rail") {
        assert.ok(html.includes("aria-label=")); assert.equal(probeValue.calls[0].options.hour12, false);
        assert.equal(probeValue.calls[0].options.year, "numeric");
        if (language === "en-GB") assert.ok(html.includes('aria-label="Saturday, 29 August 2026 at 14:05"'));
        if (language === "pt-BR") assert.ok(html.includes('aria-label="sábado, 29 de agosto de 2026 às 14:05"'));
      }
    }
    assert.equal(JSON.stringify(context), before);
    assert.equal(render(expressions.notice, { ...context, readMetadata: { degraded: false, fetchedAt: instant } }), "");
    assert.equal(render(expressions.notice, { ...context, readMetadata: null }), "");
    for (const invalid of [undefined, "", "invalid"]) {
      const notice = render(expressions.notice, { ...context, readMetadata: { degraded: true, fetchedAt: invalid } });
      assert.ok(notice.includes('role="status"')); assert.ok(!notice.includes("<em>"));
      const lineup = render(expressions.lineup, { ...context, verifiedDetail: { lineupAvailableAt: invalid } });
      assert.equal(Boolean(lineup), Boolean(invalid));
      if (invalid) { assert.ok(lineup.includes('dateTime="invalid"')); assert.ok(lineup.includes("—")); }
      const archive = render(expressions.archive, { ...context, selected: { name: "Official", verifiedAt: invalid } });
      assert.equal(archive.includes(" · —"), Boolean(invalid));
    }
  }
});
