import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {getTouchLineAuthCopy,getTouchLineLoginCopy,normalizeTouchLineAuthLocale,touchLineAuthEntryHref} from '../lib/touchlineArena/auth-i18n.ts';
const read = (path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('presentation opt-in preserves old getter and login catalogue, never opens operational locales',()=>{
  for(const locale of ['en-GB','pt-BR','es-ES','it-IT','fr-FR','ar-SA','tr-TR','de-DE']) {
    assert.deepEqual(getTouchLineAuthCopy(locale),getTouchLineAuthCopy(normalizeTouchLineAuthLocale(locale)));
    assert.deepEqual(getTouchLineAuthCopy(locale,true),getTouchLineLoginCopy(locale));
    const href=touchLineAuthEntryHref('/register',locale,'/clubowner?view=test');
    assert.equal(new URL(href,'https://example.test').searchParams.get('lang'),normalizeTouchLineAuthLocale(locale));
  }
});

test('three public entrypoints never pass draft opt-in and internal flags default false',()=>{
  for(const [path,name] of [['register','renderRegister'],['forgot-password','renderForgot'],['reset-password','renderResetPassword']]) {
    const source=ts.createSourceFile('page.tsx',read(`app/(auth)/${path}/page.tsx`),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const functions=source.statements.filter(ts.isFunctionDeclaration);
    const entry=functions.find(fn=>fn.modifiers?.some(mod=>mod.kind===ts.SyntaxKind.DefaultKeyword))!;
    const returns=entry.body!.statements.filter(ts.isReturnStatement);
    assert.equal(returns.length,1);
    assert.equal(returns[0].expression!.getText(source),`${name}(props, false, isTouchLineSiteLocalesEnabled("/${path}"))`);
    const internal=functions.find(fn=>fn.name?.text===name)!;
    assert.equal(internal.parameters[1].initializer!.getText(source),'false');
    assert.equal(internal.parameters[2].name.getText(source),'publicRelease');
    assert.equal(internal.parameters[2].initializer!.getText(source),'false');
    assert.equal(internal.modifiers?.some(mod=>mod.kind===ts.SyntaxKind.ExportKeyword)??false,false);
  }
});

test('auth operations use the separate public release flag; private draft remains presentation-only',()=>{
  const form=read('components/auth-form.tsx');
  const reset=read('components/reset-password-form.tsx');
  assert.match(form,/siteLocalesEnabled = false/);
  assert.match(form,/const publicSiteLocalesEnabled = siteLocalesEnabled && entryPath !== "\/admin\/login"/);
  assert.match(form,/const normalizedLocale = normalizeTouchLineAuthLocale\(locale, publicSiteLocalesEnabled\)/);
  assert.match(form,/const normalizedReturnTo = normalizeTouchLineAuthReturnTo\(returnTo, publicSiteLocalesEnabled\)/);
  assert.match(form,/touchLinePostAuthHref\(normalizedReturnTo, normalizedLocale, "\/clubowner", publicSiteLocalesEnabled\)/);
  assert.match(form,/name="locale" value=\{normalizedLocale\}/);
  assert.match(form,/emailRedirectTo: buildTouchLineAuthCallbackUrl\(firstEntryHref\)/);
  assert.match(form,/redirectTo: buildTouchLineAuthCallbackUrl\(resetPasswordHref\)/);
  assert.match(form,/body: JSON.stringify\(\{ email: normalizedEmail \}\)/);
  assert.match(reset,/body: JSON.stringify\(\{ password \}\)/);
  assert.equal((reset.match(/fetch\("\/api\/auth\/recovery"/g)||[]).length,2);
  assert.match(reset,/siteLocalesEnabled = false/);
  assert.match(reset,/const normalizedLocale = normalizeTouchLineAuthLocale\(locale, siteLocalesEnabled\)/);
  for(const source of [form,reset]) {
    assert.match(source,/getTouchLineAuthCopy\(displayLocale, draftLocaleEnabled \|\| (?:publicSiteLocalesEnabled|siteLocalesEnabled)\)\.form/);
    assert.doesNotMatch(source,/touchLine\w+Href\([^;\n]*displayLocale/);
  }
});
