import assert from "node:assert/strict";
import test from "node:test";
import { chromium, webkit, firefox, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";

// Two isolated browser contexts have no shared BroadcastChannel or cookies.
// The transport is synthetic; actual multi-account QA remains a separate gate.
test("social totals reconcile across isolated accounts without remount or replaying writes", {
  skip: process.env.TOUCHLINE_RUN_SOCIAL_CROSS_ACCOUNT_BROWSER !== "1", timeout: 120_000,
}, async () => {
  const origin = "https://social-accounts.invalid";
  const bundle = bundleIsolatedBrowserFixture({
    entryPath: "components/touchline/social/TouchlinePlayerSocialActions.tsx",
    requiredSources: ["components/touchline/social/TouchlinePlayerSocialActions.tsx"],
    mountScript: `flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(loadEntry().default,{providerId:'123',playerName:'Synthetic Player',locale:'pt-BR'}))));`,
  });
  for (const engine of [chromium, webkit, firefox]) {
    const browser = await engine.launch({ headless: true });
    try {
      const liked = new Set<number>();
      let writes = 0;
      let failRead = false;
      const contexts = await Promise.all([0, 1].map(() => browser.newContext({ serviceWorkers: "block" })));
      const pages = [];
      const errors: string[] = [];
      for (const [account, context] of contexts.entries()) {
        await context.route("**/*", async route => {
          const request = route.request(), url = new URL(request.url());
          if (url.origin !== origin) return route.abort();
          if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body:
            `<meta charset="utf-8"><style>${bundle.css}</style><div id="root"></div><script>${bundle.script.replace(/<\/script/gi, "<\\/script")}</script>` });
          if (url.pathname !== "/api/touchline/players/123/social") return route.abort();
          if (request.method() === "GET" && failRead && account === 0) return route.fulfill({ status: 503, json: { ok: false } });
          if (request.method() === "PUT") {
            writes++;
            const mutation = request.postDataJSON();
            assert.deepEqual(Object.keys(mutation).sort(), ["active", "kind"]);
            assert.equal(mutation.kind, "like");
            if (mutation.active) liked.add(account); else liked.delete(account);
          } else assert.equal(request.method(), "GET");
          return route.fulfill({ json: { ok: true, canReact: true, data: {
            followerCount: 0, likeCount: 10 + liked.size, following: false, liked: liked.has(account),
          } } });
        });
        const page = await context.newPage();
        page.on("pageerror", error => errors.push(error.message));
        await page.clock.install();
        await page.goto(origin);
        await expect(page.getByRole("button", { name: "Curtir 10", exact: true })).toBeEnabled();
        pages.push(page);
      }
      await pages[1].getByRole("button", { name: "Curtir 10", exact: true }).click();
      await expect(pages[1].getByRole("button", { name: "Curtiu 11", exact: true })).toBeEnabled();
      await pages[0].clock.runFor(30_001);
      await expect(pages[0].getByRole("button", { name: "Curtir 11", exact: true })).toBeEnabled();
      assert.equal(writes, 1, "refreshing totals never repeats a mutation");
      await pages[0].getByRole("button", { name: "Curtir 11", exact: true }).click();
      await expect(pages[0].getByRole("button", { name: "Curtiu 12", exact: true })).toBeEnabled();
      await pages[1].clock.runFor(30_001);
      await expect(pages[1].getByRole("button", { name: "Curtiu 12", exact: true })).toBeEnabled();
      assert.equal(writes, 2);
      // Losing the read must not invent zero or strand the visible page after
      // connectivity returns. A fresh GET recovers without a new like request.
      failRead = true;
      await pages[0].clock.runFor(30_001);
      await expect(pages[0].getByRole("button", { name: "Curtir —", exact: true })).toBeDisabled();
      failRead = false;
      await pages[0].evaluate(() => window.dispatchEvent(new Event("online")));
      await expect(pages[0].getByRole("button", { name: "Curtiu 12", exact: true })).toBeEnabled();
      assert.equal(writes, 2);
      assert.deepEqual(errors, []);
      for (const context of contexts) await context.close();
    } finally { await browser.close(); }
  }
});
