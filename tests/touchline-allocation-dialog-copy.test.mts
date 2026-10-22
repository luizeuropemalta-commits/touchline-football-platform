import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALLOCATION_DIALOG_KEYS, ALLOCATION_DIALOG_ROWS, getAllocationDialogCopy } from '../lib/touchlineFantasy/allocation-dialog-i18n.ts';
test('allocation dialog copy has eight gated complete vocabularies without interpolated business values', () => {
  const locales = ['en-GB', 'pt-BR', 'es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE'];
  assert.deepEqual(Object.keys(ALLOCATION_DIALOG_ROWS), locales);
  for (const locale of locales) {
    const copy = getAllocationDialogCopy(locale, true);
    assert.deepEqual(Object.keys(copy), [...ALLOCATION_DIALOG_KEYS]);
    assert.equal(ALLOCATION_DIALOG_ROWS[locale as keyof typeof ALLOCATION_DIALOG_ROWS].length, ALLOCATION_DIALOG_KEYS.length);
    for (const value of Object.values(copy)) { assert.ok(value.trim()); assert.doesNotMatch(value, /TODO|FIXME|https?:|\{[^}]*\}/); }
    if (!['en-GB', 'pt-BR'].includes(locale)) assert.equal(getAllocationDialogCopy(locale), getAllocationDialogCopy('en-GB'));
  }
  assert.equal(getAllocationDialogCopy('unknown', true), getAllocationDialogCopy('en-GB'));
  assert.equal(getAllocationDialogCopy('pt-PT'), getAllocationDialogCopy('pt-BR'));
  assert.equal(getAllocationDialogCopy('pt-BR').placementInstruction, 'Escolha uma posição compatível. Esta alteração não muda contratos nem saldo. Se a vaga estiver ocupada, os jogadores trocam de lugar no elenco.');
  assert.equal(getAllocationDialogCopy('en-GB').placementInstruction, 'Choose a compatible position. Contracts and balance stay unchanged. If the position is occupied, the players exchange places in your squad.');
  assert.equal(getAllocationDialogCopy('pt-BR').swapInstruction, 'Só muda os lugares no elenco. Contratos e saldo não mudam.');
  assert.equal(getAllocationDialogCopy('en-GB').swapInstruction, 'Only squad places change. Contracts and balance stay unchanged.');
});
test('allocation presentation opt-in leaves revision, busy, eligibility and callbacks intact', () => {
  // Static contract only; does not move players or exercise browser actions.
  const source = readFileSync(new URL('../components/touchline/fantasy/ClubOwnerCollectionSlots.tsx', import.meta.url), 'utf8');
  const part = (name: string) => { const start = source.indexOf(`export function ${name}`); const end = source.indexOf('\n}\n', start); assert.ok(start >= 0 && end > start); return source.slice(start, end); };
  const swap = part('ClubOwnerSquadSwapDialog');
  const placement = part('ClubOwnerPlayerPlacementDialog');
  for (const component of [swap, placement]) {
    assert.ok(component.includes('draftLocalesEnabled = false'));
    assert.ok(component.includes('const copy = getAllocationDialogCopy(locale, draftLocalesEnabled);'));
    assert.doesNotMatch(component, /locale\.startsWith/);
    assert.ok(component.includes('if (!busy && !sending.current) onClose();'));
    assert.ok(component.includes('expectedRevision: state.revision'));
    assert.ok(component.includes('sending.current = true;'));
    assert.ok(component.includes('finally { sending.current = false; }'));
    assert.ok(component.includes('previewPlannedClubAllocation'));
  }
  assert.ok(swap.includes('if (busy || !enabled || sending.current || choice.revision !== state.revision || !valid(choice.playerId, choice.destination)) return;'));
  assert.ok(swap.includes('if (await onMove(choice.playerId, choice.destination)) onClose();'));
  assert.ok(placement.includes('if (busy || !enabled || sending.current || chosen.revision !== state.revision || !options.some(option => option.slot === chosen.slot)) return;'));
  assert.ok(placement.includes('if (await onMove(chosen.slot)) onClose();'));
  const parent = readFileSync(new URL('../app/fantasy/FantasyGameweekClient.tsx', import.meta.url), 'utf8');
  for (const name of ['ClubOwnerSquadSwapDialog', 'ClubOwnerPlayerPlacementDialog']) {
    const start = parent.indexOf(`<${name}`), end = parent.indexOf('/>', start);
    assert.ok(start >= 0 && end > start);
    assert.ok(parent.slice(start, end).includes('draftLocalesEnabled={draftLocalesEnabled}'));
  }
});
