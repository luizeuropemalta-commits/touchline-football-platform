import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import * as ReactDOM from "react-dom";
import * as jsx from "react/jsx-runtime";
import * as icons from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as contract from "../lib/touchlineArena/clubowner-public-contract.ts";
import * as auth from "../lib/touchlineArena/auth-i18n.ts";
import * as handler from "../lib/touchlineArena/clubowner-public-handler.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";

const root = resolve(import.meta.dirname, "..");
const directoryFile = "components/touchline/social/ClubOwnerPublicDirectory.tsx", profileFile = "components/touchline/social/ClubOwnerPublicProfile.tsx";
const searchFile = "components/touchline/social/ClubOwnerSearch.tsx";
const id = "11111111-2222-4333-8444-555555555555";
const publicProfile: contract.PublicOwnerProfile = { publicId: id, displayName: "Synthetic Public Person", followerCount: 3, following: false, viewer: "member" };
type Node = React.ReactElement<Record<string, unknown>>;
type Component = (props: Record<string, unknown>) => React.ReactElement;
function loader(options: { stubNestedSearch?: boolean; react?: object; reactScope?: readonly string[]; fetch?: typeof fetch; dependencies?: handler.PeopleDependencies; timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } } = {}) {
  const cache = new Map<string, Record<string, unknown>>();
  const load = (path: string): Record<string, unknown> => {
    path = resolve(root, path);
    const old = cache.get(path); if (old) return old;
    const exports: Record<string, unknown> = {}; cache.set(path, exports);
    const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    runInNewContext(code, { exports, Request, Response, URL, URLSearchParams, Intl, AbortController, Map, Set, JSON,
      setTimeout: options.timers?.setTimeout ?? setTimeout, clearTimeout: options.timers?.clearTimeout ?? clearTimeout,
      fetch: options.fetch ?? (() => assert.fail("Unexpected network")),
      require(name: string): unknown {
        if (name === "@/lib/touchlineArena/clubowner-public-squad-server") return { readPublicOwnerSquad: async () => null };
        if (name === "@/components/touchline/cards/TouchlineCardLeadershipLayout" || name === "@/components/touchline/social/ClubOwnerPublicSquad") return { __esModule: true, default: () => null };
        if (name === "react") return options.react && (!options.reactScope || options.reactScope.includes(path)) ? options.react : React;
        if (name === "react-dom") return ReactDOM;
        if (name === "react/jsx-runtime") return jsx;
        if (name === "lucide-react") return icons;
        if (name === "next/navigation") return { useRouter: () => ({ refresh: () => undefined }), redirect: (url: string) => { throw new Error("REDIRECT:" + url); } };
        if (name === "@/lib/touchlineArena/catalogue-locale") return catalogueLocale;
        if (name === "@/lib/touchlineArena/site-locales-release") return { isTouchLineSiteLocalesEnabled: () => false };
        if (name === "@/lib/touchlineArena/account-locale-context-server") return { loadAccountLocaleContext: async () => ({ mode: "guest" }) };
        if (name === "@/components/touchline/TouchlineBrandHeader") return { __esModule: true, default: ({ navigation, accountLocaleContext }: { navigation: React.ReactNode; accountLocaleContext: { mode: string } }) => {
          assert.equal(accountLocaleContext.mode, "guest"); return React.createElement("header", { "data-global-header": true }, navigation); } };
        if (name === "@/components/touchline/TouchlineGlobalNavigation") return { __esModule: true, default: ({ surface }: { surface: string }) => {
          assert.equal(surface, "public"); return React.createElement("nav", { "aria-label": "TouchLine" }); } };
        if (options.stubNestedSearch && name === "./ClubOwnerSearch") return { __esModule: true, default: () => React.createElement("div", { "data-isolated-search-boundary": true }) };
        if (name === "next/link") return { __esModule: true, default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, children) };
        if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
        if (name === "@/lib/touchlineArena/auth-i18n") return auth;
        if (name === "@/lib/touchlineArena/clubowner-public-contract") return contract;
        if (name === "@/lib/touchlineArena/clubowner-public-handler") return handler;
        if (name === "@/lib/touchlineArena/clubowner-public-server") return { publicOwnerDependencies: () => options.dependencies };
        const relative = name.startsWith("@/") ? resolve(root, name.slice(2)) : resolve(dirname(path), name);
        const target = [relative, relative + ".tsx", relative + ".ts"].find(existsSync);
        if (!target) throw new Error(`Unmocked dependency ${name}`);
        return load(target);
      },
    });
    return exports;
  };
  return load;
}
function nodes(value: React.ReactNode): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement<Record<string, unknown>>(value)) return [];
  return [value, ...nodes(value.props.children as React.ReactNode)];
}
function harness(file: string, props: Record<string, unknown>) {
  let index = 0, unmounted = false, lateStateWrites = 0;
  const slots: unknown[] = [], effects = new Map<number, { deps?: readonly unknown[]; cleanup?: () => void }>(), pending: { url: string; init: RequestInit; resolve(value: Response): void; reject(error: Error): void }[] = [];
  const timers = new Map<number, () => void>(); let timerId = 0;
  const react = { ...React,
    useState(initial: unknown) { const slot = index++; if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial; return [slots[slot], (value: unknown) => { if (unmounted) lateStateWrites++; slots[slot] = typeof value === "function" ? value(slots[slot]) : value; }]; },
    useRef(initial: unknown) { const slot = index++; if (!(slot in slots)) slots[slot] = { current: initial }; return slots[slot]; },
    useId() { const slot = index++; return `fixture-id-${slot}`; },
    useEffect(effect: () => (() => void) | undefined, deps?: readonly unknown[]) {
      const slot = index++, previous = effects.get(slot);
      if (previous && deps && previous.deps?.length === deps.length && deps.every((value, i) => Object.is(value, previous.deps![i]))) return;
      previous?.cleanup?.(); effects.set(slot, { deps, cleanup: effect() });
    },
  };
  // Only the directly exercised component and its request hook share this hook
  // harness. Nested components rendered by ReactDOM must use real React hooks:
  // SSR does not mount effects, and their state must not pollute parent slots.
  const load = loader({ react, reactScope: [resolve(root, file), resolve(root, "components/touchline/social/usePublicOwnersRequest.ts")], stubNestedSearch: file === directoryFile,
    timers: { setTimeout: ((callback: () => void) => { const id = ++timerId; timers.set(id, () => { timers.delete(id); callback(); }); return id; }) as unknown as typeof setTimeout,
      clearTimeout: ((id: number) => timers.delete(id)) as unknown as typeof clearTimeout },
    fetch: ((url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
      pending.push({ url, init, resolve, reject }); init.signal?.addEventListener("abort", () => reject(new Error("ABORTED")), { once: true });
    })) as typeof fetch,
  });
  const Component = load(file).default as Component;
  const render = () => { index = 0; return Component(props); };
  const select = (predicate: (node: Node) => boolean) => { const node = nodes(render()).find(predicate); assert.ok(node, "Expected real rendered element"); return node; };
  const button = (label: string) => select(node => node.type === "button" && (node.props["aria-label"] === label || node.props.children === label));
  return { pending, render, select, button, props, timers, lateStateWrites: () => lateStateWrites,
    change: (id: string, value: string) => (select(node => node.props.id === id).props.onChange as (e: unknown) => void)({ target: { value } }),
    unmount() { unmounted = true; effects.forEach(effect => effect.cleanup?.()); },
  };
}
const submit = (node: Node) => (node.props.onSubmit as (event: { preventDefault(): void }) => Promise<void>)({ preventDefault() {} });
const click = (node: Node) => (node.props.onClick as () => Promise<void>)();

for (const locale of ["pt-BR", "en-GB"] as const) {
  const copy = contract.peopleCopy(locale);
  test(`retired directory ${locale}: redirects to ClubOwner with no standalone language buttons`, async () => {
    const load = loader({ dependencies: { enabled: true, currentActor: async () => ({ allowed: true }), rpc: async () => null } });
    const page = load("app/clubowners/page.tsx").default as (props: unknown) => Promise<React.ReactElement>;
    await assert.rejects(page({ searchParams: Promise.resolve({ lang: locale }) }), { message: `REDIRECT:/clubowner?lang=${locale}` });
    assert.equal(contract.publicOwnerSettingsHref(locale), `/clubowner?lang=${locale}&settings=profile#public-profile`);
  });
  test(`settings-only editor ${locale}: independent photo consent stays explicit, accessible and read-only on entry`, () => {
    const copy = contract.peopleCopy(locale);
    const h = harness(directoryFile, { locale, enabled: true, settingsOnly: true, photoSharingEnabled: true,
      initialOwn: { status: 200, profile: null } });
    const html = renderToStaticMarkup(h.render());
    assert.ok(html.includes(copy.consent)); assert.ok(html.includes(copy.nameHelp)); assert.ok(html.includes(copy.photoConsent)); assert.ok(html.includes(copy.photoPrivacy));
    assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2);
    assert.doesNotMatch(html, /checked=""|people-search-heading|data-isolated-search-boundary|type="search"/);
    assert.match(html, /<label for="people-name">/); assert.match(html, /id="public-profile"/);
    assert.equal(h.pending.length, 0); h.unmount();
  });
  test(`optional legacy searchOnly prop ${locale}: retains privacy link without publishing; actual routes use separate entrypoints`, () => {
    const h = harness(directoryFile, { locale, enabled: true, searchOnly: true, initialOwn: { status: 200, profile: null } });
    const html = renderToStaticMarkup(h.render());
    assert.ok(html.includes(copy.manageProfile)); assert.ok(html.includes(copy.discoverableHelp));
    assert.equal(h.select(node => node.props.children === copy.manageProfile).props.href, contract.publicOwnerSettingsHref(locale));
    assert.doesNotMatch(html, /id="people-name"|type="checkbox"|accountId|@|wallet|balance/);
    assert.equal(h.pending.length, 0, "Viewing the Exchange must not read or publish private account details");
    h.props.enabled = false;
    const disabled = renderToStaticMarkup(h.render());
    assert.ok(disabled.includes(copy.unavailable)); assert.ok(!disabled.includes(copy.manageProfile));
    assert.equal(h.pending.length, 0); h.unmount();
  });
  test(`public profile unavailable ${locale}: no false empty state or opt-in form before the server is ready`, () => {
    const h = harness(directoryFile, { locale, enabled: true, initialOwn: { status: 503, profile: null } });
    const html = renderToStaticMarkup(h.render());
    assert.ok(html.includes(copy.unavailable)); assert.ok(html.includes(copy.retry));
    assert.ok(!html.includes(copy.empty)); assert.doesNotMatch(html, /id="people-name"|type="checkbox"/);
    assert.equal(h.pending.length, 0); h.unmount();
  });
  test(`actual profile page SSR ${locale}: precise count, public ID and safe states`, async () => {
    for (const [result, enabled, expected] of [[publicProfile, true, copy.follow], [null, true, copy.notFound], [publicProfile, false, copy.unavailable]] as const) {
      const load = loader({ dependencies: { enabled, currentActor: async () => null, rpc: async () => result } });
      const page = load("app/clubowners/[publicId]/page.tsx").default as (props: unknown) => Promise<React.ReactElement>;
      const html = renderToStaticMarkup(await page({ params: Promise.resolve({ publicId: id }), searchParams: Promise.resolve({ lang: locale }) }));
      assert.ok(html.includes(expected)); if (enabled && result) { assert.ok(html.includes(publicProfile.displayName)); assert.match(html, /<dd>3<\/dd>/); }
      assert.ok(html.includes('data-global-header="true"'));
      assert.doesNotMatch(html, /type="search"|role="search"|people-search-heading/);
      assert.ok(!html.includes(`href="/clubowners?lang=${locale}"`), "Profile search must not navigate to the old inline directory");
      assert.doesNotMatch(html, />Português<|>English</);
    }
  });
  test(`real directory handlers ${locale}: explicit name save, one PUT, preserved pending state, exact payload`, async () => {
    const h = harness(directoryFile, { locale, enabled: true, initialOwn: { status: 200, profile: null } });
    const searchKey = () => h.select(node => node.props.enabled === true && node.props.locale === locale).key;
    const beforeSearchKey = searchKey();
    h.change("people-name", "Chosen Public Name");
    const consent = h.select(node => node.type === "input" && node.props.type === "checkbox");
    assert.equal(consent.props.checked, false);
    (consent.props.onChange as (event: unknown) => void)({ target: { checked: true } });
    assert.equal(h.pending.length, 0, "name entry alone never publishes");
    const form = () => h.select(node => node.type === "form" && nodes(node.props.children as React.ReactNode).some(child => child.props.id === "people-name"));
    const work = submit(form()); await submit(form());
    assert.equal(h.pending.length, 1); assert.equal(h.pending[0].url, "/api/account/public-profile"); assert.equal(h.pending[0].init.method, "PUT");
    assert.deepEqual(JSON.parse(String(h.pending[0].init.body)), { displayName: "Chosen Public Name", published: true });
    assert.equal(h.button(copy.saving).props.disabled, true);
    h.pending[0].resolve(Response.json({ profile: { publicId: id, displayName: "Chosen Public Name", published: true, followerCount: 0 } })); await work;
    assert.notEqual(searchKey(), beforeSearchKey, "confirmed publication refreshes the public directory rather than leaving its old snapshot mounted");
    assert.ok(renderToStaticMarkup(h.render()).includes(copy.saved)); assert.equal(h.timers.size, 0);
    h.unmount(); assert.equal(h.lateStateWrites(), 0);
  });
  test(`real follow handlers ${locale}: server counts, no duplicate write, unknown outcome needs GET`, async () => {
    const h = harness(profileFile, { locale, publicId: id, enabled: true, initial: { status: 200, profile: publicProfile } });
    const work = click(h.button(copy.follow)); await click(h.button(copy.saving)); assert.equal(h.pending.length, 1);
    assert.deepEqual(JSON.parse(String(h.pending[0].init.body)), { active: true });
    h.pending[0].resolve(Response.json({ error: "unavailable" }, { status: 503 })); await work;
    assert.equal(h.button(copy.follow).props.disabled, true); assert.equal(h.pending.length, 1);
    assert.ok(renderToStaticMarkup(h.render()).includes(copy.writeError)); assert.match(renderToStaticMarkup(h.render()), /<dd>3<\/dd>/);
    const refresh = click(h.button(copy.retry)); assert.equal(h.pending[1].init.method, "GET");
    h.pending[1].resolve(Response.json({ profile: { ...publicProfile, following: true, followerCount: 4 } })); await refresh;
    assert.equal(h.button(`${copy.following}: ${copy.unfollow}`).props.disabled, false);
    assert.equal(h.button(`${copy.following}: ${copy.unfollow}`).props["aria-pressed"], true);
    assert.equal(h.button(`${copy.following}: ${copy.unfollow}`).props["data-action"], "follow"); assert.match(renderToStaticMarkup(h.render()), /<dd>4<\/dd>/);
    const unfollow = click(h.button(`${copy.following}: ${copy.unfollow}`)); assert.deepEqual(JSON.parse(String(h.pending[2].init.body)), { active: false });
    h.pending[2].resolve(Response.json({ profile: publicProfile })); await unfollow; h.unmount();
  });
}
test("real request lifecycle aborts at 15s and on unmount without repeating writes or stale state updates", async () => {
  const copy = contract.peopleCopy("en-GB");
  for (const mode of ["timeout", "unmount"] as const) {
    const h = harness(profileFile, { locale: "en-GB", publicId: id, enabled: true, initial: { status: 200, profile: publicProfile } });
    const work = click(h.button(copy.follow)); assert.equal(h.timers.size, 1);
    if (mode === "timeout") for (const timeout of h.timers.values()) timeout(); else h.unmount();
    await work; assert.equal(h.pending[0].init.signal?.aborted, true); assert.equal(h.pending.length, 1); assert.equal(h.timers.size, 0);
    if (mode === "timeout") { assert.ok(renderToStaticMarkup(h.render()).includes(copy.writeError)); h.unmount(); }
    assert.equal(h.lateStateWrites(), 0);
  }
});
// This hook harness renders the real Search parent and its actual callbacks. Row
// effects/DOM focus are covered by the real bundled browser fixture, not simulated here.
const settleSearch = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
const runSearchTimer = (h: ReturnType<typeof harness>) => { const next = h.timers.values().next().value; assert.ok(next); next(); };
const inputChange = (h: ReturnType<typeof harness>, value: string) =>
  (h.select(node => node.type === "input" && node.props.type === "search").props.onChange as (event: unknown) => void)({ target: { value } });
const searchRows = (h: ReturnType<typeof harness>) => nodes(h.render()).filter(node => node.props.person).map(node => node.props.person as contract.PublicOwnerSearchResult);
test("real Search lists ranking first and searches name fragments and tokens; a pasted ID has no result", async () => {
  const h = harness(searchFile, { locale: "en-GB", enabled: true }); h.render(); runSearchTimer(h);
  assert.equal(h.pending[0].url, "/api/touchline/clubowners?q=");
  h.pending[0].resolve(Response.json({ profiles: [{ ...publicProfile, rank: 1 }], nextCursor: "page2" })); await settleSearch();
  assert.equal(searchRows(h)[0].rank, 1);
  const friend = { ...publicProfile, displayName: "Luiz José da Silva", rank: 40 };
  for (const [index, query] of ["SIL", "jose luiz", "silVA José"].entries()) {
    inputChange(h, query); h.render(); runSearchTimer(h);
    assert.equal(new URL(h.pending[index + 1].url, "https://fixture.invalid").searchParams.get("q"), query);
    assert.equal(contract.publicOwnerNameMatchesQuery(friend.displayName, query), true);
    h.pending[index + 1].resolve(Response.json({ profiles: [friend], nextCursor: null })); await settleSearch();
    assert.equal(searchRows(h)[0].rank, 40);
  }
  assert.doesNotMatch(contract.peopleCopy("en-GB").query, /\bID\b/);
  assert.doesNotMatch(contract.peopleCopy("pt-BR").query, /\bID\b/);
  inputChange(h, id); h.render(); runSearchTimer(h);
  assert.equal(new URL(h.pending[4].url, "https://fixture.invalid").searchParams.get("q"), id);
  assert.equal(contract.publicOwnerNameMatchesQuery(friend.displayName, id), false);
  h.pending[4].resolve(Response.json({ profiles: [], nextCursor: null })); await settleSearch();
  assert.equal(searchRows(h).length, 0); assert.ok(renderToStaticMarkup(h.render()).includes(contract.peopleCopy("en-GB").empty));
  assert.ok(h.pending.every(request => !request.init.method && !request.init.body));
  h.unmount(); assert.equal(h.lateStateWrites(), 0);
});
for (const locale of ["pt-BR", "en-GB"] as const) test(`search row SSR ${locale}: name, portrait, rank and followers; ID remains only in the navigation target`, async () => {
  const copy = contract.peopleCopy(locale), h = harness(searchFile, { locale, enabled: true });
  h.render(); runSearchTimer(h);
  h.pending[0].resolve(Response.json({ profiles: [{ ...publicProfile, rank: 40, avatarUrl: null }], nextCursor: null }));
  await settleSearch();
  // One terminal server render proves the actual row's markup. Row effects,
  // interaction, layout and focus still require the separate DOM fixture.
  const html = renderToStaticMarkup(h.render()), visible = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  assert.ok(visible.includes(publicProfile.displayName)); assert.ok(visible.includes(`${copy.rank} #40`));
  assert.ok(visible.includes(`3 ${copy.followers.toLocaleLowerCase(locale)}`));
  assert.ok(html.includes(`href="${contract.publicOwnerHref(id, locale)}"`));
  assert.ok(html.includes(`aria-label="${copy.photoMissing}"`)); assert.ok(html.includes('role="img"'));
  assert.ok(html.includes('type="button"')); assert.ok(visible.includes(copy.follow));
  assert.ok(!visible.includes(id)); assert.doesNotMatch(visible, /\bID\b/);
  assert.ok(!html.includes(`aria-label="${id}"`)); assert.equal(h.pending.length, 1);
  h.unmount();
});
for (const locale of ["pt-BR", "en-GB"] as const) {
  test(`search row plan state SSR ${locale}: confirmed plan reaches the portrait and no unconfirmed plan is invented`, async () => {
    const copy = contract.peopleCopy(locale);
    for (const planKey of ["beta", "standard", "master", "vip", null, undefined] as const) {
      const h = harness(searchFile, { locale, enabled: true }); h.render(); runSearchTimer(h);
      h.pending[0].resolve(Response.json({ profiles: [{ ...publicProfile, rank: 1, avatarUrl: null, planKey }], nextCursor: null }));
      await settleSearch();
      assert.equal(searchRows(h)[0].planKey, planKey ?? null);
      const html = renderToStaticMarkup(h.render());
      assert.ok(html.includes(`data-plan="${planKey ?? "unconfirmed"}"`));
      assert.ok(html.includes(`aria-label="${copy.photoMissing}"`));
      assert.match(html, /data-action="follow"/); assert.match(html, /aria-pressed="false"/);
      assert.equal(h.pending.length, 1, "A consent-hidden photo must not trigger image requests");
      h.unmount();
    }
  });
  test(`profile action SSR ${locale}: visible following status, accessible action and decorative check stay consistent`, () => {
    const copy = contract.peopleCopy(locale), load = loader(), Component = load(profileFile).default as Component;
    for (const following of [false, true]) {
      const html = renderToStaticMarkup(React.createElement(Component, { locale, publicId: id, enabled: true,
        initial: { status: 200, profile: { ...publicProfile, following, planKey: "vip", avatarUrl: null } } }));
      const visible = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
      assert.ok(html.includes('data-plan="vip"')); assert.ok(html.includes('data-action="follow"'));
      assert.ok(html.includes(`aria-pressed="${following}"`));
      assert.ok(html.includes(`aria-label="${following ? `${copy.following}: ${copy.unfollow}` : copy.follow}"`));
      assert.ok(visible.includes(following ? copy.following : copy.follow));
      assert.equal(/lucide-check/.test(html), following);
      if (following) { assert.ok(!visible.includes(copy.unfollow)); assert.match(html, /aria-hidden="true"/); }
    }
  });
}
test("real Search paginates without duplicate IDs and leaves confirmed rows visible on failed next-page reads", async () => {
  const copy = contract.peopleCopy("en-GB"), h = harness(searchFile, { locale: "en-GB", enabled: true });
  h.render(); runSearchTimer(h);
  const first = { ...publicProfile, rank: 1 }, second = { ...publicProfile, publicId: "66666666-7777-4888-8999-aaaaaaaaaaaa", rank: 2 };
  h.pending[0].resolve(Response.json({ profiles: [first], nextCursor: "page2" })); await settleSearch();
  click(h.button(copy.moreResults)); h.render(); runSearchTimer(h);
  assert.equal(new URL(h.pending[1].url, "https://fixture.invalid").searchParams.get("cursor"), "page2");
  h.pending[1].resolve(Response.json({ profiles: [first, second], nextCursor: "page3" })); await settleSearch();
  assert.deepEqual(searchRows(h).map(row => row.publicId), [first.publicId, second.publicId]);
  click(h.button(copy.moreResults)); h.render(); runSearchTimer(h);
  h.pending[2].resolve(Response.json({ error: "PRIVATE_DETAIL" }, { status: 503 })); await settleSearch();
  assert.equal(searchRows(h).length, 2); assert.ok(nodes(h.render()).some(node => node.props.role === "alert"));
  assert.ok(!nodes(h.render()).some(node => node.props.children === copy.empty || node.props.children === copy.browseEmpty));
  h.unmount();
});
test("real Search distinguishes unavailable, empty, invalid and superseded requests without false results", async () => {
  const copy = contract.peopleCopy("en-GB"), h = harness(searchFile, { locale: "en-GB", enabled: true });
  h.render(); runSearchTimer(h);
  h.pending[0].resolve(Response.json({ error: "PRIVATE_DETAIL" }, { status: 503 })); await settleSearch();
  let html = renderToStaticMarkup(h.render()); assert.ok(html.includes(copy.error)); assert.ok(!html.includes(copy.browseEmpty)); assert.ok(!html.includes("PRIVATE_DETAIL"));
  submit(h.select(node => node.type === "form")); h.render(); runSearchTimer(h);
  h.pending[1].resolve(Response.json({ profiles: [], nextCursor: null })); await settleSearch();
  assert.ok(renderToStaticMarkup(h.render()).includes(copy.browseEmpty));
  inputChange(h, "New friend"); h.render(); runSearchTimer(h);
  inputChange(h, "Different friend"); h.render(); assert.equal(h.pending[2].init.signal?.aborted, true); runSearchTimer(h);
  h.pending[2].resolve(Response.json({ profiles: [{ ...publicProfile, rank: 1 }], nextCursor: null }));
  h.pending[3].resolve(Response.json({ profiles: [], nextCursor: null })); await settleSearch();
  html = renderToStaticMarkup(h.render()); assert.ok(html.includes(copy.empty)); assert.ok(!html.includes(publicProfile.displayName));
  inputChange(h, "x"); h.render(); assert.equal(h.timers.size, 0); assert.ok(renderToStaticMarkup(h.render()).includes(copy.queryHelp));
  assert.equal(h.pending.length, 4); h.unmount(); assert.equal(h.lateStateWrites(), 0);
});
test("real Search resets an expired snapshot cursor before retrying or explicitly submitting", async () => {
  const copy = contract.peopleCopy("en-GB"), h = harness(searchFile, { locale: "en-GB", enabled: true });
  const first = { ...publicProfile, rank: 1 };
  h.render(); runSearchTimer(h);
  h.pending[0].resolve(Response.json({ profiles: [first], nextCursor: "stalePage" })); await settleSearch();
  click(h.button(copy.moreResults)); h.render(); runSearchTimer(h);
  h.pending[1].resolve(Response.json({ error: "stale_cursor" }, { status: 400 })); await settleSearch();
  assert.equal(searchRows(h).length, 1);
  submit(h.select(node => node.type === "form")); h.render(); runSearchTimer(h);
  assert.equal(new URL(h.pending[2].url, "https://fixture.invalid").searchParams.get("cursor"), null);
  h.pending[2].resolve(Response.json({ profiles: [first], nextCursor: "newPage" })); await settleSearch();
  click(h.button(copy.moreResults)); h.render(); runSearchTimer(h);
  h.pending[3].resolve(Response.json({ error: "stale_cursor" }, { status: 400 })); await settleSearch();
  submit(h.select(node => node.type === "form")); h.render(); runSearchTimer(h);
  assert.equal(new URL(h.pending[4].url, "https://fixture.invalid").searchParams.get("cursor"), null);
  h.pending[4].resolve(Response.json({ profiles: [], nextCursor: null })); await settleSearch();
  assert.ok(renderToStaticMarkup(h.render()).includes(copy.browseEmpty)); h.unmount();
});
test("real Search reconciles confirmed follow updates by public ID and rejects superseded snapshot responses", async () => {
  const h = harness(searchFile, { locale: "en-GB", enabled: true });
  const first = { ...publicProfile, rank: 1 }, second = { ...publicProfile, publicId: "66666666-7777-4888-8999-aaaaaaaaaaaa", rank: 2 };
  h.render(); runSearchTimer(h);
  h.pending[0].resolve(Response.json({ profiles: [first, second], nextCursor: "oldPage" })); await settleSearch();
  const row = (publicId: string) => h.select(node => (node.props.person as contract.PublicOwnerSearchResult | undefined)?.publicId === publicId);
  const update = (publicId: string, profile: contract.PublicOwnerProfile) => (row(publicId).props.onProfileChange as (profile: contract.PublicOwnerProfile) => void)(profile);
  update(first.publicId, { ...first, following: true, followerCount: 4 }); h.render(); runSearchTimer(h);
  assert.equal(searchRows(h)[0].following, true); assert.equal(searchRows(h)[0].followerCount, 4); assert.equal(searchRows(h)[1].following, false);
  update(second.publicId, { ...second, following: true, followerCount: 7 }); h.render();
  assert.equal(h.pending[1].init.signal?.aborted, true); runSearchTimer(h);
  assert.ok(h.pending.slice(1).every(request => new URL(request.url, "https://fixture.invalid").searchParams.get("cursor") === null));
  h.pending[1].resolve(Response.json({ profiles: [first, second], nextCursor: null }));
  h.pending[2].resolve(Response.json({ profiles: [{ ...first, following: true, followerCount: 4 }, { ...second, following: true, followerCount: 7 }], nextCursor: null })); await settleSearch();
  assert.deepEqual(searchRows(h).map(row => [row.publicId, row.following, row.followerCount]), [[first.publicId, true, 4], [second.publicId, true, 7]]);
  h.unmount(); assert.equal(h.lateStateWrites(), 0);
});

test("real optional photo consent starts unchecked, can be revoked independently; unknown writes require a read", async () => {
  const copy = contract.peopleCopy("en-GB"), h = harness(directoryFile, { locale: "en-GB", enabled: true, photoSharingEnabled: true, initialOwn: { status: 200, profile: null } });
  const searchKey = () => h.select(node => node.props.enabled === true && node.props.locale === "en-GB").key;
  const initialSearchKey = searchKey();
  const checkbox = (label: string) => h.select(node => node.type === "label" && Array.isArray(node.props.children) && node.props.children.includes(label));
  const input = (label: string) => nodes(checkbox(label)).find(node => node.type === "input")!;
  assert.ok(renderToStaticMarkup(h.render()).includes(copy.consent));
  assert.equal(input(copy.photoConsent).props.checked, false); assert.equal(input(copy.photoConsent).props.disabled, true);
  (input(copy.consent).props.onChange as (event: unknown) => void)({ target: { checked: true } });
  assert.equal(input(copy.photoConsent).props.disabled, false);
  assert.equal(h.pending.length, 0);
  h.change("people-name", "Customer");
  (input(copy.photoConsent).props.onChange as (event: unknown) => void)({ target: { checked: true } });
  const form = () => h.select(node => node.type === "form" && nodes(node.props.children as React.ReactNode).some(child => child.props.id === "people-name"));
  const work = submit(form()); await submit(form()); assert.equal(h.pending.length, 1);
  assert.deepEqual(JSON.parse(String(h.pending[0].init.body)), { displayName: "Customer", published: true, photoPublished: true });
  h.pending[0].resolve(Response.json({ error: "unavailable" }, { status: 503 })); await work;
  assert.equal(searchKey(), initialSearchKey, "unknown publication does not pretend to confirm a new search snapshot");
  assert.equal(h.button(copy.save).props.disabled, true); await submit(form()); assert.equal(h.pending.length, 1);
  const refreshed = click(h.button(copy.retry));
  h.pending[1].resolve(Response.json({ profile: { publicId: id, displayName: "Customer", published: true, photoPublished: true, followerCount: 1 }, photoSharingAllowed: true })); await refreshed;
  assert.notEqual(searchKey(), initialSearchKey, "a confirmed reconciliation refreshes search");
  (input(copy.photoConsent).props.onChange as (event: unknown) => void)({ target: { checked: false } }); assert.equal(input(copy.photoConsent).props.checked, false);
  const hidden = submit(form()); assert.deepEqual(JSON.parse(String(h.pending[2].init.body)), { displayName: "Customer", published: true, photoPublished: false });
  h.pending[2].resolve(Response.json({ profile: { publicId: id, displayName: "Customer", published: true, photoPublished: false, followerCount: 1 } })); await hidden; h.unmount();
});


test("public profile never presents an unconfirmed plan as Beta", () => {
  const Profile = loader()(profileFile).default as React.ComponentType<Record<string, unknown>>;
  for (const planKey of [null, undefined, "beta", "standard", "master", "vip"]) {
    const html = renderToStaticMarkup(React.createElement(Profile, { locale: "pt-BR", publicId: id, enabled: true, initial: { status: 200, profile: { ...publicProfile, planKey, viewer: "guest" } } }));
    assert.match(html, new RegExp(`data-plan="${planKey ?? "unconfirmed"}"`));
    if (!planKey) assert.doesNotMatch(html, /data-plan="beta"|>BETA</);
  }
});

test('profile consumer rejects unrelated GET and unconfirmed follow receipts',async()=>{
 const copy=contract.peopleCopy('en-GB');
 for(const mode of ['wrong-id','wrong-follow','wrong-get'] as const){
  const h=harness(profileFile,{locale:'en-GB',publicId:id,enabled:true,initial:{status:200,profile:publicProfile}});
  const work=click(h.button(mode==='wrong-get'?copy.retry:copy.follow));
  h.pending[0].resolve(Response.json({profile:{...publicProfile,publicId:mode==='wrong-follow'?id:'22222222-2222-4333-8444-555555555555',displayName:'Unexpected Profile',following:mode!=='wrong-follow'}}));await work;
  const html=renderToStaticMarkup(h.render());assert.ok(!html.includes('Unexpected Profile'));
  assert.ok(html.includes(mode==='wrong-get'?copy.error:copy.writeError));h.unmount();
 }
});

test('public profile renders confirmed fractional points and keeps unknown sporting data distinct from zero', () => {
 const Profile = loader()(profileFile).default as React.ComponentType<Record<string, unknown>>;
 for(const locale of ['pt-BR','en-GB']) {
  const render=(standing: unknown)=>renderToStaticMarkup(React.createElement(Profile,{locale,publicId:id,enabled:true,initial:{status:200,profile:{...publicProfile,viewer:'guest',standing}}}));
  const confirmed=render({rank:40,points:48.28});
  assert.ok(confirmed.includes('40')); assert.ok(confirmed.includes(locale==='pt-BR'?'48,28':'48.28'));
  const missing=render(null); assert.ok(missing.includes('—')); assert.ok(!missing.includes(locale==='pt-BR'?'0,00':'0.00'));
  assert.ok(render({rank:1,points:0}).includes(locale==='pt-BR'?'0,00':'0.00'));
 }
});


test("settings preserve hidden profiles and withdrawing publication clears public photo intent", async () => {
  const copy = contract.peopleCopy("en-GB");
  for (const published of [false, true]) {
    const h = harness(directoryFile, { locale: "en-GB", enabled: true, settingsOnly: true, photoSharingEnabled: true,
      initialOwn: { status: 200, profile: { publicId: id, displayName: "Private owner", published, photoPublished: published, followerCount: 0 } } });
    const label = h.select(node => node.type === "label" && Array.isArray(node.props.children) && node.props.children.includes(copy.consent));
    const consent = nodes(label).find(node => node.type === "input")!;
    assert.equal(consent.props.checked, published);
    if (published) (consent.props.onChange as (event: unknown) => void)({ target: { checked: false } });
    h.change("people-name", "New name");
    const work = submit(h.select(node => node.type === "form"));
    assert.deepEqual(JSON.parse(String(h.pending[0].init.body)), { displayName: "New name", published: false, photoPublished: false });
    h.pending[0].resolve(Response.json({ profile: { publicId: id, displayName: "New name", published: false, photoPublished: false, followerCount: 0 } }));
    await work;
    assert.ok(renderToStaticMarkup(h.render()).includes(copy.hidden));
    h.unmount();
  }
});
