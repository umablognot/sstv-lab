#!/usr/bin/env node
/*
 * msgfmt.mjs — compile GNU gettext .po catalogs into binary .mo files.
 * Pure Node, zero dependencies: a drop-in for `msgfmt` so translators only
 * need Node to rebuild catalogs. Usage:
 *   node tools/msgfmt.mjs                     # compile every catalog under locales/
 *   node tools/msgfmt.mjs path/to/messages.po # compile one file
 * Exit code 1 on parse errors so CI can gate translations.
 */

import fs from 'node:fs';
import path from 'node:path';

// --- .po parser -------------------------------------------------------------
export function parsePo(source) {
  const entries = [];
  const lines = source.split(/\r?\n/);
  let entry = null, lastField = null;

  const flush = () => {
    if (entry && (entry.msgid !== undefined)) {
      if (entry.msgstr === undefined) entry.msgstr = '';
      entries.push(entry);
    }
    entry = null; lastField = null;
  };
  const startEntry = () => { flush(); entry = { msgid: '', msgstr: '', msgid_plural: null, msgstr_plural: {} }; };
  // ensure an entry object exists for comments before the first msgid
  const ensure = () => { if (!entry) entry = { msgid: undefined, msgstr: undefined, msgid_plural: null, msgstr_plural: {} }; };

  for (let raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith('#~')) continue; // obsolete entries are dropped
    if (line.startsWith('#')) { ensure(); if (entry) { entry.comments ??= []; entry.comments.push(line); } continue; }
    if (line.startsWith('msgctxt')) { startEntry(); entry.msgctxt = unquote(line.slice('msgctxt'.length)); lastField = 'msgctxt'; continue; }
    if (line.startsWith('msgid_plural')) { ensure(); entry.msgid_plural = unquote(line.slice('msgid_plural'.length)); lastField = 'msgid_plural'; continue; }
    if (/^msgstr\[\d+\]/.test(line)) {
      ensure();
      const index = Number(line.slice(7, line.indexOf(']')));
      entry.msgstr_plural[index] = unquote(line.slice(line.indexOf(']') + 1));
      lastField = { plural: index };
      continue;
    }
    if (line.startsWith('msgid')) { startEntry(); entry.msgid = unquote(line.slice('msgid'.length)); lastField = 'msgid'; continue; }
    if (line.startsWith('msgstr')) { ensure(); entry.msgstr = unquote(line.slice('msgstr'.length)); lastField = 'msgstr'; continue; }
    // continuation line
    const chunk = unquote(line);
    if (entry && lastField !== null) {
      if (lastField === 'msgid') entry.msgid += chunk;
      else if (lastField === 'msgstr') entry.msgstr += chunk;
      else if (lastField === 'msgid_plural') entry.msgid_plural += chunk;
      else if (typeof lastField === 'object') entry.msgstr_plural[lastField.plural] += chunk;
    }
  }
  flush();
  return entries.filter(e => e.msgid !== undefined);
}

function unquote(rest) {
  const trimmed = rest.trim();
  const match = trimmed.match(/^"(.*)"$/s);
  const inner = match ? match[1] : trimmed.replace(/^"/, '').replace(/"$/, '');
  return inner
    .replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
    .replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

// --- .mo writer ---------------------------------------------------------------
export function compileMo(entries) {
  const used = entries.filter(e => {
    if (e.msgid === '') return true; // header
    return (typeof e.msgstr === 'string' && e.msgstr.length > 0) ||
      Object.values(e.msgstr_plural ?? {}).some(s => s.length > 0);
  });
  const keys = used.map(e => e.msgid_plural !== null ? `${e.msgid}\0${e.msgid_plural}` : e.msgid);
  const values = used.map(e => {
    if (e.msgid_plural !== null) {
      const indices = Object.keys(e.msgstr_plural).map(Number).sort((a, b) => a - b);
      const max = indices.length ? indices[indices.length - 1] : -1;
      const forms = [];
      for (let i = 0; i <= max; i++) forms.push(e.msgstr_plural[i] ?? '');
      return forms.join('\0');
    }
    return e.msgstr;
  });

  const encoder = new TextEncoder();
  const offsets = [];
  let dataLength = 0;
  for (let i = 0; i < keys.length; i++) {
    const keyBytes = encoder.encode(keys[i]);
    const valBytes = encoder.encode(values[i]);
    offsets.push({ keyBytes, valBytes });
    dataLength += keyBytes.length + valBytes.length;
  }

  const N = keys.length;
  const startOriginals = 28;
  const startTranslations = startOriginals + N * 8;
  const startData = startTranslations + N * 8;
  const totalLength = startData + dataLength;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  view.setUint32(0, 0x950412de, true);  // magic (LE)
  view.setUint32(4, 0, true);           // major version
  view.setUint32(8, N, true);           // number of strings
  view.setUint32(12, startOriginals, true);
  view.setUint32(16, startTranslations, true);
  view.setUint32(20, N * 8 + N * 8, true); // size of hash table (none) — GNU writes 0; keep 0
  view.setUint32(20, 0, true);
  view.setUint32(24, startData, true);  // offset of hash table (unused → data starts here)

  let dataOffset = startData;
  offsets.forEach(({ keyBytes, valBytes }, i) => {
    view.setUint32(startOriginals + i * 8, keyBytes.length, true);
    view.setUint32(startOriginals + i * 8 + 4, dataOffset, true);
    new Uint8Array(buffer, dataOffset, keyBytes.length).set(keyBytes);
    dataOffset += keyBytes.length;
    view.setUint32(startTranslations + i * 8, valBytes.length, true);
    view.setUint32(startTranslations + i * 8 + 4, dataOffset, true);
    new Uint8Array(buffer, dataOffset, valBytes.length).set(valBytes);
    dataOffset += valBytes.length;
  });
  return Buffer.from(buffer);
}

// --- CLI -----------------------------------------------------------------------
function poToMoPath(poPath) {
  return poPath.replace(/\.po$/, '.mo');
}

function compileFile(poPath) {
  const entries = parsePo(fs.readFileSync(poPath, 'utf8'));
  const header = entries.find(e => e.msgid === '');
  if (!header || !header.msgstr || !header.msgstr.includes('Content-Type')) {
    throw new Error(`${poPath}: missing or invalid header entry`);
  }
  const mo = compileMo(entries);
  const outPath = poToMoPath(poPath);
  fs.writeFileSync(outPath, mo);
  const translated = entries.filter(e => e.msgid !== '' &&
    ((typeof e.msgstr === 'string' && e.msgstr.length > 0) ||
      Object.values(e.msgstr_plural ?? {}).some(s => s.length > 0))).length;
  return { outPath, entries: entries.length - 1, translated };
}

function main() {
  const targets = process.argv.slice(2);
  const files = targets.length ? targets : [];
  if (!files.length) {
    const root = path.resolve('dist/locales');
    if (!fs.existsSync(root)) {
      console.error('No dist/locales/ directory found. Run from the repository root.');
      process.exit(1);
    }
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(dirent => {
      const full = path.join(dir, dirent.name);
      return dirent.isDirectory() ? walk(full) : (dirent.name.endsWith('.po') ? [full] : []);
    });
    files.push(...walk(root));
  }
  if (!files.length) { console.error('No .po files found.'); process.exit(1); }
  let failed = false;
  for (const file of files) {
    try {
      const { outPath, entries, translated } = compileFile(file);
      console.log(`${file} → ${outPath} (${translated}/${entries} strings)`);
    } catch (error) {
      failed = true;
      console.error(error.message);
    }
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
