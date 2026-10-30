import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, webkit, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";

// Real components and shared decision; synthetic persisted snapshots only.
// This does not attest hosted Sportmonks ingestion or native iPhone behavior.
test("one update transitions historical XI → official NS → live → FT while advancing Next game", {
  skip: process.env.TOUCHLINE_RUN_MATCHDAY_TRANSITION_BROWSER !== "1", timeout: 90_000,
}, async () => {
  const engine = process.env.TOUCHLINE_MATCHDAY_ENGINE === "webkit" ? "webkit" : "chromium";
  const output = "/private/tmp/touchline-clubhub-matchday-20261030";
  mkdirSync(output, { recursive: true });
  const bundle = bundleIsolatedBrowserFixture({
    entryPath: "components/touchline/ClubHubOfficialLineup.tsx",
    additionalEntryPaths: ["components/touchline/club-hub/ClubHubNextFixtureCard.tsx", "lib/touchlineArena/club-hub-matchday-context.ts", "lib/touchlineArena/club-lineup.ts", "lib/touchlineArena/demo-data.ts"],
    requiredSources: ["lib/touchlineArena/club-hub-matchday-context.ts", "components/touchline/ClubHubOfficialLineup.module.css"],
    mountScript: `const Lineup=loadEntry().default,Next=loadAdditionalEntry('components/touchline/club-hub/ClubHubNextFixtureCard.tsx').default;
      const resolve=loadAdditionalEntry('lib/touchlineArena/club-hub-matchday-context.ts').resolveClubHubMatchdayContext;
      const build=loadAdditionalEntry('lib/touchlineArena/club-lineup.ts').buildTouchLineClubMatchdayPresentation;
      const club=loadAdditionalEntry('lib/touchlineArena/demo-data.ts').findTouchLineClub('manchester-city');
      window.fetch=()=>{throw Error('Unexpected network read in synthetic persisted fixture');};
      const roles=['goalkeeper',...Array(4).fill('defender'),...Array(3).fill('midfielder'),...Array(3).fill('forward')];
      const sheet=id=>roles.map((position,index)=>({id:id+'-'+index,providerId:id+'-'+index,provider:'sportmonks',fixtureId:id,teamId:club.teamId,teamName:club.name,playerId:String(index+1),playerName:'Player '+(index+1),jerseyNumber:index+1,formationPosition:String(index+1),position,isStarter:true,isSubstitute:false,statistics:[]}));
      const fixture=(id,status,offset)=>({id,providerId:id,startsAt:new Date(Date.now()+offset).toISOString(),status,homeTeam:{id:club.teamId,providerId:club.teamId,name:'Manchester City',shortCode:'MCI'},awayTeam:{id:'away-'+id,providerId:'away-'+id,name:'Opponent '+id,shortCode:id==='current'?'CUR':id==='previous'?'PRE':'NXT'}});
      const previous=fixture('previous','FT',-86400000),next=fixture('next','NS',7*86400000);
      window.renderPhase=(phase,locale)=>{
        const current=fixture('current',phase==='before'?'NS':phase,phase==='LIVE'||phase==='FT'?-3600000:3600000);
        const presentation=build({club,squadCards:[],fixtureId:'current',officialLineup:phase==='before'?[]:sheet('current'),lastCompletedXi:{fixtureId:'previous',formation:'4-3-3',starters:sheet('previous')}});
        const context=resolve({clubTeamId:club.teamId,presentation,matchdayFixtureId:'current',publicFixture:current,lastCompletedXiFixture:previous,candidates:[previous,current,next]});
        const f=context.lineupFixture,n=context.nextFixture;
        const props={clubName:club.name,locale,lineup:presentation.lineup,recordedXiWithoutCards:presentation.recordedXiWithoutCards,lastCompletedXiStartsAt:previous.startsAt,staticVisualQa:true,liveUpdates:false,labels:{nationality:'N',points:'P',totalPoints:'TP',cardPrice:'CP'},matchup:{fixtureId:f.providerId,initialFixture:f,home:f.homeTeam,away:f.awayTeam,status:f.status,startsAt:f.startsAt,startsAtIso:f.startsAt}};
        const team=t=>({teamId:t.providerId,name:t.name,shortCode:t.shortCode});
        flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement('main',null,
          React.createElement('div',{'data-xi-fixture':f.providerId},React.createElement(Lineup,props)),
          React.createElement('aside',{'data-next-fixture':n.providerId},React.createElement(Next,{nextOnly:true,initialFixture:n,liveUpdates:false,locale,initialTimeZone:'Europe/Malta',startsAt:n.startsAt,status:n.status,homeTeam:team(n.homeTeam),awayTeam:team(n.awayTeam),homePosition:null,awayPosition:null,previewHref:null}))))));
      };`,
  });
  const browser = await (engine === "webkit" ? webkit : chromium).launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => route.abort());
    await page.setContent(`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#06120d;color:#edf5e6;font:16px Arial}main{padding:20px;display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:20px}aside{min-width:0}#root{min-width:0}@media(max-width:1100px){main{grid-template-columns:minmax(0,1fr)}}${bundle.css}</style><div id="root"></div>`);
    await page.addScriptTag({ content: bundle.script });
    assert.deepEqual(errors, [], "browser module initialization");
    for (const [width,height,locale] of [[1440,900,"en-GB"],[844,390,"pt-BR"]] as const) {
      await page.setViewportSize({width,height});
      for (const phase of ["before","NS","LIVE","FT"]) {
        await page.evaluate(({phase,locale}) => (window as unknown as { renderPhase(phase: string, locale: string): void }).renderPhase(phase,locale), {phase,locale});
        const prior = phase === "before", historical = prior || phase === "FT";
        await expect(page.locator("[data-xi-fixture]")).toHaveAttribute("data-xi-fixture",prior?"previous":"current");
        await expect(page.locator("[data-next-fixture]")).toHaveAttribute("data-next-fixture",prior?"current":"next");
        await expect(page.locator("#touchline-club-lineup h2")).toHaveText(locale==="en-GB" ? historical?"Last line-up":"Line-up" : historical?"Última escalação":"Escalação");
        await expect(page.locator("#touchline-club-lineup aside")).toContainText(prior?"PRE":"CUR");
        await expect(page.locator("[data-next-fixture] article")).toContainText(prior?"Opponent current":"Opponent next");
        await expect(page.locator("[data-next-fixture] article")).toHaveAttribute("data-state","upcoming");
        assert.equal(await page.locator("#touchline-club-lineup [data-clubhub-fixture-status]").count(),phase==="NS"?0:1);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        const contained = await page.locator('[class*="formationPanel"]').evaluate(panel => {
          const box=panel.getBoundingClientRect();
          return [...panel.children].every(child=>{const rect=child.getBoundingClientRect();return rect.left>=box.left&&rect.right<=box.right&&rect.top>=box.top&&rect.bottom<=box.bottom;});
        });
        assert.equal(contained,true,`formation label/status stays inside panel: ${width}/${phase}`);
        if(phase==="NS"||phase==="FT")await page.screenshot({path:path.join(output,`${engine}-${width}-${phase}.png`),fullPage:true});
      }
    }
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
});
