import assert from 'node:assert/strict';
import test from 'node:test';
import { matchPushLiveEventWindow } from '../lib/touchlineArena/match-push-live-event-window.ts';
import type { TouchlineFixturePeriod } from '../lib/football-data/types.ts';

const first: TouchlineFixturePeriod = { providerId: '77', fixtureId: '8', typeId: '1',
  countsFrom: 0, sortOrder: 1, started: 1000, ticking: true, hasTimer: true, minutes: 20, seconds: 30 };
function input() {
  const current = { ...first, minutes: 23, seconds: 0 };
  return { fixtureId: '8', live: true, confirmed: true, periods: [current], baseline: { ...first }, current,
    event: { periodId: '77', minute: 22, extraMinute: undefined as number | undefined }, maximumEventLagSeconds: 120 };
}
test('recent confirmed live goal after baseline eligible; whole-minute window conservative', () => {
  assert.equal(matchPushLiveEventWindow(input()).status, 'eligible');
  const noAddedTime = input(); noAddedTime.event.extraMinute = 0;
  assert.equal(matchPushLiveEventWindow(noAddedTime).status, 'eligible');
  for (const minute of [19, 20]) {
    const value = input(); value.event.minute = minute;
    assert.equal(matchPushLiveEventWindow(value).reason, 'at-or-before-baseline-minute');
  }
  const old = input(); old.event.minute = 21; old.maximumEventLagSeconds = 119;
  assert.equal(matchPushLiveEventWindow(old).reason, 'event-outside-live-window');
  old.maximumEventLagSeconds = 120;
  assert.equal(matchPushLiveEventWindow(old).status, 'eligible');
  const future = input(); future.event.minute = 23;
  assert.equal(matchPushLiveEventWindow(future).reason, 'minute-not-fully-observed');
  assert.equal(matchPushLiveEventWindow({ ...input(), live: false }).status, 'suppressed');
  assert.equal(matchPushLiveEventWindow({ ...input(), confirmed: false }).status, 'suppressed');
});
test('injury time is base endpoint plus extra, never double-counted', () => {
  const value = input(); value.baseline.minutes = 45;
  value.current.minutes = 48; value.event.minute = 45; value.event.extraMinute = 2;
  assert.equal(matchPushLiveEventWindow(value).status, 'eligible');
  value.event.extraMinute = 0;
  assert.equal(matchPushLiveEventWindow(value).reason, 'at-or-before-baseline-minute');
  value.event.minute = 47; value.event.extraMinute = 2;
  assert.equal(matchPushLiveEventWindow(value).reason, 'ambiguous-extra-minute');
});
test('cross-period goal allowed only through unique completed chronological chain', () => {
  const value = input();
  const previous = { ...first, ticking: false, hasTimer: false, ended: 4000, minutes: 48 };
  value.current = { ...first, providerId: '78', typeId: '2', countsFrom: 45, sortOrder: 2, started: 5000, minutes: 48, seconds: 0 };
  value.periods = [previous, value.current]; value.event = { periodId: '78', minute: 47, extraMinute: undefined };
  assert.equal(matchPushLiveEventWindow(value).status, 'eligible');
  value.baseline.minutes = 49;
  assert.equal(matchPushLiveEventWindow(value).reason, 'baseline-clock-regressed');
  value.baseline.minutes = 20;
  previous.ended = 6000;
  assert.equal(matchPushLiveEventWindow(value).reason, 'unproven-period-chronology');
  previous.ended = 4000; value.event.periodId = '77';
  assert.equal(matchPushLiveEventWindow(value).reason, 'event-not-current-period');
  value.current.sortOrder = 3;
  assert.equal(matchPushLiveEventWindow(value).reason, 'unproven-period-chronology');
});
test('invalid, duplicated, unbound and regressed evidence fails closed', () => {
  for (const maximumEventLagSeconds of [0, -1, 1.5, NaN, Infinity]) {
    assert.equal(matchPushLiveEventWindow({ ...input(), maximumEventLagSeconds }).status, 'unavailable');
  }
  const duplicated = input(); duplicated.periods.push({ ...duplicated.current });
  assert.equal(matchPushLiveEventWindow(duplicated).status, 'unavailable');
  const foreign = input(); foreign.current.fixtureId = '9';
  assert.equal(matchPushLiveEventWindow(foreign).status, 'unavailable');
  const missingTimer = input(); missingTimer.current.hasTimer = false;
  assert.equal(matchPushLiveEventWindow(missingTimer).status, 'unavailable');
  const regressed = input(); regressed.current.minutes = 19;
  assert.equal(matchPushLiveEventWindow(regressed).status, 'rebaseline');
  const changed = input(); changed.baseline.started = 999;
  assert.equal(matchPushLiveEventWindow(changed).status, 'rebaseline');
  const reopened = input(); reopened.baseline.ended = 2000; reopened.baseline.ticking = false;
  assert.equal(matchPushLiveEventWindow(reopened).reason, 'baseline-period-reopened');
  const unbound = input(); unbound.event.periodId = '99';
  assert.equal(matchPushLiveEventWindow(unbound).status, 'unavailable');
});
