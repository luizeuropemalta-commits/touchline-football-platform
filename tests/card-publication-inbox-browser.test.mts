import test from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
test("membership issue visible and switching players resets editorial fields", { skip: process.env.TOUCHLINE_RUN_PUBLICATION_INBOX_BROWSER !== "1", timeout: 60000 }, async () => {
 const rows = ["Omar", "Second", "Unbound"].map((name, i) => ({playerId:String(i),playerName:name,clubName:"Club",provider:{},effective:{},override:{displayName:name},cardReview:{state:"COMPLETE",missingFields:[]},positionConflict:null,publicationIssue:i===2?"NO_ACTIVE_MEMBERSHIP":"STALE_PUBLICATION"}));
 const bundle = bundleIsolatedBrowserFixture({entryPath:"components/card-engine-inbox.tsx",requiredSources:[],mountScript:`const Panel=loadEntry().CardEngineInbox;flushSync(()=>root.render(React.createElement(Panel,{rows:${JSON.stringify(rows)},locale:"pt-BR"})));`});
 const browser=await chromium.launch({headless:true});
 try {
 const page=await browser.newPage();
 const requests:unknown[]=[];
 const urls:string[]=[];
 await page.route("**/*",route=>{if(route.request().method()==="POST"){requests.push(route.request().postDataJSON());urls.push(route.request().url());return route.fulfill({json:{cardReview:{state:"COMPLETE"}}});} return route.fulfill({contentType:"text/html",body:`<meta charset="utf-8"><div id="root"></div><script>${bundle.script.replace(/<\/script/gi,"<\\/script")}</script>`});});
 await page.goto("https://card-inbox.invalid");
 await expect(page.getByRole("alert")).toContainText("revisão de vínculo");
 await page.getByRole("button",{name:"Revalidar publicação"}).click();
 await expect(page.getByText("Publicação ainda pendente: revise os campos indicados.")).toBeVisible();
 assert.deepEqual(requests.shift(),{playerId:"0"});
 assert.match(urls.shift()!,/action=reconcile-publication$/);
 await page.locator('input[name="displayName"]').fill("Unsaved first player");
 await page.getByRole("button",{name:/Second/}).click();
 await expect(page.locator('input[name="displayName"]')).toHaveValue("Second");
 await page.getByRole("button",{name:"SALVAR E REVALIDAR"}).click();
 await expect(page.getByText(/Completo. Recarregue/)).toBeVisible();
 assert.equal((requests[0] as {playerId:string}).playerId,"1");
 assert.equal((requests[0] as {fields:{displayName:string}}).fields.displayName,"Second");
 await page.getByRole("button",{name:/Unbound/}).click();
 await expect(page.getByRole("button",{name:"SALVAR E REVALIDAR"})).toBeDisabled();
 await expect(page.getByRole("button",{name:"Revalidar publicação"})).toHaveCount(0);
 await expect(page.getByText(/Completo. Recarregue/)).toHaveCount(0);
 } finally {await browser.close();}
});
