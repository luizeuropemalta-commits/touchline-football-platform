import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Execute the actual Arena reserve branch, without starting Next or a database.
function reserveBranch(arenaOpen: boolean, showCollectionStructure: boolean, editable: boolean, ready: boolean, authority: "current" | "locked" | "locked-missing" = "current") {
  const source = readFileSync(new URL('../app/fantasy/FantasyGameweekClient.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('{arenaOpen && showCollectionStructure && (!showLockedRound || displayedReserves) ? <section');
  assert.ok(start >= 0, 'Arena must include the collection reserve bank');
  const end = source.indexOf('</section> : null}', start);
  assert.ok(end > start);
  const expression = source.slice(start + 1, end + '</section> : null'.length);
  const state = { players: [{ playerId: 'reserve-player', area: 'reserves', slot: 0 }] };
  const historicalState = { players: [{ playerId: 'historical-reserve', area: 'reserves', slot: 0 }] };
  const displayedReserves = authority === 'current' ? state : authority === 'locked' ? historicalState : null;
  const currentAvailability = [{ playerId: 'reserve-player', badge: 'injured' }];
  const catalogue = [{ id: 'reserve-player' }];
  const captures: Record<string, unknown>[] = [];
  const createElement = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => {
    if (typeof type === 'function') return type(props);
    return { type, props, children };
  };
  const compiled = ts.transpileModule(`result = (${expression});`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } });
  const context = {
    result: undefined, React: { createElement }, arenaOpen, showCollectionStructure, editable,
    showLockedRound: authority !== "current", displayedReserves, currentAvailability,
    collection: { state }, collectionSlotsEditable: ready, snapshot: { catalogue },
    locale: 'pt-BR', draftLocalesEnabled: false, collectionLayout: { outside: 'outside', arenaReserves: 'arenaReserves' },
    pitchCardWidth: 120, CLUB_RESERVE_POSITIONS: ['GK','CB','CB','RB','LB','DM','MID','RW','CF'], guidedChoice: null,
    getAllocationDialogCopy: () => ({ reserves: 'Reservas' }), chooseCollectionPlace: () => {}, setSquadSwap: () => {}, setReleasePlayerId: () => {},
    ClubOwnerCollectionSlots: (props: Record<string, unknown>) => { captures.push(props); return null; },
  };
  vm.runInNewContext(compiled.outputText, context, { timeout: 1000 });
  return { result: context.result, captures, state, historicalState, currentAvailability, catalogue };
}

test('Arena renders all nine canonical reserves from the same squad and catalogue', () => {
  const result = reserveBranch(true, true, true, true);
  assert.ok(result.result);
  assert.equal(result.captures.length, 1);
  const props = result.captures[0];
  assert.equal(props.area, 'reserves');
  assert.equal(props.count, 9);
  assert.equal(props.state, result.state);
  assert.equal(props.catalogue, result.catalogue);
  assert.equal(props.liveSeasonRating, true);
  assert.equal(props.playerAvailabilityIndicators, result.currentAvailability);
  assert.equal(props.displayWidth, 120);
  assert.equal(props.enabled, true);
});

test('Arena reserve controls stay disabled while market or collection is unavailable', () => {
  for (const [editable, ready] of [[false, true], [true, false], [false, false]]) {
    assert.equal(reserveBranch(true, true, editable, ready).captures[0].enabled, false);
  }
});

test('Arena bank does not duplicate normal ClubOwner reserves', () => {
  assert.equal(reserveBranch(false, true, true, true).result, null);
  assert.equal(reserveBranch(true, false, true, true).result, null);
});

 test('Arena locked round uses historical reserves without leaking current replacements', () => {
  const result = reserveBranch(true, true, false, true, 'locked');
  assert.equal(result.captures.length, 1);
  const props = result.captures[0];
  assert.equal(props.state, result.historicalState);
  assert.notEqual(props.state, result.state);
  assert.equal(props.catalogue, result.catalogue);
  assert.equal(props.area, 'reserves');
  assert.equal(props.count, 9);
  assert.equal(props.enabled, false);
  assert.equal(props.liveSeasonRating, true);
  assert.equal(props.displayWidth, 120);
  const missing = reserveBranch(true, true, false, true, 'locked-missing');
  assert.equal(missing.result, null, 'missing historical reserves must not invent a current bank');
  assert.equal(missing.captures.length, 0);
});
