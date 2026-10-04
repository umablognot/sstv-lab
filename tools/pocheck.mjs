// pocheck — verify translation catalogs stay in sync (CI-friendly, exit 1 on drift).
import fs from 'node:fs';
import { parsePo } from './msgfmt.mjs';

const LANGUAGES = ['tr', 'en', 'de', 'es', 'fr', 'ar', 'zh-CN'];
let failed = false;

function loadKeys(lang) {
  const entries = parsePo(fs.readFileSync(`dist/locales/${lang}/LC_MESSAGES/messages.po`, 'utf8'));
  const map = new Map();
  for (const entry of entries) {
    if (!entry.msgid) continue;
    map.set(entry.msgid, entry.msgstr ?? '');
  }
  return map;
}

const catalogs = Object.fromEntries(LANGUAGES.map(lang => [lang, loadKeys(lang)]));
const reference = catalogs.tr;

for (const lang of LANGUAGES) {
  for (const [key, value] of reference) {
    if (!catalogs[lang].has(key)) { console.error(`${lang}: missing "${key}"`); failed = true; }
    else if (catalogs[lang].get(key).trim() === '') { console.error(`${lang}: empty "${key}"`); failed = true; }
  }
  for (const key of catalogs[lang].keys()) {
    if (!reference.has(key)) { console.error(`${lang}: unknown key "${key}"`); failed = true; }
  }
}

// app-side coverage
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
for (const key of used) {
  if (!reference.has(key)) { console.error(`app key "${key}" not in catalogs`); failed = true; }
}

if (failed) process.exit(1);
console.log(`pocheck: ${reference.size} keys × ${LANGUAGES.length} languages, ${used.size} app keys — all in sync`);
