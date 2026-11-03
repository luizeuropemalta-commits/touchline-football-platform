import test from 'node:test';
import assert from 'node:assert/strict';
import type {OwnPublicOwner} from '../lib/touchlineArena/clubowner-public-contract.ts';
import {chromium,expect} from '@playwright/test';
import {bundleIsolatedBrowserFixture} from './helpers/touchline-isolated-browser-bundle.mts';
import {requireBrowserCapacity} from './helpers/touchline-browser-capacity.mts';
const entry='components/touchline/social/ClubOwnerDiscoveryOnboarding.tsx';
test('first access real modal closes safely and reconciles uncertain writes without republishing private profiles',{
 skip:process.env.TOUCHLINE_RUN_FIRST_ACCESS_BROWSER!=='1',timeout:90000,
},async()=>{
 requireBrowserCapacity(process.cwd());
 const bundle=bundleIsolatedBrowserFixture({entryPath:entry,requiredSources:[entry,'components/touchline/a11y/TouchlineDialog.tsx','components/touchline/social/usePublicOwnersRequest.ts'],allowSyntheticRouteRefresh:true,
 mountScript:`window.refreshCount=0;window.onFixtureRouteRefresh=()=>window.refreshCount++;const Component=loadEntry().default;flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Component,{locale:'en-GB'}))));`});
 const browser=await chromium.launch({headless:true});try{
 for(const mode of ['close','uncertain','private']){
 const context=await browser.newContext({viewport:{width:1000,height:800},serviceWorkers:'block'});try{
 let puts=0,gets=0;const persisted:{profile:OwnPublicOwner|null}={profile:null};const errors:string[]=[];
 await context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());if(url.origin!=='https://onboarding.invalid')return route.abort();
 if(url.pathname==='/api/account/public-profile/onboarding'){
 puts++;assert.equal(req.method(),'PUT');assert.deepEqual(req.postDataJSON(),{displayName:'Chosen friend',intentVersion:1});
 // Existing private profile models a concurrent insert before this request.
 persisted.profile={publicId:'11111111-1111-4111-8111-111111111111',displayName:mode==='private'?'Private choice':'Chosen friend',published:mode!=='private',photoPublished:false,followerCount:0};
 return mode==='uncertain'?route.fulfill({status:503,json:{error:'unavailable'}}):route.fulfill({json:{profile:persisted.profile}});
 }
 if(url.pathname==='/api/account/public-profile'){gets++;assert.equal(req.method(),'GET');return gets===1?route.fulfill({status:503,json:{error:'unavailable'}}):route.fulfill({json:{profile:persisted.profile}});}
 return route.fulfill({contentType:'text/html',body:`<!doctype html><html><style>body{font:16px sans-serif}${bundle.css}</style><div id="root"></div><script>${bundle.script.replace(/<\/script/gi,'<\\/script')}</script></html>`});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://onboarding.invalid');
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();const input=page.locator('#first-access-public-name');await expect(input).toHaveValue('');await expect(input).toBeFocused();
 if(mode==='close'){await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);assert.equal(puts,0);assert.equal(gets,0);}
 else{
 await input.fill('Chosen friend');await expect(page.locator('#first-access-handle')).toHaveCount(0);const save=page.getByRole('button',{name:'Save and appear in search',exact:true});await save.click();
 if(mode==='uncertain'){
 await expect(save).toBeDisabled();await expect(page.getByRole('alert')).toBeVisible();assert.equal(puts,1);
 await page.getByRole('button',{name:'Refresh data',exact:true}).click();await expect(save).toBeDisabled();assert.equal(puts,1);
 await page.getByRole('button',{name:'Refresh data',exact:true}).click();
 }
 await expect(dialog).toHaveCount(0);assert.equal(puts,1);assert.equal(await page.evaluate(()=>window['refreshCount']),1);
 if(mode==='private'){assert.ok(persisted.profile);assert.equal(persisted.profile.published,false);}
 }
 assert.deepEqual(errors,[]);
 }finally{await context.close();}
 }
 }finally{await browser.close();}
});
