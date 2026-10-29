import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionStructureShown, initialCollectionCoachClub } from '../lib/touchlineFantasy/collection-empty-state.ts';

test('new enabled collection shows its structure without requiring a first contract', () => {
  assert.equal(collectionStructureShown(true, false, true), true);
  assert.equal(collectionStructureShown(true, false, false), false);
  assert.equal(collectionStructureShown(false, true, true), false);
});
test('all plans open a published coach without a Beta tier restriction', () => {
  const coaches = [
    { clubName: 'City', slot: { cardTier: 'sapphire-blue' } },
    { clubName: 'Archived', selectable: false, slot: { cardTier: 'ruby-red' } },
    { clubName: 'Hull', slot: { cardTier: 'ruby-red' } },
  ];
  assert.equal(initialCollectionCoachClub(coaches), 'City');
  assert.equal(initialCollectionCoachClub([coaches[1]]), null);
});
