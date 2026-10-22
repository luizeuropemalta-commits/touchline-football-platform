import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, join } from "node:path";
import ts from "typescript";
import { chromium, webkit, expect } from "@playwright/test";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY as formations } from "../lib/touchlineArena/formation-geometry.ts";
import { collectionSlotPlan } from "../lib/touchlineFantasy/club-position-plan.ts";
import { CLUB_POSITION_LIMITS } from "../lib/touchlineFantasy/club-acquisition.ts";

const root=resolve(import.meta.dirname,"..");
const native=createRequire(import.meta.url);
const postcss=createRequire(native.resolve("next"))("postcss") as {parse:(css:string)=>{walkRules:(fn:(rule:{selector:string})=>void)=>void;toString:()=>string}};
const originalCards=process.env.SQUAD_SWAP_ORIGINAL_CARDS==="1";
const fullSquad=process.env.SQUAD_SWAP_FULL_SQUAD==="1";
function fixture() {
  const modules:Record<string,string>={};let css=readFileSync(resolve(root,"app/globals.css"),"utf8").match(/:root\s*\{[\s\S]*?\}/)?.[0]??"";
  for(const [id,file] of [["react","react.development.js"],["react/jsx-runtime","react-jsx-runtime.development.js"],["react-dom","react-dom.development.js"],["react-dom/client","react-dom-client.development.js"],["scheduler","scheduler.development.js"]]) {
    const packageName=id.startsWith("react-dom")?"react-dom":id.startsWith("react")?"react":"scheduler";
    const lookup=packageName==="scheduler"?createRequire(native.resolve("react-dom/client")):native;
    modules[id]=readFileSync(join(dirname(lookup.resolve(packageName)),"cjs",file),"utf8");
  }
  modules["lucide-react"]="exports.ArrowLeftRight=()=>null;";
  if(originalCards)modules["lucide-react"]=readFileSync(native.resolve("lucide-react"),"utf8");
  modules["next/navigation"]='exports.usePathname=()=>"/isolated-fixture";';
  function add(path:string):string {
    if(Object.hasOwn(modules,path))return path;
    if(path.endsWith(".json")){modules[path]=`exports.default=${readFileSync(path,"utf8")};`;return path;}
    if(path.endsWith(".css")) {
      const prefix=`m${Object.keys(modules).length}_`;
      const sheet=postcss.parse(readFileSync(path,"utf8"));
      sheet.walkRules(rule=>{rule.selector=rule.selector.replace(/\.([a-zA-Z_][\w-]*)/g,(_,name)=>`.${prefix}${name}`);});css+=sheet.toString();
      modules[path]=`exports.default=new Proxy({},{get:(_,key)=>${JSON.stringify(prefix)}+String(key)});`;return path;
    }
    if(!originalCards&&path.endsWith("TouchlineGameweekCard.tsx")){modules[path]="exports.default=()=>null;";return path;}
    if(!originalCards&&path.endsWith("TouchlineMarketPlayerTile.tsx")){
      modules[path]='exports.default=({card,children})=>require("react").createElement("article",{"data-fixture-card":card.id},require("react").createElement("p",null,card.name),children);';return path;
    }
    modules[path]="";
    const source=ts.createSourceFile(path,readFileSync(path,"utf8"),ts.ScriptTarget.ES2022,true);
    // Preserve ESM import hoisting when adapting modules for this tiny browser loader.
    const ordered=ts.factory.updateSourceFile(source,[...source.statements.filter(ts.isImportDeclaration),...source.statements.filter(s=>!ts.isImportDeclaration(s))]);
    let output=ts.transpileModule(ts.createPrinter().printFile(ordered),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    output=output.replace(/require\("([^"]+)"\)/g,(whole,id:string)=>{
      if(Object.hasOwn(modules,id))return whole;
      assert.ok(id.startsWith(".")||id.startsWith("@/"),`Unsupported dependency ${id}`);
      const base=id.startsWith("@/")?resolve(root,id.slice(2)):resolve(dirname(path),id);
      const found=[base,base+".ts",base+".tsx"].find(existsSync);assert.ok(found,base);
      return `require(${JSON.stringify(add(found))})`;
    });modules[path]=output;return path;
  }
  const entry=add(resolve(root,"components/touchline/fantasy/ClubOwnerCollectionSlots.tsx"));
  const detail:Record<string,string>={GK:"Goalkeeper",CB:"Centre Back",RB:"Right Back",LB:"Left Back",DM:"Defensive Midfield",MID:"Central Midfield",RW:"Right Wing",LW:"Left Wing",CF:"Centre Forward"};
  const plan=collectionSlotPlan(formations["4-3-3"]);assert.ok(plan);
  const players=fullSquad ? (["starters","reserves","outside"] as const).flatMap(area=>plan[area].map((position,slot)=>({playerId:position==="RW"?(area==="starters"?"starter":area==="reserves"?"bench":"outside"):`${area}-${slot}`,area,slot,clubId:"fixture",position,primaryDetail:detail[position],valueEur:1_000_000})))
    : [{playerId:"starter",area:"starters",slot:8},{playerId:"bench",area:"reserves",slot:6},{playerId:"outside",area:"outside",slot:0}].map(p=>({...p,clubId:"fixture",position:"RW",primaryDetail:"Right Wing",valueEur:1_000_000}));
  if(fullSquad){
    assert.equal(players.length,35);assert.equal(new Set(players.map(p=>p.playerId)).size,35);
    for(const [position,count]of Object.entries(CLUB_POSITION_LIMITS))assert.equal(players.filter(p=>p.position===position).length,count,position);
    assert.deepEqual(["starters","reserves","outside"].map(area=>players.filter(p=>p.area===area).length),[11,9,15]);
  }
  const state={revision:0,seasonId:"fixture",plan:"vip",balanceEur:100_000_000,coach:{id:"fixture-coach",tier:"sapphire-blue",valueEur:10_000_000},formationCode:"4-3-3",players,receipts:[]};
  const catalogue=players.map(p=>({id:p.playerId,canonicalPlayerId:p.playerId,name:`Fictional ${p.playerId}`,shortName:`Fictional ${p.playerId}`,clubName:"Arsenal",position:p.primaryDetail,role:p.position,shirtNumber:17,countryCode3:"ENG",touchlinePoints:0,seasonTotalRating:null,marketValue:"",marketValueState:"verified",primaryPositionDetail:p.primaryDetail,editorialCard:{tierKey:"radiant-gold",marketValueEur:1_000_000,marketValueState:"verified",cardPrice:{amountMinor:0,currency:"GBP"},lastReviewedAt:"2026-10-19T00:00:00Z"}}));
  const definitions=Object.entries(modules).map(([id,code])=>`${JSON.stringify(id)}:function(module,exports,require){${code}\n}`).join(",");
  return `<!doctype html><html lang="en"><base href="http://isolated-fixture.invalid/"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial;background:#07100d;color:white}${css}</style><div id="root"></div><script>
    const process={env:{NODE_ENV:'development'}},modules={${definitions}},cache={};
    function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}
    const React=require('react'),Dialog=require(${JSON.stringify(entry)}).ClubOwnerSquadSwapDialog;
    window.moves=[];
    function App(){const [open,setOpen]=React.useState(false);return React.createElement(React.Fragment,null,React.createElement('button',{id:'open',onClick:()=>setOpen(true)},'Open fixture'),open?React.createElement(Dialog,{state:${JSON.stringify(state)},catalogue:${JSON.stringify(catalogue)},geometry:${JSON.stringify(formations["4-3-3"])},playerId:'starter',locale:'en-GB',busy:false,enabled:true,error:null,onClose:()=>setOpen(false),onMove:async(...args)=>{window.moves.push(args);return true;}}):null);}
    require('react-dom/client').createRoot(document.getElementById('root')).render(React.createElement(App));
  </script></html>`;
}

test("isolated real swap dialog: desktop/mobile choose, cancel, confirm and focus; no network",{timeout:60_000},async()=>{
  const html=fixture();const engine=process.env.SQUAD_SWAP_ENGINE==="webkit"?webkit:chromium;const browser=await engine.launch({headless:true});
  try { for(const viewport of [{width:1280,height:800},{width:844,height:390},{width:390,height:844}]) {
    const context=await browser.newContext({viewport});const localAssets:string[]=[];
    await context.route("**/*",async route=>{
      const url=new URL(route.request().url());const file=resolve(root,"public","."+decodeURIComponent(url.pathname));
      if(originalCards&&url.hostname==="isolated-fixture.invalid"&&file.startsWith(resolve(root,"public")+"/")&&existsSync(file)&&/\.(png|webp|jpg|jpeg|svg|woff2?)$/.test(file)) {localAssets.push(url.pathname);await route.fulfill({path:file});}
      else await route.abort();
    });
    const page=await context.newPage();page.setDefaultTimeout(4000);const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
    await page.setContent(html);await page.locator("#open").waitFor().catch(error=>{assert.deepEqual(errors,[]);throw error;});await page.locator("#open").focus();await page.keyboard.press("Enter");
    const dialog=page.getByRole("dialog"),cancel=page.getByRole("button",{name:"Cancel",exact:true});
    await expect(dialog).toBeVisible();await expect(cancel).toBeFocused();
    if(fullSquad){
      await expect(page.getByRole("button",{name:"Select",exact:true})).toHaveCount(2);
      await expect(page.locator('[data-touchline-card-zoom="trigger"]')).toHaveCount(2);
      await expect(dialog.getByText("Fictional bench",{exact:true}).first()).toBeVisible();
      assert.doesNotMatch(await dialog.textContent()??"",/Fictional (starters-|reserves-|outside-|starter\b)/);
    }
    if(originalCards){
      const trigger=page.locator('[data-touchline-card-zoom="trigger"]').first().getByRole("button").first();await expect(trigger).toBeVisible();
      const thumb=await trigger.boundingBox();assert.ok(thumb&&thumb.width>0&&thumb.width<=200,`thumbnail must stay compact: ${JSON.stringify(thumb)}`);
      await trigger.click();await expect(page.locator('[role="dialog"]')).toHaveCount(2);
      await expect(page.locator('[data-card-zoom="expanded"]')).toBeVisible();
      if(process.env.SQUAD_SWAP_SCREENSHOT_DIR)await page.screenshot({path:join(process.env.SQUAD_SWAP_SCREENSHOT_DIR,`squad-swap-${fullSquad?"full35-":""}original-${engine.name()}-zoom-${viewport.width}x${viewport.height}.png`)});
      await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(1);await expect(trigger).toBeFocused();
      assert.ok(localAssets.length>0,"real local card assets loaded");await cancel.focus();
    }
    if(process.env.SQUAD_SWAP_SCREENSHOT_DIR)await page.screenshot({path:join(process.env.SQUAD_SWAP_SCREENSHOT_DIR,`squad-swap-${fullSquad?"full35-":""}${originalCards?"original-"+engine.name():"fixture"}-${viewport.width}x${viewport.height}.png`)});
    const box=await dialog.boundingBox();assert.ok(box);assert.ok(box.x>=0&&box.x+box.width<=viewport.width&&box.y>=0&&box.y+box.height<=viewport.height);
    await page.keyboard.press("Shift+Tab");await expect(page.getByRole("button",{name:"Select",exact:true}).last()).toBeFocused();
    await page.keyboard.press("Tab");await expect(cancel).toBeFocused();
    await page.getByRole("button",{name:"Select",exact:true}).first().click();
    assert.deepEqual(await page.evaluate(()=>Reflect.get(window,"moves")),[]);
    await page.getByRole("button",{name:"Back",exact:true}).click();await cancel.click();
    await expect(dialog).toHaveCount(0);await expect(page.locator("#open")).toBeFocused();
    assert.deepEqual(await page.evaluate(()=>Reflect.get(window,"moves")),[]);
    await page.locator("#open").focus();await page.keyboard.press("Enter");await expect(cancel).toBeFocused();await page.keyboard.press("Escape");await expect(dialog).toHaveCount(0);
    await page.locator("#open").focus();await page.keyboard.press("Enter");await page.getByRole("button",{name:"Select",exact:true}).first().click();
    await page.getByRole("button",{name:"Confirm squad change",exact:true}).click();await expect(dialog).toHaveCount(0);
    assert.deepEqual(await page.evaluate(()=>Reflect.get(window,"moves")),[["bench",{area:"starters",slot:8}]]);
    await expect(page.locator("#open")).toBeFocused();assert.deepEqual(errors,[]);
    await context.close();
  }} finally {await browser.close();}
});
