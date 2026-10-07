import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import * as icons from "lucide-react";
import ts from "typescript";
import * as copyModule from "../lib/touchlineArena/social-feed-i18n.ts";
import { TOUCHLINE_CLUB_HUB_SHARE_CATALOGUES } from "../lib/touchlineArena/club-hub-share-i18n.ts";

const source = readFileSync(new URL("../components/touchline/social/TouchlineSocial.tsx", import.meta.url), "utf8");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
function load(sharedState?: string) {
  const exports: Record<string, (props: object) => React.ReactElement> = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports,
    require: (name: string) => {
      if (name === "react") return { ...React, useMemo: (fn: () => unknown) => fn(), useEffect: () => {},
        useState: (initial: unknown) => [initial instanceof Map && sharedState ? new Map([["official-id", sharedState]]) : initial, () => assert.fail("No action during render")] };
      if (name === "react/jsx-runtime") return jsx;
      if (name === "lucide-react") return icons;
      if (name.endsWith("social-feed-i18n")) return copyModule;
      if (name.endsWith("social-native-share")) return { shareTouchlinePost: () => assert.fail("Render must not share") };
      if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name.endsWith("ClubOwnerPortraitPerimeterTrace")) return { ClubOwnerPortraitPerimeterTrace: () => null };
      if (name.endsWith("TouchlineClubPerimeterTrace")) return { default: () => null };
      assert.fail(`Unexpected module ${name}`);
    },
    Map,
    window: new Proxy({}, { get: () => assert.fail("No browser action during render") }),
  });
  return exports;
}
const escaped = (value: string) => renderToStaticMarkup(React.createElement("span", null, value)).slice(6, -7);
const identity = '<b>Official & $& name</b>';
const posts = ["official", "simulation", "owner"].map(kind => Object.freeze({
  id: `${kind}-id`, kind, title: identity, body: "Factual body 123", meta: "2026-10-03", badge: "987",
  actionHref: "/touchline-players/123?lang=pt-BR", actionLabel: "Exact action", visualValue: "42",
}));

test("real feed covers eight catalogues, empty/filter/post/share states without altering facts", () => {
  const before = JSON.stringify(posts);
  for (const locale of locales) {
    const copy = copyModule.getTouchlineSocialFeedCopy(locale, true);
    for (const state of [undefined, "shared", "copied", "unavailable"]) {
      const { TouchlineSocialFeed: Feed } = load(state);
      const html = renderToStaticMarkup(Feed({ entityId: "player:123", entityName: identity, accent: "#fff", locale, draftLocalesEnabled: true, posts, highlights: [{ label: "Fact", value: "123" }] }));
      for (const value of [copy.title, copy.description, copy.officialPost, copy.simulationPost, copy.ownerPost, copy.verifiedProfile, copy.all, copy.official, copy.simulation, copy.featured, copy.likesUnavailable, identity, "Factual body 123", "987", "TouchLine Pulse", "TouchLine Live", "ClubOwner"]) assert.ok(html.includes(escaped(value)), `${locale}: ${value}`);
      const share = state === "shared" ? copy.shared : state === "copied" ? copy.copied : state === "unavailable" ? copy.shareUnavailable : copy.share;
      assert.ok(html.includes(escaped(share)));
      assert.match(html, /disabled=""/);
      assert.ok(html.includes('href="/touchline-players/123?lang=pt-BR"'));
      assert.ok(!html.includes("<b>Official"));
    }
    const { TouchlineSocialFeed: Feed } = load();
    assert.ok(renderToStaticMarkup(Feed({ entityId: "p", accent: "#fff", locale, draftLocalesEnabled: true, posts: [] })).includes(escaped(copy.empty)));
    const custom = renderToStaticMarkup(Feed({ entityId: "p", accent: "#fff", locale, draftLocalesEnabled: true, posts: [], emptyMessage: identity, entityRole: "Exact role" }));
    assert.ok(custom.includes(escaped(identity))); assert.ok(custom.includes("Exact role"));
    assert.equal(copy.shared, TOUCHLINE_CLUB_HUB_SHARE_CATALOGUES[locale].shared);
    assert.equal(copy.copied, TOUCHLINE_CLUB_HUB_SHARE_CATALOGUES[locale].copied);
  }
  assert.equal(JSON.stringify(posts), before);
});

test("default feed wording and six-language gating remain unchanged", () => {
  const { TouchlineSocialFeed: Feed } = load();
  const base = { entityId: "p", posts: [], accent: "#fff" };
  assert.ok(renderToStaticMarkup(Feed(base)).includes("Central de atualizações"));
  assert.equal(copyModule.getTouchlineSocialFeedCopy("en-GB").share, "Share");
  assert.equal(copyModule.getTouchlineSocialFeedCopy("pt-BR").shareUnavailable, "Indisponível");
  for (const locale of [...locales.slice(2), "invalid"]) {
    assert.equal(copyModule.getTouchlineSocialFeedCopy(locale), copyModule.getTouchlineSocialFeedCopy("en-GB"));
    assert.ok(renderToStaticMarkup(Feed({ ...base, locale })).includes("Updates centre"));
  }
});

test("real profile header localizes only its accessible label and escapes factual name", () => {
  const { TouchlineSocialProfileHeader: Header } = load();
  const base = { name: identity, kind: "Official", subtitle: "Exact subtitle", accent: "#fff", profileDetails: [{ label: "Fact", value: "42" }] };
  for (const locale of locales) {
    const expected = copyModule.touchlineSocialProfileDetailsLabel(identity, locale, true);
    assert.ok(expected.includes(identity), "replacement metacharacters remain factual");
    const html = renderToStaticMarkup(Header({ ...base, locale, draftLocalesEnabled: true }));
    assert.ok(html.includes(`aria-label="${escaped(expected)}"`));
    assert.ok(html.includes(escaped(identity))); assert.ok(html.includes("Exact subtitle"));
    assert.ok(!html.includes("<b>Official"));
  }
  const defaultHtml = renderToStaticMarkup(Header(base));
  assert.ok(defaultHtml.includes(`aria-label="${escaped(`${identity} profile details`)}"`));
  assert.equal(copyModule.touchlineSocialProfileDetailsLabel(identity, "ar-SA"), `${identity} profile details`);
});
