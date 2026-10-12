import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

test('Live places exactly one shared language control in the main header, not the navigation toolbar', () => {
  const source = ts.createSourceFile('Live.tsx', readFileSync(new URL('../components/touchline/match-centre/TouchlineMatchCentre.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let count = 0;
  const header = ts.createSourceFile('Header.tsx', readFileSync(new URL('../components/touchline/TouchlineBrandHeader.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let sharedHeaders = 0;
  function countHeader(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'TouchlineBrandHeader') sharedHeaders++;
    ts.forEachChild(node, countHeader);
  }
  countHeader(source);
  assert.equal(sharedHeaders, 1);
  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(header) === 'TouchlinePageControls') {
      count++;
      let ancestor = node.parent;
      const containers: string[] = [];
      while (ancestor) {
        if (ts.isJsxElement(ancestor)) containers.push(ancestor.openingElement.tagName.getText(header));
        ancestor = ancestor.parent;
      }
      assert.ok(containers.includes('header'), 'language controls must live in the top header');
    }
    ts.forEachChild(node, visit);
  }
  visit(header);
  assert.equal(count, 1);
});
