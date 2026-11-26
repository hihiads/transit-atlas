import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBulletin } from './dashboard.js';

const now = Date.parse('2026-11-26T14:00:00Z');
const bulletin = { kind: 'announcement', audience: 'all', level: 'warning', text: ' Najava ',
  textEn: 'Notice', startsAt: '2026-11-26T15:00:00Z', expiresAt: '2026-11-27T15:00:00Z' };

test('validates scheduled windows, operators and public-facing text', () => {
  const valid = parseBulletin(bulletin, now);
  assert.equal(valid.text, 'Najava');
  assert.equal(valid.line, null);
  assert.equal(valid.startsAt.toISOString(), '2026-11-26T15:00:00.000Z');
  assert.equal(parseBulletin({ ...bulletin, expiresAt: bulletin.startsAt }, now), null);
  assert.equal(parseBulletin({ ...bulletin, textEn: 'a'.repeat(281) }, now), null);
  assert.equal(parseBulletin({ ...bulletin, audience: 'all', kind: 'stop', line: '14' }, now), null);
  assert.equal(parseBulletin({ ...bulletin, audience: 'zet', kind: 'stop', line: '14' }, now).line, '14');
  assert.equal(parseBulletin({ ...bulletin, audience: 'zet', kind: 'stop', line: '<b>' }, now), null);
});
