import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { touchlineArenaPanelHref } from '../lib/touchlineArena/arena-navigation.ts';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = ts.createSourceFile('FantasyGameweekClient.tsx', read('app/fantasy/FantasyGameweekClient.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function nodes(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node[] {
  const matches: ts.Node[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) matches.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return matches;
}
function declaration(name: string) {
  const found = nodes(source, node => ts.isVariableDeclaration(node) && node.name.getText(source) === name);
  assert.equal(found.length, 1, name);
  return found[0] as ts.VariableDeclaration;
}
function attribute(element: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string) {
  return element.attributes.properties.find(property => ts.isJsxAttribute(property) && property.name.getText() === name) as ts.JsxAttribute | undefined;
}

test('public Market helper enters ClubOwner, never another market page, panel or hash', () => {
  for (const locale of ['pt-BR', 'en-GB', 'es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE']) {
    const href = touchlineArenaPanelHref('market', locale);
    const url = new URL(href, 'https://touchline.invalid');
    assert.equal(url.pathname, '/clubowner');
    assert.equal(url.hash, '');
    assert.deepEqual([...url.searchParams.keys()], ['lang']);
    assert.ok(url.searchParams.get('lang'));
  }
  const page = ts.createSourceFile('page.tsx', read('app/clubowner/page.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const clients = nodes(page, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(page) === 'FantasyGameweekClient') as ts.JsxSelfClosingElement[];
  assert.equal(clients.length, 1);
  for (const prop of ['embedded', 'marketPage']) {
    const value = attribute(clients[0], prop);
    assert.ok(value, prop);
    assert.equal(value.initializer, undefined, `${prop} is true`);
  }
});

test('inline Market is a direct unconditional child after the setup/XI branch, not a tab', () => {
  const sections = nodes(source, node => ts.isJsxElement(node)
    && attribute(node.openingElement, 'id')?.initializer?.getText(source) === '"my-club-player-selection"') as ts.JsxElement[];
  assert.equal(sections.length, 1);
  const market = sections[0];
  assert.ok(ts.isJsxElement(market.parent), 'not wrapped in an if, conditional, expression or hidden tab');
  const root = market.parent as ts.JsxElement;
  assert.equal(root.openingElement.tagName.getText(source), 'section');
  assert.equal(attribute(market.openingElement, 'data-open')?.initializer?.getText(source), '"true"');
  assert.equal(attribute(market.openingElement, 'data-inline-selection')?.initializer?.getText(source), '"true"');
  assert.equal(attribute(market.openingElement, 'hidden'), undefined);
  const earlier = root.children.slice(0, root.children.indexOf(market));
  const setup = earlier.find(node => ts.isJsxExpression(node) && node.expression
    && ts.isConditionalExpression(node.expression) && node.expression.condition.getText(source) === '!selectedCoach');
  assert.ok(setup, 'coach/formation/XI branch precedes, rather than encloses, the Market');
  assert.ok(ts.isReturnStatement(root.parent));
  const embedded = root.parent.parent.parent;
  assert.ok(ts.isIfStatement(embedded));
  assert.equal(embedded.expression.getText(source), 'embedded');
  const unavailable = nodes(source, node => ts.isIfStatement(node) && node.expression.getText(source) === '!snapshot')[0];
  assert.ok(unavailable && unavailable.pos < embedded.pos, 'missing snapshot remains unavailable');
  const filter = declaration('browseCards');
  const branch = nodes(filter, node => ts.isConditionalExpression(node) && node.condition.getText(source) === 'marketPage')[0] as ts.ConditionalExpression;
  assert.ok(branch, 'real market filter remains position-led');
  assert.equal(branch.whenTrue.getText(source), 'Boolean(activeSlot) && slotAccepts(activeSlot, card)');
});

test('real slot selection focuses and scrolls in place; adding a player returns to the same XI', () => {
  const scroll = nodes(source, node => ts.isFunctionDeclaration(node) && node.name?.text === 'scrollToLineupSection')[0];
  assert.ok(scroll);
  const open = declaration('openTacticalSelector');
  const select = declaration('selectMyClubPlayer');
  const code = ts.transpileModule(`${scroll.getText(source)}\nconst open=${open.initializer!.getText(source)};\nconst select=${select.initializer!.getText(source)};\n({open,select})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  for (const reduced of [false, true]) {
    const events: unknown[][] = [];
    let addSucceeds = true;
    const record = (name: string) => (value: unknown) => events.push([name, value]);
    const { open: openSlot, select: selectPlayer } = runInNewContext(code, {
      setActiveSlotId: record('slot'), setBrowsePosition: record('browse'), setVisibleStep: record('step'),
      setSquadView: record('view'), setQuery: record('query'), activeSlot: { id: 'GK' }, marketPage: true,
      addPlayer: () => addSucceeds,
      // No router, location or navigation mock: a new route dependency fails.
      window: { requestAnimationFrame: (fn: () => void) => fn(), matchMedia: () => ({ matches: reduced }) },
      document: { getElementById: (id: string) => ({
        focus: (options: { preventScroll: boolean }) => events.push(['focus', id, options.preventScroll]),
        scrollIntoView: (options: { behavior: string; block: string }) => events.push(['scroll', id, options.behavior, options.block]),
      }) },
    });
    openSlot('GK');
    assert.deepEqual(events, [
      ['slot','GK'], ['browse',null], ['step','players'], ['view','tactical'], ['query',''],
      ['focus','my-club-player-selection',true], ['scroll','my-club-player-selection',reduced ? 'instant' : 'smooth','start'],
    ]);
    events.length = 0;
    selectPlayer({ id: 'canonical-player' });
    assert.deepEqual(events, [['browse',null], ['view','tactical'], ['focus','my-club-xi-pitch',true], ['scroll','my-club-xi-pitch',reduced ? 'instant' : 'smooth','start']]);
    events.length = 0;
    addSucceeds = false;
    selectPlayer({ id: 'rejected-player' });
    assert.deepEqual(events, [], 'failed selection never moves focus or navigates');
  }
});
