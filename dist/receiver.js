import {SyncDetector, SyncPulseWidth} from './vendor/sync-detector.js';
import {AudioResampler} from './resampler.js';

// Acquire VIS first, then follow Robot36's 150 ms clock. Missing sync pulses
// must not delete image rows or change the alternating Cr/Cb channel order.
export class RobotReceiver {
 constructor(rate, onUpdate = () => {}) {
  this.resampler = rate > 16000 ? new AudioResampler(rate) : null;
  rate = Math.min(rate, 16000);
  Object.assign(this, {rate, onUpdate, position:0, rows:0, done:false, locked:false, dropped:0,
   headers:[], leaderSamples:0, leaderEdge:-Infinity, smoothIndex:0, smoothSum:0, pulses:[]});
  this.sync = new SyncDetector(rate);
  this.buffer = new Float32Array(Math.ceil(rate * 3));
  this.energy = new Float32Array(this.buffer.length);
  this.pixels = new Uint8ClampedArray(320 * 240 * 4);
  for (let i = 3; i < this.pixels.length; i += 4) this.pixels[i] = 255;
  this.smooth = new Float32Array(Math.max(1, Math.round(rate * .001)));
 }
 read(pos, buffer = this.buffer) {
  return buffer[((Math.round(pos) % buffer.length) + buffer.length) % buffer.length];
 }
 mean(start, length, buffer = this.buffer) {
  let sum = 0;
  const n = Math.max(1, Math.round(length));
  for (let i = 0; i < n; i++) sum += this.read(start + i, buffer);
  return sum / n;
 }
 process(samples) {
  if (this.done) return;
  if (this.resampler) samples = this.resampler.process(samples);
  for (let p = 0; p < samples.length; p += 128) {
   const input = samples.subarray(p, p + 128), demod = new Float32Array(input.length);
   const result = this.sync.process(input, demod);
   for (let i = 0; i < input.length; i++) {
    const pos = this.position + i;
    this.buffer[pos % this.buffer.length] = demod[i];
    this.energy[pos % this.energy.length] = input[i] * input[i];
    if (!this.locked) this.findHeader(demod[i], pos);
   }
   this.position += input.length;
   if (!this.locked) this.checkHeaders();
   if (this.locked) {
    if (result.detected && result.width === SyncPulseWidth.NineMilliSeconds)
     this.pulses.push({end:this.position - input.length + result.offset, offset:result.frequencyOffset});
    while (this.locked && !this.done && this.position >= this.nextEnd + this.rate * .144) this.decodeNext();
   }
  }
 }
 findHeader(value, pos) {
  this.smoothSum += value - this.smooth[this.smoothIndex];
  this.smooth[this.smoothIndex] = value;
  this.smoothIndex = (this.smoothIndex + 1) % this.smooth.length;
  const v = this.smoothSum / this.smooth.length;
  if (Math.abs(v) < .25) this.leaderSamples++;
  else {
   if (this.leaderSamples > this.rate * .20) this.leaderEdge = pos;
   this.leaderSamples = 0;
  }
  if (pos - this.leaderEdge < this.rate * .010 && v < -.875) {
   this.headers.push(pos - (this.smooth.length - 1) / 2);
   this.leaderEdge = -Infinity;
  }
 }
 checkHeaders() {
  while (this.headers.length && this.position > this.headers[0] + this.rate * .302) {
   const start = this.headers.shift();
   const offset = this.mean(start - this.rate * .10, this.rate * .04);
   const tone = slot => this.mean(start + this.rate * (slot * .03 + .012), this.rate * .012) - offset;
   // VIS start, seven LSB-first data bits, even parity, stop. Robot36 VIS = 8.
   if (Math.abs(tone(0) + 1.75) > .25 || Math.abs(tone(9) + 1.75) > .25) continue;
   let code = 0, parity = 0, valid = true;
   for (let bit = 0; bit < 8; bit++) {
    const v = tone(bit + 1), one = Math.abs(v + 2) < Math.abs(v + 1.5);
    if (Math.abs(v - (one ? -2 : -1.5)) > .23) valid = false;
    if (bit < 7 && one) code |= 1 << bit;
    parity ^= Number(one);
   }
   const signalEnergy = this.mean(start - this.rate * .10, this.rate * .04, this.energy);
   if (!valid || code !== 8 || parity || signalEnergy < 1e-9) continue;
   Object.assign(this, {locked:true, nextEnd:start + this.rate * .309, period:this.rate * .150,
    offset, signalEnergy, line:0, rows:0, dropped:0, badRun:0, even:null, lastPulse:null, pulses:[], headers:[]});
   this.pixels.fill(0);
   for (let i = 3; i < this.pixels.length; i += 4) this.pixels[i] = 255;
   this.onUpdate({type:'start', rows:0});
   break;
  }
 }
 decodeNext() {
  let end = this.nextEnd;
  const near = this.pulses.filter(p => Math.abs(p.end - end) < this.rate * .003);
  const pulse = near.sort((a,b) => Math.abs(a.end-end) - Math.abs(b.end-end))[0];
  if (pulse) {
   // Slow clock correction follows sound-card drift without jumping to echoes.
   end += (pulse.end - end) * .20;
   if (this.lastPulse) {
    const measured = (pulse.end - this.lastPulse.end) / (this.line - this.lastPulse.line);
    if (Math.abs(measured - this.rate * .15) < this.rate * .001) this.period += (measured - this.period) * .03;
   }
   this.lastPulse = {...pulse, line:this.line};
   this.offset += (pulse.offset - this.offset) * .05;
  }
  this.pulses = this.pulses.filter(p => p.end > end + this.rate * .010);
  const scale = this.period / (this.rate * .150);
  const energy = this.mean(end + this.rate * .010, this.rate * .070, this.energy);
  const valid = energy > Math.max(1e-10, this.signalEnergy * .001);
  this.badRun = valid ? 0 : this.badRun + 1;
  if (!valid) this.dropped++;
  if (this.badRun >= 3) {
   this.locked = false;
   this.leaderSamples = 0;
   this.onUpdate({type:'lost', rows:this.rows, dropped:this.dropped});
   return;
  }
  const y = new Float32Array(320), c = new Float32Array(320);
  for (let x = 0; x < 320; x++) {
   y[x] = this.level(end + this.rate * scale * (.003 + (x+.5) * .088/320));
   c[x] = this.level(end + this.rate * scale * (.097 + (x+.5) * .044/320));
  }
  if (this.line % 2 === 0) this.even = {y,c,valid};
  else if (this.even) {
   for (let row = 0; row < 2; row++) for (let x = 0; x < 320; x++) {
    if (!(row ? valid : this.even.valid)) continue;
    const Y = row ? y[x] : this.even.y[x], cb = c[x]-128, cr = this.even.c[x]-128;
    const p = ((this.line-1+row)*320+x)*4;
    this.pixels[p] = Y + 1.402*cr;
    this.pixels[p+1] = Y - .344136*cb - .714136*cr;
    this.pixels[p+2] = Y + 1.772*cb;
   }
   this.rows = this.line + 1;
   this.even = null;
   const finished = this.rows === 240;
   this.done = finished && this.dropped === 0;
   this.onUpdate({type:finished ? (this.done ? 'complete' : 'incomplete') : 'image', rows:this.rows, pixels:this.pixels, dropped:this.dropped});
   if (finished) this.locked = false;
  }
  this.line++;
  this.nextEnd = end + this.period;
 }
 level(pos) {
  return Math.max(0, Math.min(255, (this.mean(pos-1,3) - this.offset + 1) * 127.5));
 }
}
