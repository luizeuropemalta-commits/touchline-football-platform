import assert from 'node:assert/strict';
import test from 'node:test';
import { publicationBindingIssue as check } from '../lib/touchlineArena/card-publication-integrity.ts';
const base = { publicationMembershipId: 'old', currentClubId: 'club', activeMemberships: [{ id: 'new', club_id: 'club' }] };
test('transferred player with complete editorial data still needs publication reconciliation', () => {
  assert.equal(check(base), 'STALE_PUBLICATION');
  assert.equal(check({ ...base, publicationMembershipId: 'new' }), null);
});
test('no active, ambiguous and foreign-club memberships cannot be automatically reconciled', () => {
  assert.equal(check({ ...base, activeMemberships: [] }), 'NO_ACTIVE_MEMBERSHIP');
  assert.equal(check({ ...base, activeMemberships: [...base.activeMemberships, ...base.activeMemberships] }), 'AMBIGUOUS_MEMBERSHIP');
  assert.equal(check({ ...base, currentClubId: 'other' }), 'CLUB_MISMATCH');
  assert.equal(check({ ...base, currentClubId: null }), 'CLUB_MISMATCH');
});
