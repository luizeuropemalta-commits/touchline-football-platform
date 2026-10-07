import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import * as resolver from '../lib/touchlineArena/catalogue-locale.ts';
import * as copy from '../lib/touchlineArena/push-rehearsal-i18n.ts';
const releasePolicy: { isTouchLineSiteLocalesEnabled?: (path?: string) => boolean } = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: releasePolicy, process: { env: {} } });


type Props={searchParams:Promise<{lang?:string|string[]}>};
type Metadata={title:string;robots:{index:boolean;follow:boolean}};
type Module={generateMetadata:(props:Props)=>Promise<Metadata>;isolated:(props:Props,draft?:boolean)=>Promise<Metadata>};
function load():Module {
  const source=readFileSync(new URL('../app/notifications/rehearsal/page.tsx',import.meta.url),'utf8');
  const fail=()=>assert.fail('metadata must not authenticate, admit, register or send');
  const dependencies:Record<string,unknown>={
    '@/lib/touchlineArena/site-locales-release':releasePolicy,
    'react/jsx-runtime':jsx,'next/headers':{headers:fail},'next/navigation':{notFound:fail},
    '@/components/touchline/notifications/TouchlinePushRehearsal':{default:fail},
    '@/lib/touchlineArena/account-locale-context-server':{loadAccountLocaleContext:fail},
    '@/lib/touchlineArena/catalogue-locale':resolver,'@/lib/touchlineArena/push-rehearsal-i18n':copy,
  };
  const exports:Record<string,unknown>={};
  runInNewContext(ts.transpileModule(source+'\nexport {rehearsalMetadata as isolated};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {exports,require(name:string){assert.ok(name in dependencies,name);return dependencies[name];}});
  return exports as Module;
}
test('rehearsal metadata preserves exact public default and noindex while isolated titles use all eight catalogues',async()=>{
  const loaded=load();
  for(const locale of ['en-GB','pt-BR','es-ES','it-IT','fr-FR','ar-SA','tr-TR','de-DE','invalid','__proto__']) {
    const props={searchParams:Promise.resolve({lang:locale})};
    for(const metadata of [await loaded.generateMetadata(props),await loaded.isolated(props)]) {
      assert.equal(metadata.title,'TouchLine · Notification test');
      assert.equal(metadata.robots.index,false);assert.equal(metadata.robots.follow,false);
    }
    const metadata=await loaded.isolated(props,true);
    assert.equal(metadata.title,`TouchLine · ${copy.getTouchlinePushRehearsalCopy(locale,true).pageTitle}`);
    assert.equal(metadata.robots.index,false);assert.equal(metadata.robots.follow,false);
  }
});
test('isolated metadata follows first language query and empty query falls back without operational access',async()=>{
  const loaded=load();
  for(const [lang,expected] of [[['ar-SA','pt-BR'],'ar-SA'],[['pt-BR','ar-SA'],'pt-BR'],[[],'en-GB']] as const) {
    const metadata=await loaded.isolated({searchParams:Promise.resolve({lang:[...lang]})},true);
    assert.equal(metadata.title,`TouchLine · ${copy.getTouchlinePushRehearsalCopy(expected,true).pageTitle}`);
  }
});
