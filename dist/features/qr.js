/*
 * SSTV Lab — pure-JS QR code encoder (byte mode).
 * Implements ISO/IEC 18004 core: capacity tables, Reed–Solomon ECC over
 * GF(256), zigzag placement, format/version info, mask + penalty selection.
 * Capacity/ECC tables follow the public reference values popularised by
 * Nayuki's QR-Code-generator (MIT) — credited in THIRD_PARTY.txt.
 * Round-trip verified in tools/test-qr.mjs against the vendored jsQR decoder.
 */

const ECC_FORMAT_BITS = { l: 1, m: 0, q: 3, h: 2 };

// ECC codewords per block, indexed [version 1..40]
const ECC_CODEWORDS_PER_BLOCK = {
  l: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  m: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  h: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
};

// Number of RS error-correction blocks, indexed [version 1..40]
const NUM_ERROR_CORRECTION_BLOCKS = {
  l: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  m: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  h: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
};

// --- GF(256) arithmetic, modulus 0x11D -------------------------------------
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

// Descending divisor with implicit leading x^degree term (array length = degree):
// result[0] = coeff of x^(degree-1) … result[degree-1] = constant term.
function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1; // α^0
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 2);
  }
  return Uint8Array.from(result);
}

function rsRemainder(data, divisor) {
  const result = new Uint8Array(divisor.length);
  for (const b of data) {
    const factor = b ^ result[0];
    result.copyWithin(0, 1);
    result[divisor.length - 1] = 0;
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
  }
  return result;
}

// --- capacity ---------------------------------------------------------------
export function getNumRawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

export function getDataCodewords(version, ecl = 'l') {
  return (getNumRawDataModules(version) >> 3) -
    ECC_CODEWORDS_PER_BLOCK[ecl][version] * NUM_ERROR_CORRECTION_BLOCKS[ecl][version];
}

export function getByteCapacity(version, ecl = 'l') {
  const countBits = 4 + (version < 10 ? 8 : 16);
  return Math.floor((getDataCodewords(version, ecl) * 8 - countBits) / 8);
}

export function smallestVersionFor(byteLength, ecl = 'l', maxVersion = 40) {
  for (let v = 1; v <= maxVersion; v++) {
    if (getByteCapacity(v, ecl) >= byteLength) return v;
  }
  return -1;
}

// --- data codewords ----------------------------------------------------------
function toBits(buffer, value, length) {
  for (let i = length - 1; i >= 0; i--) buffer.push((value >>> i) & 1);
}

function makeDataCodewords(bytes, version, ecl) {
  const bits = [];
  toBits(bits, 0b0100, 4);                                  // byte mode
  toBits(bits, bytes.length, version < 10 ? 8 : 16);        // char count
  for (const b of bytes) toBits(bits, b, 8);
  const capacityBits = getDataCodewords(version, ecl) * 8;
  toBits(bits, 0, Math.min(4, capacityBits - bits.length)); // terminator
  toBits(bits, 0, (8 - bits.length % 8) % 8);               // byte align
  for (let pad = 0xEC; bits.length < capacityBits; pad ^= 0xEC ^ 0x11) toBits(bits, pad, 8);
  const data = new Uint8Array(bits.length / 8);
  for (let i = 0; i < data.length; i++) {
    data[i] = (bits[i * 8] << 7) | (bits[i * 8 + 1] << 6) | (bits[i * 8 + 2] << 5) | (bits[i * 8 + 3] << 4) |
      (bits[i * 8 + 4] << 3) | (bits[i * 8 + 5] << 2) | (bits[i * 8 + 6] << 1) | bits[i * 8 + 7];
  }
  return data;
}

function addEccAndInterleave(data, ver, ecl) {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl][ver];
  const rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - rawCodewords % numBlocks;
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const generator = rsDivisor(blockEccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dataLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const dat = data.subarray(k, k + dataLen); k += dataLen;
    blocks.push({ dat: dat.slice(), ecc: rsRemainder(dat, generator) });
  }
  const interleaved = [];
  const maxDataLen = shortBlockLen - blockEccLen + 1;
  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      const dataLen = shortBlockLen - blockEccLen + (b < numShortBlocks ? 0 : 1);
      if (i < dataLen) interleaved.push(blocks[b].dat[i]);
    }
  }
  for (let i = 0; i < blockEccLen; i++) {
    for (let b = 0; b < numBlocks; b++) interleaved.push(blocks[b].ecc[i]);
  }
  return Uint8Array.from(interleaved);
}

// --- matrix drawing ----------------------------------------------------------
function getAlignmentPatternPositions(ver) {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = ver * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

function drawFunctionPatterns(size, version, ecl) {
  const modules = Array.from({ length: size }, () => new Uint8Array(size));
  const isFunction = Array.from({ length: size }, () => new Uint8Array(size));
  const setFn = (x, y, dark) => { modules[y][x] = dark ? 1 : 0; isFunction[y][x] = 1; };

  for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || x >= size || y < 0 || y >= size) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      setFn(x, y, dist !== 2 && dist !== 4);
    }
  }
  const align = getAlignmentPatternPositions(version);
  for (let i = 0; i < align.length; i++) for (let j = 0; j < align.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      setFn(align[j] + dx, align[i] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  setFn(8, size - 8, 1); // dark module
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = (bits >>> i) & 1, a = size - 11 + i % 3, b = Math.floor(i / 3);
      setFn(a, b, bit); setFn(b, a, bit);
    }
  }
  // Reserve the format-info cells (mask 0 placeholder) so data placement
  // skips them; the real bits are written after masking.
  drawFormatInfo(modules, isFunction, size, ecl, 0);
  return { modules, isFunction };
}

function placeCodewords(modules, isFunction, size, codewords) {
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && bitIndex < codewords.length * 8) {
          modules[y][x] = (codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1;
          bitIndex++;
        }
      }
    }
  }
}

function applyMaskToData(modules, isFunction, mask) {
  const size = modules.length;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (isFunction[y][x]) continue;
    let invert = false;
    switch (mask) {
      case 0: invert = (x + y) % 2 === 0; break;
      case 1: invert = y % 2 === 0; break;
      case 2: invert = x % 3 === 0; break;
      case 3: invert = (x + y) % 3 === 0; break;
      case 4: invert = (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0; break;
      case 5: invert = x * y % 2 + x * y % 3 === 0; break;
      case 6: invert = (x * y % 2 + x * y % 3) % 2 === 0; break;
      case 7: invert = ((x + y) % 2 + x * y % 3) % 2 === 0; break;
    }
    if (invert) modules[y][x] ^= 1;
  }
}

function drawFormatInfo(modules, isFunction, size, ecl, mask) {
  const data = ECC_FORMAT_BITS[ecl] << 3 | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = (data << 10 | rem) ^ 0x5412;
  const bit = i => (bits >>> i) & 1;
  const setF = (x, y, dark) => { modules[y][x] = dark ? 1 : 0; isFunction[y][x] = 1; };
  for (let i = 0; i <= 5; i++) setF(8, i, bit(i));
  setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
  for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(i));
  setF(8, size - 8, 1); // dark module
}

// --- penalty -----------------------------------------------------------------
function maskPenalty(modules) {
  const size = modules.length;
  let penalty = 0;
  const runs = line => {
    let penaltyRun = 0, runColor = line[0], runLen = 1;
    for (let i = 1; i < line.length; i++) {
      if (line[i] === runColor) runLen++;
      else { if (runLen >= 5) penaltyRun += runLen - 2; runColor = line[i]; runLen = 1; }
    }
    if (runLen >= 5) penaltyRun += runLen - 2;
    return penaltyRun;
  };
  for (const row of modules) penalty += runs(row);
  for (let x = 0; x < size; x++) penalty += runs(modules.map(row => row[x]));
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const c = modules[y][x];
    if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) penalty += 3;
  }
  const PATTERN = [1, 0, 1, 1, 1, 0, 1];
  const lineScan = line => {
    let found = 0;
    for (let i = 0; i <= line.length - 7; i++) {
      let match = true;
      for (let k = 0; k < 7; k++) if (line[i + k] !== PATTERN[k]) { match = false; break; }
      if (match) found++;
    }
    return found * 40;
  };
  for (const row of modules) penalty += lineScan(row);
  for (let x = 0; x < size; x++) penalty += lineScan(modules.map(row => row[x]));
  let dark = 0;
  for (const row of modules) for (const cell of row) dark += cell;
  const total = size * size;
  penalty += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return penalty;
}

// --- public API --------------------------------------------------------------
export function encodeBytes(bytes, { ecl = 'l', maxVersion = 40 } = {}) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('bytes must be Uint8Array');
  const version = smallestVersionFor(bytes.length, ecl, maxVersion);
  if (version < 0) throw new RangeError(`payload too large for a single QR (${bytes.length} bytes)`);
  const data = makeDataCodewords(bytes, version, ecl);
  const codewords = addEccAndInterleave(data, version, ecl);
  const size = version * 4 + 17;
  let best = null, bestPenalty = Infinity, bestMask = 0;
  for (let mask = 0; mask < 8; mask++) {
    const { modules, isFunction } = drawFunctionPatterns(size, version, ecl);
    placeCodewords(modules, isFunction, size, codewords);
    applyMaskToData(modules, isFunction, mask);
    drawFormatInfo(modules, isFunction, size, ecl, mask);
    const penalty = maskPenalty(modules);
    if (penalty < bestPenalty) { bestPenalty = penalty; best = modules; bestMask = mask; }
  }
  return { version, mask: bestMask, size, modules: best, ecl };
}

// --- transfer framing (chunked QR stream) ------------------------------------
export const QR_MAGIC = 0x53; // 'S'

export function frameChunks(payload, chunkSize = 250) {
  const total = Math.ceil(payload.length / chunkSize);
  if (total > 65535) throw new RangeError('payload spans too many QR frames');
  const frames = [];
  for (let i = 0; i < total; i++) {
    const body = payload.subarray(i * chunkSize, Math.min((i + 1) * chunkSize, payload.length));
    const frame = new Uint8Array(7 + body.length);
    frame[0] = QR_MAGIC; frame[1] = 0x51;            // 'SQ'
    frame[2] = total >>> 8; frame[3] = total & 0xFF;  // total frames (BE)
    frame[4] = i >>> 8; frame[5] = i & 0xFF;          // frame index (BE)
    frame[6] = body.length;                           // body length
    frame.set(body, 7);
    frames.push(frame);
  }
  return frames;
}

export function parseFrame(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) return null;
  if (bytes[0] !== QR_MAGIC || bytes[1] !== 0x51) return null;
  const total = (bytes[2] << 8) | bytes[3];
  const index = (bytes[4] << 8) | bytes[5];
  const length = bytes[6];
  if (index >= total || bytes.length < 7 + length) return null;
  return { total, index, body: bytes.subarray(7, 7 + length) };
}

export class FrameCollector {
  constructor() { this.reset(); }
  reset() { this.parts = new Map(); this.total = 0; }
  get count() { return this.parts.size; }
  get complete() { return this.total > 0 && this.parts.size === this.total; }
  add(frame) {
    this.total = frame.total;
    if (!this.parts.has(frame.index)) this.parts.set(frame.index, frame.body);
    return this.complete;
  }
  assemble() {
    if (!this.complete) return null;
    const ordered = [...this.parts.keys()].sort((a, b) => a - b).map(k => this.parts.get(k));
    const length = ordered.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(length);
    let offset = 0;
    for (const part of ordered) { out.set(part, offset); offset += part.length; }
    return out;
  }
}
