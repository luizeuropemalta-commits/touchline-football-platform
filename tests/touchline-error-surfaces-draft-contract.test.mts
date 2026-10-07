import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const paths=['app/error.tsx','app/global-error.tsx','components/touchline/TouchlineNotFound.tsx'];
test('public wrappers export no extra Next page helpers and cannot enable internal false-default flags',()=>{
  for(const path of paths) {
    const source=readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
    const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const functions=ast.statements.filter(ts.isFunctionDeclaration);
    const publicFns=functions.filter(fn=>fn.modifiers?.some(mod=>mod.kind===ts.SyntaxKind.ExportKeyword));
    assert.equal(publicFns.length,1);
    const publicText=publicFns[0].body!.getText(ast);
    assert.doesNotMatch(publicText,/draftLocalesEnabled|\.\.\.props/);
    const internal=functions.find(fn=>!fn.modifiers?.some(mod=>mod.kind===ts.SyntaxKind.ExportKeyword))!;
    assert.match(internal.parameters[0].getText(ast),/draftLocalesEnabled = false/);
    assert.match(source,/getTouchlinePublicErrorCopy\(locale, draftLocalesEnabled\)/);
    assert.doesNotMatch(source,/error\.(?:message|stack|digest)/);
    assert.doesNotMatch(source,/localStorage\.setItem|document\.cookie|fetch\(/);
  }
});
