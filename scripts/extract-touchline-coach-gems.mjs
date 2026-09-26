import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// Owner-authorised deterministic extraction. RGB comes only from coach originals.
// Each polygon follows the bottom gem's own bezel, not the connected frame arms.
export const coachGemMasks = [
  { tier: 'diamond-gold', source: '07_golddiamond_coach.png', points: [[481,1205],[594,1205],[659,1270],[659,1377],[594,1446],[482,1446],[416,1378],[416,1270]] },
  { tier: 'clear-diamond', source: '05_silver_coach.png', points: [[508,1155],[593,1155],[660,1222],[660,1341],[596,1391],[551,1415],[506,1390],[443,1342],[443,1223]] },
  { tier: 'emerald-green', source: '03_green_coach.png', points: [[588,923],[654,923],[702,967],[702,1061],[655,1110],[585,1110],[539,1060],[539,967]] },
  { tier: 'radiant-gold', source: '06_gold_coach.png', points: [[496,1224],[585,1224],[646,1283],[646,1370],[586,1426],[543,1446],[495,1425],[437,1369],[437,1282]] },
  { tier: 'amethyst-purple', source: '04_purple_coach.png', points: [[491,1133],[590,1133],[663,1210],[663,1337],[592,1407],[543,1443],[491,1407],[419,1338],[419,1210]] },
  { tier: 'sapphire-blue', source: '01_blue_coach.png', points: [[493,1178],[593,1178],[658,1243],[658,1343],[592,1407],[543,1427],[493,1407],[428,1344],[428,1243]] },
  { tier: 'ruby-red', source: '02_red_coach.png', points: [[499,1206],[585,1206],[644,1263],[644,1345],[586,1402],[543,1424],[500,1402],[443,1345],[443,1263]] },
];

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, '../../outputs/card-review-20260921/coach-gems-candidate');
await mkdir(out, { recursive: true });
const manifest = [];
const tiles = [];
for (const [index, gem] of coachGemMasks.entries()) {
  const input = await readFile(resolve(root, 'public/touchlineArena/cards/coaches', gem.source));
  const left = Math.min(...gem.points.map(p => p[0])) - 3;
  const top = Math.min(...gem.points.map(p => p[1])) - 1;
  const width = Math.max(...gem.points.map(p => p[0])) - left + 4;
  const height = Math.max(...gem.points.map(p => p[1])) - top + 2;
  const points = gem.points.map(([x, y]) => `${x-left},${y-top}`).join(' ');
  const mask = await sharp(Buffer.from(`<svg width="${width*4}" height="${height*4}" viewBox="0 0 ${width} ${height}"><polygon points="${points}" fill="white"/></svg>`))
    .resize(width, height).png().toBuffer();
  const png = await sharp(input).extract({ left, top, width, height })
    .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  await writeFile(resolve(out, `${gem.tier}.png`), png);
  manifest.push({ rank: index + 1, ...gem, crop: { left, top, width, height }, sourceSha256: createHash('sha256').update(input).digest('hex'), outputSha256: createHash('sha256').update(png).digest('hex') });
  const thumb = await sharp(png).resize(180,240,{fit:'inside'}).toBuffer();
  tiles.push({input:thumb,left:index*210+15,top:15});
}
await sharp({create:{width:1470,height:265,channels:4,background:'#07100e'}}).composite(tiles).png().toFile(resolve(out,'review-dark.png'));
await sharp({create:{width:1470,height:265,channels:4,background:'#eeeeee'}}).composite(tiles).png().toFile(resolve(out,'review-light.png'));
await writeFile(resolve(out, 'manifest.json'), JSON.stringify(manifest,null,2)+'\n');
console.log(`Extracted ${manifest.length} original coach gems for review only: ${out}`);
