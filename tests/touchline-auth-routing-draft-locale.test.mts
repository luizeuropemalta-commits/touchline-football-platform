import assert from 'node:assert/strict';
import test from 'node:test';
import * as auth from '../lib/touchlineArena/auth-i18n.ts';

// Future optional arguments call the actual existing functions; no mock locale
// implementation. Before the seam exists these assertions expose lost drafts.
const normalize:(locale?:string|null,draft?:boolean)=>string=auth.normalizeTouchLineAuthLocale;
const href:(path:string,locale?:string|null,draft?:boolean)=>string=auth.touchLineAuthHref;
const returnTo:(path?:string|null,draft?:boolean)=>string|null=auth.normalizeTouchLineAuthReturnTo;
const post:(path:string|null|undefined,locale?:string|null,fallback?:string,draft?:boolean)=>string=auth.touchLinePostAuthHref;
const entry:(path:string,locale?:string|null,next?:string|null,draft?:boolean)=>string=auth.touchLineAuthEntryHref;
const locales=['en-GB','pt-BR','es-ES','it-IT','fr-FR','ar-SA','tr-TR','de-DE'];
const base='https://touchline.test';

test('auth route helpers retain eight exact locales only with trusted explicit opt-in',()=>{
  for(const locale of locales)for(const draft of [false,true]){
    const expected=draft?locale:locale==='pt-BR'?'pt-BR':'en-GB';
    assert.equal(normalize(locale,draft),expected);
    assert.equal(href('/login?error=1',locale,draft),`/login?error=1&lang=${expected}`);
    assert.equal(returnTo(`/arena/bench?lang=${locale}&owner=foreign#private`,draft),`/clubowner?lang=${expected}`);
    assert.equal(post('/arena?owner=foreign',locale,undefined,draft),`/clubowner?lang=${expected}`);
    assert.equal(post(undefined,locale,undefined,draft),`/clubowner?lang=${expected}`);
    const destination=new URL(entry('/login',locale,`/club-owner/other/substitution?lang=${locale}&owner=foreign#private`,draft),base);
    assert.equal(destination.pathname,'/login');assert.equal(destination.searchParams.get('lang'),expected);
    assert.equal(destination.searchParams.get('returnTo'),`/clubowner?lang=${expected}`);
  }
});

test('omitted gate and query lookalikes preserve public EN/PT and cannot authorize drafts',()=>{
  for(const locale of locales){
    const expected=locale==='pt-BR'?'pt-BR':'en-GB';
    assert.equal(normalize(locale),expected);
    assert.equal(href('/login?draftLocalesEnabled=true',locale),`/login?draftLocalesEnabled=true&lang=${expected}`);
    assert.equal(returnTo(`/arena?lang=${locale}&draftLocalesEnabled=true`),`/clubowner?lang=${expected}`);
    assert.equal(post('/arena?lang=ar-SA&draftLocalesEnabled=true',locale),`/clubowner?lang=${expected}`);
  }
  for(const locale of ['AR-SA','ar','unknown','__proto__','',null,undefined]){
    assert.equal(normalize(locale,true),'en-GB');assert.equal(normalize(locale),'en-GB');
  }
});

test('returnTo allowlist, official destination and permitted query/hash contracts remain unchanged',()=>{
  for(const draft of [false,true]){
    for(const unsafe of ['https://evil.test/x','//evil.test/x','/\\evil.test/x','/login','/arena\n?lang=ar-SA','/arena\u007f']){
      assert.equal(returnTo(unsafe,draft),null);
      assert.equal(post(unsafe,'pt-BR',undefined,draft),'/clubowner?lang=pt-BR');
    }
    for(const allowed of ['/my-club?lang=ar-SA&tab=history#official','/clubowner?contractPlayer=10&lang=ar-SA','/inbox?lang=fr-FR#read','/admin/finance?lang=pt-BR']){
      assert.equal(returnTo(allowed,draft),allowed,'existing permitted queries are not blanket-normalized');
    }
    assert.equal(returnTo('/arena?intro=first&lang=ar-SA',draft),'/intro?intro=first&lang=ar-SA');
    assert.equal(post('/my-club?tab=history#official','fr-FR',undefined,draft),`/my-club?tab=history&lang=${draft?'fr-FR':'en-GB'}#official`);
  }
  assert.equal(auth.normalizeTouchLineAdminReturnTo('/admin/finance?lang=ar-SA'),'/admin/finance?lang=ar-SA');
  assert.equal(auth.normalizeTouchLineAdminReturnTo('/arena?lang=ar-SA'),'/admin');
});
