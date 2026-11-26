import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertsFromLiveVehicles } from './rareVehicleAlerts.js';

test('selects only fresh rare sightings on the current Zagreb day', () => {
  const now = Date.parse('2026-11-26T23:01:00Z');
  const current = { rare: true, zetId: '42', lastUpdate: now - 1000, line: '14' };
  const vehicles = [
    { ...current, lastUpdate: now - 2000, line: '12' },
    current,
    { ...current, zetId: '43', lastUpdate: now - 120_000 },
    { ...current, zetId: '44', lastUpdate: now + 1000 },
    { ...current, zetId: '45', rare: false },
    { ...current, zetId: '46', lastUpdate: NaN }
  ];
  const result = alertsFromLiveVehicles(vehicles, now);
  assert.equal(result.day, '2026-11-27');
  assert.deepEqual([...result.active], [['42', current]]);
});
