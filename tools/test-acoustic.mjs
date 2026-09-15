// Loudspeaker-to-microphone impairments. The clean round trip in test-dsp.mjs
// passes even when the decoder falls apart in a real room, because a room adds
// things a synthesised signal never has: sounds outside the Robot36 band, the
// reflection off the desk arriving a few milliseconds late, and low frequency
// rumble from holding the phone. Each case below decoded to confetti or failed
// to lock at all before the receive filter was sharpened.
import assert from 'node:assert/strict';
import {encodeRobot36} from '../dist/encoder.js';
import {RobotReceiver} from '../dist/receiver.js';

const RATE = 48000;
const colors = [[255,255,255],[255,255,0],[0,255,255],[0,255,0],[255,0,255],[255,0,0],[0,0,255],[0,0,0]];
const pixels = new Uint8ClampedArray(320*240*4);
for (let y = 0; y < 240; y++) for (let x = 0; x < 320; x++) {
 const p = (y*320+x)*4, c = colors[Math.floor(x/40)];
 pixels.set([...c,255], p);
}
const source = encodeRobot36(pixels, RATE);

function colourError(decoded) {
 let sum = 0, n = 0;
 for (let y = 8; y < 232; y++) for (let x = 8; x < 312; x++) {
  if (x % 40 < 8 || x % 40 > 32) continue;
  for (let k = 0; k < 3; k++) { sum += Math.abs(decoded[(y*320+x)*4+k] - pixels[(y*320+x)*4+k]); n++; }
 }
 return sum / n;
}
let seed = 20260915;
const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
const rms = x => { let p = 0; for (const v of x) p += v*v; return Math.sqrt(p / x.length); };

const silenceAround = x => { const y = new Float32Array(x.length + RATE); y.set(x, RATE/2); return y; };
function interferingTone(x, frequency, decibels) {
 const amplitude = rms(x) * Math.pow(10, decibels/20), y = Float32Array.from(x);
 for (let i = 0; i < y.length; i++) y[i] += amplitude * Math.sin(2*Math.PI*frequency*i/RATE);
 return y;
}
function whiteNoise(x, snrDecibels) {
 const amplitude = rms(x) / Math.pow(10, snrDecibels/20), y = Float32Array.from(x);
 for (let i = 0; i < y.length; i++) y[i] += amplitude * random() * 3.46;
 return y;
}
function reflection(x, milliseconds, gain) {
 const delay = Math.round(milliseconds * RATE / 1000), y = Float32Array.from(x);
 for (let i = delay; i < x.length; i++) y[i] += gain * x[i-delay];
 return y;
}
function rumble(x, decibels) {
 const amplitude = rms(x) * Math.pow(10, decibels/20), y = Float32Array.from(x);
 let a = 0, b = 0; const k = 2*Math.PI*60/RATE;
 for (let i = 0; i < y.length; i++) { a += k*(random()*3.46 - a); b += k*(a - b); y[i] += amplitude * b * 30; }
 return y;
}

function decode(name, samples, limit) {
 const receiver = new RobotReceiver(RATE, () => {});
 for (let p = 0; p < samples.length; p += 1024) receiver.process(samples.subarray(p, p+1024));
 const error = colourError(receiver.pixels);
 console.log(JSON.stringify({name, rows:receiver.rows, error:+error.toFixed(2)}));
 assert.equal(receiver.rows, 240, name + ' must decode every row');
 assert.equal(receiver.done, true, name + ' must finish without missing audio');
 assert.ok(error < limit, name + ' colour error ' + error.toFixed(1) + ' exceeds ' + limit);
}

decode('clean', silenceAround(source), 3);
// Out of band sounds. The old 33-tap filter was only 6 dB down at the band edge,
// so a 3 kHz tone six decibels over the signal stopped it from locking entirely.
decode('tone-500Hz+12dB', silenceAround(interferingTone(source, 500, 12)), 10);
decode('tone-700Hz+6dB', silenceAround(interferingTone(source, 700, 6)), 10);
decode('tone-3000Hz+6dB', silenceAround(interferingTone(source, 3000, 6)), 10);
decode('tone-3500Hz+12dB', silenceAround(interferingTone(source, 3500, 12)), 10);
decode('rumble+20dB', silenceAround(rumble(source, 20)), 15);
decode('noise-10dB-SNR', silenceAround(whiteNoise(source, 10)), 10);
decode('noise-6dB-SNR', silenceAround(whiteNoise(source, 6)), 15);
// Desk reflections. These stay lossy because the echo really does overwrite the
// picture, but the clock must still hold for all 240 rows.
decode('reflection-2ms', silenceAround(reflection(source, 2, .8)), 30);
decode('reflection-3ms', silenceAround(reflection(source, 3, .8)), 30);

// The decoder exposes reconstructed pixels, not a calibrated quality score.
// Validate actual colour error and complete reception instead of an absent field.
