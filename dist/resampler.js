// Continuous, band-limited resampling before the expensive FM filters. Keeping
// the phase and FIR history between microphone blocks avoids clicks and drift.
export class AudioResampler {
 constructor(inputRate, outputRate = 16000) {
  this.step = inputRate / outputRate;
  this.next = 0;
  this.position = 0;
  this.half = 31;
  this.buffer = new Float32Array(128);
  this.filters = [];
  const cutoff = Math.min(3600 / inputRate, .45);
  for (let phase = 0; phase < 128; phase++) {
   const taps = new Float64Array(63);
   let sum = 0;
   for (let n = -31; n <= 31; n++) {
    const x = n - phase / 128;
    const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
    const window = .42 + .5 * Math.cos(Math.PI * n / 31) + .08 * Math.cos(2 * Math.PI * n / 31);
    taps[n + 31] = sinc * window;
    sum += taps[n + 31];
   }
   for (let i = 0; i < taps.length; i++) taps[i] /= sum;
   this.filters.push(taps);
  }
 }
 process(input) {
  const output = new Float32Array(Math.ceil(input.length / this.step) + 2);
  let count = 0;
  for (const value of input) {
   this.buffer[this.position % this.buffer.length] = value;
   this.position++;
   while (Math.floor(this.next) + this.half < this.position) {
    const center = Math.floor(this.next), taps = this.filters[Math.floor((this.next - center) * 128)];
    let sum = 0;
    for (let i = 0; i < taps.length; i++) {
     const index = center + i - this.half;
     if (index >= 0) sum += taps[i] * this.buffer[index % this.buffer.length];
    }
    output[count++] = sum;
    this.next += this.step;
   }
  }
  return output.subarray(0, count);
 }
}
