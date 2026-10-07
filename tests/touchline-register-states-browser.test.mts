import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, join } from 'node:path';
import ts from 'typescript';
import { chromium, expect } from '@playwright/test';
import { getTouchLineAuthCopy } from '../lib/touchlineArena/auth-i18n.ts';

const enabled = process.env.TOUCHLINE_RUN_LOCALE_BROWSER_TESTS === '1';
const require = createRequire(import.meta.url);
const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const locales = ['en-GB','pt-BR','es-ES','it-IT','fr-FR','ar-SA','tr-TR','de-DE'];
const origin = 'http://localhost:31998';

function fixtureHtml(locale: string) {
  const modules: Record<string,string> = {};
  for (const [id,pkg,file] of [
    ['react','react','react.development.js'], ['react/jsx-runtime','react','react-jsx-runtime.development.js'],
    ['react-dom','react-dom','react-dom.development.js'], ['react-dom/client','react-dom','react-dom-client.development.js'],
    ['scheduler','scheduler','scheduler.development.js'],
  ]) modules[id] = readFileSync(join(dirname(pkg === 'scheduler'
    ? createRequire(require.resolve('react-dom/client')).resolve(pkg) : require.resolve(pkg)), 'cjs', file), 'utf8');
  modules['next/link'] = 'exports.__esModule=true;exports.default=function Link(p){const {children,...rest}=p;return require("react").createElement("a",rest,children)};';
  modules['lucide-react'] = 'module.exports=new Proxy({}, {get:()=>()=>null});';
  modules['@/lib/supabase/client'] = `exports.createClient=()=>({auth:{
    signUp(){window.__signupCalls++;return new Promise(resolve=>{window.__finishSignup=resolve})},
    resend(){window.__resendCalls++;return new Promise(resolve=>{window.__finishResend=resolve})}
  }});`;
  const dictionaries = Object.fromEntries(locales.map(language => [language,getTouchLineAuthCopy(language,true)]));
  modules['@/lib/touchlineArena/auth-i18n'] = `const copies=${JSON.stringify(dictionaries)};
    exports.getTouchLineAuthCopy=(locale)=>copies[locale];
    exports.normalizeTouchLineAuthLocale=(locale)=>locale==='pt-BR'?'pt-BR':'en-GB';
    exports.normalizeTouchLineLoginLocale=(locale)=>copies[locale]?locale:'en-GB';
    exports.normalizeTouchLineAuthReturnTo=()=>'/clubowner';
    exports.touchLineAuthEntryHref=(path,locale)=>path+'?lang='+locale;
    exports.touchLineAuthHref=(path,locale)=>path+'?lang='+locale;
    exports.touchLinePostAuthHref=()=>'/clubowner';`;
  modules['@/lib/touchlineArena/public-origin'] = 'exports.resolveTouchLineAuthOrigin=({currentOrigin})=>currentOrigin;';
  modules['@/lib/touchlineArena/arena-onboarding'] = 'exports.touchlineRegistrationEntryHref=()=>"/intro";';
  modules[resolve(root,'components/ui.tsx')] = `const React=require('react');
    exports.Button=({children,...props})=>React.createElement('button',props,children);
    exports.Input=(props)=>React.createElement('input',props);`;
  const entry = resolve(root,'components/auth-form.tsx');
  let code = ts.transpileModule(readFileSync(entry,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  code = code.replace(/require\("\.\/ui"\)/g,`require(${JSON.stringify(resolve(root,'components/ui.tsx'))})`);
  modules[entry] = code;
  const definitions = Object.entries(modules).map(([id,source])=>`${JSON.stringify(id)}:function(module,exports,require){${source}\n}`).join(',');
  return `<!doctype html><html lang="${locale}" dir="${locale==='ar-SA'?'rtl':'ltr'}"><head><meta charset="utf-8"></head><body><div id="root"></div><script>
    const process={env:{NODE_ENV:'development'}};const modules={${definitions}},cache={};
    function require(id){if(cache[id])return cache[id].exports;if(!modules[id])throw Error('Missing module '+id);const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}
    window.__signupCalls=0;window.__finishSignup=null;window.__resendCalls=0;window.__finishResend=null;
    require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require(${JSON.stringify(entry)}).AuthForm,{mode:'register',locale:${JSON.stringify(locale)},draftLocaleEnabled:true}));
  </script></body></html>`;
}

test('register eight-language pending/error states stay named and announced without a real signup', {skip:!enabled,timeout:90_000}, async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    for(const locale of locales) {
      const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
      const page=await context.newPage();page.setDefaultTimeout(5000);
      const errors:string[]=[],unexpected:string[]=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.origin===origin&&url.pathname==='/register'&&request.method()==='GET') {
          await route.fulfill({contentType:'text/html',body:fixtureHtml(locale)});return;
        }
        unexpected.push(`${request.method()} ${url.pathname}`);await route.abort();
      });
      try {
        await page.goto(`${origin}/register`);
        const copy=getTouchLineAuthCopy(locale,true).form;
        await page.getByRole('button',{name:copy.createAccount}).click();
        assert.equal(await page.evaluate(()=>window.__signupCalls),0,`${locale} native required validation`);
        await page.locator('[name=first_name]').fill('Test');
        await page.locator('[name=last_name]').fill('User');
        await page.locator('[name=email]').fill('invalid-address');
        await page.locator('[name=password]').fill('local-pass-123');
        await page.locator('[type=checkbox]').check();
        await page.getByRole('button',{name:copy.createAccount}).click();
        assert.equal(await page.evaluate(()=>window.__signupCalls),0,`${locale} native email validation`);
        await page.locator('[name=email]').fill('local@example.test');
        await page.locator('[type=checkbox]').uncheck();
        await page.getByRole('button',{name:copy.createAccount}).click();
        assert.equal(await page.evaluate(()=>window.__signupCalls),0,`${locale} required terms validation`);
        const password=page.locator('[name=password]');
        await page.getByRole('button',{name:copy.showPassword}).click();
        await expect(password).toHaveAttribute('type','text');
        await page.getByRole('button',{name:copy.hidePassword}).click();
        await expect(password).toHaveAttribute('type','password');
        await page.locator('[type=checkbox]').check();
        await page.getByRole('button',{name:copy.createAccount}).click();
        await expect.poll(()=>page.evaluate(()=>window.__signupCalls)).toBe(1);
        await expect(page.getByRole('button',{name:copy.createAccount})).toBeDisabled();
        await page.evaluate(()=>window.__finishSignup({data:{session:null},error:new Error('synthetic failure')}));
        await expect(page.getByRole('alert')).toHaveText(copy.genericError);
        await expect(page.getByRole('button',{name:copy.createAccount})).toBeEnabled();
        await page.getByRole('button',{name:copy.createAccount}).click();
        await expect.poll(()=>page.evaluate(()=>window.__signupCalls)).toBe(2);
        await page.evaluate(()=>window.__finishSignup({data:{session:null},error:null}));
        await expect(page.getByText('local@example.test')).toBeVisible();
        const resend=page.getByRole('button',{name:copy.resendConfirmation});
        await resend.click();
        await expect.poll(()=>page.evaluate(()=>window.__resendCalls)).toBe(1);
        await expect(resend).toBeDisabled();
        await page.evaluate(()=>window.__finishResend({error:new Error('synthetic failure')}));
        await expect(page.getByRole('status')).toHaveText(copy.confirmationResendFailed);
        await resend.click();
        await expect.poll(()=>page.evaluate(()=>window.__resendCalls)).toBe(2);
        await page.evaluate(()=>window.__finishResend({error:null}));
        await expect(page.getByRole('status')).toHaveText(copy.confirmationResent);
        await page.getByRole('button',{name:copy.useAnotherEmail}).click();
        await expect(page.getByRole('button',{name:copy.createAccount})).toBeVisible();
        await expect(page.locator('[name=password]')).toHaveValue('');
        assert.deepEqual(errors,[],`${locale} page errors`);
        assert.deepEqual(unexpected,[],`${locale} network requests`);
      } finally {await context.close();}
    }
  } finally {await browser.close();}
});
