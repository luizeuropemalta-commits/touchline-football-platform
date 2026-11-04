import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { Script } from "node:vm";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import sharp from "sharp";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import { peopleCopy, publicOwnerAvatarHref, publicOwnerNameMatchesQuery, parsePublicOwnerSearchPage, type PeopleLocale, type PublicOwnerSearchResult } from "../lib/touchlineArena/clubowner-public-contract.ts";

function publicPhotoRows(version: string): PublicOwnerSearchResult[] {
  return Array.from({ length: 20 }, (_, index) => {
    const publicId = `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`;
    return { publicId, displayName: `Synthetic Customer ${index}`, avatarUrl: publicOwnerAvatarHref(publicId, version),
      rank: index + 1, followerCount: 20 - index, following: false, viewer: "member", planKey: null };
  });
}
function photoSearchPage(rows: PublicOwnerSearchResult[], query: string) {
  return { profiles: rows.filter(row => query === "" || publicOwnerNameMatchesQuery(row.displayName, query)), nextCursor: null };
}
function buildAvatarFixture() {
  const directory = "components/touchline/social/ClubOwnerPublicDirectory.tsx", profile = "components/touchline/social/ClubOwnerPublicProfile.tsx";
  const avatar = "components/touchline/social/ClubOwnerPublicAvatar.tsx", css = "components/touchline/social/ClubOwnerPublic.module.css";
  const trigger = "components/touchline/social/ClubOwnerSearchDialog.tsx";
  return bundleIsolatedBrowserFixture({ entryPath: directory, additionalEntryPaths: [avatar, profile, css, trigger],
    requiredSources: [directory, profile, avatar, css, trigger, "components/touchline/social/ClubOwnerSearch.tsx", "lib/touchlineArena/clubowner-public-avatar-client.ts", "lib/touchlineArena/clubowner-public-contract.ts"],
    mountScript: `const styles=loadAdditionalEntry(${JSON.stringify(css)}),Avatar=loadAdditionalEntry(${JSON.stringify(avatar)}).default;
      window.renderPeople=(kind,props)=>flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement('main',{className:styles.shell},React.createElement('div',{className:styles.content},kind==='blank'?null:kind==='avatars'?React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(5,56px)',gap:'4px'}},props.map((p,i)=>React.createElement(Avatar,{key:i,...p}))):React.createElement(kind==='profile'?loadAdditionalEntry(${JSON.stringify(profile)}).default:kind==='search'?loadAdditionalEntry(${JSON.stringify(trigger)}).default:loadEntry().default,props))))));window.renderPeople('directory',window.peopleFixture);`,
  });
}
test("avatar consent and transport fixture compiles separate editor, modal and profile with the current public DTO", () => {
  const bundle = buildAvatarFixture(); new Script(bundle.script);
  for (const file of ["ClubOwnerPublicDirectory.tsx", "ClubOwnerPublicProfile.tsx", "ClubOwnerSearchDialog.tsx", "ClubOwnerSearch.tsx", "ClubOwnerPublicAvatar.tsx"]) {
    assert.ok(bundle.sources.includes(`components/touchline/social/${file}`));
  }
  const rows = publicPhotoRows("a".repeat(64));
  for (const query of ["", "Synthetic", "CUSTOMER synthetic", "No match", rows[0].publicId]) {
    const page = parsePublicOwnerSearchPage(photoSearchPage(rows, query));
    assert.equal(page.nextCursor, null); assert.equal(page.profiles.length, query === "No match" || query === rows[0].publicId ? 0 : 20);
    for (const [index, row] of page.profiles.entries()) {
      assert.equal(row.rank, index + 1); assert.equal(row.viewer, "member"); assert.equal(row.following, false); assert.equal(row.planKey, null);
    }
  }
});

// Real React/CSS/queue/transport, isolated HTTP only. This is not hosted Auth,
// migration, retention or deployment evidence. Run one engine per window:
// TOUCHLINE_RUN_PUBLIC_AVATAR_BROWSER=1 TOUCHLINE_PUBLIC_AVATAR_BROWSER_ENGINE=chromium node --test --experimental-strip-types tests/clubowner-public-avatar-browser.test.mts
test("public photo consent, visible serial loading, replacement and cancellation in real browsers", {
  skip: process.env.TOUCHLINE_RUN_PUBLIC_AVATAR_BROWSER !== "1", timeout: 120_000,
}, async () => {
  const selected = process.env.TOUCHLINE_PUBLIC_AVATAR_BROWSER_ENGINE;
  assert.ok(selected === undefined || ["chromium", "webkit", "firefox"].includes(selected));
  const engines = [chromium, webkit, firefox].filter(engine => !selected || engine.name() === selected);
  const output = mkdtempSync(`${tmpdir()}/touchline-public-avatar-browser-`), origin = "https://people.invalid";
  const lime = readFileSync("app/globals.css", "utf8").match(/--lime:\s*(#[a-f0-9]{6})/i)?.[1]; assert.ok(lime);
  const neutralRingRgb = "rgb(174, 187, 178)"; // No confirmed plan is supplied in this consent/transport fixture.
  const bundle = buildAvatarFixture();
  writeFileSync(`${output}/sources.json`, JSON.stringify(bundle.sources, null, 2));
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#237e43" } }).webp().toBuffer();
  let scenarios = 0;
  for (const engine of engines) {
    const moderate = !process.env.CI && process.env.TOUCHLINE_PUBLIC_AVATAR_BROWSER_ALLOW_MODERATE_PRESSURE === "1";
    assert.notEqual(process.env.TOUCHLINE_LOCAL_IGNORE_MEMORY_GATE, "1", "This fixture never permits the broad memory-gate bypass");
    assert.ok(process.env.TOUCHLINE_LOCAL_BROWSER_DISK_RESERVE_MIB === undefined || process.env.TOUCHLINE_LOCAL_BROWSER_DISK_RESERVE_MIB === "5120", "The default 5 GiB disk reserve must remain intact");
    requireBrowserCapacity(process.cwd(), { allowModerateDarwinPressure: moderate });
    if (moderate) console.log("Explicit local moderate-pressure allowance; critical pressure remains refused and the default 5 GiB disk reserve is unchanged.");
    const browser = await engine.launch({ headless: true });
    try {
      for (const locale of ["pt-BR", "en-GB"] as PeopleLocale[]) for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 820 }]) {
        const copy = peopleCopy(locale), id = "11111111-1111-4111-8111-111111111111", version = "a".repeat(64), nextVersion = "b".repeat(64);
        let own = { publicId: id, displayName: "Synthetic Customer", published: false, photoPublished: false, followerCount: 3 };
        const rows = publicPhotoRows(version);
        const writes: unknown[] = [], imageRequests: string[] = [], errors: string[] = [];
        let active = 0, maxActive = 0, imageStatus = 200, delay = 25;
        let metadataVersion: string | null = version, metadataUnavailable = false;
        const metadataRequests: string[] = [];
        const context = await browser.newContext({ viewport, serviceWorkers: "block", reducedMotion: "reduce" });
        try {
          await context.route("**/*", async route => {
            const request = route.request(), url = new URL(request.url());
            if (url.origin !== origin) return route.abort();
            // WebKit routes local object URLs too; leave native blob decoding intact.
            if (url.protocol === "blob:") return route.continue();
            if (url.pathname.endsWith("/avatar")) {
              imageRequests.push(url.pathname + url.search); active++; maxActive = Math.max(maxActive, active);
              const status = imageStatus;
              try {
                await new Promise(resolve => setTimeout(resolve, delay));
                await route.fulfill({ status, contentType: status === 200 ? "image/webp" : "application/json", body: status === 200 ? bytes : '{"error":"unavailable"}', headers: { "cache-control": "private, no-store" } });
              } catch { /* Browser may abort an in-flight request on unmount. */ }
              finally { active--; }
              return;
            }
            if (url.pathname === "/api/account/public-profile") {
              if (request.method() === "PUT") { const body = request.postDataJSON(); writes.push(body); own = { ...own, ...body }; }
              return route.fulfill({ json: { profile: own, photoSharingAllowed: true } });
            }
            if (url.pathname === "/api/touchline/clubowners") {
              assert.equal(request.method(), "GET"); assert.equal(url.searchParams.get("cursor"), null);
              return route.fulfill({ json: photoSearchPage(rows, url.searchParams.get("q") ?? "") });
            }
            if (/^\/api\/touchline\/clubowners\/[a-f0-9-]{36}$/.test(url.pathname)) {
              assert.equal(request.method(), "GET"); metadataRequests.push(url.pathname);
              if (metadataUnavailable) return route.fulfill({ status: 503, json: { error: "unavailable" } });
              const publicId = url.pathname.split("/").at(-1)!;
              const profile = publicId === id ? { publicId: id, displayName: own.displayName, followerCount: 3, following: false, viewer: "guest", planKey: null,
                avatarUrl: metadataVersion === null ? null : publicOwnerAvatarHref(id, metadataVersion) } : rows.find(row => row.publicId === publicId);
              return route.fulfill({ status: profile ? 200 : 404, json: profile ? { profile } : { error: "not_found" } });
            }
            if (url.pathname !== "/clubowners") return route.abort();
            const props = { locale, enabled: true, settingsOnly: true, photoSharingEnabled: true, initialOwn: { status: 200, profile: own } };
            return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--lime:${lime}}*{box-sizing:border-box}body{margin:0;font:16px system-ui}button,input{font:inherit}${bundle.css}</style><div id="root"></div><script>window.peopleFixture=${JSON.stringify(props)};${bundle.script.replace(/<\/script/gi, "<\\/script")}</script></html>` });
          });
          const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
          await page.goto(`${origin}/clubowners`);
          const photo = page.getByRole("checkbox", { name: copy.photoConsent, exact: true });
          const publication = page.getByRole("checkbox", { name: copy.consent, exact: true });
          await expect(publication).not.toBeChecked();
          await expect(photo).not.toBeChecked(); await expect(photo).toBeDisabled();
          assert.deepEqual(writes, [], "Opening settings never publishes the name or photo");
          await publication.focus(); await page.keyboard.press("Space");
          await expect(publication).toBeChecked(); await expect(photo).toBeEnabled();
          assert.deepEqual(writes, [], "Consent selection stays local until save");
          await photo.focus(); await page.keyboard.press("Space"); await page.getByRole("button", { name: copy.save, exact: true }).click();
          await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
          assert.deepEqual(writes, [{ displayName: own.displayName, published: true, photoPublished: true }]);
          await page.reload(); await expect(publication).toBeChecked(); await expect(photo).toBeChecked(); await expect(page.getByText(copy.published, { exact: true })).toBeVisible();
          await page.screenshot({ path: `${output}/${engine.name()}-${locale}-${viewport.width}-consent.png`, fullPage: true });
          await expect(page.getByRole("searchbox")).toHaveCount(0); assert.equal(imageRequests.length, 0, "Settings-only consent must not load discovery photos");
          const render = (kind: string, props: unknown) => page.evaluate(({ kind, props }) => {
            (window as unknown as { renderPeople: (kind: string, props: unknown) => void }).renderPeople(kind, props);
          }, { kind, props });
          await render("search", { locale }); await expect(page.getByRole("searchbox")).toHaveCount(0);
          await page.getByRole("button", { name: copy.title, exact: true }).click();
          const dialog = page.getByRole("dialog", { name: copy.title, exact: true }), input = dialog.getByRole("searchbox", { name: copy.query, exact: true });
          await expect(input).toBeFocused(); await expect(dialog.getByRole("checkbox")).toHaveCount(0);
          const results = dialog.getByRole("listitem"); await expect(results).toHaveCount(20);
          for (let index = 0; index < 20; index++) {
            await results.nth(index).scrollIntoViewIfNeeded(); await expect(results.nth(index).locator("img")).toBeVisible();
            await expect.poll(() => results.nth(index).locator("img").evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(8);
          }
          assert.equal(imageRequests.length, 20); assert.equal(new Set(imageRequests).size, 20); assert.equal(maxActive, 1);
          const beforeQuery = imageRequests.length;
          await input.fill("Synthetic"); await input.press("Enter"); await expect(results).toHaveCount(20);
          // A different query mounts a fresh ranked snapshot; each consented
          // photo is fetched once for that snapshot, not an automatic retry.
          await expect.poll(() => imageRequests.length).toBeGreaterThan(beforeQuery);
          for (let index = 0; index < 20; index++) {
            await results.nth(index).scrollIntoViewIfNeeded(); await expect(results.nth(index).locator("img")).toBeVisible();
            await expect.poll(() => results.nth(index).locator("img").evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(8);
          }
          assert.equal(imageRequests.length - beforeQuery, 20); assert.equal(new Set(imageRequests.slice(beforeQuery)).size, 20); assert.equal(maxActive, 1);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await dialog.getByRole("button", { name: copy.close, exact: true }).click(); await expect(dialog).toHaveCount(0);
          await render("profile", { locale, publicId: id, enabled: true, initial: { status: 200, profile: { publicId: id, displayName: own.displayName, followerCount: 3, following: false, viewer: "guest", avatarUrl: publicOwnerAvatarHref(id, version) } } });
          await page.evaluate(() => scrollTo(0, 0)); await expect(page.locator("img")).toBeVisible();
          await expect.poll(() => page.locator("img").evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(8);
          await expect(page.locator("img")).toHaveCSS("border-top-color", neutralRingRgb); await expect(page.locator("img")).toHaveCSS("border-top-width", "1px");
          await expect(page.getByRole("heading", { name: own.displayName })).toBeVisible(); await expect(page.getByText(copy.login, { exact: true })).toBeVisible();
          await page.screenshot({ path: `${output}/${engine.name()}-${locale}-${viewport.width}-profile.png`, fullPage: true });
          const props = { locale, publicId: id, displayName: own.displayName, avatarUrl: publicOwnerAvatarHref(id, version) };
          await render("avatars", [props]); await expect(page.locator("img")).toBeVisible(); const oldBlob = await page.locator("img").getAttribute("src");
          metadataVersion = nextVersion;
          await page.evaluate(() => window.dispatchEvent(new Event("focus")));
          await expect.poll(async () => page.locator("img").getAttribute("src")).not.toBe(oldBlob);
          await expect(page.locator("img")).toBeVisible(); assert.notEqual(await page.locator("img").getAttribute("src"), oldBlob);
          assert.equal(await page.evaluate(async url => { try { await fetch(url!); return false; } catch { return true; } }, oldBlob), true, "replaced object URL is revoked");
          metadataVersion = null; await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await expect(page.getByRole("img", { name: copy.photoMissing })).toBeVisible(); await expect(page.locator("img")).toHaveCount(0);
          await expect(page.getByRole("img", { name: copy.photoMissing })).toHaveCSS("border-top-color", neutralRingRgb); await expect(page.getByRole("img", { name: copy.photoMissing })).toHaveCSS("border-top-width", "1px");
          metadataVersion = nextVersion; imageStatus = 404; await render("avatars", [{ ...props, avatarUrl: publicOwnerAvatarHref(id, nextVersion) }]);
          await expect(page.locator("img")).toHaveCount(0); await expect(page.getByRole("img", { name: copy.photoMissing })).toBeVisible(); await expect(page.getByRole("button", { name: copy.photoRetry })).toHaveCount(0);
          await render("blank", null);
          imageStatus = 503; await render("avatars", [{ ...props, avatarUrl: publicOwnerAvatarHref(id, nextVersion) }]);
          await expect(page.getByRole("img", { name: copy.photoUnavailable })).toBeVisible(); const failedCount = imageRequests.length;
          await page.waitForTimeout(80); assert.equal(imageRequests.length, failedCount, "no automatic retry");
          imageStatus = 200; await page.getByRole("button", { name: copy.photoRetry }).click(); await expect(page.locator("img")).toBeVisible(); assert.equal(imageRequests.length, failedCount + 1);
          metadataUnavailable = true; await render("avatars", [{ ...props, publicId: rows[0].publicId }]); await expect(page.locator("img")).toHaveCount(0);
          await expect(page.getByRole("img", { name: copy.photoUnavailable })).toBeVisible(); assert.equal(imageRequests.length, failedCount + 1, "mismatched identity never fetches a previous person's URL");
          metadataUnavailable = false; await render("blank", null); delay = 250; const beforeCancel = imageRequests.length;
          await render("avatars", rows.map(row => ({ ...row, locale })));
          await expect.poll(() => imageRequests.length).toBe(beforeCancel + 1); await render("blank", null);
          await page.waitForTimeout(300); assert.equal(imageRequests.length, beforeCancel + 1, "unmount cancels all waiting images"); await expect(page.locator("img")).toHaveCount(0);
          await page.goto(`${origin}/clubowners`); await photo.uncheck(); await expect(photo).not.toBeChecked(); await page.getByRole("button", { name: copy.save, exact: true }).click();
          await expect(page.getByText(copy.saved, { exact: true })).toBeVisible(); assert.deepEqual(writes.at(-1), { displayName: own.displayName, published: true, photoPublished: false });
          assert.ok(metadataRequests.length > 0, "visible public photos reconcile current consent and version");
          assert.equal(own.publicId, id); assert.equal(own.followerCount, 3); assert.deepEqual(errors, []); scenarios++;
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  assert.equal(scenarios, engines.length * 4);
  console.log(JSON.stringify({ scenarios, output, boundary: "isolated real UI and transport; synthetic HTTP, no real account or remote database" }));
});
