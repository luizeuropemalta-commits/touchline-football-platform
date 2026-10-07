import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as copy from '../lib/touchlineArena/auth-i18n.ts';
import * as i18n from '../lib/touchlineArena/i18n.ts';

type Props = Record<string, unknown> & { children?: React.ReactNode };
type Page = (props: Props, draft?: boolean, release?: boolean) => Promise<React.ReactElement<Props>>;
const locales = ['en-GB', 'pt-BR', 'es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE'];
const empty = () => null;
const link = ({ children, ...props }: React.ComponentProps<'a'>) => React.createElement('a', props, children);

function harness(flag?: string) {
  const env = { TOUCHLINE_SITE_LOCALES_ENABLED: flag };
  function load(path: string, modules: Record<string, unknown>, appended = '') {
    const exports: Record<string, unknown> = {};
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8') + appended;
    runInNewContext(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText, { exports, process: { env }, URL, require(name: string) {
      if (name === 'react/jsx-runtime') return jsx;
      assert.ok(name in modules, `Unexpected dependency ${name}`);
      return modules[name];
    } });
    return exports;
  }
  const modules: Record<string, unknown> = {
    react: React,
    'next/navigation': { usePathname: () => '/login' },
    './SiteLocaleReleaseContext': { useSiteLocaleRelease: () => false },
    'next/link': { default: link },
    'lucide-react': new Proxy({}, { get: () => empty }),
    '@/lib/touchlineArena/auth-i18n': copy,
    '@/lib/touchlineArena/i18n': i18n,
    '@/lib/touchlineArena/site-locales-release': load('lib/touchlineArena/site-locales-release.ts', {}),
    '@/lib/touchlineArena/account-locale-context-server': { loadAccountLocaleContext: async () => ({ mode: 'guest' }) },
    '@/lib/touchlineArena/browser-storage': { writeBrowserStorage: () => { throw Error('SSR cannot persist'); } },
    '@/lib/touchlineArena/presentation-locale-intent': { rememberTouchlinePresentationLocaleIntent: () => { throw Error('SSR cannot persist'); } },
    '@/components/touchline/AccountLocaleMenu': { default: empty },
    '@/components/auth-ambient-audio': { AuthAmbientAudio: empty },
    './TouchlinePageControls.module.css': { default: { controls: 'controls' } },
    './logo': { Logo: ({ href }: Props) => React.createElement('a', { href: String(href), 'data-brand': true }) },
    './auth-cinematic-media': { AuthCinematicMedia: empty },
    './auth-league-picker': { AuthLeaguePicker: empty },
    './ui': { Button: ({ children, ...props }: React.ComponentProps<'button'>) => React.createElement('button', props, children), Input: (props: React.ComponentProps<'input'>) => React.createElement('input', props) },
    '@/lib/supabase/client': { createClient: () => { throw Error('SSR cannot authenticate'); } },
    '@/lib/touchlineArena/public-origin': { resolveTouchLineAuthOrigin: () => { throw Error('SSR cannot redirect'); } },
    '@/lib/touchlineArena/arena-onboarding': { touchlineRegistrationEntryHref: (_destination: string, locale: string) => `/intro?lang=${locale}` },
  };
  modules['@/components/auth-language-switcher'] = load('components/auth-language-switcher.tsx', modules);
  modules['./touchline/TouchlinePageControls'] = load('components/touchline/TouchlinePageControls.tsx', modules);
  modules['@/components/auth-layout'] = load('components/auth-layout.tsx', modules);
  modules['@/components/auth-form'] = load('components/auth-form.tsx', modules);
  modules['@/components/reset-password-form'] = load('components/reset-password-form.tsx', modules);
  return { page(route: string, privateName?: string) {
    return load(`app/(auth)/${route}/page.tsx`, modules, privateName ? `\nexport { ${privateName} as privateRender };` : '') as { default: Page; privateRender: Page };
  } };
}

for (const flag of [undefined, 'false', 'TRUE', 'true']) {
  test(`real public auth exports use exact server release flag ${String(flag)}`, async () => {
    const view = harness(flag);
    const released = flag === 'true';
    for (const route of ['login', 'register', 'forgot-password', 'reset-password']) {
      const page = view.page(route);
      for (const locale of locales) {
        const tree = await page.default({ searchParams: Promise.resolve({ lang: locale, returnTo: '/clubowner?view=test' }) });
        assert.equal(tree.props.siteLocalesEnabled, released);
        const expected = released || route === 'login' ? locale : copy.normalizeTouchLineAuthLocale(locale);
        assert.equal(tree.props.locale, expected);
        const html = renderToStaticMarkup(tree);
        assert.ok(html.includes(`lang="${expected}"`));
        assert.ok(html.includes(`dir="${expected === 'ar-SA' ? 'rtl' : 'ltr'}"`));
        if (released || route === 'login') assert.equal((html.match(/<option /g) ?? []).length, 8);
        else assert.equal((html.match(/<option /g) ?? []).length, 0, 'closed secondary routes retain account menu');
        const navLocale = released ? locale : copy.normalizeTouchLineAuthLocale(locale);
        if (route === 'login') {
          assert.ok(html.includes(`name="locale" value="${navLocale}"`));
          for (const destination of ['register', 'forgot-password']) {
            assert.ok(html.includes(`href="/${destination}?lang=${navLocale}&amp;returnTo=`));
          }
        } else {
          assert.ok(html.includes(`href="/login?lang=${navLocale}`));
          assert.ok(html.includes(`href="/intro?lang=${navLocale}"`), 'brand preserves operational locale');
        }
      }
    }
  });
}

test('released public routes keep protected return destinations EN/PT including normalized paths', async () => {
  const view = harness('true');
  for (const route of ['login', 'register', 'forgot-password']) {
    const page = view.page(route);
    for (const returnTo of ['/admin', '/admin/users?lang=ar-SA', '/visual-qa', '/visual-qa/locale', '/clubowner/../admin']) {
      for (const locale of ['ar-SA', 'pt-BR']) {
        const tree = await page.default({ searchParams: Promise.resolve({ lang: locale, returnTo }) });
        assert.equal(tree.props.siteLocalesEnabled, false);
        assert.equal(tree.props.locale, copy.normalizeTouchLineAuthLocale(locale));
        const html = renderToStaticMarkup(tree);
        assert.equal((html.match(/<option /g) ?? []).length, 0, 'protected returns do not expose public selector');
        if (route === 'login') assert.ok(html.includes(`name="locale" value="${copy.normalizeTouchLineAuthLocale(locale)}"`));
      }
    }
  }
});

test('private presentation seams stay default closed and cannot inherit public release from environment', async () => {
  const view = harness('true');
  for (const [route, name] of [['register', 'renderRegister'], ['forgot-password', 'renderForgot'], ['reset-password', 'renderResetPassword']]) {
    const page = view.page(route, name);
    for (const draft of [false, true]) {
      const tree = await page.privateRender({ searchParams: Promise.resolve({ lang: 'ar-SA' }) }, draft);
      assert.equal(tree.props.siteLocalesEnabled, false);
      assert.equal(tree.props.locale, draft ? 'ar-SA' : 'en-GB');
      const html = renderToStaticMarkup(tree);
      assert.ok(html.includes('href="/login?lang=en-GB"'));
      assert.ok(html.includes('href="/intro?lang=en-GB"'));
    }
  }
});
