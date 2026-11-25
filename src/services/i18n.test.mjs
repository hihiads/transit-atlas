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

function loadLanguage(preferences) {
  const exports = {};
  runInNewContext(script, {
    exports,
    require: () => english,
    navigator: { languages: preferences, language: preferences[0] }
  });
  return exports;
}

test('uses the primary device language and falls back to English', () => {
  assert.equal(loadLanguage(['hr-HR', 'en-US']).t('Pronađi vlakove'), 'Pronađi vlakove');
  assert.equal(loadLanguage(['en-GB', 'hr-HR']).t('Pronađi vlakove'), 'Find trains');
  assert.equal(loadLanguage(['de-DE']).language, 'en');
  assert.equal(loadLanguage([]).language, 'en');
});

test('formats translated status messages and preserves names from transit feeds', () => {
  const { t } = loadLanguage(['en-US']);
  assert.equal(t('Kasni {0} min', 5), '5 min late');
  assert.equal(t('Otvori stajalište {0}', 'Trnava'), 'Open stop Trnava');
  assert.equal(t('· Linija {0} – {1}', 'Dugo Selo', 'Harmica'), '· Route Dugo Selo – Harmica');
  assert.equal(t('Maksimir'), 'Maksimir');
  assert.equal(t('toString'), 'toString');
});
