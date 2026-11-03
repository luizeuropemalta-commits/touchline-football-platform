import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { chromium, webkit, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";

const origin="https://avatar-direct.invalid",actor="11111111-1111-4111-8111-111111111111";
const initial={accountId:actor,revision:"0",avatarUrl:null,generation:"0",activeOperationId:null,
  fencedThroughGeneration:"-1",operationId:null,operationState:null,committedRevision:null,
  uploadAllowed:true,canUpload:false,readyForSelection:false};
const mount=`
const Control=loadEntry().default;
window.actor=${JSON.stringify(actor)};window.context=${JSON.stringify(initial)};window.observers=new Set();window.refreshes=0;
window.onFixtureRouteRefresh=()=>window.refreshes++;
window.avatarFixtureAuth={auth:{getUser:async()=>({data:{user:{id:window.actor}},error:null}),onAuthStateChange:callback=>{window.observers.add(callback);callback('INITIAL_SESSION',{user:{id:window.actor}});return{data:{subscription:{unsubscribe:()=>window.observers.delete(callback)}}}}}};
window.renderAvatar=()=>flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Control,{accountId:window.actor,context:window.context,locale:'pt-BR',avatarSelectionEnabled:true,retentionReady:true},React.createElement('span',null,'Foto atual')))));
window.renderAvatar();
`;
test("real avatar opens native chooser and uploads once, with error-only recovery and fresh context after success",{
  skip:process.env.TOUCHLINE_RUN_AVATAR_MODAL_BROWSER!=="1",timeout:120000,
},async()=>{
  const output=process.env.TOUCHLINE_AVATAR_MODAL_CAPTURE_DIR;
  assert.ok(output&&path.isAbsolute(output));mkdirSync(output,{recursive:true});
  const engine=process.env.TOUCHLINE_AVATAR_MODAL_ENGINE==="webkit"?webkit:chromium;
  const bundle=bundleIsolatedBrowserFixture({entryPath:"components/touchline/ClubOwnerAvatarControl.tsx",
    requiredSources:["components/touchline/ClubOwnerAvatarUploadSelection.tsx","lib/touchlineArena/club-owner-avatar-preparation.ts","lib/touchlineArena/club-owner-avatar-client.ts"],
    mountScript:mount,syntheticAvatarAuth:true,allowSyntheticRouteRefresh:true});
  const photo=await sharp({create:{width:80,height:80,channels:3,background:"#b7ff2f"}}).png().toBuffer();
  const browser=await engine.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:"block"});
    const page=await context.newPage(),errors:string[]=[];
    page.on("pageerror",e=>errors.push(e.message));
    let uploads=0,fail=false;
    await context.route("**/*",async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.origin!==origin)return route.abort();
      if(url.pathname==="/fixture")return route.fulfill({contentType:"text/html",body:`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#08130f;color:white;font:16px Arial;padding:24px}#root{max-width:600px}button{min-height:44px}${bundle.css}</style><div id="root"></div><script>${bundle.script.replace(/<\/script/gi,"<\\/script")}</script>`});
      if(url.pathname==="/api/account/avatar"){
        uploads++;
        if(fail)return route.fulfill({status:503,json:{ok:false,state:"unknown"}});
        const operation=req.headers()["x-touchline-avatar-operation"];
        return route.fulfill({json:{ok:true,state:"committed",requiresRefresh:true,accountId:actor,operationId:operation,revision:String(uploads),avatarUrl:"/api/account/avatar?version="+operation}});
      }
      if(url.pathname==="/api/account/avatar/recovery")return route.fulfill({json:{ok:true,state:"observed",context:initial}});
      return route.abort();
    });
    const choose=async()=>{
      const chooser=page.waitForEvent("filechooser");await page.getByRole("button",{name:"Escolher foto",exact:true}).click();
      await (await chooser).setFiles({name:"fixture.png",mimeType:"image/png",buffer:photo});
    };
    await page.goto(origin+"/fixture");
    await expect(page.getByRole("button",{name:"Escolher foto",exact:true})).toBeEnabled();
    await expect(page.locator("dialog")).toHaveCount(0);
    await expect(page.locator('[data-avatar-recovery]')).toHaveCount(0);
    await choose();
    await expect.poll(()=>uploads).toBe(1);
    await expect.poll(()=>page.evaluate(()=>(window as unknown as {refreshes:number}).refreshes)).toBe(1);
    await expect(page.locator('[data-avatar-selection="confirm"]')).toHaveCount(0);
    await page.evaluate(()=>{
      const w=window as unknown as {context:Record<string,unknown>;renderAvatar:()=>void};
      w.context={...w.context,revision:"1",generation:"2",avatarUrl:"/api/account/avatar?version=22222222-2222-4222-8222-222222222222"};
      w.renderAvatar();
    });
    await expect(page.getByRole("button",{name:"Escolher foto",exact:true})).toBeEnabled();
    fail=true;await choose();
    await expect.poll(()=>uploads).toBe(2);
    await expect(page.locator('[data-avatar-recovery]')).toBeVisible();
    await expect(page.locator("dialog")).toHaveCount(0);
    await page.screenshot({path:path.join(output,"direct-upload-error-recovery.png")});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,"direct-upload-mobile.png")});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
