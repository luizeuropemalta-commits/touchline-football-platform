import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

test('Live places exactly one shared language control in the main header, not the navigation toolbar', () => {
  const source = ts.createSourceFile('Live.tsx', readFileSync(new URL('../components/touchline/match-centre/TouchlineMatchCentre.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let count = 0;
  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'TouchlinePageControls') {
      count++;
      let ancestor = node.parent;
      const containers: string[] = [];
      while (ancestor) {
        if (ts.isJsxElement(ancestor)) containers.push(ancestor.openingElement.tagName.getText(source));
        ancestor = ancestor.parent;
      }
      assert.ok(containers.includes('header'), 'language controls must live in the top header');
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(count, 1);
});
