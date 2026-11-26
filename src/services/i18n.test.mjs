import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./i18n.ts', import.meta.url), 'utf8');
const english = JSON.parse(readFileSync(new URL('./en.json', import.meta.url), 'utf8'));
const script = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
}).outputText;

function loadLanguage(cookie = '', protocol = 'https:') {
  const exports = {};
  const document = { cookie };
  let reloads = 0;
  runInNewContext(script, {
    exports,
    require: () => english,
    document,
    window: { location: { protocol, reload: () => { reloads++; } } }
  });
  return { ...exports, document, reloads: () => reloads };
}

test('defaults to Croatian and recognises only the language preference cookie', () => {
  assert.equal(loadLanguage().t('Pronađi vlakove'), 'Pronađi vlakove');
  assert.equal(loadLanguage('sessionId=demo; transitly-language=en').t('Pronađi vlakove'), 'Find trains');
  assert.equal(loadLanguage('old-transitly-language=en').language, 'hr');
  assert.equal(loadLanguage('transitly-language=de').language, 'hr');
  assert.equal(loadLanguage('transitly-language=hr').locale, 'hr-HR');
});

test('saves the language on every path for a year and reloads the document', () => {
  const browser = loadLanguage();
  browser.selectLanguage('en');
  assert.equal(browser.document.cookie, 'transitly-language=en; Path=/; Max-Age=31536000; SameSite=Lax; Secure');
  assert.equal(browser.reloads(), 1);
  const local = loadLanguage('transitly-language=en', 'http:');
  local.selectLanguage('hr');
  assert.equal(local.document.cookie, 'transitly-language=hr; Path=/; Max-Age=31536000; SameSite=Lax');
});

test('formats translated status messages and preserves names from transit feeds', () => {
  const { t } = loadLanguage('transitly-language=en');
  assert.equal(t('Kasni {0} min', 5), '5 min late');
  assert.equal(t('Otvori stajalište {0}', 'Trnava'), 'Open stop Trnava');
  assert.equal(t('· Linija {0} – {1}', 'Dugo Selo', 'Harmica'), '· Route Dugo Selo – Harmica');
  assert.equal(t('Maksimir'), 'Maksimir');
  assert.equal(t('toString'), 'toString');
});
