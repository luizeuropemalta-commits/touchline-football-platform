import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { chromium, webkit, expect, type Browser } from '@playwright/test';

// Opt-in only. Real React StrictMode, DOM, registration and attempt modules;
// synthetic identity, Notification/Push APIs and fully intercepted HTTP.
// No actual service worker, permission dialog, DB, provider or device delivery.
const enabled = process.env.TOUCHLINE_RUN_REHEARSAL_BROWSER_TESTS === '1';
const require = createRequire(import.meta.url);
const origin = 'https://rehearsal.test';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const installation = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const other = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const markerKey = `touchline:push-rehearsal-attempt:v1:${owner}:${installation}`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Receipt = 'accepted' | 'lost' | 'unavailable';
type PermissionProbe = { kind: string; callbackActive: boolean; activation: boolean | null; documentCapture: boolean };

function fixture(configuredInstallationId: string | null = installation) {
  const reactDir = dirname(require.resolve('react'));
  const domDir = dirname(require.resolve('react-dom/client'));
  const schedulerDir = dirname(createRequire(require.resolve('react-dom/client')).resolve('scheduler'));
  const curve = createECDH('prime256v1'); curve.setPrivateKey(Buffer.alloc(32, 1));
  const publicKey = curve.getPublicKey().toString('base64url');
  const subscription = { endpoint: 'https://fcm.googleapis.com/synthetic-rehearsal', keys: {
    p256dh: publicKey, auth: Buffer.alloc(16, 2).toString('base64url'),
  } };
  const modules: Record<string, string> = {
    react: readFileSync(join(reactDir, 'cjs/react.development.js'), 'utf8'),
    'react/jsx-runtime': readFileSync(join(reactDir, 'cjs/react-jsx-runtime.development.js'), 'utf8'),
    'react-dom': readFileSync(join(domDir, 'cjs/react-dom.development.js'), 'utf8'),
    'react-dom/client': readFileSync(join(domDir, 'cjs/react-dom-client.development.js'), 'utf8'),
    scheduler: readFileSync(join(schedulerDir, 'cjs/scheduler.development.js'), 'utf8'),
    '@/components/touchline/TouchlineGlobalNavigation.module.css': 'exports.default={link:"link"};',
    '@/lib/supabase/client': `exports.createClient=()=>{fixtureAuthCreates++;return{auth:{onAuthStateChange(callback){
      fixtureObservers.add(callback);return{data:{subscription:{unsubscribe(){fixtureObservers.delete(callback);}}}};
    }}};};`,
  };
  // Instrument the synchronous public JSX callback boundary, not React internals
  // or product code. finally clears on callback return (including an async
  // callback returning its Promise), so an awaited permission call cannot pass.
  modules['react/jsx-runtime'] += `
    for(const name of ['jsx','jsxs']){const original=exports[name];exports[name]=function(type,props,key){
      if(type==='button'&&typeof props?.onClick==='function')props={...props,onClick:window.fixtureWrapClick(props.onClick)};
      return original(type,props,key);
    };}`;
  for (const [id, path] of [
    ['@/lib/touchlineArena/push-device-registration', '../lib/touchlineArena/push-device-registration.ts'],
    ['@/lib/touchlineArena/push-rehearsal-attempt', '../lib/touchlineArena/push-rehearsal-attempt.ts'],
    ['@/lib/touchlineArena/push-rehearsal-i18n', '../lib/touchlineArena/push-rehearsal-i18n.ts'],
    ['./catalogue-locale.ts', '../lib/touchlineArena/catalogue-locale.ts'],
    ['./i18n.ts', '../lib/touchlineArena/i18n.ts'],
    ['./locale-catalogues/core-drafts.ts', '../lib/touchlineArena/locale-catalogues/core-drafts.ts'],
    ['control', '../components/touchline/notifications/TouchlinePushRehearsal.tsx'],
  ]) modules[id] = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const definitions = Object.entries(modules).map(([id, source]) => `${JSON.stringify(id)}:function(module,exports,require){${source}\n}`).join(',');
  const css = readFileSync(new URL('../components/touchline/TouchlineGlobalNavigation.module.css', import.meta.url), 'utf8');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{background:#06120c;color:white;font:14px Arial;padding:24px}section{max-width:720px}button,label{margin:6px} ${css}
    </style></head><body><button id="native-permission-probe">Native direct probe</button><div id="react-probes"></div><div id="root"></div><script>
    const process={env:{NODE_ENV:'development',NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY:${JSON.stringify(publicKey)}}};
    const modules={${definitions}},cache={};
    function require(id){if(cache[id])return cache[id].exports;if(!modules[id])throw Error('Unknown fixture module '+id);const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}
    window.fixtureObservers=new Set();window.fixtureAuthCreates=0;window.fixturePromptCalls=0;window.fixturePromptGestures=[];
    window.fixtureWorkerCalls=0;window.fixtureSubscriptionReads=0;window.fixtureSignals=[];window.fixtureDispatchMarkers=[];
    window.fixtureClickDepth=0;window.fixtureProbeKind=null;window.fixtureProbeRecords=[];
    window.fixtureWrapClick=callback=>function(...args){fixtureClickDepth++;try{return callback.apply(this,args);}finally{fixtureClickDepth--;}};
    let fixtureGesture=false,permission='default',resolvePermission;
    // Retained only for diagnosis: browsers may run this microtask before the
    // target/delegated callback. It is NOT a synchronous-handler oracle.
    document.addEventListener('click',()=>{fixtureGesture=true;queueMicrotask(()=>{fixtureGesture=false;});},true);
    Object.defineProperty(window,'Notification',{configurable:true,value:{get permission(){return permission;},requestPermission(){
      const probe={kind:fixtureProbeKind??'component',callbackActive:fixtureClickDepth>0,
        activation:navigator.userActivation?.isActive??null,documentCapture:fixtureGesture};
      if(fixtureProbeKind){fixtureProbeRecords.push(probe);return Promise.resolve('granted');}
      fixturePromptCalls++;fixturePromptGestures.push(probe);
      return new Promise(resolve=>{resolvePermission=resolve;});
    }}});
    window.resolvePermissionFixture=(value)=>{permission=value;resolvePermission?.(value);};
    Object.defineProperty(window,'PushManager',{configurable:true,value:function(){}});
    const bytes=Uint8Array.from(atob(${JSON.stringify(publicKey)}.replace(/-/g,'+').replace(/_/g,'/')),character=>character.charCodeAt(0));
    const worker={pushManager:{getSubscription:async()=>{fixtureSubscriptionReads++;return{
      options:{applicationServerKey:bytes.buffer},toJSON:()=>(${JSON.stringify(subscription)})};},subscribe:async()=>{throw Error('Unexpected synthetic subscribe');}}};
    Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{ready:Promise.resolve(worker),register:async(path,options)=>{
      if(path!='/touchline-push-sw.js'||options.scope!='/')throw Error('Unexpected registration');fixtureWorkerCalls++;return worker;
    }}});
    const realFetch=window.fetch.bind(window);
    window.fetch=(input,init)=>{fixtureSignals.push({url:String(input),signal:init?.signal});
      if(String(input)==='/api/notifications/rehearsal')fixtureDispatchMarkers.push(localStorage.getItem(${JSON.stringify(markerKey)}));
      return realFetch(input,init);
    };
    localStorage.setItem('touchline:push-installation-id:v1',${JSON.stringify(installation)});
    const React=require('react'),flushSync=require('react-dom').flushSync,Control=require('control').default;
    document.getElementById('native-permission-probe').addEventListener('click',fixtureWrapClick(()=>{
      fixtureProbeKind='native-direct';Notification.requestPermission();fixtureProbeKind=null;
    }));
    const jsx=require('react/jsx-runtime').jsx;
    function PermissionProbes(){return React.createElement(React.Fragment,null,
      jsx('button',{id:'react-direct-probe',onClick:()=>{fixtureProbeKind='react-direct';Notification.requestPermission();fixtureProbeKind=null;},children:'React direct probe'}),
      jsx('button',{id:'react-deferred-probe',onClick:async()=>{await Promise.resolve();fixtureProbeKind='react-deferred';await Notification.requestPermission();fixtureProbeKind=null;},children:'React deferred probe'}));}
    const probeRoot=require('react-dom/client').createRoot(document.getElementById('react-probes'));
    flushSync(()=>probeRoot.render(React.createElement(React.StrictMode,null,React.createElement(PermissionProbes))));
    let root=null,props={accountId:${JSON.stringify(owner)},configuredInstallationId:${JSON.stringify(configuredInstallationId)},locale:'en-GB'};
    window.renderFixture=(patch={})=>{props={...props,...patch};if(!root)root=require('react-dom/client').createRoot(document.getElementById('root'));
      flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Control,props))));};
    window.unmountFixture=()=>{if(root){flushSync(()=>root.unmount());root=null;}};
    window.emitFixture=(id,event='INITIAL_SESSION')=>{for(const callback of fixtureObservers)callback(event,id?{user:{id}}:null);};
    renderFixture();
    </script></body></html>`;
}

async function browserCase(browser: Browser, options: { configuredInstallationId?: string | null; holdRegistration?: boolean } = {}) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, serviceWorkers: 'block' });
  const page = await context.newPage(); page.setDefaultTimeout(5_000);
  const errors: string[] = [], unexpected: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const registrations: { owner: string | undefined; body: Record<string, unknown> }[] = [];
  const posts: { owner: string | undefined; body: Record<string, unknown> }[] = [];
  const registrationReceipts: ((receipt: Receipt) => Promise<void>)[] = [], attemptReceipts: ((receipt: Receipt) => Promise<void>)[] = [];
  const html = fixture(options.configuredInstallationId === undefined ? installation : options.configuredInstallationId);
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { unexpected.push(url.origin); await route.abort(); return; }
    if (url.pathname === '/rehearsal') { await route.fulfill({ contentType: 'text/html', body: html }); return; }
    if (url.pathname === '/favicon.ico') { await route.fulfill({ status: 204 }); return; }
    const device = url.pathname === '/api/notifications/devices';
    if (!device && url.pathname !== '/api/notifications/rehearsal') { unexpected.push(url.pathname); await route.abort(); return; }
    assert.equal(route.request().method(), device ? 'PUT' : 'POST');
    const entry = { owner: route.request().headers()['x-touchline-expected-account'], body: route.request().postDataJSON() as Record<string, unknown> };
    (device ? registrations : posts).push(entry);
    let finishReceipt!: () => void;
    const finished = new Promise<void>(resolve => { finishReceipt = resolve; });
    const receipt = device && !options.holdRegistration ? 'accepted' : await new Promise<Receipt>(resolve => {
      (device ? registrationReceipts : attemptReceipts).push(value => { resolve(value); return finished; });
    });
    // Aborted lifecycle requests can no longer accept their intentionally late receipt.
    try {
      if (receipt === 'lost') await route.abort('failed').catch(() => {});
      else await route.fulfill(receipt === 'unavailable' ? { status: 503, json: { ok: false, status: 'unconfirmed' } }
        : device ? { status: 200, json: { ok: true, delivery: 'not-sent', accountId: owner, installationId: installation } }
          : { status: 202, json: { ok: true, status: 'provider_accepted' } }).catch(() => {});
    } finally { finishReceipt(); }
  });
  return { page, errors, unexpected, registrations, posts, registrationReceipts, attemptReceipts,
    async open() {
      await page.goto(`${origin}/rehearsal`);
      assert.deepEqual(errors, [], 'rehearsal fixture must initialize without module or script errors');
      await expect(page.getByRole('button', { name: 'Prepare this device' })).toBeDisabled();
      assert.equal(await page.evaluate('fixtureObservers.size'), 1);
      assert.ok(await page.evaluate(() => (window as unknown as { fixtureAuthCreates: number }).fixtureAuthCreates) >= 2,
        'real StrictMode replays effect and cleans its old observer');
    },
    async identify() {
      await page.evaluate(id => { (window as unknown as { emitFixture(id: string): void }).emitFixture(id); }, owner);
      await expect(page.getByRole('button', { name: 'Prepare this device' })).toBeEnabled();
    },
    async prepare() {
      await page.getByRole('button', { name: 'Prepare this device' }).click();
      await expect.poll(() => page.evaluate('fixturePromptCalls')).toBe(1);
      const probes = await page.evaluate('fixturePromptGestures') as PermissionProbe[];
      assert.equal(probes.length, 1);
      assert.equal(probes[0].callbackActive, true, 'permission must execute before the actual React click callback returns');
      assert.equal(probes[0].activation, true, 'the real browser must also report active user activation');
      assert.equal(registrations.length, 0); assert.equal(posts.length, 0);
      await page.evaluate('resolvePermissionFixture("granted")');
      await expect.poll(() => registrations.length).toBe(1);
    },
    async send() {
      const checkbox = page.getByRole('checkbox'); await expect(checkbox).not.toBeChecked();
      await expect(page.getByRole('button', { name: 'Send one test' })).toBeDisabled();
      await checkbox.check(); await page.getByRole('button', { name: 'Send one test' }).click();
      await expect.poll(() => posts.length).toBe(1);
      await expect(page.getByRole('button', { name: 'Send one test' })).toBeDisabled();
    },
    async close() {
      for (const release of [...registrationReceipts, ...attemptReceipts]) void release('unavailable');
      await context.close();
    },
  };
}

test('real React StrictMode rehearsal stays one-shot and account-bound with synthetic browser/provider boundaries', { skip: !enabled, timeout: 60_000 }, async t => {
  // Engines and cases are intentionally serial; no web server or real push exists.
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      await t.test(`${engine.name()}: permission oracle distinguishes direct native/React callbacks from an awaited callback`, async () => {
        const h = await browserCase(browser);
        try {
          await h.open();
          await h.page.getByRole('button', { name: 'Native direct probe', exact: true }).click();
          await h.page.getByRole('button', { name: 'React direct probe', exact: true }).click();
          await h.page.getByRole('button', { name: 'React deferred probe', exact: true }).click();
          await expect.poll(() => h.page.evaluate('fixtureProbeRecords.length')).toBe(3);
          const probes = await h.page.evaluate('fixtureProbeRecords') as PermissionProbe[];
          assert.deepEqual(probes.map(probe => probe.kind), ['native-direct', 'react-direct', 'react-deferred']);
          assert.deepEqual(probes.map(probe => probe.callbackActive), [true, true, false]);
          assert.deepEqual(probes.map(probe => probe.activation), [true, true, true],
            'transient activation alone does not distinguish a same-callback request from a microtask-deferred request');
          assert.ok(probes.slice(0, 2).some(probe => probe.documentCapture === false),
            'the former capture-listener microtask flag misclassifies a demonstrably synchronous control');
          assert.equal(await h.page.evaluate('fixturePromptCalls + fixtureWorkerCalls + fixtureSubscriptionReads'), 0);
          assert.equal(h.registrations.length, 0); assert.equal(h.posts.length, 0);
          assert.deepEqual(h.errors, []); assert.deepEqual(h.unexpected, []);
        } finally { await h.close(); }
      });

      await t.test(`${engine.name()}: explicit preparation, unchecked consent, exact one POST`, async () => {
        const h = await browserCase(browser);
        try {
          await h.open(); assert.equal(h.registrations.length, 0); assert.equal(h.posts.length, 0);
          assert.equal(await h.page.evaluate('fixturePromptCalls + fixtureWorkerCalls + fixtureSubscriptionReads'), 0);
          assert.equal(await h.page.evaluate(key => localStorage.getItem(key), markerKey), null);
          await h.identify(); await h.prepare(); await h.send();
          assert.equal(h.registrations[0].owner, owner); assert.equal(h.registrations[0].body.installationId, installation);
          assert.equal(h.posts[0].owner, owner);
          assert.deepEqual(Object.keys(h.posts[0].body).sort(), ['explicitTestConsent', 'installationId', 'requestId']);
          assert.equal(h.posts[0].body.installationId, installation); assert.equal(h.posts[0].body.explicitTestConsent, true);
          assert.match(String(h.posts[0].body.requestId), uuid);
          const marker = JSON.parse(await h.page.evaluate('fixtureDispatchMarkers[0]') as string);
          assert.deepEqual(marker, { requestId: h.posts[0].body.requestId, state: 'attempted' });
          await h.page.getByRole('button', { name: 'Send one test' }).dispatchEvent('click'); assert.equal(h.posts.length, 1);
          await h.attemptReceipts[0]('accepted');
          await expect(h.page.getByRole('status')).toHaveText('Accepted by the push provider. This does not confirm receipt on your device.');
          await expect(h.page.getByRole('checkbox')).not.toBeChecked(); await expect(h.page.getByRole('checkbox')).toBeDisabled();
          assert.deepEqual(h.errors, []); assert.deepEqual(h.unexpected, []);
        } finally { await h.close(); }
      });

      await t.test(`${engine.name()}: foreign INITIAL_SESSION cannot be repaired by a later matching event`, async () => {
        const h = await browserCase(browser);
        try {
          await h.open(); await h.page.evaluate(id => { (window as unknown as { emitFixture(id: string): void }).emitFixture(id); }, other);
          await h.page.evaluate(id => { (window as unknown as { emitFixture(id: string): void }).emitFixture(id); }, owner);
          await expect(h.page.getByRole('button', { name: 'Prepare this device' })).toBeDisabled();
          assert.equal(h.registrations.length, 0); assert.equal(h.posts.length, 0); assert.equal(await h.page.evaluate('fixturePromptCalls'), 0);
          assert.deepEqual(h.errors, []); assert.deepEqual(h.unexpected, []);
        } finally { await h.close(); }
      });

      for (const configuredInstallationId of [null, other]) await t.test(`${engine.name()}: ${configuredInstallationId === null ? 'unset' : 'different'} configured installation never creates a test attempt`, async () => {
        const h = await browserCase(browser, { configuredInstallationId });
        try {
          await h.open(); await h.identify(); await h.prepare();
          await expect(h.page.getByRole('status')).toHaveText('Device registered, but the test is not enabled for this installation. No test sent.');
          await expect(h.page.getByRole('checkbox')).toHaveCount(0); assert.equal(h.posts.length, 0);
          assert.equal(await h.page.evaluate(key => localStorage.getItem(key), markerKey), null);
          assert.deepEqual(h.errors, []); assert.deepEqual(h.unexpected, []);
        } finally { await h.close(); }
      });

      for (const boundary of ['registration', 'attempt'] as const) for (const invalidation of ['account', 'unmount'] as const) {
        await t.test(`${engine.name()}: held ${boundary} receipt after ${invalidation} cannot enable or accept`, async () => {
          const h = await browserCase(browser, { holdRegistration: boundary === 'registration' });
          try {
            await h.open(); await h.identify(); await h.prepare();
            if (boundary === 'attempt') await h.send();
            if (invalidation === 'account') await h.page.evaluate(id => {
              const host = window as unknown as { emitFixture(id: string): void; renderFixture(props: { accountId: string }): void };
              host.emitFixture(id); host.renderFixture({ accountId: id });
            }, other);
            else await h.page.evaluate('unmountFixture()');
            const path = boundary === 'registration' ? '/api/notifications/devices' : '/api/notifications/rehearsal';
            await expect.poll(() => h.page.evaluate(url => (window as unknown as { fixtureSignals: { url: string; signal: AbortSignal }[] }).fixtureSignals.find(item => item.url === url)?.signal.aborted, path)).toBe(true);
            await (boundary === 'registration' ? h.registrationReceipts : h.attemptReceipts)[0]('accepted');
            await h.page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
            if (invalidation === 'unmount') await expect(h.page.locator('#root')).toBeEmpty();
            else { await expect(h.page.getByRole('button', { name: 'Prepare this device' })).toBeDisabled(); await expect(h.page.getByRole('checkbox')).toHaveCount(0); }
            await expect(h.page.getByText('Accepted by the push provider.', { exact: false })).toHaveCount(0);
            assert.equal(h.registrations.length, 1); assert.equal(h.posts.length, boundary === 'attempt' ? 1 : 0);
            assert.equal(await h.page.evaluate('fixtureObservers.size'), invalidation === 'unmount' ? 0 : 1);
            assert.deepEqual(h.errors, []); assert.deepEqual(h.unexpected, []);
          } finally { await h.close(); }
        });
      }

      await t.test(`${engine.name()}: lost receipt stays consumed and remount cannot request a second test`, async () => {
        const h = await browserCase(browser);
        try {
          await h.open(); await h.identify(); await h.prepare(); await h.send();
          const originalMarker = await h.page.evaluate(key => localStorage.getItem(key), markerKey);
          assert.notEqual(originalMarker, null); await h.attemptReceipts[0]('lost');
          await expect(h.page.getByRole('status')).toContainText('Outcome unconfirmed.');
          await expect(h.page.getByRole('button', { name: 'Prepare this device' })).toBeDisabled();
          await expect(h.page.getByRole('checkbox')).toHaveCount(0); assert.equal(h.posts.length, 1);
          await h.page.evaluate('unmountFixture();renderFixture()'); await h.identify();
          await h.page.getByRole('button', { name: 'Prepare this device' }).click();
          await expect.poll(() => h.registrations.length).toBe(2);
          await h.page.getByRole('checkbox').check(); await h.page.getByRole('button', { name: 'Send one test' }).click();
          await expect(h.page.getByRole('status')).toHaveText('An earlier attempt exists for this device. No new test was requested.');
          assert.equal(h.posts.length, 1); assert.equal(await h.page.evaluate(key => localStorage.getItem(key), markerKey), originalMarker);
          assert.equal(await h.page.evaluate('fixturePromptCalls'), 1); assert.equal(await h.page.evaluate('fixtureObservers.size'), 1);
          assert.deepEqual(h.errors, []); assert.deepEqual(h.unexpected, []);
        } finally { await h.close(); }
      });
    } finally { await browser.close(); }
  }
});
