import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Script } from "node:vm";
import test from "node:test";
import { chromium, firefox, webkit, expect, type BrowserContext, type Page } from "@playwright/test";
import sharp from "sharp";
import { peopleCopy, publicOwnerAvatarHref, publicOwnerHref, publicOwnerNameMatchesQuery, type PeopleLocale, type PublicOwnerSearchResult } from "../lib/touchlineArena/clubowner-public-contract.ts";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";

const entry = "components/touchline/social/ClubOwnerSearchDialog.tsx";
const required = [entry, "components/touchline/social/ClubOwnerSearch.tsx", "components/touchline/social/ClubOwnerSearch.module.css",
  "components/touchline/social/ClubOwnerPublicAvatar.tsx", "components/touchline/social/ClubOwnerPublic.module.css",
  "components/touchline/TouchlineGlobalNavigation.module.css", "components/touchline/social/usePublicOwnersRequest.ts",
  "components/touchline/a11y/TouchlineDialog.tsx", "lib/touchlineArena/clubowner-public-contract.ts"];
const evidence = resolve("artifacts/clubowner-search-ui-20261101");
const portraitPlans = ["beta", "standard", "master", "vip", null] as const;
// Canonical confirmed-plan ring palette; neutral must never impersonate Beta.
const portraitRings = ["rgb(255, 136, 142)", "rgb(117, 187, 255)", "rgb(165, 228, 182)", "rgb(213, 180, 246)", "rgb(174, 187, 178)"];
async function syntheticPortraits() {
  const backgrounds = ["#573a39", "#244b69", "#285242", "#523566", "#39434b"];
  return Promise.all(backgrounds.map((background, index) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="${background}"/><path d="M12 96C12 58 84 58 84 96" fill="#c3d1ce"/><ellipse cx="48" cy="40" rx="19" ry="23" fill="#d5aa83"/><path d="M29 37C23 9 74 10 68 38C58 25 43 28 29 37" fill="#${["34302a", "4c3027", "262a28", "4a3931", "353132"][index]}"/><circle cx="41" cy="40" r="2" fill="#242626"/><circle cx="55" cy="40" r="2" fill="#242626"/><path d="M42 51Q48 55 54 51" fill="none" stroke="#6b453a" stroke-width="2"/></svg>`)).webp({ quality: 80 }).toBuffer()));
}
test("five synthetic portraits are real decodable WebP fixtures, without private photos or remote files", async () => {
  const photos = await syntheticPortraits(); assert.equal(photos.length, 5);
  for (const photo of photos) {
    const metadata = await sharp(photo).metadata();
    assert.equal(metadata.format, "webp"); assert.equal(metadata.width, 96); assert.equal(metadata.height, 96);
    assert.ok(photo.length < 16_000);
  }
});
function buildFixture() {
  return bundleIsolatedBrowserFixture({ entryPath: entry, requiredSources: required,
    mountScript: `const Trigger=loadEntry().default,locale=window.searchLocale;flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement('main',null,React.createElement('header',{'data-header':true},React.createElement(Trigger,{locale,compact:true})),React.createElement('section',{'data-exchange':true},React.createElement(Trigger,{locale}))))));`,
  });
}
test("ClubOwner search modal compiles real components, hooks, portal and scoped CSS without a browser", () => {
  const bundle = buildFixture(); new Script(bundle.script);
  for (const file of required) assert.ok(bundle.sources.includes(file), file);
  assert.match(bundle.css, /backdrop-filter/); assert.match(bundle.css, /min-width:0/);
  mkdirSync(evidence, { recursive: true });
  writeFileSync(resolve(evidence, "dialog-bundle-source-receipt.json"), JSON.stringify({ scope: "Bundle compilation only; no DOM, network or hosted proof", sources: bundle.sources.map(path => ({ path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") })) }, null, 2) + "\n");
});

// Native calibration and event evidence reuse the existing XI keyboard oracle.
async function recordKeyboardProbe(page: Page, key: "Tab" | "Alt+Tab") {
  const before = await page.evaluate(() => {
    const describe = (node: EventTarget | null) => node instanceof HTMLElement ? {
      tag: node.tagName, id: node.id.slice(0, 100), text: (node.textContent ?? "").trim().slice(0, 120),
      tabIndex: node.tabIndex, disabled: "disabled" in node ? Boolean(node.disabled) : false,
    } : null;
    // Read defaultPrevented after dispatch has finished, not in a capture-phase
    // microtask that might run before the product's delegated event listeners.
    const records: Array<() => object> = [];
    const listener = (event: Event) => {
      if (records.length >= 12) return;
      const target = describe(event.target);
      records.push(() => ({ type: event.type, target, defaultPrevented: event.defaultPrevented,
        key: event instanceof KeyboardEvent ? event.key : null,
        altKey: event instanceof KeyboardEvent ? event.altKey : null }));
    };
    const events = ["keydown", "keyup", "focusin"];
    for (const event of events) window.addEventListener(event, listener, true);
    const host = window as Window & { fixtureKeyboardProbe?: { read: () => object; stop: () => void } };
    host.fixtureKeyboardProbe = {
      read: () => ({ activeElement: describe(document.activeElement), documentFocused: document.hasFocus(), events: records.map(read => read()) }),
      stop: () => { for (const event of events) window.removeEventListener(event, listener, true); delete host.fixtureKeyboardProbe; },
    };
    return { activeElement: describe(document.activeElement), documentFocused: document.hasFocus() };
  });
  let failure: unknown;
  try {
    await page.keyboard.press(key);
  } catch (error) { failure = error; }
  const after = await page.evaluate(() => {
    const probe = (window as Window & { fixtureKeyboardProbe?: { read: () => object; stop: () => void } }).fixtureKeyboardProbe;
    try { return probe?.read() ?? { unavailable: true }; } finally { probe?.stop(); }
  }).catch(error => { failure ??= error; return { unavailable: true }; });
  return { evidence: { key, before, after }, failure };
}

type KeyboardKey = "Tab" | "Alt+Tab";
type KeyboardObservation = {
  documentFocused: boolean;
  activeElement: { tag: string; id: string } | null;
  events: Array<{ type: string; key: string | null; defaultPrevented: boolean }>;
};
type NativeObservation = { key: KeyboardKey; beforeFocused: boolean; after: KeyboardObservation };
function assertKeyboardObservation(observation: NativeObservation) {
  assert.equal(observation.beforeFocused, true, "Document must be focused before keyboard navigation");
  assert.equal(observation.after.documentFocused, true, "Document lost focus during keyboard navigation");
  assert.ok(Array.isArray(observation.after.events), "Keyboard event evidence missing");
  assert.ok(observation.after.events.some(event => event.type === "keydown" && event.key === "Tab"), "Tab keydown missing");
  assert.ok(observation.after.events.some(event => event.type === "keyup" && event.key === "Tab"), "Tab keyup missing");
  assert.ok(observation.after.events.every(event => event.defaultPrevented === false), "Keyboard navigation was cancelled");
}
function checkedKeyboardProbe(probe: Awaited<ReturnType<typeof recordKeyboardProbe>>): NativeObservation {
  if (probe.failure) throw probe.failure;
  const after = probe.evidence.after as KeyboardObservation;
  const observation = { key: probe.evidence.key, beforeFocused: probe.evidence.before.documentFocused, after };
  assertKeyboardObservation(observation);
  return { ...observation, after: { ...after,
    activeElement: after.activeElement ? { tag: after.activeElement.tag, id: after.activeElement.id } : null } };
}
async function calibrateSearchKeyboard(context: BrowserContext, details: { engine: string; locale: PeopleLocale; width: number }): Promise<KeyboardKey> {
  // Separate native document in the same viewport/touch context; never calibrate
  // against the product target or synthesize focus on its behalf.
  const control = await context.newPage();
  const probes: Array<Awaited<ReturnType<typeof recordKeyboardProbe>>["evidence"]> = [];
  const unexpected: string[] = [];
  let selectedKey: KeyboardKey | null = null;
  try {
    await control.route("**/*", async route => { unexpected.push(route.request().method()); await route.abort("blockedbyclient"); });
    await control.setContent('<!doctype html><html lang="en"><meta charset="utf-8"><body><a id="native-anchor" href="#native-input">Native link</a><button id="native-button" type="button">Native button</button><input id="native-input" aria-label="Native input"></body></html>');
    const anchor = control.locator("#native-anchor");
    await anchor.focus(); await expect(anchor).toBeFocused();
    const tabProbe = await recordKeyboardProbe(control, "Tab"); probes.push(tabProbe.evidence);
    const tab = checkedKeyboardProbe(tabProbe);
    if (tab.after.activeElement?.tag === "BUTTON" && tab.after.activeElement.id === "native-button") {
      selectedKey = "Tab";
    } else {
      assert.equal(details.engine, "webkit", "Chromium and Firefox must reach a native button using Tab");
      assert.deepEqual(tab.after.activeElement, { tag: "INPUT", id: "native-input" }, "WebKit native Tab has an unexpected target");
      await anchor.focus(); await expect(anchor).toBeFocused();
      const alternateProbe = await recordKeyboardProbe(control, "Alt+Tab"); probes.push(alternateProbe.evidence);
      const alternate = checkedKeyboardProbe(alternateProbe);
      assert.deepEqual(alternate.after.activeElement, { tag: "BUTTON", id: "native-button" }, "WebKit Alt+Tab must reach the native button");
      selectedKey = "Alt+Tab";
    }
    assert.deepEqual(unexpected, [], "Native calibration must make no network request");
    return selectedKey;
  } finally {
    console.log(`SEARCH_KEYBOARD_CALIBRATION ${JSON.stringify({ ...details, selectedKey, probes, unexpected })}`);
    await control.close();
  }
}

async function pressCalibratedSearchKey(page: Page, key: KeyboardKey, details: { engine: string; locale: PeopleLocale; width: number; phase: string }) {
  const probe = await recordKeyboardProbe(page, key);
  console.log(`SEARCH_KEYBOARD_PRODUCT ${JSON.stringify({ ...details, ...probe.evidence })}`);
  if (probe.failure) throw probe.failure;
}

// Real React components, focus/scroll-lock hooks, fetch callbacks and scoped CSS.
// Forty synthetic public owners and intercepted HTTP model the boundary only;
// this does not prove database ranking, RLS, hosted sessions or an iPhone device.
const requestedEngine = process.env.TOUCHLINE_CLUBOWNER_SEARCH_BROWSER_ENGINE;
for (const engine of [chromium, webkit, firefox]) test(`ClubOwner search modal real DOM flows in ${engine.name()}`, {
  skip: process.env.TOUCHLINE_RUN_CLUBOWNER_SEARCH_BROWSER !== "1" || Boolean(requestedEngine && requestedEngine !== engine.name()), timeout: 150_000,
}, async () => {
  requireBrowserCapacity(process.cwd());
  const bundle = buildFixture(), origin = "https://search.invalid", portraits = await syntheticPortraits();
  const lime = readFileSync("app/globals.css", "utf8").match(/--lime:\s*(#[a-f0-9]{6})/i)?.[1]; assert.ok(lime);
  const limeRgb = `rgb(${[1, 3, 5].map(index => parseInt(lime.slice(index, index + 2), 16)).join(", ")})`;
  mkdirSync(evidence, { recursive: true });
  const results: { locale: PeopleLocale; width: number; puts: number; listReads: number; profileReads: number; imageReads: number; touch: boolean; keyboardKey: KeyboardKey; screenshot: string; portraitsScreenshot: string; followingScreenshot: string }[] = [];
  const browser = await engine.launch({ headless: true });
  try {
    for (const locale of ["pt-BR", "en-GB"] as const) for (const width of [390, 1280]) {
      const copy = peopleCopy(locale), errors: string[] = [], requests: { method: string; path: string; query: string }[] = [];
      let puts = 0, listReads = 0, profileReads = 0, imageReads = 0, failNextWrite = true, expireNextPage = false;
      const people: PublicOwnerSearchResult[] = Array.from({ length: 40 }, (_, i) => ({
        publicId: `11111111-2222-4333-8444-${String(i + 1).padStart(12, "0")}`, displayName: `Fixture friend ${String(i + 1).padStart(2, "0")}`,
        rank: i + 1, followerCount: 100 - i, following: false, viewer: "member", planKey: portraitPlans[i % 5],
        avatarUrl: i < 5 ? publicOwnerAvatarHref(`11111111-2222-4333-8444-${String(i + 1).padStart(12, "0")}`, "a".repeat(64)) : null,
      }));
      const metadataIds: string[] = [];
      const friend = people[39];
      friend.displayName = "Luiz José da Silva";
      const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width === 390, isMobile: width === 390 && engine.name() !== "firefox", serviceWorkers: "block", reducedMotion: "reduce" });
      try {
        const keyboardKey = await calibrateSearchKeyboard(context, { engine: engine.name(), locale, width });
        await context.route("**/*", async route => {
          const request = route.request(), url = new URL(request.url());
          if (url.origin !== origin) return route.abort();
          // WebKit routes local object URLs too; leave native blob decoding intact.
          if (url.protocol === "blob:") return route.continue();
          requests.push({ method: request.method(), path: url.pathname, query: url.search });
          if (url.pathname.endsWith("/avatar")) {
            const index = people.findIndex(person => person.avatarUrl === url.pathname + url.search);
            assert.ok(index >= 0 && index < 5, "Only separately consented synthetic photos may be requested");
            assert.equal(request.method(), "GET"); imageReads++;
            return route.fulfill({ contentType: "image/webp", body: portraits[index], headers: { "cache-control": "private, no-store" } });
          }
          if (url.pathname === "/api/touchline/clubowners") {
            listReads++; assert.equal(request.method(), "GET");
            const q = url.searchParams.get("q") ?? "", cursor = url.searchParams.get("cursor");
            if (q === "Unavailable") return route.fulfill({ status: 503, json: { error: "PRIVATE_INTERNAL_DETAIL" } });
            if (q === "Malformed") return route.fulfill({ json: { profiles: [{ publicId: friend.publicId, displayName: friend.displayName }], nextCursor: null } });
            if (q) return route.fulfill({ json: { profiles: people.filter(p => publicOwnerNameMatchesQuery(p.displayName, q)), nextCursor: null } });
            if (cursor === "page2") {
              if (expireNextPage) { expireNextPage = false; return route.fulfill({ status: 400, json: { error: "stale_cursor" } }); }
              return route.fulfill({ json: { profiles: people.slice(19, 39), nextCursor: null } });
            }
            assert.equal(cursor, null); return route.fulfill({ json: { profiles: people.slice(0, 20), nextCursor: "page2" } });
          }
          if (url.pathname === `/api/touchline/clubowners/${friend.publicId}/follow`) {
            assert.equal(request.method(), "PUT"); puts++;
            const body = request.postDataJSON(); assert.deepEqual(Object.keys(body), ["active"]); assert.equal(typeof body.active, "boolean");
            if (friend.following !== body.active) friend.followerCount += body.active ? 1 : -1;
            friend.following = body.active;
            if (failNextWrite) { failNextWrite = false; return route.fulfill({ status: 503, json: { error: "UNCERTAIN_WRITE" } }); }
            return route.fulfill({ json: { profile: friend } });
          }
          if (/^\/api\/touchline\/clubowners\/[a-f0-9-]{36}$/.test(url.pathname)) {
            assert.equal(request.method(), "GET");
            const publicId = url.pathname.split("/").at(-1)!;
            const profile = people.find(person => person.publicId === publicId);
            assert.ok(profile, "Metadata reads must match a known synthetic public identity");
            metadataIds.push(publicId); profileReads++;
            return route.fulfill({ json: { profile } });
          }
          if (url.pathname !== "/") return route.abort();
          return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--lime:${lime}}*{box-sizing:border-box}body{margin:0;background:#030b09;color:#edf7ed;font:16px system-ui}main{padding:20px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}button,input{font:inherit}${bundle.css}</style><div id="root"></div><script>window.searchLocale=${JSON.stringify(locale)};${bundle.script.replace(/<\/script/gi, "<\\/script")}</script></html>` });
        });
        const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
        await page.goto(origin);
        const compact = page.locator("[data-header]").getByRole("button", { name: copy.title, exact: true });
        const trigger = page.locator("[data-exchange]").getByRole("button", { name: copy.title, exact: true });
        await expect(compact).toHaveAttribute("aria-haspopup", "dialog"); await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
        await expect(page.getByRole("searchbox")).toHaveCount(0); await expect(page.getByRole("form")).toHaveCount(0);
        assert.equal(listReads, 0); assert.equal(puts, 0);
        assert.ok((await trigger.boundingBox())!.height < 100, "compact entry is not an inline search/results form");
        await trigger.click(); const dialog = page.getByRole("dialog", { name: copy.title, exact: true }), input = dialog.getByRole("searchbox", { name: copy.query });
        await expect(input).toBeFocused(); await expect(dialog).toHaveAttribute("aria-modal", "true");
        await expect(dialog.getByRole("heading", { name: copy.rankedTitle })).toBeVisible();
        await expect(dialog.getByRole("listitem")).toHaveCount(20);
        await expect(dialog.getByRole("img", { name: copy.photoMissing, exact: true })).toHaveCount(15);
        for (const [index, planKey] of portraitPlans.entries()) {
          const row = dialog.getByRole("listitem").nth(index), image = row.locator("img");
          await row.scrollIntoViewIfNeeded(); await expect(image).toBeVisible();
          await expect(row.locator("[data-plan]")).toHaveAttribute("data-plan", planKey ?? "unconfirmed");
          await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(96);
          await expect(image).toHaveCSS("border-top-color", portraitRings[index]); await expect(image).toHaveCSS("border-top-width", "1px");
          const fallback = dialog.getByRole("listitem").nth(index + 5).getByRole("img", { name: copy.photoMissing, exact: true });
          await expect(fallback).toHaveCSS("border-top-color", portraitRings[index]);
        }
        assert.equal(imageReads, 5, "Private/null photos do not load; confirmed portraits are loaded once");
        for (const person of people.slice(0, 5)) assert.ok(metadataIds.includes(person.publicId),
          "Visible portraits reconcile consent/version against their own current public profile");
        const firstFollow = dialog.getByRole("listitem").first().getByRole("button", { name: copy.follow, exact: true });
        await firstFollow.scrollIntoViewIfNeeded(); await page.mouse.move(0, 0); await input.focus();
        await expect(firstFollow).toHaveAttribute("data-action", "follow"); await expect(firstFollow).toHaveAttribute("aria-pressed", "false");
        await expect(firstFollow).toHaveCSS("color", limeRgb); await expect(firstFollow).not.toHaveCSS("background-color", limeRgb);
        await firstFollow.hover();
        if (width === 390) {
          assert.equal(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), true);
          await expect(firstFollow).not.toHaveCSS("background-color", limeRgb); await expect(firstFollow).toHaveCSS("transform", "none");
        } else await expect(firstFollow).toHaveCSS("background-color", limeRgb);
        await page.mouse.move(0, 0); await dialog.getByRole("listitem").first().getByRole("link").last().focus(); await pressCalibratedSearchKey(page, keyboardKey, { engine: engine.name(), locale, width, phase: "first-follow" });
        await expect(firstFollow).toBeFocused(); await expect(firstFollow).toHaveCSS("background-color", limeRgb);
        await input.focus();
        const portraitsScreenshot = resolve(evidence, `search-${engine.name()}-${locale}-${width}-plan-portraits.png`);
        await page.screenshot({ path: portraitsScreenshot });
        await expect(dialog.getByRole("checkbox")).toHaveCount(0);
        await expect(dialog.getByRole("link", { name: copy.manageProfile, exact: true })).toHaveCount(0);
        assert.doesNotMatch(await dialog.innerText(), /\bID\b|11111111-2222-4333-8444-/);
        assert.doesNotMatch(copy.query, /\bID\b/i);
        assert.deepEqual(await dialog.locator("li a[href^='/clubowners/']:not([aria-label])").allTextContents(), people.slice(0, 20).map(person => person.displayName));
        await expect(dialog.getByText(friend.displayName, { exact: true })).toHaveCount(0);
        await expect(dialog.getByLabel(`${copy.rank} 1`, { exact: true })).toBeVisible();
        await expect(dialog.getByText(`100 ${copy.followers.toLocaleLowerCase(locale)}`, { exact: true })).toBeVisible();
        const initialListReads = listReads;
        await dialog.getByRole("button", { name: copy.moreResults, exact: true }).click();
        await expect(dialog.getByRole("listitem")).toHaveCount(39); assert.equal(listReads, initialListReads + 1);
        const hrefs = await dialog.locator("li a[href^='/clubowners/']:not([aria-label])").evaluateAll(nodes => nodes.map(node => node.getAttribute("href")));
        assert.equal(new Set(hrefs).size, 39); assert.equal(puts, 0);
        for (const query of ["SIL", "jose luiz", "silVA José"]) {
          await input.fill(query); await expect(dialog.getByRole("listitem")).toHaveCount(1);
          await expect(dialog.getByRole("link", { name: friend.displayName, exact: true }).first()).toHaveAttribute("href", publicOwnerHref(friend.publicId, locale));
          await expect(dialog.getByLabel(`${copy.rank} 40`, { exact: true })).toBeVisible();
          assert.doesNotMatch(await dialog.innerText(), /\bID\b|11111111-2222-4333-8444-/);
        }
        await input.fill(friend.publicId); await input.press("Enter");
        await expect(dialog.getByText(copy.empty, { exact: true })).toBeVisible();
        await expect(dialog.getByRole("listitem")).toHaveCount(0);
        await input.fill("silva"); await expect(dialog.getByRole("listitem")).toHaveCount(1); assert.equal(puts, 0);
        const beforeFollowReads = listReads;
        await dialog.getByRole("search").evaluate(form => {
          form.setAttribute("data-submits", "0");
          form.addEventListener("submit", () => form.setAttribute("data-submits", String(Number(form.getAttribute("data-submits")) + 1)));
        });
        await dialog.getByRole("button", { name: copy.follow, exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
        await expect(dialog.getByText(copy.writeError, { exact: true })).toBeVisible();
        await expect(dialog.getByRole("button", { name: copy.follow, exact: true })).toBeDisabled();
        assert.equal(puts, 1); assert.equal(listReads, beforeFollowReads, "follow must not submit the search form");
        const profileReadsBeforeRecovery = profileReads;
        await dialog.getByRole("button", { name: copy.retry, exact: true }).click();
        await expect(dialog.getByRole("button", { name: `${copy.following}: ${copy.unfollow}`, exact: true })).toBeEnabled();
        assert.equal(puts, 1); assert.equal(profileReads, profileReadsBeforeRecovery + 1, "uncertain follow is reconciled by one GET, not replayed PUT");
        const following = dialog.getByRole("button", { name: `${copy.following}: ${copy.unfollow}`, exact: true });
        await expect(following).toHaveAttribute("aria-pressed", "true"); await expect(following).toHaveText(copy.following);
        await expect(following.locator("svg[aria-hidden='true']")).toHaveCount(1);
        await input.focus(); await page.mouse.move(0, 0);
        await expect(following).not.toHaveCSS("background-color", limeRgb);
        const followingScreenshot = resolve(evidence, `search-${engine.name()}-${locale}-${width}-following.png`); await page.screenshot({ path: followingScreenshot });

        await expect(dialog.getByText(`62 ${copy.followers.toLocaleLowerCase(locale)}`, { exact: true })).toBeVisible();
        if (width === 390) await following.tap(); else await following.click();
        await expect(dialog.getByRole("button", { name: copy.follow, exact: true })).toBeEnabled(); assert.equal(puts, 2);
        if (width === 390) {
          const afterTap = dialog.getByRole("button", { name: copy.follow, exact: true });
          await expect(afterTap).not.toHaveCSS("background-color", limeRgb); await expect(afterTap).toHaveCSS("transform", "none");
        }
        await expect(dialog.getByRole("search")).toHaveAttribute("data-submits", "0");
        for (const query of ["Unavailable", "Malformed"]) {
          await input.fill(query); await expect(dialog.getByText(copy.error, { exact: true })).toBeVisible();
          await expect(dialog.getByText(copy.empty, { exact: true })).toHaveCount(0); await expect(dialog.getByText(copy.browseEmpty, { exact: true })).toHaveCount(0);
          assert.ok(!(await dialog.textContent())!.includes("PRIVATE_INTERNAL_DETAIL"));
        }
        await input.fill("No match"); await expect(dialog.getByText(copy.empty, { exact: true })).toBeVisible();
        await dialog.getByRole("button", { name: copy.clearSearch, exact: true }).click(); await expect(input).toBeFocused();
        await expect(dialog.getByRole("listitem")).toHaveCount(20);
        expireNextPage = true;
        await dialog.getByRole("button", { name: copy.moreResults, exact: true }).click();
        await expect(dialog.getByText(copy.error, { exact: true })).toBeVisible();
        await expect(dialog.getByRole("listitem")).toHaveCount(20);
        await expect(dialog.getByText(copy.browseEmpty, { exact: true })).toHaveCount(0);
        const readsBeforeCursorRecovery = listReads;
        await expect(dialog.getByRole("button", { name: copy.retry, exact: true })).toHaveCount(0);
        await input.press("Enter");
        await expect(dialog.getByRole("button", { name: copy.moreResults, exact: true })).toBeVisible();
        await expect(dialog.getByRole("listitem")).toHaveCount(20);
        assert.equal(listReads, readsBeforeCursorRecovery + 1);
        assert.equal(new URL(requests.filter(request => request.path === "/api/touchline/clubowners").at(-1)!.query, origin).searchParams.get("cursor"), null, "stale cursor retries restart the ranking snapshot");
        await expect(dialog.getByRole("link", { name: copy.manageProfile, exact: true })).toHaveCount(0);
        await dialog.getByRole("button", { name: copy.moreResults, exact: true }).focus(); await pressCalibratedSearchKey(page, keyboardKey, { engine: engine.name(), locale, width, phase: "close-after-more-results" }); await expect(dialog.getByRole("button", { name: copy.close, exact: true })).toBeFocused();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${locale}/${width} page overflow`);
        assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${locale}/${width} dialog overflow`);
        const screenshot = resolve(evidence, `search-${engine.name()}-${locale}-${width}.png`); await page.screenshot({ path: screenshot });
        await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
        await expect(page.getByRole("searchbox")).toHaveCount(0);
        assert.equal(await page.locator("#root").evaluate(el => (el as HTMLElement).inert), false);
        assert.equal(await page.evaluate(() => document.documentElement.style.overflow), "");
        await compact.click(); await expect(input).toBeFocused(); await dialog.getByRole("button", { name: copy.close, exact: true }).click();
        await expect(compact).toBeFocused(); assert.equal(puts, 2);
        assert.ok(requests.filter(request => request.method !== "GET").every(request => request.path.endsWith("/follow")));
        assert.deepEqual(errors, []); results.push({ locale, width, puts, listReads, profileReads, imageReads, touch: width === 390, keyboardKey, screenshot, portraitsScreenshot, followingScreenshot });
      } finally { await context.close(); }
    }
    assert.equal(results.length, 4);
  } finally {
    await browser.close();
    writeFileSync(resolve(evidence, `dialog-browser-${engine.name()}-result.json`), JSON.stringify({ scope: "Real local DOM with synthetic HTTP; not hosted or physical-device proof", engine: engine.name(), completedCases: results }, null, 2) + "\n");
  }
});
