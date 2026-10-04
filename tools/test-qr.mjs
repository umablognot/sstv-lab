// Round-trip test: our QR encoder output must decode cleanly via jsQR.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { encodeBytes, frameChunks, parseFrame, FrameCollector, getByteCapacity, smallestVersionFor } from '../dist/features/qr.js';
// Load the pristine UMD build in a sandbox (package type:module makes require() treat it as ESM).
const sandbox = {};
vm.runInNewContext(fs.readFileSync(new URL('../dist/vendor/jsQR.js', import.meta.url), 'utf8'), sandbox);
const jsQR = sandbox.jsQR ?? sandbox.window?.jsQR ?? sandbox.self?.jsQR;
assert.equal(typeof jsQR, 'function', 'jsQR must load');

function rasterize(qr, scale = 4, border = 4) {
  const size = (qr.size + border * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const gy = Math.floor(y / scale) - border, gx = Math.floor(x / scale) - border;
    const dark = gy >= 0 && gy < qr.size && gx >= 0 && gx < qr.size ? qr.modules[gy][gx] : 0;
    const v = dark ? 0 : 255, p = (y * size + x) * 4;
    pixels[p] = pixels[p + 1] = pixels[p + 2] = v; pixels[p + 3] = 255;
  }
  return { data: pixels, size };
}

function decode(payload, ecl = 'l') {
  const qr = encodeBytes(payload, { ecl });
  const { data, size } = rasterize(qr);
  const result = jsQR(data, size, size);
  assert.ok(result, `jsQR failed to decode ${payload.length}B ecl=${ecl} v=${qr.version}`);
  const decoded = new Uint8Array(Buffer.from(result.binaryData));
  assert.ok(Buffer.from(decoded).equals(Buffer.from(payload)), `payload mismatch ecl=${ecl}`);
  return qr;
}

// deterministic pseudo-random payloads
function pseudoRandomBytes(length, seed = 7) {
  const out = new Uint8Array(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (state >>> 16) & 0xff;
  }
  return out;
}

for (const size of [1, 7, 31, 100, 250, 271, 500]) {
  for (const ecl of ['l', 'm']) {
    const qr = decode(pseudoRandomBytes(size, size + 3), ecl);
    if (size === 271 && ecl === 'l') assert.equal(qr.version, 10, '271 bytes should fill v10-L');
  }
}
// text payloads (ASCII + UTF-8 bytes)
decode(new TextEncoder().encode('MERHABA! Robot36 SSTV lab round trip.'));
decode(new TextEncoder().encode('频率·二维码·تقنية'));

// capacity table sanity (ISO 18004 reference values)
assert.equal(getByteCapacity(1, 'l'), 17);
assert.equal(getByteCapacity(1, 'm'), 14);
assert.equal(getByteCapacity(10, 'l'), 271);
assert.equal(getByteCapacity(40, 'l'), 2953);
assert.equal(getByteCapacity(40, 'h'), 1273);
assert.equal(smallestVersionFor(17, 'l'), 1);
assert.equal(smallestVersionFor(18, 'l'), 2);
assert.equal(smallestVersionFor(2954, 'l'), -1);

// chunk framing round-trip incl. short last frame + duplicate/unordered tolerance
const payload = pseudoRandomBytes(1240, 99);
const frames = frameChunks(payload, 250);
assert.equal(frames.length, 5);
assert.equal(frames[4].length, 7 + (1240 - 4 * 250));
const collector = new FrameCollector();
for (const index of [2, 0, 2, 4, 1, 3]) {
  const parsed = parseFrame(frames[index]);
  assert.ok(parsed, 'frame must parse');
  assert.equal(parsed.total, 5);
  assert.equal(parsed.index, index);
  collector.add(parsed);
}
assert.ok(collector.complete);
assert.ok(Buffer.from(collector.assemble()).equals(Buffer.from(payload)));

// foreign content is rejected
assert.equal(parseFrame(new TextEncoder().encode('https://example.com')), null);
assert.equal(parseFrame(new Uint8Array([0x53, 0x51, 0, 3, 0, 9, 1, 65])), null, 'index>=total must fail');

// oversized payload rejected clearly
assert.throws(() => encodeBytes(new Uint8Array(3000), { ecl: 'l' }), RangeError);

console.log('QR encoder/decoder round-trip: PASS');
