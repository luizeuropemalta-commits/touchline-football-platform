import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const files=['cards/TouchlineCardZoom.module.css','fantasy/ClubOwnerCollectionSlots.module.css','fantasy/ClubOwnerReleaseDialog.module.css','market/ClubOwnerExchangeHub.module.css','market-preview/MarketExperiencePreview.module.css','office/ClubOwnerOffice.module.css','ClubOwnerPlanOnboarding.module.css','ClubOwnerPlanShowcase.module.css'];
test('card zoom stays opaque while other modal backgrounds retain shared smoke and blur',()=>{
 const globals=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(globals,/--touchline-modal-backdrop: rgba\(0, 5, 6, \.72\)/);assert.match(globals,/--touchline-modal-blur: blur\(8px\)/);
 for(const file of files){const css=readFileSync(new URL('../components/touchline/'+file,import.meta.url),'utf8');
  if(file==='cards/TouchlineCardZoom.module.css'){
   const backdrop=css.match(/\.backdrop\s*\{([^}]+)\}/)?.[1];assert.ok(backdrop,'card zoom backdrop rule exists');
   assert.match(backdrop,/background:\s*#020809\s*;/,file);
   assert.match(backdrop,/(?:^|\n)\s*-webkit-backdrop-filter:\s*none\s*;/,file);
   assert.match(backdrop,/(?:^|\n)\s*backdrop-filter:\s*none\s*;/,file);
   continue;
  }
  assert.match(css,/background: var\(--touchline-modal-backdrop/,file);assert.match(css,/-webkit-backdrop-filter: var\(--touchline-modal-blur/,file);assert.match(css,/backdrop-filter: var\(--touchline-modal-blur/,file);
 }
});
