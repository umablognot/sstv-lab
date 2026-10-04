/*
 * SSTV Lab — sound helpers: SSTV calibration tone test and audio output
 * routing for the acoustic transfer.
 */

import { pickAudioOutput, routeContextTo } from './bluetooth.js';

const CALIBRATION_TONES = [1500, 1900, 2300]; // Robot36 image / sync / chroma carriers
const TONE_SECONDS = 1.6;
const TONE_GAIN = 0.6;

export class ToneTester {
  constructor() { this.context = null; this.gain = null; this.osc = null; this.sinkId = null; }

  setOutput(sinkId) { this.sinkId = sinkId; }

  async play({ onTone = () => {}, onDone = () => {} } = {}) {
    this.stop();
    const Audio = window.AudioContext || window.webkitAudioContext;
    this.context = new Audio();
    if (this.sinkId) { try { await routeContextTo(this.context, this.sinkId); } catch {} }
    await this.context.resume();
    this.gain = this.context.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(this.context.destination);
    for (let i = 0; i < CALIBRATION_TONES.length; i++) {
      const start = this.context.currentTime + i * TONE_SECONDS;
      const osc = this.context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = CALIBRATION_TONES[i];
      osc.connect(this.gain);
      osc.start(start);
      osc.stop(start + TONE_SECONDS);
      if (i === CALIBRATION_TONES.length - 1) {
        osc.onended = () => { this.stop(); onDone(); };
      }
    }
    const fade = TONE_SECONDS * 0.1;
    this.gain.gain.setValueAtTime(0, this.context.currentTime);
    this.gain.gain.linearRampToValueAtTime(TONE_GAIN, this.context.currentTime + fade);
    this.gain.gain.setValueAtTime(TONE_GAIN, this.context.currentTime + CALIBRATION_TONES.length * TONE_SECONDS - fade);
    this.gain.gain.linearRampToValueAtTime(0, this.context.currentTime + CALIBRATION_TONES.length * TONE_SECONDS);
    this.active = true;
    CALIBRATION_TONES.forEach((freq, i) => setTimeout(() => onTone(freq), i * TONE_SECONDS * 1000));
  }

  stop() {
    if (this.context) {
      try { this.gain?.disconnect(); } catch {}
      this.context.close().catch(() => {});
    }
    this.context = null; this.gain = null; this.active = false;
  }
}

export { pickAudioOutput, routeContextTo };
