import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as contract from "../lib/touchlineArena/clubowner-public-contract.ts";
import * as auth from "../lib/touchlineArena/auth-i18n.ts";
import * as handler from "../lib/touchlineArena/clubowner-public-handler.ts";

const root = resolve(import.meta.dirname, "..");
const directoryFile = "components/touchline/social/ClubOwnerPublicDirectory.tsx", profileFile = "components/touchline/social/ClubOwnerPublicProfile.tsx";
const id = "11111111-2222-4333-8444-555555555555";
const publicProfile: contract.PublicOwnerProfile = { publicId: id, displayName: "Synthetic Public Person", followerCount: 3, following: false, viewer: "member" };
type Node = React.ReactElement<Record<string, unknown>>;
type Component = (props: Record<string, unknown>) => React.ReactElement;
function loader(options: { react?: object; fetch?: typeof fetch; dependencies?: handler.PeopleDependencies; timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } } = {}) {
  const cache = new Map<string, Record<string, unknown>>();
  const load = (path: string): Record<string, unknown> => {
    path = resolve(root, path);
    const old = cache.get(path); if (old) return old;
    const exports: Record<string, unknown> = {}; cache.set(path, exports);
    const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    runInNewContext(code, { exports, Request, Response, URL, Intl, AbortController, Set, JSON,
      setTimeout: options.timers?.setTimeout ?? setTimeout, clearTimeout: options.timers?.clearTimeout ?? clearTimeout,
      fetch: options.fetch ?? (() => assert.fail("Unexpected network")),
      require(name: string): unknown {
        if (name === "react") return options.react ?? React;
        if (name === "react/jsx-runtime") return jsx;
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
  const slots: unknown[] = [], effects: (() => void)[] = [], pending: { url: string; init: RequestInit; resolve(value: Response): void; reject(error: Error): void }[] = [];
  const timers = new Map<number, () => void>(); let timerId = 0;
  const react = { ...React,
    useState(initial: unknown) { const slot = index++; if (!(slot in slots)) slots[slot] = initial; return [slots[slot], (value: unknown) => { if (unmounted) lateStateWrites++; slots[slot] = value; }]; },
    useRef(initial: unknown) { const slot = index++; if (!(slot in slots)) slots[slot] = { current: initial }; return slots[slot]; },
    useEffect(effect: () => (() => void) | undefined) { const slot = index++; if (!(slot in slots)) { slots[slot] = true; const cleanup = effect(); if (cleanup) effects.push(cleanup); } },
  };
  const load = loader({ react,
    timers: { setTimeout: ((callback: () => void) => { const id = ++timerId; timers.set(id, callback); return id; }) as unknown as typeof setTimeout,
      clearTimeout: ((id: number) => timers.delete(id)) as unknown as typeof clearTimeout },
    fetch: ((url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
      pending.push({ url, init, resolve, reject }); init.signal?.addEventListener("abort", () => reject(new Error("ABORTED")), { once: true });
    })) as typeof fetch,
  });
  const Component = load(file).default as Component;
  const render = () => { index = 0; return Component(props); };
  const select = (predicate: (node: Node) => boolean) => { const node = nodes(render()).find(predicate); assert.ok(node, "Expected real rendered element"); return node; };
  const button = (label: string) => select(node => node.type === "button" && node.props.children === label);
  return { pending, render, select, button, props, timers, lateStateWrites: () => lateStateWrites,
    change: (id: string, value: string) => (select(node => node.props.id === id).props.onChange as (e: unknown) => void)({ target: { value } }),
    unmount() { unmounted = true; effects.forEach(cleanup => cleanup()); },
  };
}
const submit = (node: Node) => (node.props.onSubmit as (event: { preventDefault(): void }) => Promise<void>)({ preventDefault() {} });
const click = (node: Node) => (node.props.onClick as () => Promise<void>)();

for (const locale of ["pt-BR", "en-GB"] as const) {
  const copy = contract.peopleCopy(locale);
  test(`actual pages SSR ${locale}: opt-in is unchecked, privacy is explicit, private identity never serialized`, async () => {
    const load = loader({ dependencies: { enabled: true, currentActor: async () => ({ allowed: true }), rpc: async () => null } });
    const page = load("app/clubowners/page.tsx").default as (props: unknown) => Promise<React.ReactElement>;
    const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ lang: locale }) }));
    assert.ok(html.includes(copy.privacy)); assert.ok(html.includes(copy.consent)); assert.match(html, /type="checkbox"/); assert.doesNotMatch(html, /checked=""/);
    assert.match(html, /\/clubowner\?lang=/); assert.doesNotMatch(html, /email@example|accountId|budget|wallet/);
    const guestLoad = loader({ dependencies: { enabled: true, currentActor: async () => null, rpc: async () => publicProfile } });
    const guest = guestLoad("app/clubowners/page.tsx").default as typeof page;
    const guestHtml = renderToStaticMarkup(await guest({ searchParams: Promise.resolve({ lang: locale }) }));
    assert.ok(guestHtml.includes(copy.login)); assert.doesNotMatch(guestHtml, /id="people-name"/);
  });
  test(`actual profile page SSR ${locale}: precise count, public ID and safe states`, async () => {
    for (const [result, enabled, expected] of [[publicProfile, true, copy.follow], [null, true, copy.notFound], [publicProfile, false, copy.unavailable]] as const) {
      const load = loader({ dependencies: { enabled, currentActor: async () => null, rpc: async () => result } });
      const page = load("app/clubowners/[publicId]/page.tsx").default as (props: unknown) => Promise<React.ReactElement>;
      const html = renderToStaticMarkup(await page({ params: Promise.resolve({ publicId: id }), searchParams: Promise.resolve({ lang: locale }) }));
      assert.ok(html.includes(expected)); if (enabled && result) { assert.ok(html.includes(id)); assert.match(html, /<dd>3<\/dd>/); }
    }
  });
  test(`real directory handlers ${locale}: explicit opt-in, one PUT, preserved pending state, exact payload`, async () => {
    const h = harness(directoryFile, { locale, enabled: true, initialOwn: { status: 200, profile: null } });
    h.change("people-name", "Chosen Public Name");
    (h.select(node => node.props.type === "checkbox").props.onChange as (e: unknown) => void)({ target: { checked: true } });
    const form = () => h.select(node => node.type === "form" && nodes(node.props.children as React.ReactNode).some(child => child.props.id === "people-name"));
    const work = submit(form()); await submit(form());
    assert.equal(h.pending.length, 1); assert.equal(h.pending[0].url, "/api/account/public-profile"); assert.equal(h.pending[0].init.method, "PUT");
    assert.deepEqual(JSON.parse(String(h.pending[0].init.body)), { displayName: "Chosen Public Name", published: true });
    assert.equal(h.button(copy.saving).props.disabled, true);
    h.pending[0].resolve(Response.json({ profile: { publicId: id, displayName: "Chosen Public Name", published: true, followerCount: 0 } })); await work;
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
    assert.equal(h.button(copy.unfollow).props.disabled, false); assert.match(renderToStaticMarkup(h.render()), /<dd>4<\/dd>/);
    const unfollow = click(h.button(copy.unfollow)); assert.deepEqual(JSON.parse(String(h.pending[2].init.body)), { active: false });
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
test("real directory search submits a literal bounded query and handles empty and unavailable distinctly", async () => {
  const copy = contract.peopleCopy("en-GB");
  const h = harness(directoryFile, { locale: "en-GB", enabled: true, initialOwn: { status: 401, profile: null } });
  const form = () => h.select(node => node.type === "form");
  h.change("people-query", "Name %"); const work = submit(form());
  assert.equal(h.pending[0].url, "/api/touchline/clubowners?q=Name%20%25");
  h.pending[0].resolve(Response.json({ profiles: [] })); await work; assert.ok(renderToStaticMarkup(h.render()).includes(copy.empty));
  const failed = submit(form()); h.pending[1].resolve(Response.json({ error: "PRIVATE_DETAIL" }, { status: 503 })); await failed;
  const html = renderToStaticMarkup(h.render()); assert.ok(html.includes(copy.error)); assert.ok(!html.includes(copy.empty)); assert.ok(!html.includes("PRIVATE_DETAIL")); h.unmount();
});

test("real photo consent is separate, initially unchecked and cleared when hiding; unknown writes require a read", async () => {
  const copy = contract.peopleCopy("en-GB"), h = harness(directoryFile, { locale: "en-GB", enabled: true, photoSharingEnabled: true, initialOwn: { status: 200, profile: null } });
  const checkbox = (label: string) => h.select(node => node.type === "label" && Array.isArray(node.props.children) && node.props.children.includes(label));
  const input = (label: string) => nodes(checkbox(label)).find(node => node.type === "input")!;
  assert.equal(input(copy.consent).props.checked, false); assert.equal(input(copy.photoConsent).props.checked, false); assert.equal(input(copy.photoConsent).props.disabled, true);
  h.change("people-name", "Customer");
  (input(copy.consent).props.onChange as (event: unknown) => void)({ target: { checked: true } });
  (input(copy.photoConsent).props.onChange as (event: unknown) => void)({ target: { checked: true } });
  const form = () => h.select(node => node.type === "form" && nodes(node.props.children as React.ReactNode).some(child => child.props.id === "people-name"));
  const work = submit(form()); await submit(form()); assert.equal(h.pending.length, 1);
  assert.deepEqual(JSON.parse(String(h.pending[0].init.body)), { displayName: "Customer", published: true, photoPublished: true });
  h.pending[0].resolve(Response.json({ error: "unavailable" }, { status: 503 })); await work;
  assert.equal(h.button(copy.save).props.disabled, true); await submit(form()); assert.equal(h.pending.length, 1);
  const refreshed = click(h.button(copy.retry));
  h.pending[1].resolve(Response.json({ profile: { publicId: id, displayName: "Customer", published: true, photoPublished: true, followerCount: 1 }, photoSharingAllowed: true })); await refreshed;
  (input(copy.consent).props.onChange as (event: unknown) => void)({ target: { checked: false } }); assert.equal(input(copy.photoConsent).props.checked, false);
  const hidden = submit(form()); assert.deepEqual(JSON.parse(String(h.pending[2].init.body)), { displayName: "Customer", published: false, photoPublished: false });
  h.pending[2].resolve(Response.json({ profile: { publicId: id, displayName: "Customer", published: false, photoPublished: false, followerCount: 1 } })); await hidden; h.unmount();
});
