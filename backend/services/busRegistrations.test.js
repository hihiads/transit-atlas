import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBusRegistrations } from './busRegistrations.js';

const post = (id, lines) => `<div class="inner" data-msgid="${id}">${lines.join('<br>')}</div>`;
const tablica = 'garažni broj -- tablica';
const dubrava = 'garažni broj -- registracija';

test('uses current unambiguous registration rows from active ZET depot posts', () => {
  const page = [
    post('29388', [tablica, '<b>11 -- ZG-1001-AB</b>&nbsp;ex ZG-5999-XZ', '*12 -- ZG-1002-AB',
      '15 -- ZG-1005-AB', '17 -- ZG-2002-AB', '19 -- ZG-1009-AB']),
    post('29389', [tablica, '13 -- ZG-1003-AB', '15 -- ZG-2005-AB', '18 -- ZG-2002-AB', '19 -- ZG-1009-AB',
      'PRIJEVOZ OSOBA S INVALIDITETOM:', '55 -- ZG-1055-AB']),
    post('226485', [dubrava, '14 -- ZG-1004-AB', '------------', '56 -- ZG-1056-AB']),
    post('99999', [tablica, '99 -- ZG-1099-AB'])
  ].join('');
  assert.deepEqual([...parseBusRegistrations(page)], [
    ['11', 'ZG-1001-AB'], ['19', 'ZG-1009-AB'], ['13', 'ZG-1003-AB'], ['14', 'ZG-1004-AB']
  ]);
  assert.equal(parseBusRegistrations(page.replace('data-msgid="29389"', 'data-msgid="32"')), null);
});
