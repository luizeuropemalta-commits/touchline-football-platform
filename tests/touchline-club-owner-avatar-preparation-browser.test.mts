import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { chromium, webkit, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { validateClubOwnerAvatar } from "../lib/touchlineArena/club-owner-avatar-validation.ts";

const origin = "https://avatar-preparation.invalid";
const helper = "lib/touchlineArena/club-owner-avatar-preparation.ts";
const mount = `
const Selection=loadEntry().default;window.preparer=loadAdditionalEntry(${JSON.stringify(helper)});
window.actor='00000000-0000-4000-8000-000000000001';window.current=true;window.visible=true;window.registered=0;
window.hold=false;window.pending=[];window.decodeCalls=0;window.closedBitmaps=0;window.revoked=0;window.previewBlobs=new Map();
const nativeBitmap=window.createImageBitmap.bind(window),nativeRevoke=URL.revokeObjectURL.bind(URL),nativeObjectURL=URL.createObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=nativeObjectURL(blob);window.previewBlobs.set(url,blob);return url};
URL.revokeObjectURL=url=>{window.revoked++;window.previewBlobs.delete(url);nativeRevoke(url)};
window.createImageBitmap=async(...args)=>{window.decodeCalls++;const bitmap=await nativeBitmap(...args),close=bitmap.close.bind(bitmap);bitmap.close=()=>{window.closedBitmaps++;close()};if(window.hold)await new Promise(resolve=>window.pending.push(resolve));return bitmap};
window.renderSelection=(mounted=true)=>{const actor=window.actor;flushSync(()=>root.render(mounted?React.createElement(Selection,{key:actor,context:{accountId:actor,revision:'0',avatarUrl:null,generation:'0',selectionEnabled:true,retentionReady:true},enabled:true,retentionReady:true,visible:window.visible,locale:'pt-BR',isCurrent:()=>window.current&&actor===window.actor,registerUpload:value=>{if(value)window.registered++},onRefreshRequired:()=>{window.refreshed=true}}):null))};window.renderSelection();
`;

test("real browser photo preparation: large file orientation preview/upload identity and cancellation", {
  skip: process.env.TOUCHLINE_RUN_AVATAR_PREPARATION_BROWSER !== "1", timeout: 180_000,
}, async () => {
  const out = process.env.TOUCHLINE_AVATAR_PREPARATION_CAPTURE_DIR; assert.ok(out && path.isAbsolute(out)); mkdirSync(out, { recursive: true });
  const engine = process.env.TOUCHLINE_AVATAR_PREPARATION_ENGINE === "webkit" ? webkit : chromium;
  const bundle = bundleIsolatedBrowserFixture({ entryPath: "components/touchline/ClubOwnerAvatarUploadSelection.tsx", requiredSources: [helper, "lib/touchlineArena/club-owner-avatar-client.ts"], additionalEntryPaths: [helper], mountScript: mount });
  // Synthetic high-entropy image exceeds the transport cap but fits local input.
  const noise = Buffer.alloc(1800 * 1000 * 3); let seed = 12;
  for (let i = 0; i < noise.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; noise[i] = seed & 255; }
  const large = await sharp(noise, { raw: { width: 1800, height: 1000, channels: 3 } }).png().toBuffer(); assert.ok(large.length > 4_000_000);
  const pixels = Buffer.alloc(1200 * 800 * 3);
  for (let y = 0; y < 800; y++) for (let x = 0; x < 1200; x++) {
    const color = y < 400 ? (x < 600 ? [255, 0, 0] : [0, 255, 0]) : (x < 600 ? [0, 0, 255] : [255, 255, 0]);
    pixels.set(color, (y * 1200 + x) * 3);
  }
  const orientations: { format: "jpeg" | "png" | "webp"; orientation: number; bytes: Buffer }[] = [];
  for (const format of ["jpeg", "png", "webp"] as const) for (let orientation = 1; orientation <= 8; orientation++) orientations.push({ format, orientation, bytes: await sharp(pixels, { raw: { width: 1200, height: 800, channels: 3 } }).withMetadata({ orientation }).toFormat(format).toBuffer() });
  const rotated = orientations.slice(0, 8).map(item => item.bytes);
  const small = await sharp({ create: { width: 40, height: 20, channels: 4, background: { r: 230, g: 50, b: 10, alpha: .5 } } }).webp().toBuffer();
  const portrait = readFileSync("public/touchlineArena/club-owner/avatars/luiz-lopez-owner-avatar-v1.png");
  const frames = Buffer.alloc(8 * 16 * 3); frames.fill(255, 8 * 8 * 3);
  const animation = await sharp(frames, { raw: { width: 8, height: 16, pageHeight: 8, channels: 3 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  const apng = Buffer.concat([large.subarray(0, 33), Buffer.from("000000086163544c000000020000000000000000", "hex"), large.subarray(33)]);
  const bomb = Buffer.from(large); bomb.writeUInt32BE(100_000, 16);
  const browser = await engine.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
    const page = await context.newPage(), errors: string[] = [], posts: Buffer[] = [], postTypes: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      // WebKit routes blob images as well as HTTP requests; let the local
      // browser load the component's own blob without admitting remote hosts.
      if (url.protocol === "blob:" && url.origin === origin) return route.continue();
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#07111b;color:#edf8ff;font:16px Arial;padding:24px}input,button{font:inherit}section{max-width:680px}p{line-height:1.5}img{display:block;margin-block:20px}${bundle.css}</style><div id="root"></div><script>${bundle.script.replace(/<\/script/gi, "<\\/script")}</script>` });
      if (url.pathname === "/api/account/avatar" && request.method() === "POST") { posts.push(request.postDataBuffer()!); postTypes.push(request.headers()["content-type"]); return route.fulfill({ status: 422, json: { ok: false, error: "OUTPUT_TOO_LARGE", state: "unknown" } }); }
      return route.abort();
    });
    const reset = () => page.goto(origin + "/fixture");
    const select = (buffer: Buffer, name = "photo.png", mimeType = "image/png") => page.locator("input[type=file]").setInputFiles({ name, mimeType, buffer });
    // Read the exact Blob passed by the real component; routed WebKit fetches
    // cannot read blob: URLs even when the rendered image is already decoded.
    const preview = async () => {
      await expect(page.getByRole("button", { name: "Confirmar envio da foto" })).toBeVisible();
      await expect.poll(() => page.locator("img").evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      return Buffer.from(await page.locator("img").evaluate(async img => {
        const blob = (window as unknown as { previewBlobs: Map<string, Blob> }).previewBlobs.get((img as HTMLImageElement).src);
        if (!blob) throw Error("Preview source blob absent");
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      }));
    };
    await reset(); await select(large); const prepared = await preview();
    const metadata = await sharp(prepared).metadata(); assert.equal(metadata.format, "png"); assert.equal(metadata.width, 512); assert.equal(metadata.height, 284); assert.ok(prepared.length < 4_000_000 && prepared.length < large.length);
    assert.equal(posts.length, 0); await page.screenshot({ path: path.join(out, `${engine.name()}-desktop-prepared.png`), fullPage: true });
    await page.getByRole("button", { name: "Confirmar envio da foto" }).click(); await expect.poll(() => posts.length).toBe(1); assert.deepEqual(posts[0], prepared); assert.equal(postTypes[0], "image/png"); await expect(page.locator("input")).toBeDisabled();
    for (const { format, orientation, bytes } of orientations) {
      await reset(); await select(bytes, `oriented.${format}`, `image/${format}`); const result = await preview();
      const actual = await sharp(result).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const expected = await sharp(bytes).autoOrient().resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(actual.info.width, expected.info.width, `${format} EXIF${orientation} width`); assert.equal(actual.info.height, expected.info.height, `${format} EXIF${orientation} height`);
      for (const [x, y] of [[.2, .2], [.8, .2], [.2, .8], [.8, .8]]) {
        const offset = (Math.floor(actual.info.height * y) * actual.info.width + Math.floor(actual.info.width * x)) * 3;
        for (let channel = 0; channel < 3; channel++) assert.ok(Math.abs(actual.data[offset + channel] - expected.data[offset + channel]) <= 12, `${format} EXIF${orientation} corner ${x}/${y}`);
      }
    }
    await reset(); await select(small, "small.webp", "image/webp"); const preserved = await sharp(await preview()).metadata(); assert.equal(preserved.width, 40); assert.equal(preserved.height, 20); assert.equal(preserved.hasAlpha, true);
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(out, `${engine.name()}-mobile-prepared.png`), fullPage: true }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await reset(); await select(portrait, "existing-public-portrait.png", "image/png"); const portraitPreview = await preview();
    const normalized = await validateClubOwnerAvatar(new Uint8Array(portraitPreview)); assert.ok(normalized.ok); assert.ok(normalized.bytes.length <= 128 * 1024);
    writeFileSync(path.join(out, `${engine.name()}-portrait-prepared.png`), portraitPreview, { mode: 0o600 });
    writeFileSync(path.join(out, `${engine.name()}-portrait-server.webp`), normalized.bytes, { mode: 0o600 });
    await page.screenshot({ path: path.join(out, `${engine.name()}-mobile-portrait.png`), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 800 }); await page.screenshot({ path: path.join(out, `${engine.name()}-desktop-portrait.png`), fullPage: true });
    // Invalid headers, animation and source limits stop before decoder/operation.
    for (const [buffer, mimeType, message] of [
      [Buffer.from("000000186674797068656963000000006d69663168656963", "hex"), "image/heic", "HEIC/HEIF"],
      [rotated[0].subarray(0, 20), "image/jpeg", "Não foi possível ler"],
      [Buffer.from([1, 2, 3]), "image/png", "Não foi possível ler"],
      [animation, "image/webp", "foto estática"], [apng, "image/png", "foto estática"], [bomb, "image/png", "dimensões"],
    ] as const) { await reset(); await select(buffer, "invalid.photo", mimeType); await expect(page.getByRole("status")).toContainText(message); assert.equal(await page.evaluate(() => (window as unknown as { decodeCalls: number }).decodeCalls), 0); }
    // Hold a real native result to exercise source change/cancel/identity/unmount.
    for (const action of ["replace", "cancel", "identity", "unmount", "hide"]) {
      await reset(); await page.evaluate(() => { (window as unknown as { hold: boolean }).hold = true; }); await select(rotated[0], "first.jpg", "image/jpeg");
      await expect.poll(() => page.evaluate(() => (window as unknown as { pending: unknown[] }).pending.length)).toBe(1);
      if (action === "replace") await select(small, "replacement.webp", "image/webp");
      else if (action === "cancel") await page.getByRole("button", { name: "Cancelar seleção" }).click();
      else await page.evaluate(action => { const w = window as unknown as { actor: string; visible: boolean; renderSelection: (mounted?: boolean) => void }; if (action === "identity") w.actor = "00000000-0000-4000-8000-000000000002"; if (action === "hide") w.visible = false; w.renderSelection(action !== "unmount"); }, action);
      await page.evaluate(() => { const w = window as unknown as { hold: boolean; pending: (() => void)[] }; w.hold = false; w.pending.splice(0).forEach(resolve => resolve()); });
      await expect.poll(() => page.evaluate(() => (window as unknown as { closedBitmaps: number }).closedBitmaps)).toBe(action === "replace" ? 2 : 1);
      if (action === "replace") { assert.equal((await sharp(await preview()).metadata()).width, 40); }
      else { await expect(page.locator("img")).toHaveCount(0); assert.equal(await page.evaluate(() => (window as unknown as { registered: number }).registered), 0); }
    }
    await reset(); await select(small, "preview.webp", "image/webp"); await preview(); await page.getByRole("button", { name: "Cancelar seleção" }).click(); await expect(page.locator("img")).toHaveCount(0); assert.equal(await page.evaluate(() => (window as unknown as { revoked: number }).revoked), 1);
    assert.equal(posts.length, 1); assert.deepEqual(errors, []); await context.close();
  } finally { await browser.close(); }
});
