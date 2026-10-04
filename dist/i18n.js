/*
 * SSTV Lab — lightweight gettext runtime for a no-build static app.
 * Loads compiled GNU gettext catalogs (.mo) that live next to the site:
 *   locales/{lang}/LC_MESSAGES/messages.mo
 * Source catalogs (.po) live beside them for translators; recompile with
 *   node tools/msgfmt.mjs
 * Zero dependencies, works fully offline once cached by the service worker.
 */

export const SUPPORTED_LANGUAGES = ['tr', 'en', 'de', 'es', 'fr', 'ar', 'zh-CN'];

export const LANGUAGE_NAMES = {
  'tr': 'Türkçe', 'en': 'English', 'de': 'Deutsch', 'es': 'Español',
  'fr': 'Français', 'ar': 'العربية', 'zh-CN': '简体中文'
};

const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur']);
const STORAGE_KEY = 'sstv-lang';
const FALLBACK = 'en';

// Plural rule per supported language (nplurals aware, pragmatic subset).
const PLURAL_RULES = {
  'tr': n => 0,
  'en': n => n === 1 ? 0 : 1,
  'de': n => n === 1 ? 0 : 1,
  'es': n => n === 1 ? 0 : 1,
  'fr': n => n <= 1 ? 0 : 1,
  'ar': n => n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 :
        (n % 100 >= 3 && n % 100 <= 10) ? 3 : (n % 100 >= 11) ? 4 : 5,
  'zh-CN': n => 0
};

let catalog = Object.create(null);
let current = FALLBACK;
let ready = false;
const listeners = [];

export function normalizeLanguage(input) {
  if (!input) return null;
  const code = String(input).toLowerCase();
  if (code.startsWith('zh')) {
    if (code.includes('tw') || code.includes('hk') || code.includes('hant')) return 'zh-CN'; // fallback to Simplified catalog
    return 'zh-CN';
  }
  const base = code.split(/[-_]/)[0];
  return SUPPORTED_LANGUAGES.find(lang => lang === base) ?? null;
}

function storedLanguage() {
  try { return normalizeLanguage(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}

function browserLanguage() {
  for (const candidate of navigator.languages ?? [navigator.language]) {
    const match = normalizeLanguage(candidate);
    if (match) return match;
  }
  return null;
}

/** Parse a GNU MO catalog (little-endian) into a flat string map. */
export function parseMo(buffer) {
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== 0x950412de) {
    const swapped = (magic >>> 16) | (magic << 16);
    if (swapped !== 0x950412de) throw new Error('Not a GNU mo file');
  }
  const count = view.getUint32(8, true);
  const originals = view.getUint32(12, true);
  const translations = view.getUint32(16, true);
  const decoder = new TextDecoder('utf-8');
  const table = Object.create(null);
  for (let i = 0; i < count; i++) {
    const length = view.getUint32(originals + i * 8, true);
    const offset = view.getUint32(originals + i * 8 + 4, true);
    const id = decoder.decode(new Uint8Array(buffer, offset, length));
    const tLength = view.getUint32(translations + i * 8, true);
    const tOffset = view.getUint32(translations + i * 8 + 4, true);
    const str = decoder.decode(new Uint8Array(buffer, tOffset, tLength));
    if (id.includes('\0')) {
      const [key, pluralKey] = id.split('\0');
      table[key] = { plural: pluralKey ?? `${key}.plural`, forms: str.split('\0') };
    } else if (str.length) {
      table[id] = str;
    }
  }
  return table;
}

async function loadCatalog(language) {
  try {
    const response = await fetch(`locales/${language}/LC_MESSAGES/messages.mo`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`mo ${response.status}`);
    return parseMo(await response.arrayBuffer());
  } catch {
    return Object.create(null); // missing catalog → source strings stay visible
  }
}

/** Translate a key with optional {var} interpolation. */
export function t(key, vars) {
  let text = catalog[key];
  if (typeof text === 'object' && text !== null) text = text.forms[0] ?? key;
  if (typeof text !== 'string') text = key;
  if (vars) for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

/** Plural-aware translate: msgid is "key", msgid_plural "key.plural". */
export function tn(key, n, vars) {
  const entry = catalog[key];
  if (typeof entry === 'object' && entry !== null && Array.isArray(entry.forms)) {
    const index = (PLURAL_RULES[current] ?? PLURAL_RULES.en)(n);
    text_apply(entry.forms[index] ?? entry.forms[0] ?? key);
    return;
  }
  text_apply(key);
  function text_apply(text) {
    if (vars) for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  }
}

/** Walk the DOM and swap every annotated element to the active language. */
export function apply(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach(el => {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':');
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
}

export function getLanguage() { return current; }

export function isReady() { return ready; }

export function onChange(fn) { listeners.push(fn); }

export async function setLanguage(language, { persist = true } = {}) {
  const target = normalizeLanguage(language) ?? FALLBACK;
  catalog = await loadCatalog(target);
  current = target;
  if (persist) { try { localStorage.setItem(STORAGE_KEY, target); } catch {} }
  document.documentElement.lang = target;
  document.documentElement.dir = RTL_LANGUAGES.has(target) ? 'rtl' : 'ltr';
  apply();
  ready = true;
  document.documentElement.dataset.i18nReady = '1';
  for (const fn of listeners) { try { fn(target); } catch {} }
}

/** Boot: stored choice → browser language → fallback. */
export async function init() {
  await setLanguage(storedLanguage() ?? browserLanguage() ?? FALLBACK, { persist: false });
}

export const i18n = { t, tn, apply, init, setLanguage, getLanguage, onChange,
  SUPPORTED_LANGUAGES, LANGUAGE_NAMES };
export default i18n;
