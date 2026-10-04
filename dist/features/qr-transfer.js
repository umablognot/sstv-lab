/*
 * SSTV Lab — QR photo transfer orchestration.
 * Sender: photo bytes → SQ frames → animated QR codes on a canvas.
 * Receiver: camera → jsQR scan loop → FrameCollector → payload callback.
 * Fully offline; uses the vendored jsQR (window.jsQR) for scanning.
 */

import { encodeBytes, frameChunks, parseFrame, FrameCollector } from './qr.js';

const QUIET_MODULES = 4;
const DARK = '#101412';
const LIGHT = '#ffffff';

// --- sender ------------------------------------------------------------------
export class QrSender {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.timer = 0;
    this.frames = [];
    this.index = 0;
  }

  get active() { return this.timer !== 0; }

  async loadPayload(bytes, { chunkSize = 250, maxFrames = 1200 } = {}) {
    if (typeof bytes === 'string') bytes = new TextEncoder().encode(bytes);
    const frames = frameChunks(bytes, chunkSize);
    if (frames.length > maxFrames) {
      throw new RangeError(`too many frames (${frames.length}); use a smaller image`);
    }
    this.frames = frames;
    this.index = 0;
    return frames.length;
  }

  start({ intervalMs = 400, onFrame = () => {}, onDone = () => {} } = {}) {
    if (!this.frames.length) throw new Error('no payload');
    this.stop();
    this.index = 0;
    const show = () => {
      this.render(this.frames[this.index]);
      onFrame(this.index + 1, this.frames.length);
      this.index = (this.index + 1) % this.frames.length;
    };
    show();
    this.timer = setInterval(show, intervalMs);
    this.onDone = onDone;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
  }

  render(frame) {
    const qr = encodeBytes(frame, { ecl: 'l' });
    const ctx = this.ctx;
    const size = this.canvas.width;
    const modules = qr.size + QUIET_MODULES * 2;
    const scale = Math.max(1, Math.floor(size / modules));
    const offset = Math.floor((size - modules * scale) / 2);
    ctx.fillStyle = LIGHT;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = DARK;
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) {
        ctx.fillRect(offset + (x + QUIET_MODULES) * scale, offset + (y + QUIET_MODULES) * scale, scale, scale);
      }
    }
  }
}

// --- receiver ------------------------------------------------------------------
export class QrReceiver {
  constructor(video, { onProgress = () => {}, onDone = () => {}, onError = () => {} } = {}) {
    this.video = video;
    this.onProgress = onProgress;
    this.onDone = onDone;
    this.onError = onError;
    this.collector = new FrameCollector();
    this.stream = null;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.running = false;
    this.lastDecode = 0;
  }

  get supported() { return typeof window.jsQR === 'function'; }

  async start() {
    if (!this.supported) throw new Error('unsupported');
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('insecure');
    this.collector.reset();
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    this.video.srcObject = this.stream;
    await new Promise(resolve => { this.video.onloadedmetadata = resolve; });
    await this.video.play();
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      const now = performance.now();
      if (now - this.lastDecode > 100 && this.video.readyState >= 2) {
        this.lastDecode = now;
        this.scan();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  scan() {
    const w = 480;
    const h = Math.max(1, Math.round(this.video.videoHeight / this.video.videoWidth * w)) || 360;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.ctx.drawImage(this.video, 0, 0, w, h);
    const image = this.ctx.getImageData(0, 0, w, h);
    const result = window.jsQR(image.data, w, h, { inversionAttempts: 'dontInvert' });
    if (!result?.binaryData) return;
    const frame = parseFrame(new Uint8Array(result.binaryData));
    if (!frame) return;
    const wasComplete = this.collector.complete;
    this.collector.add(frame);
    this.onProgress(this.collector.count, frame.total);
    if (this.collector.complete && !wasComplete) {
      const payload = this.collector.assemble();
      this.stop();
      this.onDone(payload);
    }
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }
}

export async function renderReceivedPhoto(canvas, bytes) {
  const blob = new Blob([bytes], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return blob;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
