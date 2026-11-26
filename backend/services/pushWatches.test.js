import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWatch } from './pushWatches.js';
import { alertPayload } from './apns.js';

const now = Date.parse('2026-11-26T08:00:00Z');
const watch = {
  departureAt: now + 10 * 60_000, expiresAt: new Date(now + 2 * 3600_000), line: '17', stopName: 'Glavni kolodvor', stopSequence: 5,
  delayNotifiedAt: null, earlyNotifiedAt: null, arrivalNotifiedAt: null
};
const base = { now, delaySeconds: NaN, cancelled: false, vehicleFresh: false, vehicleSequence: null };

test('late by 6 minutes notifies once', () => {
  const first = evaluateWatch(watch, { ...base, delaySeconds: 360 });
  assert.deepEqual(first.notifications.map(item => item.type), ['delay']);
  assert.match(first.notifications[0].body, /kasni 6 min/);
  const again = evaluateWatch({ ...watch, delayNotifiedAt: now }, { ...base, delaySeconds: 420 });
  assert.equal(again.notifications.length, 0);
});

test('a bus that is early ("uranio") notifies with minutes early', () => {
  const result = evaluateWatch(watch, { ...base, delaySeconds: -180 });
  assert.deepEqual(result.notifications.map(item => item.type), ['early']);
  assert.match(result.notifications[0].body, /3 min ranije/);
});

test('small delays under the thresholds stay silent', () => {
  assert.equal(evaluateWatch(watch, { ...base, delaySeconds: 60 }).notifications.length, 0);
  assert.equal(evaluateWatch(watch, { ...base, delaySeconds: -60 }).notifications.length, 0);
});

test('vehicle one stop away says it is coming, at the stop says it arrived', () => {
  const coming = evaluateWatch(watch, { ...base, vehicleFresh: true, vehicleSequence: 4 });
  assert.match(coming.notifications[0].title, /stiže/);
  const arrived = evaluateWatch(watch, { ...base, vehicleFresh: true, vehicleSequence: 5 });
  assert.match(arrived.notifications[0].title, /je stigao/);
  assert.ok(arrived.updates.arrivalNotifiedAt);
});

test('vehicle already past the stop is silent and stops the watch', () => {
  const passed = evaluateWatch(watch, { ...base, vehicleFresh: true, vehicleSequence: 7 });
  assert.equal(passed.notifications.length, 0);
  assert.ok(passed.updates.arrivalNotifiedAt);
});

test('no notifications when cancelled, too early, or too late', () => {
  assert.equal(evaluateWatch(watch, { ...base, cancelled: true, delaySeconds: 600 }).notifications.length, 0);
  const far = { ...watch, departureAt: now + 3 * 3600_000 };
  assert.equal(evaluateWatch(far, { ...base, delaySeconds: 600 }).notifications.length, 0);
  assert.equal(evaluateWatch(watch, { ...base, now: now + 3 * 3600_000, delaySeconds: 600 }).notifications.length, 0);
});

test('APNs payload carries the alert and custom data', () => {
  const payload = alertPayload({ title: 'Test', body: 'Tijelo', data: { type: 'delay' } });
  assert.deepEqual(payload.aps.alert, { title: 'Test', body: 'Tijelo' });
  assert.equal(payload.aps.sound, 'default');
  assert.equal(payload.type, 'delay');
});
