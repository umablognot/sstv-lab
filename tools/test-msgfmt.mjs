// msgfmt round-trip: .po text → compiled .mo binary → parsed back → identical map.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePo, compileMo } from './msgfmt.mjs';
import { parseMo } from '../dist/i18n.js';

const sample = `
msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"
"Language: tr\\n"

msgid "tab.send.title"
msgstr "Fotoğraf gönder"

msgid "rx.lines"
msgstr "{rows} / 240 satır"

msgid "with.quotes"
msgstr "He said \\"merhaba\\""
`;

const entries = parsePo(sample);
assert.equal(entries.length, 4, 'header + 3 strings'); // header has empty msgid
const byKey = Object.fromEntries(entries.map(e => [e.msgid, e.msgstr]));
assert.equal(byKey['tab.send.title'], 'Fotoğraf gönder');
assert.equal(byKey['rx.lines'], '{rows} / 240 satır');
assert.equal(byKey['with.quotes'], 'He said "merhaba"');

// multi-line continuation
const multiline = parsePo(`
msgid ""
msgstr "Content-Type: text/plain; charset=UTF-8\\n"
msgid "long"
msgstr "first part "
"second part"
`);
assert.equal(multiline[1].msgstr, 'first part second part');

const mo = compileMo(entries);
const parsedBack = parseMo(mo.buffer.slice(mo.byteOffset, mo.byteOffset + mo.byteLength));
assert.equal(parsedBack['tab.send.title'], 'Fotoğraf gönder');
assert.equal(parsedBack['rx.lines'], '{rows} / 240 satır');
assert.equal(parsedBack['with.quotes'], 'He said "merhaba"');
assert.ok(parsedBack['']?.includes('Content-Type'), 'header preserved');

// empty msgstr entries are dropped from the binary (source string fallback)
const partial = compileMo(parsePo(`
msgid ""
msgstr "Content-Type: text/plain; charset=UTF-8\\n"
msgid "known"
msgstr "çeviri"
msgid "unknown"
msgstr ""
`));
const parsed = parseMo(partial.buffer.slice(partial.byteOffset, partial.byteOffset + partial.byteLength));
assert.equal(parsed['known'], 'çeviri');
assert.equal('unknown' in parsed, false);

// every real catalog compiles and parses back cleanly
for (const lang of ['tr', 'en', 'de', 'es', 'fr', 'ar', 'zh-CN']) {
  const poPath = `dist/locales/${lang}/LC_MESSAGES/messages.po`;
  const entries = parsePo(fs.readFileSync(poPath, 'utf8'));
  const mo = compileMo(entries);
  const parsed = parseMo(mo.buffer.slice(mo.byteOffset, mo.byteOffset + mo.byteLength));
  const translated = entries.filter(e => e.msgid && e.msgstr);
  for (const entry of translated) {
    assert.equal(parsed[entry.msgid], entry.msgstr, `${lang}:${entry.msgid}`);
  }
  console.log(`${lang}: ${Object.keys(parsed).length - 1} strings round-trip OK`);
}
console.log('msgfmt po→mo→parse round-trip: PASS');
