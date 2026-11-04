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
    mountScript: `
      // Observe the component's real online effect without adding a subscriber,
      // invoking a callback ourselves or changing any timer/visibility guard.
      const nativeAdd=window.addEventListener, nativeRemove=window.removeEventListener;
      const activeOnline=new Map(), onlineInstalls=[], onlineRemovals=[], onlineDeliveries=[];
      let onlineSequence=0;
      const socialStatus=()=>document.querySelector('[role="status"]')?.textContent??null;
      window.addEventListener=function(type,listener,options){
        if(type!=='online'||!listener)return nativeAdd.call(this,type,listener,options);
        let registration=activeOnline.get(listener);
        if(!registration){
          const id=++onlineSequence;
          const wrapped=function(event){
            onlineDeliveries.push({id,status:socialStatus(),at:Date.now()});
            return typeof listener==='function'?listener.call(this,event):listener.handleEvent(event);
          };
          registration={id,wrapped,status:socialStatus()};activeOnline.set(listener,registration);
          onlineInstalls.push({id,status:registration.status,at:Date.now()});
        }
        return nativeAdd.call(this,type,registration.wrapped,options);
      };
      window.removeEventListener=function(type,listener,options){
        const registration=type==='online'?activeOnline.get(listener):null;
        if(!registration)return nativeRemove.call(this,type,listener,options);
        activeOnline.delete(listener);onlineRemovals.push({id:registration.id,at:Date.now()});
        return nativeRemove.call(this,type,registration.wrapped,options);
      };
      window.socialOnlineObservation=()=>({active:Array.from(activeOnline.values(),({id,status})=>({id,status})),
        installs:onlineInstalls,removals:onlineRemovals,deliveries:onlineDeliveries,now:Date.now()});
      flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(loadEntry().default,{providerId:'123',playerName:'Synthetic Player',locale:'pt-BR'}))));`,
  });
  for (const engine of [chromium, webkit, firefox]) {
    const browser = await engine.launch({ headless: true });
    const liked = new Set<number>();
    let writes = 0;
    const traffic: Array<{ account: number; method: string; status: number }> = [];
    const pages: import("@playwright/test").Page[] = [];
    try {
      let failRead = false;
      const contexts = await Promise.all([0, 1].map(() => browser.newContext({ serviceWorkers: "block" })));
      const errors: string[] = [];
      for (const [account, context] of contexts.entries()) {
        await context.route("**/*", async route => {
          const request = route.request(), url = new URL(request.url());
          if (url.origin !== origin) return route.abort();
          if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body:
            `<meta charset="utf-8"><style>${bundle.css}</style><div id="root"></div><script>${bundle.script.replace(/<\/script/gi, "<\\/script")}</script>` });
          if (url.pathname !== "/api/touchline/players/123/social") return route.abort();
          if (request.method() === "GET" && failRead && account === 0) {
            traffic.push({ account, method: "GET", status: 503 });
            return route.fulfill({ status: 503, json: { ok: false } });
          }
          if (request.method() === "PUT") {
            writes++;
            const mutation = request.postDataJSON();
            assert.deepEqual(Object.keys(mutation).sort(), ["active", "kind"]);
            assert.equal(mutation.kind, "like");
            if (mutation.active) liked.add(account); else liked.delete(account);
          } else assert.equal(request.method(), "GET");
          traffic.push({ account, method: request.method(), status: 200 });
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
      const reads = (account: number, status: number) => traffic.filter(row => row.account === account && row.method === "GET" && row.status === status).length;
      const failuresBefore = reads(0, 503);
      failRead = true;
      await pages[0].clock.runFor(30_001);
      await expect(pages[0].getByRole("button", { name: "Curtir —", exact: true })).toBeDisabled();
      // The disabled dash also exists during loading. Wait for the actual failed
      // read and committed error state before emitting the sole online signal.
      await expect.poll(() => reads(0, 503)).toBeGreaterThan(failuresBefore);
      await expect(pages[0].getByRole("status")).toHaveText("Interações indisponíveis. Nenhuma confirmação recebida.");
      await expect(pages[0].getByRole("button", { name: "Consultar novamente", exact: true })).toBeEnabled();
      await expect(pages[1].getByRole("button", { name: "Curtiu 12", exact: true })).toBeEnabled();
      assert.deepEqual(await pages[0].evaluate(() => ({ visibility: document.visibilityState, online: navigator.onLine })),
        { visibility: "visible", online: true }, "online recovery exercises a real visible, connected control");
      // This effect is recreated on phase changes. Observe its real error-phase
      // registration; a rendered status alone does not prove passive effects ran.
      // The clock stays installed: no frozen requestAnimationFrame wait or sleep.
      await expect.poll(() => pages[0].evaluate(() =>
        (window as unknown as { socialOnlineObservation: () => { active: Array<{ status: string | null }> } })
          .socialOnlineObservation().active.map(listener => listener.status)))
        .toEqual(["Interações indisponíveis. Nenhuma confirmação recebida."]);
      const deliveriesBefore = await pages[0].evaluate("window.socialOnlineObservation().deliveries.length") as number;
      const successesBefore = reads(0, 200);
      failRead = false;
      await pages[0].evaluate(() => window.dispatchEvent(new Event("online")));
      await expect.poll(() => pages[0].evaluate("window.socialOnlineObservation().deliveries.length")).toBe(deliveriesBefore + 1);
      await expect.poll(() => reads(0, 200)).toBe(successesBefore + 1);
      await expect(pages[0].getByRole("button", { name: "Curtiu 12", exact: true })).toBeEnabled();
      await expect(pages[0].getByRole("status")).toHaveText("Interações salvas na sua conta.");
      assert.equal(writes, 2);
      assert.deepEqual(errors, []);
      console.log(`SOCIAL_CROSS_ACCOUNT_PROOF ${JSON.stringify({ engine: engine.name(), traffic, writes,
        recoveryGetCount: reads(0, 200) - successesBefore, isolatedAccounts: true,
        onlineEffects: await pages[0].evaluate("window.socialOnlineObservation()") })}`);
      for (const context of contexts) await context.close();
    } catch (error) {
      const state = await Promise.all(pages.map(async (page, account) => ({ account,
        ...(await page.evaluate(() => ({ visibility: document.visibilityState, online: navigator.onLine,
          onlineEffects: (window as unknown as { socialOnlineObservation: () => unknown }).socialOnlineObservation(),
          status: document.querySelector('[role="status"]')?.textContent ?? null,
          buttons: Array.from(document.querySelectorAll("button"), button => ({ text: button.textContent, disabled: button.disabled })),
        })).catch(() => ({ unavailable: true }))),
      })));
      console.log(`SOCIAL_CROSS_ACCOUNT_FAILURE ${JSON.stringify({ engine: engine.name(), traffic, writes, state })}`);
      throw error;
    } finally { await browser.close(); }
  }
});
