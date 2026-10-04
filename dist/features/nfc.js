/*
 * SSTV Lab — Web NFC pairing (Chrome on Android).
 * Writes/reads an NDEF invite so a tap opens the app on the other phone with
 * the right role preselected. Works fully offline; the invite URL carries the
 * role and language in its query string.
 */

const ROLE_PARAM = 'role';

function inviteUrl(role) {
  const url = new URL(location.href);
  url.hash = '';
  url.searchParams.set(ROLE_PARAM, role);
  if (window.sstvI18n) url.searchParams.set('lang', window.sstvI18n.getLanguage());
  return url.toString();
}

export const nfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window;

export function parseInviteRecord(record) {
  // NDEFReader record.data for url/text records is already a string (or ArrayBuffer).
  let value = record.data;
  if (value instanceof ArrayBuffer) value = new TextDecoder().decode(value);
  if (typeof value !== 'string') return null;
  if (record.recordType === 'url' || value.startsWith('http')) {
    try {
      const url = new URL(value, location.href);
      const role = url.searchParams.get(ROLE_PARAM);
      if (role === 'rx' || role === 'tx') return { role, url: url.toString() };
      return null;
    } catch { return null; }
  }
  return null;
}

export async function writeInvite(role, { onStatus = () => {} } = {}) {
  if (!nfcSupported) throw new Error('unsupported');
  const writer = new NDEFReader();
  onStatus('wait');
  await writer.write({
    records: [
      { recordType: 'url', data: inviteUrl(role) },
      { recordType: 'text', data: `SSTV Lab ${role === 'rx' ? 'receive' : 'send'}` }
    ]
  });
  onStatus('written', role);
}

export async function readInvite({ onInvite = () => {}, onStatus = () => {} } = {}) {
  if (!nfcSupported) throw new Error('unsupported');
  const reader = new NDEFReader();
  onStatus('wait');
  await reader.scan();
  onStatus('listening');
  reader.onreading = ({ message }) => {
    for (const record of message.records) {
      const invite = parseInviteRecord(record);
      if (invite) { onInvite(invite); return; }
    }
    onStatus('no-invite');
  };
  reader.onreadingerror = () => onStatus('error');
}

export function applyInviteRole(role) {
  // The app binds this to its own tab-switching logic via a custom event so
  // this module stays independent of app.js internals.
  window.dispatchEvent(new CustomEvent('sstv-invite', { detail: { role } }));
}
