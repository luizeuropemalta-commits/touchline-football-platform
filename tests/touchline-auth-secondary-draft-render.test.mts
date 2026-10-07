import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as copy from '../lib/touchlineArena/auth-i18n.ts';

const locales = ['en-GB','pt-BR','es-ES','it-IT','fr-FR','ar-SA','tr-TR','de-DE'];
const empty = () => null;
const link = ({children, ...props}: React.ComponentProps<'a'>) => React.createElement('a', props, children);
type CapturedProps = Record<string, unknown> & { children?: React.ReactNode };
type PageRenderer = (props: CapturedProps, draft?: boolean) => Promise<React.ReactElement<CapturedProps>>;
type VmExports = { default: PageRenderer; isolatedRender: PageRenderer; AuthForm: React.ComponentType<CapturedProps>; ResetPasswordForm: React.ComponentType<CapturedProps> };
function load(path: string, modules: Record<string, unknown>, appended = '') {
  const exports = {} as VmExports;
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8') + appended;
  runInNewContext(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText, {
    exports, process: {env:{}}, require(name: string) {
      if (name === 'react/jsx-runtime') return jsx;
      assert.ok(name in modules, `Unexpected dependency ${name}`); return modules[name];
    },
  });
  return exports;
}

for (const [route, renderer, section] of [['register','renderRegister','register'],['forgot-password','renderForgot','forgot'],['reset-password','renderResetPassword','reset']] as const) {
  test(`${route}: real page defaults closed, isolated eight-language presentation preserves auth context and returnTo`, async () => {
    let reads = 0;
    const context = {mode:'guest'};
    const layout = empty;
    const form = () => null;
    const page = load(`app/(auth)/${route}/page.tsx`, {
      'next/link':{default:link}, 'lucide-react':{ArrowLeft:empty,FlaskConical:empty},
      '@/components/auth-layout':{AuthLayout:layout}, '@/components/auth-form':{AuthForm:form},
      '@/components/reset-password-form':{ResetPasswordForm:form}, '@/lib/touchlineArena/auth-i18n':copy,
      '@/lib/touchlineArena/site-locales-release':load('lib/touchlineArena/site-locales-release.ts',{}),
      '@/lib/touchlineArena/account-locale-context-server':{loadAccountLocaleContext:async()=>{reads++; return context;}},
    }, `\nexport { ${renderer} as isolatedRender };`);
    for (const locale of locales) for (const draft of [false,true]) {
      const before = reads;
      const props = {searchParams:Promise.resolve({lang:locale,returnTo:'/clubowner?view=test'})};
      const tree = draft ? await page.isolatedRender(props,true) : await page.default(props);
      const effective = draft ? locale : copy.normalizeTouchLineAuthLocale(locale);
      assert.equal(reads,before+1);
      assert.equal(tree.type,layout);
      assert.equal(tree.props.accountLocaleContext,context);
      assert.equal(tree.props.locale,effective);
      assert.equal(tree.props.draftLocalesEnabled,draft);
      assert.equal(tree.props.siteLocalesEnabled,false);
      assert.equal(tree.props.keepLoginLayoutStable,true);
      assert.equal(tree.props.brandSubtitle,'TouchLine Futebol Cards');
      const children = React.Children.toArray(tree.props.children).filter((child): child is React.ReactElement<CapturedProps> => React.isValidElement<CapturedProps>(child));
      const forms = children.filter(child=>child.type===form);
      assert.equal(forms.length,1);
      assert.equal(forms[0].props.draftLocaleEnabled,draft);
      assert.equal(forms[0].props.siteLocalesEnabled,false);
      assert.equal(forms[0].props.locale,effective);
      if (route!=='reset-password') assert.equal(forms[0].props.returnTo,'/clubowner?view=test');
      const heading = children.find(child=>child.type==='h1');
      assert.equal(heading?.props.children,copy.getTouchLineAuthCopy(locale,draft)[section].title);
      if (route === 'register') {
        const betaTitle = renderToStaticMarkup(React.createElement(React.Fragment, null, copy.getTouchLineAuthCopy(locale, draft).register.betaTitle));
        const banners = children.filter(child => child.type === 'div' && renderToStaticMarkup(child).includes(betaTitle));
        assert.equal(banners.length, 1, 'identify the real beta notice by its localized title');
        assert.match(String(banners[0].props.className), /\btext-start\b/, 'notice follows inherited LTR or RTL direction');
        assert.doesNotMatch(String(banners[0].props.className), /\btext-(?:left|right)\b/, 'no physical alignment override');
      }
      const html = renderToStaticMarkup(React.createElement(React.Fragment,null,...children));
      assert.ok(html.includes('href="/login?lang='));
      assert.ok(!html.includes(`lang=${locale}`) || ['en-GB','pt-BR'].includes(locale), 'draft must not widen auth navigation');
    }
  });
}

test('real AuthForm register/forgot and ResetPasswordForm checking state consume opted-in dictionaries', () => {
  const ui = {Button:({children,...props}:React.ComponentProps<'button'>)=>React.createElement('button',props,children),Input:(props:React.ComponentProps<'input'>)=>React.createElement('input',props)};
  const modules = {
    react:React,'next/link':{default:link},'lucide-react':{ArrowRight:empty,Check:empty,Eye:empty,EyeOff:empty,Loader2:empty,Mail:empty},
    '@/lib/touchlineArena/auth-i18n':copy,'./ui':ui,
    '@/lib/supabase/client':{createClient:()=>{throw Error('SSR must not authenticate');}},
    '@/lib/touchlineArena/public-origin':{resolveTouchLineAuthOrigin:()=>{throw Error('SSR must not redirect');}},
    '@/lib/touchlineArena/arena-onboarding':{touchlineRegistrationEntryHref:(_destination:string,locale:string)=>`/intro?lang=${locale}`},
  };
  const {AuthForm} = load('components/auth-form.tsx',modules);
  const {ResetPasswordForm} = load('components/reset-password-form.tsx',modules);
  for (const locale of locales) {
    const released = renderToStaticMarkup(React.createElement(AuthForm, {mode:'register', locale, siteLocalesEnabled:true}));
    assert.ok(released.includes(copy.getTouchLineAuthCopy(locale,true).form.firstName), 'public release enables translated copy without a private draft flag');
    const html = renderToStaticMarkup(React.createElement(AuthForm, {mode:'login', locale, draftLocaleEnabled:true, siteLocalesEnabled:true}));
    assert.ok(html.includes(`href="/register?lang=${locale}"`), 'released signup link preserves selected locale');
    assert.ok(html.includes(`href="/forgot-password?lang=${locale}"`), 'released recovery link preserves selected locale');
    assert.ok(html.includes(`name="locale" value="${locale}"`), 'native login receives released locale');
    const admin = renderToStaticMarkup(React.createElement(AuthForm, {mode:'login', locale, entryPath:'/admin/login', siteLocalesEnabled:true}));
    assert.ok(admin.includes(`name="locale" value="${locale === 'pt-BR' ? 'pt-BR' : 'en-GB'}"`), 'admin remains EN/PT');
  }
  for (const locale of locales) for (const draft of [false,true]) {
    const text = copy.getTouchLineAuthCopy(locale,draft).form;
    for (const mode of ['register','forgot']) {
      const html = renderToStaticMarkup(React.createElement(AuthForm,{mode,locale,draftLocaleEnabled:draft}));
      assert.ok(html.includes(text.email));
      if(mode==='register') assert.ok(html.includes(text.firstName));
      assert.ok(html.includes('name="email"'));
    }
    const reset = renderToStaticMarkup(React.createElement(ResetPasswordForm,{locale,draftLocaleEnabled:draft}));
    assert.ok(reset.includes(text.recoveryChecking));
    assert.ok(reset.includes('role="status"'));
  }
});
