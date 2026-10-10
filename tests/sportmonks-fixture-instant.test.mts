import assert from 'node:assert/strict';
import test from 'node:test';
import { sportmonksFixtureInstant as instant } from '../lib/football-data/sportmonks-fixture-instant.ts';

test('epoch seconds override localized strings and host timezone', () => {
  const epoch = Date.parse('2026-10-10T11:30:00.000Z') / 1000;
  const old = process.env.TZ;
  try {
    for (const zone of ['UTC', 'Europe/Malta', 'America/Sao_Paulo']) {
      process.env.TZ = zone;
      assert.equal(instant({ starting_at_timestamp: epoch, starting_at: '2026-10-10 13:30:00' }), '2026-10-10T11:30:00.000Z');
      assert.equal(instant({ starting_at: '2026-10-10 11:30:00' }), '2026-10-10T11:30:00.000Z');
    }
  } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
});
test('request timezone fallback preserves the same instant, including half-hour and quarter-hour offsets', () => {
  for (const [time, zone] of [['12:30:00', 'Europe/London'], ['13:30:00', 'Europe/Malta'],
    ['08:30:00', 'America/Sao_Paulo'], ['17:00:00', 'Asia/Kolkata'], ['17:15:00', 'Asia/Kathmandu']]) {
    assert.equal(instant({ starting_at: `2026-10-10 ${time}` }, zone), '2026-10-10T11:30:00.000Z');
  }
  assert.equal(instant({ starting_at: '2026-01-10 11:30:00' }, 'Europe/London'), '2026-01-10T11:30:00.000Z');
  assert.equal(instant({ starting_at: '2026-10-10 00:15:00' }, 'Europe/Malta'), '2026-10-09T22:15:00.000Z');
});
test('DST missing and repeated times are rejected unless epoch or explicit offset resolves them', () => {
  assert.equal(instant({ starting_at: '2026-03-29 01:30:00' }, 'Europe/London'), undefined);
  assert.equal(instant({ starting_at: '2026-10-25 01:30:00' }, 'Europe/London'), undefined);
  assert.equal(instant({ starting_at: '2026-10-25T01:30:00+01:00' }, 'Europe/London'), '2026-10-25T00:30:00.000Z');
  assert.equal(instant({ starting_at: '2026-10-25T01:30:00+00:00' }), '2026-10-25T01:30:00.000Z');
  assert.equal(instant({ starting_at: '2026-10-04 02:15:00' }, 'Australia/Lord_Howe'), undefined);
  assert.equal(instant({ starting_at: '2026-04-05 01:45:00' }, 'Australia/Lord_Howe'), undefined);
});
test('invalid timestamps and malformed dates never throw or normalize into another match date', () => {
  for (const value of [NaN, Infinity, 1e30, {}, null, '']) assert.equal(instant({ starting_at_timestamp: value }), undefined);
  for (const starting_at of ['2026-02-30 12:00:00', '2026-10-10 24:00:00', '2026-10-10', 'bad', '2026-10-10T12:00:00+99:00'])
    assert.equal(instant({ starting_at }), undefined);
  assert.equal(instant({ starting_at: '2026-10-10 12:00:00' }, 'invalid-zone'), undefined);
  assert.equal(instant({ starting_at_timestamp: '0' }), '1970-01-01T00:00:00.000Z');
  assert.equal(instant({ starting_at: '2026-10-10 12:00:00.25' }), '2026-10-10T12:00:00.250Z');
});
