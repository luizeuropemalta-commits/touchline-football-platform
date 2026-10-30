import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import sharp from "sharp";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import { peopleCopy, publicOwnerAvatarHref, type PeopleLocale } from "../lib/touchlineArena/clubowner-public-contract.ts";

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
  const limeRgb = `rgb(${[1, 3, 5].map(index => parseInt(lime.slice(index, index + 2), 16)).join(", ")})`;
  const directory = "components/touchline/social/ClubOwnerPublicDirectory.tsx", profile = "components/touchline/social/ClubOwnerPublicProfile.tsx";
  const avatar = "components/touchline/social/ClubOwnerPublicAvatar.tsx", css = "components/touchline/social/ClubOwnerPublic.module.css";
  const bundle = bundleIsolatedBrowserFixture({ entryPath: directory, additionalEntryPaths: [avatar, profile, css],
    requiredSources: [directory, profile, avatar, css, "lib/touchlineArena/clubowner-public-avatar-client.ts", "lib/touchlineArena/clubowner-public-contract.ts"],
    mountScript: `const styles=loadAdditionalEntry(${JSON.stringify(css)}),Avatar=loadAdditionalEntry(${JSON.stringify(avatar)}).default;
      window.renderPeople=(kind,props)=>flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement('main',{className:styles.shell},React.createElement('div',{className:styles.content},kind==='blank'?null:kind==='avatars'?React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(5,56px)',gap:'4px'}},props.map((p,i)=>React.createElement(Avatar,{key:i,...p}))):React.createElement(kind==='profile'?loadAdditionalEntry(${JSON.stringify(profile)}).default:loadEntry().default,props))))));window.renderPeople('directory',window.peopleFixture);`,
  });
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
        const rows = Array.from({ length: 20 }, (_, index) => { const publicId = `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`; return { publicId, displayName: `Synthetic Customer ${index}`, avatarUrl: publicOwnerAvatarHref(publicId, version) }; });
        const writes: unknown[] = [], imageRequests: string[] = [], errors: string[] = [];
        let active = 0, maxActive = 0, imageStatus = 200, delay = 25;
        const context = await browser.newContext({ viewport, serviceWorkers: "block", reducedMotion: "reduce" });
        try {
          await context.route("**/*", async route => {
            const request = route.request(), url = new URL(request.url());
            if (url.origin !== origin) return route.abort();
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
            if (url.pathname === "/api/touchline/clubowners") return route.fulfill({ json: { profiles: rows } });
            if (url.pathname !== "/clubowners") return route.abort();
            const props = { locale, enabled: true, photoSharingEnabled: true, initialOwn: { status: 200, profile: own } };
            return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--lime:${lime}}*{box-sizing:border-box}body{margin:0;font:16px system-ui}button,input{font:inherit}${bundle.css}</style><div id="root"></div><script>window.peopleFixture=${JSON.stringify(props)};${bundle.script.replace(/<\/script/gi, "<\\/script")}</script></html>` });
          });
          const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
          await page.goto(`${origin}/clubowners`);
          const publish = page.getByRole("checkbox", { name: copy.consent, exact: true }), photo = page.getByRole("checkbox", { name: copy.photoConsent, exact: true });
          await expect(publish).not.toBeChecked(); await expect(photo).not.toBeChecked(); await expect(photo).toBeDisabled();
          await publish.focus(); await page.keyboard.press("Space"); await expect(photo).toBeEnabled(); await expect(photo).not.toBeChecked();
          await photo.focus(); await page.keyboard.press("Space"); await page.getByRole("button", { name: copy.save, exact: true }).click();
          await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
          assert.deepEqual(writes, [{ displayName: own.displayName, published: true, photoPublished: true }]);
          await page.reload(); await expect(photo).toBeChecked(); await expect(publish).toBeChecked();
          await page.screenshot({ path: `${output}/${engine.name()}-${locale}-${viewport.width}-consent.png`, fullPage: true });
          await page.getByLabel(copy.query, { exact: true }).fill("Synthetic"); await page.getByRole("button", { name: copy.search, exact: true }).click();
          const results = page.locator("li"); await expect(results).toHaveCount(20);
          for (let index = 0; index < 20; index++) {
            await results.nth(index).scrollIntoViewIfNeeded(); await expect(results.nth(index).locator("img")).toBeVisible();
          }
          assert.equal(imageRequests.length, 20); assert.equal(new Set(imageRequests).size, 20); assert.equal(maxActive, 1);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          const render = (kind: string, props: unknown) => page.evaluate(({ kind, props }) => {
            (window as unknown as { renderPeople: (kind: string, props: unknown) => void }).renderPeople(kind, props);
          }, { kind, props });
          await render("profile", { locale, publicId: id, enabled: true, initial: { status: 200, profile: { publicId: id, displayName: own.displayName, followerCount: 3, following: false, viewer: "guest", avatarUrl: publicOwnerAvatarHref(id, version) } } });
          await page.evaluate(() => scrollTo(0, 0)); await expect(page.locator("img")).toBeVisible();
          await expect(page.locator("img")).toHaveCSS("border-top-color", limeRgb); await expect(page.locator("img")).toHaveCSS("border-top-width", "1px");
          await expect(page.getByRole("heading", { name: own.displayName })).toBeVisible(); await expect(page.getByText(copy.login, { exact: true })).toBeVisible();
          await page.screenshot({ path: `${output}/${engine.name()}-${locale}-${viewport.width}-profile.png`, fullPage: true });
          const props = { locale, publicId: id, displayName: own.displayName, avatarUrl: publicOwnerAvatarHref(id, version) };
          await render("avatars", [props]); await expect(page.locator("img")).toBeVisible(); const oldBlob = await page.locator("img").getAttribute("src");
          await render("avatars", [{ ...props, avatarUrl: publicOwnerAvatarHref(id, nextVersion) }]);
          await expect(page.locator("img")).toBeVisible(); assert.notEqual(await page.locator("img").getAttribute("src"), oldBlob);
          assert.equal(await page.evaluate(async url => { try { await fetch(url!); return false; } catch { return true; } }, oldBlob), true, "replaced object URL is revoked");
          await render("avatars", [{ ...props, avatarUrl: null }]); await expect(page.getByRole("img", { name: copy.photoMissing })).toBeVisible(); await expect(page.locator("img")).toHaveCount(0);
          await expect(page.getByRole("img", { name: copy.photoMissing })).toHaveCSS("border-top-color", limeRgb); await expect(page.getByRole("img", { name: copy.photoMissing })).toHaveCSS("border-top-width", "1px");
          imageStatus = 404; await render("avatars", [{ ...props, avatarUrl: publicOwnerAvatarHref(id, nextVersion) }]);
          await expect(page.locator("img")).toHaveCount(0); await expect(page.getByRole("img", { name: copy.photoMissing })).toBeVisible(); await expect(page.getByRole("button", { name: copy.photoRetry })).toHaveCount(0);
          await render("blank", null);
          imageStatus = 503; await render("avatars", [{ ...props, avatarUrl: publicOwnerAvatarHref(id, nextVersion) }]);
          await expect(page.getByRole("img", { name: copy.photoUnavailable })).toBeVisible(); const failedCount = imageRequests.length;
          await page.waitForTimeout(80); assert.equal(imageRequests.length, failedCount, "no automatic retry");
          imageStatus = 200; await page.getByRole("button", { name: copy.photoRetry }).click(); await expect(page.locator("img")).toBeVisible(); assert.equal(imageRequests.length, failedCount + 1);
          await render("avatars", [{ ...props, publicId: rows[0].publicId }]); await expect(page.locator("img")).toHaveCount(0);
          await expect(page.getByRole("img", { name: copy.photoUnavailable })).toBeVisible(); assert.equal(imageRequests.length, failedCount + 1, "mismatched identity never fetches a previous person's URL");
          await render("blank", null); delay = 250; const beforeCancel = imageRequests.length;
          await render("avatars", rows.map(row => ({ ...row, locale })));
          await expect.poll(() => imageRequests.length).toBe(beforeCancel + 1); await render("blank", null);
          await page.waitForTimeout(300); assert.equal(imageRequests.length, beforeCancel + 1, "unmount cancels all waiting images"); await expect(page.locator("img")).toHaveCount(0);
          await page.goto(`${origin}/clubowners`); await publish.uncheck(); await expect(photo).not.toBeChecked(); await page.getByRole("button", { name: copy.save, exact: true }).click();
          await expect(page.getByText(copy.saved, { exact: true })).toBeVisible(); assert.deepEqual(writes.at(-1), { displayName: own.displayName, published: false, photoPublished: false });
          assert.equal(own.publicId, id); assert.equal(own.followerCount, 3); assert.deepEqual(errors, []); scenarios++;
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  assert.equal(scenarios, engines.length * 4);
  console.log(JSON.stringify({ scenarios, output, boundary: "isolated real UI and transport; synthetic HTTP, no real account or remote database" }));
});
