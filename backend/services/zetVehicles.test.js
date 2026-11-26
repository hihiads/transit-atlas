import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zetVehicleId } from './zetFleet.js';
import { validateVehicleReport } from './vehicleReports.js';

test('extracts ZET fleet numbers from the official realtime feed', () => {
  assert.equal(zetVehicleId('X3JX2PT0D8_42'), '42');
  assert.equal(zetVehicleId('XTIX2PT030_10344'), '10344');
  assert.equal(zetVehicleId('rt_trip_42'), null);
  assert.equal(zetVehicleId('other', { id: '36' }), '36');
});

test('accepts a live trip and a predefined report reason, rejecting client-supplied announcement fields', () => {
  const valid = { vehicleId: 'X3JX2PT0D8_42', tripId: '0_11_16101_161_10116', reason: 'delay' };
  assert.deepEqual(validateVehicleReport(valid), valid);
  assert.equal(validateVehicleReport({ ...valid, reason: 'free text' }), null);
  assert.equal(validateVehicleReport({ ...valid, vehicleId: { $ne: null } }), null);
  assert.equal(validateVehicleReport({ ...valid, tripId: '' }), null);
  assert.equal(validateVehicleReport({ ...valid, count: 3 }), null);
});
