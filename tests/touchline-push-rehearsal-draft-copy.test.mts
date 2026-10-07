import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {getTouchlinePushRehearsalCopy,TOUCHLINE_PUSH_REHEARSAL_DRAFT_STATUS} from '../lib/touchlineArena/push-rehearsal-i18n.ts';
const phases=['idle','preparing','ready','registered-disabled','sending','accepted','unconfirmed','blocked','permission','unsupported','unconfigured','storage','previous'];
const locales=['en-GB','pt-BR','es-ES','it-IT','fr-FR','ar-SA','tr-TR','de-DE'];
test('all rehearsal phases and seven UI labels have eight catalogues, while defaults remain EN/PT',()=>{
  assert.equal(TOUCHLINE_PUSH_REHEARSAL_DRAFT_STATUS,'draft');
  const keys=[...phases,'pageTitle','pageDescription','title','description','prepare','consent','send'].sort();
  for(const locale of locales) {
    const copy=getTouchlinePushRehearsalCopy(locale,true);
    assert.deepEqual(Object.keys(copy).sort(),keys);
    for(const value of Object.values(copy))assert.ok(value.trim());
    assert.deepEqual(getTouchlinePushRehearsalCopy(locale),getTouchlinePushRehearsalCopy(locale==='pt-BR'?'pt-BR':'en-GB',true));
  }
  assert.equal(getTouchlinePushRehearsalCopy('en-GB').accepted,'Accepted by the push provider. This does not confirm receipt on your device.');
  assert.equal(getTouchlinePushRehearsalCopy('pt-BR').accepted,'Aceito pelo provedor de push. Isso não confirma o recebimento no aparelho.');
  assert.match(getTouchlinePushRehearsalCopy('en-GB').unconfirmed,/no automatic retry/);
  assert.match(getTouchlinePushRehearsalCopy('pt-BR').consent,/um único TESTE/);
  for(const locale of ['constructor','__proto__',''])assert.equal(getTouchlinePushRehearsalCopy(locale,true),getTouchlinePushRehearsalCopy('en-GB'));
});
test('admission and permission/registration/consent/send lifecycle retain exact pre-localization bytes',()=>{
  const source=readFileSync(new URL('../components/touchline/notifications/TouchlinePushRehearsal.tsx',import.meta.url),'utf8');
  const ast=ts.createSourceFile('component.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const expected:Record<string,string>={waitPermission:'46e842a35a566612b0d296f23be864be122f3f82a767bbf43fd8c2aba688b430',useLayoutEffect:'ee5fc8cc49e72ce97f8e678186ed2a8e15b6183a45441f1db075a48028e59450',prepare:'1d809a2256b6fb32c3681c9eb3aaed3667f2307003a0df1ad28cef1b5a4380da',changeConsent:'ec308e8a3546bb7704fd6683195c3d44e3eeaee4fdeea436a5b4ca37d131df32',send:'7ce19733530d2a3e391df1dd5e1f7fdc58eab1eae9f2dce1c35fe404b00d9e21'};
  const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
  const observed:Record<string,string>={};
  function visit(node:ts.Node) {
    if(ts.isFunctionDeclaration(node)&&node.name&&node.name.text in expected)observed[node.name.text]=hash(node.getText(ast));
    if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useLayoutEffect')observed.useLayoutEffect=hash(node.getText(ast));
    node.forEachChild(visit);
  }
  visit(ast);assert.deepEqual(observed,expected);
  const page=readFileSync(new URL('../app/notifications/rehearsal/page.tsx',import.meta.url),'utf8');
  const pageAst=ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const renderers=pageAst.statements.filter((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==='renderPushRehearsalPage');
  assert.equal(renderers.length,1);
  const render=renderers[0].getText(pageAst);
  const admissionStart=render.indexOf('  const env =');
  const admissionEnd=render.indexOf('  const requestedLocale =');
  assert.ok(admissionStart>=0&&admissionEnd>admissionStart);
  assert.equal(hash(render.slice(admissionStart,admissionEnd)),'7c5bfcc930be9f07b904d5c1b2ad07a4d67e15ee33082a6ecf9a4369d69b454f');
  assert.match(page,/return renderPushRehearsalPage\(props, isTouchLineSiteLocalesEnabled\("\/notifications\/rehearsal"\)\)/);
  assert.match(page,/draftLocalesEnabled = false/);
  assert.match(source,/disabled=\{phase !== "ready" \|\| !consent\}/);
  assert.match(source,/role="status" aria-live="polite"/);
});
