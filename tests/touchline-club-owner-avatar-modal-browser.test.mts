import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, webkit, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";

const origin = "https://avatar-modal.invalid", actor = "11111111-1111-4111-8111-111111111111", other = "33333333-3333-4333-8333-333333333333";
const initial = { accountId: actor, revision: "0", avatarUrl: null, generation: "0", activeOperationId: null,
  fencedThroughGeneration: "-1", operationId: null, operationState: null, committedRevision: null,
  uploadAllowed: true, canUpload: false, readyForSelection: false };
const mount = `
const Control=loadEntry().default;const sharedDialog=loadAdditionalEntry("components/touchline/a11y/TouchlineDialog.tsx");
window.actor=${JSON.stringify(actor)};window.locale='pt-BR';window.context=${JSON.stringify(initial)};window.observers=new Set();window.refreshes=0;window.uploadAborts=0;
window.onFixtureRouteRefresh=()=>window.refreshes++;
window.avatarFixtureAuth={auth:{getUser:async()=>({data:{user:{id:window.actor}},error:null}),onAuthStateChange:callback=>{window.observers.add(callback);callback('INITIAL_SESSION',{user:{id:window.actor}});return{data:{subscription:{unsubscribe:()=>window.observers.delete(callback)}}}}}};
const nativeFetch=window.fetch.bind(window);window.fetch=(input,init)=>{if(input==='/api/account/avatar')init?.signal?.addEventListener('abort',()=>window.uploadAborts++);return nativeFetch(input,init)};
window.changeIdentity=()=>{window.actor=${JSON.stringify(other)};for(const callback of window.observers)callback('SIGNED_IN',{user:{id:window.actor}})};
const avatar=()=>React.createElement(Control,{accountId:${JSON.stringify(actor)},context:window.context,locale:window.locale,draftLocalesEnabled:true,avatarSelectionEnabled:true,retentionReady:true},React.createElement('span',null,'QA'));
function NestedHost(){const heading=React.useRef(null);const {dialogRef,dialogProps}=sharedDialog.useTouchlineDialog({open:true,label:'Parent fixture',initialFocusRef:heading,onDismiss:()=>window.parentDismisses++});sharedDialog.useTouchlineDialogScrollLock(true);React.useLayoutEffect(()=>{const node=dialogRef.current;if(!node.open)node.showModal();return()=>{if(node.open)node.close()}},[]);return React.createElement('dialog',{...dialogProps,'data-fixture-parent':true},React.createElement('h2',{ref:heading,tabIndex:-1},'Parent fixture'),avatar())}
window.nested=false;window.parentDismisses=0;
window.renderAvatar=(mounted=true)=>flushSync(()=>root.render(mounted?React.createElement(React.StrictMode,null,window.nested?React.createElement(NestedHost):avatar()):null));
window.renderAvatar();
`;

test("real avatar host modal keeps uncertain work across close and traps/restores focus in StrictMode", {
  skip: process.env.TOUCHLINE_RUN_AVATAR_MODAL_BROWSER !== "1", timeout: 180_000,
}, async () => {
  const output = process.env.TOUCHLINE_AVATAR_MODAL_CAPTURE_DIR;
  assert.ok(output && path.isAbsolute(output)); mkdirSync(output, { recursive: true });
  const engine = process.env.TOUCHLINE_AVATAR_MODAL_ENGINE === "webkit" ? webkit : chromium;
  const bundle = bundleIsolatedBrowserFixture({ entryPath: "components/touchline/ClubOwnerAvatarControl.tsx",
    requiredSources: ["components/touchline/ClubOwnerAvatarUploadSelection.tsx", "components/touchline/a11y/TouchlineDialog.tsx", "lib/touchlineArena/club-owner-avatar-preparation.ts", "lib/touchlineArena/club-owner-avatar-client.ts"],
    mountScript: mount, syntheticAvatarAuth: true, allowSyntheticRouteRefresh: true,
    additionalEntryPaths: ["components/touchline/a11y/TouchlineDialog.tsx"] });
  const portrait = readFileSync("public/touchlineArena/club-owner/avatars/luiz-lopez-owner-avatar-v1.png");
  const browser = await engine.launch({ headless: true });
  const results: unknown[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
    const page = await context.newPage(), errors: string[] = [], requests: { kind: string; body: string; operation?: string }[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let releaseUpload: (() => void) | null = null, holdUpload = false, failFence = true;
    await context.route("**/*", async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.protocol === "blob:" && url.origin === origin) return route.continue();
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--touchline-modal-backdrop:rgba(0,5,6,.72);--touchline-modal-blur:blur(8px)}*{box-sizing:border-box}body{margin:0;background:#08130f;color:#f6ffec;font:16px Arial;padding:32px;min-height:150vh}button{font:inherit}h1{font-weight:500}#root{max-width:400px}#root>small{display:block;margin:20px 0}.fixture-text{font-size:22px;line-height:1.8;color:#c4e4ba;max-width:620px}${bundle.css}</style><main id="background"><h1>TouchLine · conta cliente de teste</h1><div id="root"></div><p class="fixture-text">Caixa do clube · Formação · Elenco<br>Conteúdo de fundo para verificar a janela de foto.</p><button id="background-action">Ação da página</button></main><script>${bundle.script.replace(/<\/script/gi, "<\\/script")}</script>` });
      if (url.pathname === "/api/account/avatar" && req.method() === "POST") {
        requests.push({ kind: "upload", body: req.postDataBuffer()!.toString("base64"), operation: req.headers()["x-touchline-avatar-operation"] });
        if (holdUpload) await new Promise<void>(resolve => { releaseUpload = resolve; });
        return route.fulfill({ status: 422, json: { ok: false, error: "OUTPUT_TOO_LARGE", state: "unknown" } });
      }
      if (url.pathname === "/api/account/avatar/recovery") {
        const body = req.postData()!; requests.push({ kind: "recovery", body });
        const action = JSON.parse(body).action;
        if (action === "status") return route.fulfill({ json: { ok: true, state: "observed", context: initial } });
        if (failFence) return route.fulfill({ status: 503, json: { ok: false } });
        return route.fulfill({ json: { ok: true, state: "observed", barrierStatus: "barrier_applied", context: { ...initial, generation: "1", fencedThroughGeneration: "0" } } });
      }
      return route.abort();
    });
    const open = async () => { await page.locator('[data-avatar-action="open"]').click(); await expect(page.locator("dialog:modal")).toHaveCount(1); };
    const close = async () => { await page.keyboard.press("Escape"); await expect(page.locator("dialog:modal")).toHaveCount(0); await expect(page.locator('[data-avatar-action="open"]')).toBeFocused(); };
    const select = async () => {
      const chooser = page.waitForEvent("filechooser"); await page.locator('[data-avatar-selection="choose"]').click();
      await (await chooser).setFiles({ name: "portrait.png", mimeType: "image/png", buffer: portrait });
      await expect(page.locator('[data-avatar-selection="confirm"]')).toBeVisible();
      await expect.poll(() => page.locator("dialog img").evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    };
    for (const [width, height, locale] of [[1440,900,"pt-BR"],[844,390,"pt-BR"],[390,844,"pt-BR"],[1024,768,"en-GB"],[844,390,"ar-SA"]] as const) {
      await page.setViewportSize({ width, height }); await page.goto(origin + "/fixture");
      await page.evaluate(locale => { const w = window as unknown as { locale: string; renderAvatar: () => void }; w.locale = locale; w.renderAvatar(); }, locale);
      await expect(page.locator('[data-avatar-action="open"]')).toBeEnabled(); assert.equal(requests.length, 0);
      await expect(page.locator("dialog")).toBeHidden(); await open();
      await expect(page.locator("dialog h2")).toBeFocused();
      const geometry = await page.locator("dialog").evaluate(node => {
        const r=node.getBoundingClientRect(),s=getComputedStyle(node);
        return { x:r.x,y:r.y,width:r.width,height:r.height,overflow:node.scrollWidth>node.clientWidth,background:s.backgroundColor,blur:s.backdropFilter,locked:document.documentElement.dataset.touchlineModalScrollLock };
      });
      assert.ok(Math.abs(geometry.width-width)<1); assert.ok(Math.abs(geometry.height-height)<1); assert.equal(geometry.overflow,false); assert.equal(geometry.background,"rgba(0, 5, 6, 0.72)"); assert.equal(geometry.blur,"blur(8px)"); assert.equal(geometry.locked,"true");
      await page.keyboard.press("Tab"); await expect(page.locator('[data-avatar-action="close"]')).toBeFocused();
      await page.keyboard.press("Shift+Tab"); await expect(page.locator('[data-avatar-action="observe"]')).toBeFocused();
      await page.keyboard.press("Tab"); await expect(page.locator('[data-avatar-action="close"]')).toBeFocused();
      await select();
      await page.locator("dialog").evaluate(async node=>{node.scrollTop=0;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))});
      await page.screenshot({ path: path.join(output,`${engine.name()}-${width}-${locale}-photo.png`) });
      await page.locator("dialog").evaluate(node=>{node.scrollTop=node.scrollHeight});
      await page.screenshot({ path: path.join(output,`${engine.name()}-${width}-${locale}-footer.png`) });
      const gap = await page.locator('[data-avatar-selection="confirm"]').evaluate(node => {
        const a=node.getBoundingClientRect(),b=node.nextElementSibling!.getBoundingClientRect();
        return a.bottom<=b.top ? b.top-a.bottom : b.left>=a.right ? b.left-a.right : a.left-b.right;
      }); assert.ok(gap>=13,`actions gap ${gap}`);
      await close(); assert.equal(await page.evaluate(()=>document.documentElement.dataset.touchlineModalScrollLock),undefined);
      await open(); await expect(page.locator("dialog img")).toHaveCount(0); await close();
      results.push({width,height,locale,geometry,actionsGap:gap});
    }
    // Close/reopen never cancels a dispatched upload, nor enables replacement.
    await page.setViewportSize({width:1280,height:800}); await page.goto(origin+"/fixture"); await open(); await select();
    holdUpload=true; await page.locator('[data-avatar-selection="confirm"]').click(); await expect.poll(()=>requests.filter(r=>r.kind==="upload").length).toBe(1);
    await close(); await open(); await expect(page.locator('[data-avatar-selection="choose"]')).toBeDisabled();
    assert.equal(await page.evaluate(()=>(window as unknown as {uploadAborts:number}).uploadAborts),0);
    assert.ok(releaseUpload); (releaseUpload as ()=>void)(); releaseUpload=null; holdUpload=false;
    await expect(page.locator("dialog section[aria-busy=true]")).toHaveCount(0);
    await close(); await open(); await expect(page.locator('[data-avatar-selection="choose"]')).toBeDisabled();
    assert.equal(requests.filter(r=>r.kind==="upload").length,1);
    // Recovery is explicit, with a separate confirmation. An uncertain fence
    // retains precisely the same request pair across closing and reopening.
    await page.locator('[data-avatar-action="observe"]').click(); await expect(page.locator('[data-avatar-action="prepare-fence"]')).toBeVisible();
    await page.locator('[data-avatar-action="prepare-fence"]').click(); assert.equal(requests.filter(r=>r.kind==="recovery").length,1);
    await close(); await open(); await expect(page.locator('[data-avatar-action="confirm-fence"]')).toHaveCount(0);
    await page.locator('[data-avatar-action="prepare-fence"]').click(); await page.locator('[data-avatar-action="confirm-fence"]').click();
    await expect(page.locator('[data-avatar-action="retry"]')).toBeVisible(); const originalFence=requests.at(-1)!.body;
    await close(); await open(); failFence=false; await page.locator('[data-avatar-action="retry"]').click();
    await expect.poll(()=>page.evaluate(()=>(window as unknown as {refreshes:number}).refreshes)).toBe(1);
    assert.equal(requests.at(-1)!.body,originalFence); assert.equal(requests.filter(r=>r.kind==="upload").length,1);
    await close();
    // Identity retirement and unmount clear the dialog/focus/scroll locks,
    // abort in-flight work and cannot let a late response refresh another user.
    for(const mode of ["identity","unmount"]){
      await page.goto(origin+"/fixture"); await open(); await select(); releaseUpload=null; holdUpload=true;
      await page.locator('[data-avatar-selection="confirm"]').click(); await expect.poll(()=>!!releaseUpload).toBe(true);
      await page.evaluate(mode=>{const w=window as unknown as {changeIdentity:()=>void;renderAvatar:(mounted:boolean)=>void};if(mode==="identity")w.changeIdentity();else w.renderAvatar(false);},mode);
      await expect(page.locator("dialog:modal")).toHaveCount(0); await expect.poll(()=>page.evaluate(()=>(window as unknown as {uploadAborts:number}).uploadAborts)).toBe(1);
      (releaseUpload as unknown as ()=>void)(); releaseUpload=null;holdUpload=false;
      assert.equal(await page.evaluate(()=>(window as unknown as {refreshes:number}).refreshes),0);
      await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.touchlineModalScrollLock)).toBe(undefined);
      await expect.poll(()=>page.evaluate(()=>Boolean(document.activeElement?.closest('dialog')))).toBe(false);
      assert.equal(await page.locator('#background').evaluate(node=>(node as HTMLElement).inert),false);
    }
    // A nested native dialog owns Escape and returns to its trigger without
    // dismissing the parent or removing the parent's scroll protection.
    await page.goto(origin+"/fixture");
    await page.evaluate(()=>{const w=window as unknown as {nested:boolean;renderAvatar:()=>void};w.nested=true;w.renderAvatar()});
    await expect(page.locator('[data-fixture-parent]:modal')).toHaveCount(1);
    await page.locator('[data-avatar-action="open"]').click();
    await expect(page.locator('[data-avatar-dialog]:modal')).toHaveCount(1);
    await expect(page.locator('[data-avatar-dialog] h2')).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-avatar-dialog]:modal')).toHaveCount(0);
    await expect(page.locator('[data-fixture-parent]:modal')).toHaveCount(1);
    await expect(page.locator('[data-avatar-action="open"]')).toBeFocused();
    assert.equal(await page.evaluate(()=>(window as unknown as {parentDismisses:number}).parentDismisses),0);
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.touchlineModalScrollLock),"true");
    await page.evaluate(()=>(window as unknown as {renderAvatar:(mounted:boolean)=>void}).renderAvatar(false));
    await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.touchlineModalScrollLock)).toBe(undefined);
    assert.deepEqual(errors,[]);
    writeFileSync(path.join(output,`${engine.name()}-results.json`),JSON.stringify({results,requests:requests.map(({kind,operation})=>({kind,operation})),errors},null,2)+"\n",{mode:0o600});
    await context.close();
  }finally{await browser.close();}
});
