/*
 * SSTV Lab — Bluetooth channels.
 *  1. Audio output picker: route the acoustic transfer to a paired Bluetooth
 *     speaker (selectAudioOutput + AudioContext.setSinkId).
 *  2. GATT photo transfer over the Nordic UART Service between two
 *     Web Bluetooth devices — fully offline, no pairing dialog beyond the
 *     browser chooser.
 */

export const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const NUS_TX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // app → peripheral
export const NUS_RX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // peripheral → app

export const btSupported = typeof navigator !== 'undefined' && !!navigator.bluetooth;
const outputPickerSupported = () => !!navigator.mediaDevices?.selectAudioOutput;

export const audioOutputSupported = outputPickerSupported();

// --- audio output ------------------------------------------------------------
export async function pickAudioOutput() {
  if (!outputPickerSupported()) throw new Error('unsupported');
  const device = await navigator.mediaDevices.selectAudioOutput();
  return device; // { id, name, ... } — pass device.id to AudioContext.setSinkId
}

export async function routeContextTo(context, sinkId) {
  if (sinkId == null) return;
  if (typeof context.setSinkId === 'function') await context.setSinkId(sinkId);
  else throw new Error('unsupported');
}

// --- GATT photo transfer -----------------------------------------------------
// Wire format: magic 'SB' + uint32 total length (BE) + payload bytes.
const BT_MAGIC = [0x53, 0x42];
const CHUNK_SIZE = 244;           // safe under ATT MTU 247 and legacy 512 limits
const WRITE_PAUSE_MS = 15;        // flow control for small peripherals

function framePayload(bytes) {
  const frame = new Uint8Array(6 + bytes.length);
  frame[0] = BT_MAGIC[0]; frame[1] = BT_MAGIC[1];
  frame[2] = (bytes.length >>> 24) & 0xFF; frame[3] = (bytes.length >>> 16) & 0xFF;
  frame[4] = (bytes.length >>> 8) & 0xFF; frame[5] = bytes.length & 0xFF;
  frame.set(bytes, 6);
  return frame;
}

export class BtSession {
  constructor() { this.device = null; this.server = null; }

  get connected() { return !!this.server && this.device?.gatt?.connected; }

  async connect({ forReceiving = false } = {}) {
    if (!btSupported) throw new Error('unsupported');
    const device = await navigator.bluetooth.requestDevice({
      // Prefer devices advertising the UART service, but let users pick any
      // paired device that exposes it via optionalServices.
      filters: [{ services: [NUS_SERVICE] }],
      optionalServices: [NUS_SERVICE]
    });
    device.addEventListener('gattserverdisconnected', () => { this.server = null; });
    this.device = device;
    this.server = await device.gatt.connect();
    return device;
  }

  async sendPhoto(bytes, { onProgress = () => {} } = {}) {
    if (!this.connected) throw new Error('not-connected');
    const service = await this.server.getPrimaryService(NUS_SERVICE);
    const tx = await service.getCharacteristic(NUS_TX);
    const frame = framePayload(bytes);
    let sent = 0;
    for (let offset = 0; offset < frame.length; offset += CHUNK_SIZE) {
      const chunk = frame.subarray(offset, Math.min(offset + CHUNK_SIZE, frame.length));
      if (typeof tx.writeValueWithResponse === 'function') await tx.writeValueWithResponse(chunk);
      else await tx.writeValue(chunk);
      sent += chunk.length;
      onProgress(sent / frame.length);
      if (offset + CHUNK_SIZE < frame.length) await new Promise(r => setTimeout(r, WRITE_PAUSE_MS));
    }
  }

  async receivePhoto({ onProgress = () => {}, onDone = () => {} } = {}) {
    if (!this.connected) throw new Error('not-connected');
    const service = await this.server.getPrimaryService(NUS_SERVICE);
    const rx = await service.getCharacteristic(NUS_RX);
    let expected = 0;
    let buffer = new Uint8Array(0);
    await rx.startNotifications();
    rx.addEventListener('characteristicvaluechanged', ({ target }) => {
      const value = new Uint8Array(target.value.buffer);
      // Locate or continue the 'SB' framing.
      if (buffer.length < 6 && expected === 0) {
        const merged = new Uint8Array(buffer.length + value.length);
        merged.set(buffer); merged.set(value, buffer.length);
        if (merged.length >= 2 && (merged[0] !== BT_MAGIC[0] || merged[1] !== BT_MAGIC[1])) return;
        if (merged.length >= 6) {
          expected = (merged[2] << 24) | (merged[3] << 16) | (merged[4] << 8) | merged[5];
          buffer = merged.subarray(6);
          buffer = Uint8Array.from(buffer);
          onProgress(Math.min(1, buffer.length / expected));
          if (buffer.length >= expected) onDone(buffer.slice(0, expected));
          return;
        }
        buffer = merged;
        return;
      }
      const merged = new Uint8Array(Math.min(expected, buffer.length + value.length));
      merged.set(buffer.subarray(0, Math.min(buffer.length, expected)));
      merged.set(value.subarray(0, Math.max(0, Math.min(value.length, expected - buffer.length))), buffer.length);
      buffer = merged;
      onProgress(Math.min(1, buffer.length / expected));
      if (expected && buffer.length >= expected) onDone(buffer.slice(0, expected));
    });
  }

  disconnect() {
    try { this.device?.gatt?.disconnect(); } catch {}
    this.device = null; this.server = null;
  }
}
