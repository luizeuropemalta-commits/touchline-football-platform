import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import { peopleCopy, type OwnPublicOwner, type PeopleLocale } from "../lib/touchlineArena/clubowner-public-contract.ts";

// Actual components, hooks and scoped CSS; synthetic account/HTTP boundaries.
// Persistence/RLS are independently exercised with the real SQL in PGlite.
test("public directory and profile work across isolated accounts, languages and browser engines", {
  skip: process.env.TOUCHLINE_RUN_CLUBOWNER_PUBLIC_BROWSER !== "1", timeout: 120_000,
}, async () => {
  requireBrowserCapacity(process.cwd());
  const output = mkdtempSync(`${tmpdir()}/touchline-public-owners-`), origin = "https://people.invalid";
  const directory = "components/touchline/social/ClubOwnerPublicDirectory.tsx", profile = "components/touchline/social/ClubOwnerPublicProfile.tsx", css = "components/touchline/social/ClubOwnerPublic.module.css";
  const bundle = bundleIsolatedBrowserFixture({ entryPath: directory, additionalEntryPaths: [profile, css],
    requiredSources: [directory, profile, css, "components/touchline/social/usePublicOwnersRequest.ts", "lib/touchlineArena/clubowner-public-contract.ts"],
    mountScript: `const fixture=window.peopleFixture,styles=loadAdditionalEntry(${JSON.stringify(css)});const Component=fixture.kind==='profile'?loadAdditionalEntry(${JSON.stringify(profile)}).default:loadEntry().default;flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement('main',{className:styles.shell},React.createElement('div',{className:styles.content},React.createElement(Component,fixture.props))))));`,
  });
  let scenarios = 0;
  for (const engine of [chromium, webkit, firefox]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const locale of ["pt-BR", "en-GB"] as PeopleLocale[]) for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 820 }, { width: 1440, height: 900 }]) {
        const copy = peopleCopy(locale), aliceId = "11111111-2222-4333-8444-555555555555", bobId = "66666666-7777-4888-8999-aaaaaaaaaaaa";
        const profiles: (OwnPublicOwner | null)[] = [null, null];
        const followers = new Map<string, Set<number>>([[aliceId, new Set()], [bobId, new Set()]]);
        let writes = 0;
        const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport, serviceWorkers: "block", reducedMotion: "reduce" })));
        const pages = [], errors: string[] = [];
        for (const [actor, context] of contexts.entries()) {
          const summary = (id: string) => {
            const owner = profiles.findIndex(person => person?.publicId === id && person.published);
            return owner === -1 ? null : { publicId: id, displayName: profiles[owner]!.displayName, followerCount: followers.get(id)!.size, following: followers.get(id)!.has(actor), viewer: owner === actor ? "self" : "member" };
          };
          await context.route("**/*", async route => {
            const request = route.request(), url = new URL(request.url());
            if (url.origin !== origin) return route.abort();
            if (url.pathname.startsWith("/api/")) {
              if (url.pathname === "/api/account/public-profile") {
                if (request.method() === "PUT") {
                  writes++; const body = request.postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ["displayName", "published"]);
                  profiles[actor] = { publicId: actor === 0 ? aliceId : bobId, displayName: body.displayName, published: body.published, followerCount: followers.get(actor === 0 ? aliceId : bobId)!.size };
                }
                return route.fulfill({ json: { profile: profiles[actor] } });
              }
              if (url.pathname === "/api/touchline/clubowners") {
                const q = url.searchParams.get("q")!.toLowerCase();
                return route.fulfill({ json: { profiles: profiles.filter(person => person?.published && (person.displayName.toLowerCase().startsWith(q) || person.publicId === q)).map(person => ({ publicId: person!.publicId, displayName: person!.displayName })) } });
              }
              const match = url.pathname.match(/^\/api\/touchline\/clubowners\/([^/]+)(\/follow)?$/);
              if (!match || !summary(match[1])) return route.fulfill({ status: 404, json: { error: "not_found" } });
              if (match[2]) {
                writes++; const body = request.postDataJSON(); assert.deepEqual(Object.keys(body), ["active"]); assert.equal(typeof body.active, "boolean");
                if (body.active) followers.get(match[1])!.add(actor); else followers.get(match[1])!.delete(actor);
              }
              return route.fulfill({ json: { profile: summary(match[1]) } });
            }
            if (!url.pathname.startsWith("/clubowners")) return route.abort();
            const id = url.pathname.split("/")[2];
            const fixture = id ? { kind: "profile", props: { locale, publicId: id, enabled: true, initial: { status: summary(id) ? 200 : 404, profile: summary(id) } } }
              : { kind: "directory", props: { locale, enabled: true, initialOwn: { status: 200, profile: profiles[actor] } } };
            return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font:16px system-ui}button,input{font:inherit}${bundle.css}</style><div id="root"></div><script>window.peopleFixture=${JSON.stringify(fixture)};${bundle.script.replace(/<\/script/gi, "<\\/script")}</script></html>` });
          });
          const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message)); pages.push(page);
        }
        const [alice, bob] = pages;
        await alice.goto(`${origin}/clubowners?lang=${locale}`);
        await expect(alice.getByRole("checkbox")).not.toBeChecked();
        await alice.getByLabel(copy.name, { exact: true }).fill("Synthetic Friend");
        await alice.getByRole("checkbox").check(); await alice.getByRole("button", { name: copy.save, exact: true }).click();
        await expect(alice.getByText(copy.saved, { exact: true })).toBeVisible();
        assert.equal(writes, 1); await alice.reload(); await expect(alice.getByRole("checkbox")).toBeChecked();
        await expect(alice.getByLabel(copy.name, { exact: true })).toHaveValue("Synthetic Friend");
        await bob.goto(`${origin}/clubowners?lang=${locale}`);
        await bob.getByLabel(copy.query, { exact: true }).fill("Synthetic"); await bob.getByRole("button", { name: copy.search, exact: true }).click();
        await bob.getByRole("link", { name: "Synthetic Friend", exact: true }).click();
        await expect(bob.getByRole("heading", { name: "Synthetic Friend", exact: true })).toBeVisible();
        await bob.getByRole("button", { name: copy.follow, exact: true }).click();
        await expect(bob.getByRole("button", { name: copy.unfollow, exact: true })).toBeEnabled(); assert.equal(writes, 2);
        await bob.reload(); await expect(bob.getByRole("button", { name: copy.unfollow, exact: true })).toBeEnabled();
        await expect(bob.locator("dd")).toHaveText("1");
        await alice.getByRole("link", { name: copy.view, exact: true }).click();
        await expect(alice.getByText(copy.self, { exact: true })).toBeVisible(); await expect(alice.locator("dd")).toHaveText("1");
        assert.equal(await alice.getByRole("button", { name: copy.follow, exact: true }).count(), 0);
        assert.ok(await bob.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${engine.name()}/${locale}/${viewport.width} overflow`);
        if (engine === webkit) await bob.screenshot({ path: `${output}/${engine.name()}-${locale}-${viewport.width}-profile.png`, fullPage: true });
        await bob.getByRole("button", { name: copy.unfollow, exact: true }).click(); await expect(bob.locator("dd")).toHaveText("0"); assert.equal(writes, 3);
        await alice.goto(`${origin}/clubowners?lang=${locale}`); await alice.getByRole("checkbox").uncheck(); await alice.getByRole("button", { name: copy.save, exact: true }).click();
        await expect(alice.getByText(copy.hidden, { exact: true })).toBeVisible(); assert.equal(writes, 4);
        assert.ok(await alice.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        if (engine === webkit) await alice.screenshot({ path: `${output}/${engine.name()}-${locale}-${viewport.width}-directory.png`, fullPage: true });
        await bob.reload(); await expect(bob.getByText(copy.notFound, { exact: true })).toBeVisible();
        assert.deepEqual(errors, []); scenarios++; for (const context of contexts) await context.close();
      }
    } finally { await browser.close(); }
  }
  assert.equal(scenarios, 24);
  console.log(`Public ClubOwner browser: ${scenarios} flows, 48 account contexts, screenshots ${output}; synthetic HTTP, no real account/database.`);
});
