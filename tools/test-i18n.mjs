// i18n integrity: catalogs parse, keys match across languages, and every key
// referenced by the app (data-i18n / t('…')) exists in all catalogs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseMo } from '../dist/i18n.js';

const LANGUAGES = ['tr', 'en', 'de', 'es', 'fr', 'ar', 'zh-CN'];

function loadCatalog(lang) {
  const mo = fs.readFileSync(`dist/locales/${lang}/LC_MESSAGES/messages.mo`);
  return parseMo(mo.buffer.slice(mo.byteOffset, mo.byteOffset + mo.byteLength));
}

const catalogs = Object.fromEntries(LANGUAGES.map(lang => [lang, loadCatalog(lang)]));
const reference = catalogs.tr;

// every catalog has the same key set as the Turkish reference
for (const lang of LANGUAGES) {
  const keys = new Set(Object.keys(catalogs[lang]).filter(k => k !== ''));
  const ref = new Set(Object.keys(reference).filter(k => k !== ''));
  const missing = [...ref].filter(k => !keys.has(k));
  const extra = [...keys].filter(k => !ref.has(k));
  assert.deepEqual({ missing, extra }, { missing: [], extra: [] }, `${lang} key parity`);
}

// no empty translations anywhere
for (const [lang, catalog] of Object.entries(catalogs)) {
  for (const [key, value] of Object.entries(catalog)) {
    if (!key) continue;
    assert.ok(String(value).trim().length > 0, `${lang}:${key} is empty`);
  }
}

// every key used in the app exists in every catalog
const used = new Set();
for (const file of ['dist/index.html', 'dist/about.html']) {
  for (const match of fs.readFileSync(file, 'utf8').matchAll(/data-i18n(?:-attr)?="([^"]*)"/g)) {
    for (const part of match[1].split(';')) {
      const key = part.includes(':') ? part.split(':')[1] : part;
      if (key) used.add(key);
    }
  }
}
for (const match of fs.readFileSync('dist/app.js', 'utf8').matchAll(/\bt\('([^']+)'/g)) used.add(match[1]);
for (const match of fs.readFileSync('dist/app.js', 'utf8').matchAll(/\bt\('([^']+)'/g)) used.add(match[1]);

for (const key of used) {
  for (const lang of LANGUAGES) {
    assert.ok(key in catalogs[lang], `key "${key}" missing in ${lang}`);
  }
}

// interpolation placeholders kept consistent across translations
for (const key of Object.keys(reference)) {
  if (!key) continue;
  const vars = source => new Set((source.match(/\{[a-z]+\}/g) ?? []).sort());
  for (const lang of LANGUAGES) {
    assert.deepEqual(
      vars(catalogs[lang][key]), vars(reference[key]),
      `${lang}:${key} placeholder mismatch`
    );
  }
}

console.log(`i18n integrity: ${used.size} app keys × ${LANGUAGES.length} languages: PASS`);
