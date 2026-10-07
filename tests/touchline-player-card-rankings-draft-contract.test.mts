import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../app/touchline-player-card-rankings/page.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);

test('public wrapper cannot enable drafts; ranking and data authority remain intact',()=>{
  const functions=ast.statements.filter(ts.isFunctionDeclaration);
  const entry=functions.find(fn=>fn.modifiers?.some(mod=>mod.kind===ts.SyntaxKind.DefaultKeyword))!;
  assert.equal(entry.body!.statements.filter(ts.isReturnStatement)[0].expression!.getText(ast),'renderPlayerCardRankings(props, isTouchLineSiteLocalesEnabled("/touchline-player-card-rankings"))');
  const renderer=functions.find(fn=>fn.name?.text==='renderPlayerCardRankings')!;
  assert.equal(renderer.parameters[1].initializer!.getText(ast),'false');
  const contractCalls: ts.CallExpression[] = [];
  function inspectCalls(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'touchlineArenaContractHref') contractCalls.push(node);
    ts.forEachChild(node, inspectCalls);
  }
  inspectCalls(ast);
  assert.equal(contractCalls.length, 2);
  for (const call of contractCalls) assert.equal(call.arguments[1]?.getText(ast), 'draftLocalesEnabled');
  for(const expression of ['rosterCards.sort(compareTouchLineRankedCards)','rankedCards.slice(0, 3)','rankedCards.slice(0, 20)','totalRatings.toFixed(2)','activeContractPrice: undefined','activeContractCard: null']) assert.ok(source.includes(expression),expression);
  assert.equal((source.match(/supabase.auth.getUser\(\)/g)||[]).length,1);
  assert.match(source,/if \(!result.ok\) throw result.error/);
  assert.equal((source.match(/<TouchlineBrandHeader\b/g)||[]).length,1);
  assert.match(source,/<TouchlineGlobalNavigation\s+showAudioControl=\{false\}/);
  assert.match(source,/\.tl-card-rankings-content\s*\{\s*padding: 42px 5vw 68px;/);
  assert.match(source,/\.tl-card-rankings-content\s*\{\s*padding: 26px 16px 42px;/);
  assert.doesNotMatch(source,/getAccountLocaleContext|readAccountLocale/);
  assert.doesNotMatch(source,/\.tl-card-rankings\s+(?:span|h1|p|a)\s*[,\{]/);
});

test('every authored card and zoom boundary carries opt-in and presentation helpers receive it',()=>{
  const counts:Record<string,number>={};
  function visit(node:ts.Node) {
    if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)) {
      const tag=node.tagName.getText(ast);
      if(['TouchlineEliteExactCard','TouchlineCardZoom','TouchlineGlobalNavigation'].includes(tag)) {
        counts[tag]=(counts[tag]||0)+1;
        const attrs=node.attributes.properties.filter(ts.isJsxAttribute);
        const flag=attrs.find(attr=>attr.name.getText(ast)==='draftLocalesEnabled');
        assert.equal(flag?.initializer?.getText(ast),'{draftLocalesEnabled}');
        if(tag==='TouchlineEliteExactCard') assert.equal(attrs.find(attr=>attr.name.getText(ast)==='runtimeLocaleOverride')?.initializer?.getText(ast),'{locale}');
      }
    }
    node.forEachChild(visit);
  }
  visit(ast);
  assert.deepEqual(counts,{TouchlineGlobalNavigation:1,TouchlineCardZoom:2,TouchlineEliteExactCard:4});
  for(const getter of ['getTouchlineCardZoomCopy','getTouchlineExactCardCopy','getTouchLineRankingsCopy']) assert.ok(source.includes(`${getter}(locale, draftLocalesEnabled)`));
  assert.match(source,/touchlineCardTierName\(presentation.tierKey, locale, draftLocalesEnabled\)/);
  assert.equal((source.match(/localizedPositionLabel\(card.position, locale, draftLocalesEnabled\)/g)||[]).length,2);
  assert.match(source,/buildTouchlinePlayerCardZoomDetails\(\{\s*locale,\s*draftLocalesEnabled,/);
  assert.match(source,/buildTouchlineVerifiedMatchFactFields\(\{[\s\S]*?\}, locale, draftLocalesEnabled\)/);
});
