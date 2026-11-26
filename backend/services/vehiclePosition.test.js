import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vehicleHasPassedStop } from './vehiclePosition.js';

// Five stops roughly 155 m apart on one straight line, sequences 1..5.
const LAT = 45.8;
const stops = [1, 2, 3, 4, 5].map((sequence, index) => ({
  id: String(sequence), sequence, lat: LAT, lon: 15.9 + index * 0.002
}));
const getStops = () => stops;
const at = lonOffset => ({ lat: LAT, lon: 15.9 + lonOffset, speed: 5 });

test('reported stop sequence decides passage', () => {
  assert.equal(vehicleHasPassedStop({ ...at(0), currentStopSequence: 5 }, 3, getStops), true);
  assert.equal(vehicleHasPassedStop({ ...at(0), currentStopSequence: 2 }, 3, getStops), false);
  assert.equal(vehicleHasPassedStop({ ...at(0), currentStopSequence: 3 }, 3, getStops), false);
});

test('without reported sequence, a bus just past stop 2 is not estimated for stop 2', () => {
  // Between stop 2 (lon +0.002) and stop 3 (lon +0.004): already left stop 2.
  assert.equal(vehicleHasPassedStop({ ...at(0.003) }, 2, getStops), true);
});

test('without reported sequence, a bus still approaching stop 3 is not passed', () => {
  // Between stop 1 (lon +0) and stop 2 (lon +0.002): stop 3 is still ahead.
  assert.equal(vehicleHasPassedStop({ ...at(0.001) }, 3, getStops), false);
});

test('unknown position is treated as passed, so no estimate is shown', () => {
  // About 1 km north of the line: no segment is close enough to place it.
  assert.equal(vehicleHasPassedStop({ lat: LAT + 0.01, lon: 15.9, speed: 5 }, 3, getStops), true);
});
