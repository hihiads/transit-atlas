import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseStations, bikeDomains } from './bikeShare.js';

test('stations keep coordinates, join live availability and drop unusable points', () => {
  const raw = [
    { station_id: '1', name: 'Trg', lat: 45.8, lon: 15.9, capacity: 15 },
    { station_id: '2', name: 'Bez koordinata', lat: 'x', lon: 15.9, capacity: 10 },
    { station_id: '3', name: 'Bez stanja', lat: 45.81, lon: 15.91 }
  ];
  const availability = new Map([['1', { num_bikes_available: 4, num_docks_available: 11 }]]);
  const stations = normaliseStations('hd', 'Zagreb', raw, availability);
  assert.equal(stations.length, 2);
  assert.deepEqual(stations[0], {
    id: 'hd:1', name: 'Trg', lat: 45.8, lon: 15.9, capacity: 15,
    bikesAvailable: 4, docksAvailable: 11, city: 'Zagreb', operator: 'nextbike'
  });
  assert.equal(stations[1].bikesAvailable, null);
});

test('covers Croatian nextbike networks only', () => {
  assert.ok(bikeDomains.includes('hd'));
  assert.ok(bikeDomains.includes('gt'));
  assert.ok(!bikeDomains.includes('aa'));
  assert.equal(new Set(bikeDomains).size, bikeDomains.length);
});
