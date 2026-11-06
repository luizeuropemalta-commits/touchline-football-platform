import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { chromium, webkit, expect, type Page } from "@playwright/test";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";

const root = path.resolve(import.meta.dirname, "..");
const enabled = process.env.TOUCHLINE_RUN_RANKING_TOUCH_TYPOGRAPHY_BROWSER_TESTS === "1";
const requestedEngine = process.env.TOUCHLINE_RANKING_TOUCH_TYPOGRAPHY_BROWSER_ENGINE ?? "webkit";
assert.ok(["webkit", "chromium"].includes(requestedEngine), "one installed engine per invocation");
const engine = requestedEngine === "webkit" ? webkit : chromium;
const origin = "https://ranking-typography.test";
const photoId = "22222222-2222-4222-8222-000000000001";
const missingId = "22222222-2222-4222-8222-000000000002";
const version = "a".repeat(64);
const photograph = "touchlineArena/club-owner/avatars/luiz-lopez-owner-avatar-v1.png";
const candidates = [
  { width: 667, height: 375, touch: true }, { width: 844, height: 390, touch: true },
  { width: 1280, height: 900, touch: false }, { width: 844, height: 390, touch: false },
  { width: 390, height: 844, touch: true },
];
type Styles = Record<string, string>;
async function inspect(page: Page, styles: Styles) {
  return page.evaluate(s => {
    const box = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY, width: r.width, height: r.height }; };
    const nodes = (selector: string) => [...document.querySelectorAll(selector)];
    const text = (selector: string) => nodes(selector).map(el => ({ box: box(el), size: parseFloat(getComputedStyle(el).fontSize), color: getComputedStyle(el).color }));
    const row = (el: Element) => ({ box: box(el), cells: [...el.children].map(box) });
    const pitch = document.querySelector(`.${s.pitch}`)!;
    const pitchBox = box(pitch);
    return {
      media: { coarse: matchMedia("(pointer: coarse)").matches, noHover: matchMedia("(hover: none)").matches, landscape: matchMedia("(orientation: landscape)").matches },
      viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      names: text(`.${s.rowIdentity} strong, .${s.awardIdentity} strong`),
      secondary: text(`.${s.rowIdentity} span, .${s.pointsValue} span, .${s.coachRecord} dt, .${s.awardIdentity} small, .${s.awardIdentity} > span, .${s.awardHeader} span, .${s.summary} dt, .${s.hero} p, .${s.hero} > div > span, .${s.clubOwnerTableHeader}, .${s.sectionHeading} p, .${s.sectionHeading} > span, .${s.pitchHint}, .${s.coachRankingPanel} > header > p, footer small`),
      points: text(`.${s.pointsValue} strong`), ranks: text(`.${s.ownerTableList} li > b, .${s.coachList} li > b`),
      links: nodes(`.${s.ownerAvatar} > a`).map(el => ({ box: box(el), href: el.getAttribute("href"), label: el.getAttribute("aria-label") })),
      ownerRows: nodes(`.${s.ownerTableList} li`).map(row), coachRows: nodes(`.${s.coachList} li`).map(row),
      cards: nodes(".touchline-card-surface").map(el => ({ width: box(el).width, height: box(el).height,
        textSizes: [...el.querySelectorAll("span,strong,b,small")].map(child => getComputedStyle(child).fontSize),
        images: [...el.querySelectorAll("img")].map(img => ({ src: img.currentSrc, natural: [img.naturalWidth, img.naturalHeight], width: box(img).width, height: box(img).height })),
        paths: [...el.querySelectorAll('[data-touchline-card-neon-trace="true"] path')].map(p => p.getAttribute("d")) })),
      xi: { box: pitchBox, border:["borderLeftWidth","borderRightWidth","borderTopWidth","borderBottomWidth"].map(key=>parseFloat(getComputedStyle(pitch).getPropertyValue(key.replace(/[A-Z]/g,c=>"-"+c.toLowerCase())))), slots: nodes('[data-best-eleven-player]').map(el => ({ style: el.getAttribute("style"),
        relative: [box(el).x - pitchBox.x, box(el).y - pitchBox.y, box(el).width, box(el).height],
        name: (()=>{const node=el.querySelector(`.${s.pitchIdentity} strong`)!;return {text:node.textContent,clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,overflow:getComputedStyle(node).textOverflow};})(),
        decorations: [...el.querySelectorAll('[data-touchline-player-golden-ball="true"],[data-touchline-golden-boot="true"],[data-touchline-position-golden-award]')].map(box),
        card: box(el.querySelector(".touchline-card-surface")!), labels: [...el.querySelectorAll(`.${s.pitchIdentity},.${s.positionLabel}`)].map(box) })) },
    };
  }, styles);
}

function exactCardArtWithSubpixelGeometry(after: Awaited<ReturnType<typeof inspect>>["cards"], before: Awaited<ReturnType<typeof inspect>>["cards"]) {
  assert.equal(after.length,before.length);
  let maxDelta=0;
  for(const [index,card] of after.entries()) {
    const old=before[index];
    assert.deepEqual({textSizes:card.textSizes,paths:card.paths,images:card.images.map(({src,natural})=>({src,natural}))},
      {textSizes:old.textSizes,paths:old.paths,images:old.images.map(({src,natural})=>({src,natural}))},"exact internal type, original images and neon paths");
    const current=[card.width,card.height,...card.images.flatMap(image=>[image.width,image.height])];
    const original=[old.width,old.height,...old.images.flatMap(image=>[image.width,image.height])];
    current.forEach((value,i)=>{const delta=Math.abs(value-original[i]);maxDelta=Math.max(maxDelta,delta);assert.ok(delta<=.001,`card/image geometry changed ${delta}px`);});
  }
  return maxDelta;
}
function sameNumbers(after:number[],before:number[],label:string) {
  assert.equal(after.length,before.length);
  after.forEach((value,i)=>assert.ok(Math.abs(value-before[i])<=.001,`${label}: subpixel delta ${value-before[i]}`));
}

async function renderedContrast(page: Page, styles: Styles) {
  const selector = [`.${styles.rowIdentity} span`,`.${styles.pointsValue} span`,`.${styles.coachList} li > b`,
    `.${styles.ownerTableList} li > b`,`.${styles.clubOwnerTableHeader} > span`,`.${styles.awardIdentity} small`,
    `.${styles.awardIdentity} > span`,`.${styles.awardHeader} span`,`.${styles.summary} dt`,
    `.${styles.sectionHeading} > span`,`.${styles.coachRecord} dt abbr`,`.${styles.coachRankingPanel} > header > p`,"footer small"].join(",");
  const samples = [];
  for (const section of ["#club-owner-table",`.${styles.awardPodium}`,"#coach-rankings",`.${styles.hero}`,"footer"]) {
    await page.locator(section).scrollIntoViewIfNeeded();
    const text = await page.locator(selector).evaluateAll(nodes => nodes.filter(el => [...el.childNodes].some(child => child.nodeType===Node.TEXT_NODE && child.textContent?.trim())).flatMap((el,index) => {
      const range=document.createRange();range.selectNodeContents(el);const rects=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight);
      if(!rects.length)return[];el.setAttribute("data-ranking-contrast-probe",String(index));
      return [{text:el.textContent,ink:getComputedStyle(el).color,points:rects.flatMap(r=>[.25,.5,.75].map(x=>({x:r.left+r.width*x,y:r.top+r.height*.5})))}];
    }));
    const hidden = await page.addStyleTag({content:'[data-ranking-contrast-probe]{color:transparent!important;text-shadow:none!important}'});
    try {
      const {data,info}=await sharp(await page.screenshot({scale:"css"})).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const luminance=(values:number[])=>values.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      for(const item of text){
        const channels=item.ink.match(/[\d.]+/g)?.map(Number);assert.ok(channels&&channels.length>=3,`rgb/rgba interface ink: ${item.ink}`);
        const alpha=channels[3]??1;
        const ratios=item.points.map(point=>{const index=(Math.min(info.height-1,Math.floor(point.y))*info.width+Math.min(info.width-1,Math.floor(point.x)))*info.channels;
          const background=[...data.subarray(index,index+3)],foreground=background.map((value,i)=>value*(1-alpha)+channels[i]*alpha);
          const [low,high]=[luminance(background),luminance(foreground)].sort((a,b)=>a-b);return(high+.05)/(low+.05);});
        samples.push({section,text:item.text,ink:item.ink,minRatio:Math.min(...ratios)});
      }
    } finally {await hidden.evaluate(el=>el.remove());await page.locator("[data-ranking-contrast-probe]").evaluateAll(nodes=>nodes.forEach(el=>el.removeAttribute("data-ranking-contrast-probe")));}
  }
  assert.ok(samples.length>=20,"rendered neutral/secondary text contrast probes actually collected");
  return samples;
}

// Real isolated client composition and original assets. Inputs and GET transport
// are synthetic; this does not prove the complete QA route or native Safari pinch.
test(`ranking typography ${requestedEngine}: real tables/awards/XI keep original artwork`, {
  skip: !enabled, timeout: 240_000,
}, async t => {
  assert.notEqual(process.env.TOUCHLINE_LOCAL_IGNORE_MEMORY_GATE, "1", "capacity bypass is not permitted");
  const capacity = () => requireBrowserCapacity(root, { darwinFreePercent: true,
    allowModerateDarwinPressure: process.env.TOUCHLINE_LOCAL_ALLOW_MODERATE_PRESSURE === "1" && !process.env.CI });
  capacity();
  const output = mkdtempSync(path.join(tmpdir(), "touchline-ranking-typography-"));
  t.diagnostic(`Isolated ranking evidence: ${output}`);
  execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `
    import { writeFileSync, readFileSync } from 'node:fs';
    import { createHash } from 'node:crypto';
    import { bundleIsolatedBrowserFixture } from './tests/helpers/touchline-isolated-browser-bundle.mts';
    const bundle = bundleIsolatedBrowserFixture({ entryPath: 'tests/fixtures/RankingTableTouchTypographyFixture.tsx', cssPrefix: 'rankingType',
      requiredSources: ['app/rankings/touchline-tables-client.tsx', 'app/rankings/touchline-tables.module.css',
        'components/touchline/social/ClubOwnerPublicAvatar.tsx', 'components/touchline/TouchlineSiteFooter.tsx'],
      mountScript: 'window.fixtureStyles=loadEntry().fixtureStyles;flushSync(()=>root.render(React.createElement(loadEntry().default,{locale:new URL(location.href).searchParams.get("lang")})));' });
    writeFileSync(process.argv[1]+'/bundle.json',JSON.stringify(bundle));
    writeFileSync(process.argv[1]+'/sources.json',JSON.stringify(Object.fromEntries(bundle.sources.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]))));
  `, output], { cwd: root, timeout: 40_000, stdio: "pipe" });
  const bundle = JSON.parse(readFileSync(path.join(output, "bundle.json"), "utf8")) as { css: string; script: string };
  const marker = /\/\* Touch landscape tables:[\s\S]*?\n}\n/g;
  const overrides = bundle.css.match(marker);
  assert.equal(overrides?.length, 1, "exact prepared CSS block must be present before execution");
  const baseline = bundle.css.replace(marker, "");
  const css = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8") + "\n"
    + readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "") + "\n" + baseline;
  const publicRoot = realpathSync(path.join(root, "public"));
  // The real avatar endpoint normalizes to WebP. Keep the actual reference
  // photo pixels lossless in this intercepted transport; never edit its asset.
  const avatarBytes = await sharp(path.join(publicRoot, photograph)).webp({ lossless: true }).toBuffer();
  assert.ok(existsSync(engine.executablePath()));
  capacity();
  const browser = await engine.launch({ headless: true });
  t.signal.addEventListener("abort", () => { void browser.close(); }, { once: true });
  const reports: unknown[] = [], assets = new Map<string, { bytes: number; sha256: string }>();
  try {
    for (const locale of ["pt-BR", "en-GB", "ar-SA"]) for (const item of candidates) {
      if (locale !== "pt-BR" && (item.width === 390 || (item.width === 844 && !item.touch))) continue;
      capacity();
      const context = await browser.newContext({ viewport: { width: item.width, height: item.height }, hasTouch: item.touch,
        deviceScaleFactor: item.touch ? 3 : 1, reducedMotion: "reduce", serviceWorkers: "block" });
      const page = await context.newPage(), errors: string[] = [], consoleErrors: string[] = [], unexpected: string[] = [], metadata: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
      await page.clock.install();
      const safe = (source: string) => source.replace(/<\/script/gi, "<\\/script");
      const html = `<!doctype html><html lang="${locale}" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body id="root"><script>${safe(bundle.script)}</script></body></html>`;
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (request.method() === "GET" && url.protocol === "blob:" && url.origin === origin) { await route.continue(); return; }
        if (request.method() !== "GET" || url.origin !== origin) { unexpected.push(`${request.method()} ${url.pathname}`); await route.abort(); return; }
        if (url.pathname === "/rankings") { await route.fulfill({ contentType: "text/html", body: html }); return; }
        if (url.pathname === `/api/touchline/clubowners/${photoId}` || url.pathname === `/api/touchline/clubowners/${missingId}`) {
          metadata.push(url.pathname); const id = url.pathname.split("/").at(-1)!;
          await route.fulfill({ json: { profile: { publicId: id, displayName: "Pessoa sintética", followerCount: 0, following: false, viewer: "guest",
            planKey: id === photoId ? "vip" : "master", avatarUrl: id === photoId ? `/api/touchline/clubowners/${id}/avatar?v=${version}` : null } } }); return;
        }
        const asset = url.pathname === `/api/touchline/clubowners/${photoId}/avatar` ? photograph : decodeURIComponent(url.pathname).slice(1);
        const file = path.resolve(publicRoot, asset);
        if (file.startsWith(publicRoot + path.sep) && existsSync(file) && statSync(file).isFile() && realpathSync(file).startsWith(publicRoot + path.sep)) {
          const bytes = readFileSync(file); assets.set(asset, { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
          if (asset === photograph) { await route.fulfill({ contentType: "image/webp", body: avatarBytes }); return; }
          await route.fulfill({ path: file }); return;
        }
        unexpected.push(`${request.method()} ${url.pathname}`); await route.abort();
      });
      try {
        await page.goto(`${origin}/rankings?lang=${locale}`, { waitUntil: "domcontentloaded" });
        const styles = await page.evaluate(() => (window as unknown as { fixtureStyles: Styles }).fixtureStyles);
        if (item.width === 390) {
          // Real orientation gate: preserve its inert, hidden content.
          // IntersectionObserver can still report layout intersections behind
          // the gate, so record allowed GETs instead of inventing a zero-read rule.
          const gate = page.locator("[data-touchline-orientation-gate]");
          await expect(gate).toBeVisible(); await expect(gate).toBeFocused();
          assert.equal(await page.locator("#touchline-main-content").evaluate(el => (el as HTMLElement).inert), true);
          const before = await inspect(page, styles);
          await page.addStyleTag({ content: overrides![0] });
          const after = await inspect(page, styles);
          for (const key of ["names", "secondary", "points", "ranks", "links"] as const) assert.deepEqual(after[key], before[key]);
          assert.equal(await page.locator("#touchline-main-content").getAttribute("aria-hidden"), "true");
          await page.screenshot({ path: path.join(output, "390-portrait-gate.png") });
          assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(unexpected, []);
          reports.push({ locale, ...item, mode: "real-portrait-gate", metadataGetCount: metadata.length, before, after });
          continue;
        }
        const initialOwnerBox = await page.locator(`.${styles.ownerAvatar}`).first().boundingBox();
        t.diagnostic(JSON.stringify({locale,...item,initialOwnerBox}));
        await page.locator(`.${styles.ownerAvatar}`).first().scrollIntoViewIfNeeded();
        await expect(page.locator(`.${styles.ownerAvatar} img`)).toHaveCount(1);
        await expect(page.locator(`.${styles.ownerAvatar} img`)).toHaveJSProperty("complete", true);
        await expect(page.locator(`.${styles.ownerAvatar} a[href*="${missingId}"] [role="img"]`)).toHaveCount(1);
        await page.locator("img").evaluateAll(images => { for (const image of images) image.loading = "eager"; });
        await expect.poll(() => page.locator("img").evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
        const capture = async (suffix: string) => {
          if (locale !== "pt-BR") return;
          for (const [label, selector] of [["owners", "#club-owner-table"], ["awards", `.${styles.awardPodium}`], ["xi", "#best-xi"]]) {
            await page.locator(selector).scrollIntoViewIfNeeded();
            await page.screenshot({ path: path.join(output, `${item.width}-${item.touch}-${label}-${suffix}.png`) });
          }
          await page.locator("#club-owner-table").scrollIntoViewIfNeeded();
        };
        const before = await inspect(page, styles), changed = item.touch && item.width > item.height;
        assert.equal(before.media.coarse && before.media.noHover, item.touch, "real emulated touch media, no force override");
        assert.equal(before.xi.slots.length, 11);
        assert.ok(before.cards.length >= 14, "XI and all three award cards really render");
        if (changed) assert.ok(before.names.some(row => row.size === 10), "baseline small text is actually reproduced");
        await capture("before");
        const baselineContrast = changed ? await renderedContrast(page, styles) : [];
        if (changed) assert.ok(baselineContrast.some(sample=>sample.minRatio<4.5), "rendered baseline actually reproduces low contrast");
        await page.addStyleTag({ content: overrides![0] });
        const after = await inspect(page, styles);
        assert.deepEqual(after.media, before.media);
        assert.ok(after.scrollWidth <= after.viewport, "no horizontal document overflow");
        assert.equal(after.links.length, 2, "exactly the two public-profile rows are links");
        assert.deepEqual(after.links.map(link => link.href), [photoId, missingId].map(id => `/clubowners/${id}?lang=${locale}`));
        if (changed) {
          assert.ok(after.names.every(row => row.size >= 14));
          assert.ok(after.secondary.every(row => row.size >= 12));
          assert.ok(after.points.every(row => row.size >= 18));
          assert.ok(after.ranks.every(row => row.size >= 14));
          assert.ok(after.links.every(link => link.box.width >= 44 && link.box.height >= 44 && link.href?.startsWith("/clubowners/") && link.label));
          assert.equal(await page.locator(`.${styles.ownerAvatar} > span`).evaluateAll(nodes=>nodes.length===1&&nodes.every(node=>{
            const style=getComputedStyle(node),outer=node.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(node);const text=range.getBoundingClientRect();
            return style.alignItems==="center"&&style.justifyContent==="center"&&text.left>=outer.left&&text.right<=outer.right&&text.top>=outer.top&&text.bottom<=outer.bottom;
          })),true,"no-profile initials centered and fully visible");
        } else {
          for (const group of ["names", "secondary", "points", "ranks", "links"] as const) assert.deepEqual(after[group], before[group], `${group}: desktop/portrait unchanged`);
        }
        assert.deepEqual(after.names.map(row => row.color), before.names.map(row => row.color));
        for (const [index,row] of after.secondary.entries()) {
          const old=before.secondary[index].color.match(/[\d.]+/g)!.map(Number), current=row.color.match(/[\d.]+/g)!.map(Number);
          assert.deepEqual(current.slice(0,3),old.slice(0,3),"same interface palette");
          assert.ok((current[3]??1)>=(old[3]??1),"contrast opacity never decreases");
        }
        assert.deepEqual(after.points.map(row=>row.color),before.points.map(row=>row.color),"gold points preserved");
        const maxUnchangedArtGeometryDeltaPx=changed
          ? exactCardArtWithSubpixelGeometry(after.cards.slice(11),before.cards.slice(11))
          : exactCardArtWithSubpixelGeometry(after.cards,before.cards);
        assert.deepEqual(after.xi.slots.map(slot=>slot.style),before.xi.slots.map(slot=>slot.style),"XI inline coordinates unchanged");
        if(!changed)after.xi.slots.forEach((slot,i)=>sameNumbers(slot.relative,before.xi.slots[i].relative,"unchanged desktop XI footprint"));
        for (const rows of [after.ownerRows, after.coachRows]) for (const row of rows) {
          for (const cell of row.cells) assert.ok(cell.x >= row.box.x - .5 && cell.right <= row.box.right + .5 && cell.y >= row.box.y - .5 && cell.bottom <= row.box.bottom + .5);
          for (let a = 0; a < row.cells.length; a++) for (let b = a + 1; b < row.cells.length; b++) {
            const x = row.cells[a], y = row.cells[b];
            assert.ok(x.right <= y.x + .5 || y.right <= x.x + .5 || x.bottom <= y.y + .5 || y.bottom <= x.y + .5, "table cells do not overlap");
          }
        }
        const contrast = changed ? await renderedContrast(page, styles) : [];
        for (const sample of contrast) assert.ok(sample.minRatio >= 4.5, `normal-size text contrast ${sample.minRatio.toFixed(2)}: ${sample.text}`);
        const firstLink = page.locator(`.${styles.ownerAvatar} > a`).first();
        await firstLink.focus(); await expect(firstLink).toBeFocused();
        await capture("after");
        assert.deepEqual((await inspect(page, styles)).media, after.media, "viewport capture preserves input/orientation media");
        if (changed) {
          const uniform=after;
          writeFileSync(path.join(output,`${locale}-${item.width}-xi-uniform.json`),JSON.stringify({before:before.xi,after:uniform.xi,cardsBefore:before.cards,cardsAfter:uniform.cards},null,2));
          const pitch=page.locator(`.${styles.pitch}`);
          await pitch.evaluate(el=>window.scrollTo({top:el.getBoundingClientRect().top+scrollY,behavior:"instant"}));
          await page.screenshot({path:path.join(output,`${locale}-${item.width}-xi-uniform-top.png`)});
          await pitch.evaluate(el=>window.scrollTo({top:el.getBoundingClientRect().bottom+scrollY-innerHeight,behavior:"instant"}));
          await page.screenshot({path:path.join(output,`${locale}-${item.width}-xi-uniform-bottom.png`)});
          assert.deepEqual(uniform.media,after.media);
          assert.equal(uniform.xi.slots.length,11);
          assert.equal(uniform.xi.slots.flatMap(slot=>slot.decorations).length,4,"Golden Ball, Golden Boot, Golden Gloves and Golden Shield remain visible");
          for(let i=0;i<11;i++){
            const old=before.cards[i],card=uniform.cards[i];
            assert.deepEqual({textSizes:card.textSizes,paths:card.paths,images:card.images.map(({src,natural})=>({src,natural}))},
              {textSizes:old.textSizes,paths:old.paths,images:old.images.map(({src,natural})=>({src,natural}))},"uniform envelope preserves original art/fonts/neon");
            sameNumbers([card.width,card.height],[uniform.cards[0].width,uniform.cards[0].height],"all eleven player cards have uniform dimensions");
          }
          exactCardArtWithSubpixelGeometry(uniform.cards.slice(11),before.cards.slice(11));
          const contains=(a:typeof uniform.xi.box,b:typeof a)=>b.x>=a.x&&b.right<=a.right&&b.y>=a.y&&b.bottom<=a.bottom;
          const disjoint=(a:typeof uniform.xi.box,b:typeof a)=>a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y;
          for(const [i,slot] of uniform.xi.slots.entries()){
            assert.equal(slot.style,before.xi.slots[i].style,"published tactical coordinates unchanged");
            assert.equal(slot.name.text,before.xi.slots[i].name.text,"full player name unchanged");
            assert.equal(slot.name.overflow,"ellipsis","bounded long names explicitly keep ellipsis");
            const original=before.xi.slots[i].relative;
            const center=[slot.relative[0]+slot.relative[2]/2,slot.relative[1]+slot.relative[3]/2];
            const previous=[original[0]+original[2]/2,original[1]+original[3]/2];
            center.forEach((value,k)=>assert.ok(Math.abs(value-previous[k])<=.5,"published anchor remains within one half CSS pixel after envelope correction"));
            const fractions=[Number(String(slot.style).match(/left:\s*([\d.]+)%/)![1])/100,Number(String(slot.style).match(/top:\s*([\d.]+)%/)![1])/100];
            const [left,right,top,bottom]=uniform.xi.border;
            const expected=[left+(uniform.xi.box.width-left-right)*fractions[0],top+(uniform.xi.box.height-top-bottom)*fractions[1]];
            center.forEach((value,k)=>assert.ok(Math.abs(value-expected[k])<=.5,"actual anchor follows canonical percentage inside the pitch border"));
            assert.ok(Math.abs(slot.card.x+slot.card.width/2-uniform.xi.box.x-center[0])<=.001,"card is centered on its tactical x anchor");
            for(const element of [slot.card,...slot.labels,...slot.decorations]) assert.ok(contains(uniform.xi.box,element),`slot${i} card/label/crown fully inside pitch`);
            for(const [j,other] of uniform.xi.slots.entries()){
              if(i!==j)assert.ok(disjoint(slot.card,other.card),`card${i}/${j} never overlap`);
              for(const [labelIndex,label] of slot.labels.entries()){
                assert.ok(disjoint(label,other.card),`label${i}:${labelIndex}/card${j} never overlap`);
                for(const decoration of other.decorations)assert.ok(disjoint(label,decoration),`label${i}:${labelIndex}/award${j} never overlap`);
                if(i!==j)for(const otherLabel of other.labels)assert.ok(disjoint(label,otherLabel),`labels${i}/${j} never overlap`);
              }
            }
            for(let a=0;a<slot.labels.length;a++)for(let b=a+1;b<slot.labels.length;b++)assert.ok(disjoint(slot.labels[a],slot.labels[b]),`same-player${i} labels do not overlap`);
          }
          assert.equal(await page.locator(`.${styles.pitchIdentity}`).evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).fontSize==="10px"&&getComputedStyle(node).transform==="none")),true);
          assert.equal(await page.locator(`.${styles.positionLabel}`).evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).fontSize==="11px"&&node.scrollWidth<=node.clientWidth&&node.scrollHeight<=node.clientHeight)),true);
        }
        await firstLink.scrollIntoViewIfNeeded();
        const count = metadata.filter(url => url.endsWith(photoId)).length;
        await page.clock.fastForward(61_000);
        await expect.poll(() => metadata.filter(url => url.endsWith(photoId)).length).toBeGreaterThan(count);
        await expect(page.locator(`.${styles.ownerAvatar} img`)).toHaveCount(1);
        await expect(page.locator(`.${styles.ownerAvatar} a[href*="${missingId}"] [role="img"]`)).toHaveCount(1);
        assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(unexpected, []);
        reports.push({ locale, ...item, before, after, maxUnchangedArtGeometryDeltaPx, baselineContrast, contrast, metadataGetCount: metadata.length });
      } catch (error) {
        writeFileSync(path.join(output, `failure-${locale}-${item.width}-${item.touch}.json`), JSON.stringify({ errors, consoleErrors, unexpected, metadata, badImages: await page.locator("img").evaluateAll(images=>images.filter(image=>!image.complete||image.naturalWidth===0).map(image=>({src:image.src,complete:image.complete}))).catch(()=>[]), text: await page.locator("body").innerText().catch(()=>"unavailable") }, null, 2));
        await page.screenshot({ path: path.join(output, `failure-${locale}-${item.width}-${item.touch}.png`) }).catch(()=>undefined);
        throw error;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  writeFileSync(path.join(output, "report.json"), JSON.stringify({ requestedEngine, reports, assets: Object.fromEntries(assets), losslessAvatarTransport: { source: photograph, bytes: avatarBytes.length, sha256: createHash("sha256").update(avatarBytes).digest("hex") } }, null, 2));
});
