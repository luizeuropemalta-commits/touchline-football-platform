import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

const siteLocaleEnv: Record<string, string | undefined> = {};
const siteLocalePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: siteLocalePolicy, process: { env: siteLocaleEnv } });
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { getTouchlineFantasyMarketWorkflowCopy } from "../lib/touchlineFantasy/market-workflow-i18n.ts";
import { resolveTouchlineClubOwnerPageIdentity } from "../lib/touchlineArena/club-owner-page-identity.ts";
import { touchLineAuthEntryHref } from "../lib/touchlineArena/auth-i18n.ts";
import { resolveServerReadWithin } from "../lib/touchlineArena/server-read-deadline.ts";
import { TOUCHLINE_ENGLAND_CLUBS } from "../lib/touchlineArena/demo-data.ts";

type User = { id: string; email: string; user_metadata: { full_name: string } };
type Params = { lang?: string | string[]; club?: string | string[] };
type Element = React.ReactElement<Record<string, unknown>>;
const customer: User = { id: "customer-account", email: "customer@example.test", user_metadata: { full_name: "Canonical Customer" } };
const drafts = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"];
const source = readFileSync(new URL("../app/clubowner/page.tsx", import.meta.url), "utf8");
const ownerSource = readFileSync(new URL("../lib/admin/owner.ts", import.meta.url), "utf8");

function compile(sourceText: string, context: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(sourceText, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, ...context });
  return exports;
}

function fixture(options: { user?: User | null; configured?: boolean; rejectAuth?: boolean; rejectSnapshot?: boolean } = {}) {
  const user = options.user === undefined ? customer : options.user;
  const events: string[] = [];
  const authentication = { data: { user }, error: null };
  const avatarContext = Object.freeze({ avatarUrl: "/confirmed-avatar.png" });
  const snapshot = Object.freeze({ sentinel: "canonical-snapshot" });
  // Leaf identities inspect the actual route's props without running browser
  // components. This suite does not claim child rendering or visual coverage.
  const leaves = Object.fromEntries(["brand", "navigation", "header", "notifications", "fantasy"].map(name => [name, function Leaf() { return null; }]));
  const ownerModule = compile(ownerSource, {
    process: { env: { TOUCHLINE_OWNER_EMAILS: "owner@example.test, admin@example.test" } },
  });
  const modules: Record<string, unknown> = {
    "@/lib/touchlineArena/site-locales-release": siteLocalePolicy,
    "react/jsx-runtime": jsxRuntime,
    "next/navigation": {
      redirect: (href: string) => { events.push("redirect"); throw Object.assign(new Error("route redirect"), { kind: "redirect", href }); },
      notFound: () => { events.push("notFound"); throw Object.assign(new Error("route unavailable"), { kind: "notFound" }); },
    },
    "@/components/touchline/ClubOwnerMarketHeader": { default: leaves.header },
    "@/components/touchline/TouchlineBrandHeader": { default: leaves.brand },
    "@/app/fantasy/FantasyGameweekClient": { default: leaves.fantasy },
    "@/components/touchline/TouchlineGlobalNavigation": { default: leaves.navigation },
    "@/components/touchline/notifications/TouchlineMarketNotifications": { default: leaves.notifications },
    "@/lib/supabase/server": { createClient: async () => {
      events.push("createClient");
      return options.configured === false ? null : { auth: { getUser: async () => {
        events.push("getUser");
        if (options.rejectAuth) throw new Error("auth unavailable");
        return authentication;
      } } };
    } },
    "@/lib/admin/owner": ownerModule,
    "@/lib/touchlineArena/club-owner-page-identity": { resolveTouchlineClubOwnerPageIdentity },
    "@/lib/touchlineArena/club-owner-avatar-context-server": { createClubOwnerAvatarContextReader: () => {
      events.push("avatarReaderCreated");
      return async (receivedAuth: unknown, accountId: string) => {
        events.push("avatarRead");
        assert.equal(receivedAuth, authentication);
        assert.equal(accountId, user?.id);
        return avatarContext;
      };
    } },
    "@/lib/touchlineArena/auth-i18n": { touchLineAuthEntryHref },
    "@/lib/touchlineArena/server-read-deadline": { resolveServerReadWithin },
    "@/lib/touchlineFantasy/server": { loadTouchlineFantasySnapshot: async (received: unknown) => {
      events.push("snapshot");
      assert.equal(received, user);
      if (options.rejectSnapshot) throw new Error("snapshot unavailable");
      return snapshot;
    } },
    "@/lib/touchlineArena/demo-data": { TOUCHLINE_ENGLAND_CLUBS },
    "./market-game.module.css": { default: { page: "page", content: "content" } },
    "@/lib/touchlineArena/catalogue-locale": { resolveTouchlineCatalogueLocale },
    "@/lib/touchlineFantasy/market-workflow-i18n": { getTouchlineFantasyMarketWorkflowCopy },
  };
  const loaded = compile(`${source}\nexports.internalRoute = typeof renderClubOwnerPage === "function" ? renderClubOwnerPage : undefined;\nexports.internalMetadata = typeof generateClubOwnerMetadata === "function" ? generateClubOwnerMetadata : undefined;`, {
    require: (name: string) => { assert.ok(Object.hasOwn(modules, name), `Unexpected dependency ${name}`); return modules[name]; },
    fetch: () => assert.fail("No network permitted"),
  });
  const route = loaded.default as (props: { searchParams: Promise<Params> }) => Promise<Element>;
  const metadata = loaded.generateMetadata as (props: { searchParams: Promise<Params> }) => Promise<{ title: string; description: string }>;
  const internalRoute = (params: Params, enabled?: boolean) => {
    assert.equal(typeof loaded.internalRoute, "function", "private renderClubOwnerPage seam must exist");
    return (loaded.internalRoute as (props: { searchParams: Promise<Params> }, enabled?: boolean) => Promise<Element>)({ searchParams: Promise.resolve(params) }, enabled);
  };
  const internalMetadata = (params: Params, enabled?: boolean) => {
    assert.equal(typeof loaded.internalMetadata, "function", "private generateClubOwnerMetadata seam must exist");
    return (loaded.internalMetadata as (props: { searchParams: Promise<Params> }, enabled?: boolean) => Promise<{ title: string; description: string }>)({ searchParams: Promise.resolve(params) }, enabled);
  };
  return { events, leaves, snapshot, avatarContext, internalRoute, internalMetadata, route: (params: Params) => route({ searchParams: Promise.resolve(params) }), metadata: (params: Params) => metadata({ searchParams: Promise.resolve(params) }) };
}

function descendants(node: React.ReactNode): Element[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<Record<string, unknown>>(child)
    ? [child, ...descendants(child.props.children as React.ReactNode)] : []);
}

test("default route keeps all draft requests in English and passes false to every child boundary", async () => {
  for (const requested of drafts) {
    const h = fixture();
    const root = await h.route({ lang: requested });
    assert.equal(root.type, "main");
    assert.equal(root.props.dir, undefined, "closed gate must preserve the current layout contract");
    const elements = descendants(root);
    for (const [name, leaf] of Object.entries(h.leaves)) {
      const matching = elements.filter(element => element.type === leaf);
      assert.equal(matching.length, 1, name);
      assert.equal(matching[0].props.locale, "en-GB", name);
      assert.equal(matching[0].props.draftLocalesEnabled, false, name);
    }
    const header = elements.find(element => element.type === h.leaves.header)!;
    const brand = elements.find(element => element.type === h.leaves.brand)!;
    const children = React.Children.toArray(root.props.children as React.ReactNode) as Element[];
    assert.equal(children[0].type, h.leaves.brand, "brand is first, outside the padded content");
    assert.equal(children[1].props.className, "content");
    assert.equal(descendants(children[1]).some(element => element.type === h.leaves.brand), false);
    assert.equal((brand.props.accountLocaleContext as { mode: string }).mode, "account");
    assert.equal((brand.props.accountLocaleContext as { accountId: string }).accountId, customer.id);
    assert.equal(brand.props.href, "/clubowner?lang=en-GB");
    assert.equal(elements.find(element => element.type === h.leaves.navigation)!.props.showAudioControl, false);
    const fantasy = elements.find(element => element.type === h.leaves.fantasy)!;
    assert.equal(header.props.accountId, customer.id);
    assert.equal(header.props.avatarContext, h.avatarContext);
    assert.equal((header.props.owner as { name: string }).name, customer.user_metadata.full_name);
    assert.equal(fantasy.props.initialSnapshot, h.snapshot);
    assert.equal(fantasy.props.embedded, true);
    assert.equal(fantasy.props.marketPage, true);
    assert.deepEqual(h.events, ["avatarReaderCreated", "createClient", "getUser", "avatarRead", "snapshot"]);
  }
});

test("metadata uses the same closed locale gate without touching authentication or snapshots", async () => {
  const h = fixture();
  for (const lang of [undefined, "bad", ...drafts]) {
    const metadata = await h.metadata({ lang });
    assert.equal(metadata.title, "ClubOwner · TouchLine");
    assert.equal(metadata.description, getTouchlineFantasyMarketWorkflowCopy("en-GB").metadataDescription);
  }
  assert.equal((await h.metadata({ lang: "pt-BR" })).description, getTouchlineFantasyMarketWorkflowCopy("pt-BR").metadataDescription);
  assert.deepEqual(h.events, []);
});

test("missing auth, missing configuration and rejected auth redirect before protected reads", async () => {
  for (const options of [{ user: null }, { configured: false }, { rejectAuth: true }]) {
    const h = fixture(options);
    await assert.rejects(h.route({ lang: "ar-SA" }), (error: unknown) => {
      const failure = error as { kind?: string; href?: string };
      assert.equal(failure.kind, "redirect");
      assert.equal(failure.href, touchLineAuthEntryHref("/login", "en-GB", "/clubowner?lang=en-GB"));
      return true;
    });
    assert.equal(h.events.includes("snapshot"), false);
    assert.equal(h.events.includes("avatarRead"), false);
  }
});

test("configured owner and admin identities are denied before snapshot or avatar reads", async () => {
  for (const email of ["owner@example.test", " ADMIN@EXAMPLE.TEST "]) {
    const h = fixture({ user: { ...customer, email } });
    await assert.rejects(h.route({ lang: "pt-BR" }), (error: unknown) => {
      assert.equal((error as { kind?: string }).kind, "notFound");
      return true;
    });
    assert.deepEqual(h.events, ["avatarReaderCreated", "createClient", "getUser", "notFound"]);
  }
});

test("Portuguese customer route preserves club selection, identity and false child gates", async () => {
  const h = fixture();
  const club = TOUCHLINE_ENGLAND_CLUBS[0];
  const root = await h.route({ lang: ["pt-BR", "ar-SA"], club: [club.slug, "unknown"] });
  const elements = descendants(root);
  for (const leaf of Object.values(h.leaves)) {
    const element = elements.find(candidate => candidate.type === leaf)!;
    assert.equal(element.props.locale, "pt-BR");
    assert.equal(element.props.draftLocalesEnabled, false);
  }
  const fantasy = elements.find(element => element.type === h.leaves.fantasy)!;
  assert.equal(fantasy.props.initialPlayerClubTeamId, club.teamId);
  assert.equal((fantasy.props.clubOwner as { name: string }).name, customer.user_metadata.full_name);
});

test("snapshot failure remains null and never invents customer game state", async () => {
  const h = fixture({ rejectSnapshot: true });
  const root = await h.route({ lang: "de-DE", club: "unknown" });
  const fantasy = descendants(root).find(element => element.type === h.leaves.fantasy)!;
  assert.equal(fantasy.props.initialSnapshot, null);
  assert.equal(fantasy.props.initialPlayerClubTeamId, null);
  assert.equal(fantasy.props.locale, "en-GB");
  assert.equal(fantasy.props.draftLocalesEnabled, false);
});

test("trusted private render propagates all eight locales without changing identity, avatar or snapshot reads", async () => {
  const club = TOUCHLINE_ENGLAND_CLUBS[0];
  for (const locale of ["en-GB", "pt-BR", ...drafts]) {
    const h = fixture();
    const root = await h.internalRoute({ lang: [locale, "en-GB"], club: [club.slug, "unknown"] }, true);
    assert.equal(root.type, "main");
    assert.equal(root.props.dir, "ltr");
    const elements = descendants(root);
    for (const [name, leaf] of Object.entries(h.leaves)) {
      const matches = elements.filter(element => element.type === leaf);
      assert.equal(matches.length, 1, name);
      assert.equal(matches[0].props.locale, locale, name);
      assert.equal(matches[0].props.draftLocalesEnabled, true, name);
    }
    const brand = elements.find(element => element.type === h.leaves.brand)!;
    const header = elements.find(element => element.type === h.leaves.header)!;
    const fantasy = elements.find(element => element.type === h.leaves.fantasy)!;
    assert.equal(brand.props.href, `/clubowner?lang=${locale}&club=${encodeURIComponent(club.slug)}`);
    assert.equal((brand.props.accountLocaleContext as { accountId: string }).accountId, customer.id);
    assert.equal(header.props.avatarContext, h.avatarContext);
    assert.equal(header.props.accountId, customer.id);
    assert.equal((header.props.owner as { name: string }).name, customer.user_metadata.full_name);
    assert.equal(fantasy.props.initialSnapshot, h.snapshot);
    assert.equal(fantasy.props.initialPlayerClubTeamId, club.teamId);
    assert.equal(fantasy.props.embedded, true);
    assert.equal(fantasy.props.marketPage, true);
    assert.equal(elements.find(element => element.type === h.leaves.navigation)!.props.showAudioControl, false);
    assert.deepEqual(h.events, ["avatarReaderCreated", "createClient", "getUser", "avatarRead", "snapshot"]);
  }
});

test("private metadata uses real eight-language copy and performs no protected reads", async () => {
  const h = fixture();
  for (const locale of ["en-GB", "pt-BR", ...drafts]) {
    const metadata = await h.internalMetadata({ lang: [locale, "en-GB"] }, true);
    assert.equal(metadata.title, "ClubOwner · TouchLine");
    assert.equal(metadata.description, getTouchlineFantasyMarketWorkflowCopy(locale, true).metadataDescription);
    if (drafts.includes(locale)) assert.notEqual(metadata.description, getTouchlineFantasyMarketWorkflowCopy("en-GB").metadataDescription);
  }
  assert.deepEqual(h.events, []);
});

test("private defaults stay closed and public exports cannot be enabled by extra query fields", async () => {
  for (const enabled of [undefined, false]) {
    const h = fixture();
    const root = await h.internalRoute({ lang: "ar-SA" }, enabled);
    const fantasy = descendants(root).find(element => element.type === h.leaves.fantasy)!;
    assert.equal(fantasy.props.locale, "en-GB");
    assert.equal(fantasy.props.draftLocalesEnabled, false);
    assert.equal((await h.internalMetadata({ lang: "ar-SA" }, enabled)).description, getTouchlineFantasyMarketWorkflowCopy("en-GB").metadataDescription);
  }
  const h = fixture();
  const forged = { lang: "ar-SA", draftLocalesEnabled: true, draft: "true" };
  const root = await h.route(forged);
  assert.equal(descendants(root).find(element => element.type === h.leaves.fantasy)!.props.locale, "en-GB");
  assert.equal((await h.metadata(forged)).description, getTouchlineFantasyMarketWorkflowCopy("en-GB").metadataDescription);
});

test("Next public exports delegate to the server policy and do not export the internal render seams", () => {
  const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  for (const [name, target] of [["MarketTransferPage", "renderClubOwnerPage"], ["generateMetadata", "generateClubOwnerMetadata"]]) {
    const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(declaration && ts.isFunctionDeclaration(declaration) && declaration.body, name);
    const returns = declaration.body.statements.filter(ts.isReturnStatement);
    assert.equal(returns.length, 1, name);
    const call = returns[0].expression;
    assert.ok(call && ts.isCallExpression(call), name);
    assert.equal(call.expression.getText(tree), target);
    assert.equal(call.arguments.length, 2);
    assert.equal(call.arguments[1].getText(tree), 'isTouchLineSiteLocalesEnabled("/clubowner")');
    const internal = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === target);
    assert.ok(internal && ts.isFunctionDeclaration(internal), target);
    assert.equal(internal.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false, false);
    assert.equal(internal.parameters[1]?.initializer?.kind, ts.SyntaxKind.FalseKeyword);
  }
});

test("real ClubOwner page and metadata preserve eight public locales only with the server flag ON", async () => {
  try {
    for (const flag of [undefined, "false", "true"]) for (const locale of ["en-GB", "pt-BR", ...drafts]) {
      siteLocaleEnv.TOUCHLINE_SITE_LOCALES_ENABLED = flag;
      const h = fixture();
      const tree = await h.route({ lang: locale });
      const child = descendants(tree).find(node => node.type === h.leaves.fantasy)!;
      assert.equal(child.props.locale, flag === "true" ? locale : locale === "pt-BR" ? "pt-BR" : "en-GB");
      assert.equal(child.props.draftLocalesEnabled, flag === "true");
      assert.deepEqual(await h.metadata({lang:locale}), await h.internalMetadata({lang:locale}, flag === "true"));
    }
  } finally { delete siteLocaleEnv.TOUCHLINE_SITE_LOCALES_ENABLED; }
});

test("trusted draft presentation does not bypass auth, owner denial or failed snapshot fallback", async () => {
  for (const options of [{ user: null }, { configured: false }, { rejectAuth: true }]) {
    const h = fixture(options);
    await assert.rejects(h.internalRoute({ lang: "ar-SA" }, true), (error: unknown) => {
      assert.equal((error as { kind?: string }).kind, "redirect");
      return true;
    });
    assert.equal(h.events.includes("avatarRead"), false);
    assert.equal(h.events.includes("snapshot"), false);
  }
  const owner = fixture({ user: { ...customer, email: "owner@example.test" } });
  await assert.rejects(owner.internalRoute({ lang: "ar-SA" }, true), (error: unknown) => {
    assert.equal((error as { kind?: string }).kind, "notFound");
    return true;
  });
  assert.deepEqual(owner.events, ["avatarReaderCreated", "createClient", "getUser", "notFound"]);
  const failed = fixture({ rejectSnapshot: true });
  const root = await failed.internalRoute({ lang: "ar-SA" }, true);
  const fantasy = descendants(root).find(element => element.type === failed.leaves.fantasy)!;
  assert.equal(fantasy.props.initialSnapshot, null);
  assert.equal(fantasy.props.locale, "ar-SA");
  assert.equal(fantasy.props.draftLocalesEnabled, true);
});

test("unauthenticated redirect preserves all eight trusted locales and the exact ClubOwner returnTo", async () => {
  const club = TOUCHLINE_ENGLAND_CLUBS[0];
  for (const requested of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    for (const options of [{ user: null }, { configured: false }, { rejectAuth: true }]) {
      const h = fixture(options);
      await assert.rejects(h.internalRoute({ lang: requested, club: club.slug }, true), (error: unknown) => {
        const failure = error as { kind?: string; href?: string };
        assert.equal(failure.kind, "redirect");
        assert.equal(typeof failure.href, "string");
        const target = new URL(failure.href!, "https://synthetic.invalid");
        assert.equal(target.pathname, "/login");
        assert.equal(target.searchParams.get("lang"), requested);
        assert.equal(target.searchParams.get("returnTo"), `/clubowner?lang=${requested}&club=${encodeURIComponent(club.slug)}`);
        assert.deepEqual([...target.searchParams.keys()].sort(), ["lang", "returnTo"]);
        return true;
      });
      assert.equal(h.events.includes("avatarRead"), false);
      assert.equal(h.events.includes("snapshot"), false);
      assert.equal(h.events.filter(event => event === "getUser").length, options.configured === false ? 0 : 1);
    }
  }
});

test("public and default private auth redirects retain the EN/PT release gate", async () => {
  for (const requested of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    const expected = requested === "pt-BR" ? "pt-BR" : "en-GB";
    for (const mode of ["public", "default", "false"] as const) {
      const h = fixture({ user: null });
      const pending = mode === "public" ? h.route({ lang: requested })
        : mode === "default" ? h.internalRoute({ lang: requested }) : h.internalRoute({ lang: requested }, false);
      await assert.rejects(pending, (error: unknown) => {
        const failure = error as { kind?: string; href?: string };
        assert.equal(failure.kind, "redirect");
        const target = new URL(failure.href!, "https://synthetic.invalid");
        assert.equal(target.pathname, "/login");
        assert.equal(target.searchParams.get("lang"), expected);
        assert.equal(target.searchParams.get("returnTo"), `/clubowner?lang=${expected}`);
        return true;
      });
      assert.equal(h.events.includes("avatarRead"), false);
      assert.equal(h.events.includes("snapshot"), false);
    }
  }
});
