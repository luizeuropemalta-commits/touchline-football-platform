import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import { touchlineCoachRankingGem } from '../lib/touchlineArena/coach-ranking-gems.ts';

test('seven rank gems follow medal order, independently of a coach card tier', () => {
  const tiers = ['diamond-gold','clear-diamond','emerald-green','radiant-gold','amethyst-purple','sapphire-blue','ruby-red'];
  tiers.forEach((tier, index) => assert.equal(touchlineCoachRankingGem(index+1), `/touchlineArena/cards/coach-ranking-gems/${tier}.png`));
  for (const rank of [0,-1,8,1.5,NaN,Infinity]) assert.equal(touchlineCoachRankingGem(rank), undefined);
});

test('all seven PNGs have real transparency and preserve original coach pixels', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/touchlineArena/cards/coach-ranking-gems/provenance.json', import.meta.url),'utf8'));
  assert.equal(manifest.length,7);
  for (const gem of manifest) {
    const source = readFileSync(new URL(`../public/touchlineArena/cards/coaches/${gem.source}`, import.meta.url));
    assert.equal(createHash('sha256').update(source).digest('hex'),gem.sourceSha256);
    const output = readFileSync(new URL(`../public${touchlineCoachRankingGem(gem.rank)}`,import.meta.url));
    assert.equal(createHash('sha256').update(output).digest('hex'),gem.outputSha256);
    const original = await sharp(source).extract(gem.crop).ensureAlpha().raw().toBuffer();
    const pixels = await sharp(output).ensureAlpha().raw().toBuffer();
    let transparent=0, opaque=0, softened=0;
    for(let i=0;i<pixels.length;i+=4) {
      if(pixels[i+3]===0) transparent++;
      else if(pixels[i+3]===255) {
        opaque++;
        assert.deepEqual(pixels.subarray(i,i+3),original.subarray(i,i+3),'opaque gem pixels must not be repainted');
      } else softened++;
    }
    assert.ok(transparent>0 && opaque>1000 && softened>0,gem.tier);
  }
});
