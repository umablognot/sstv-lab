// Adapted from smolgroot/sstv-decoder (0BSD). See THIRD_PARTY.txt.
export class Complex {
    real;
    imag;
    constructor(real = 0, imag = 0){
        this.real = real;
        this.imag = imag;
    }
    set(real, imag = 0) {
        this.real = real;
        this.imag = imag;
        return this;
    }
    mul(other) {
        const real = this.real * other.real - this.imag * other.imag;
        const imag = this.real * other.imag + this.imag * other.real;
        return new Complex(real, imag);
    }
    conj() {
        return new Complex(this.real, -this.imag);
    }
    arg() {
        return Math.atan2(this.imag, this.real);
    }
}
export class Phasor {
    phase = 0;
    deltaPhase;
    constructor(frequency, sampleRate){
        this.deltaPhase = 2 * Math.PI * frequency / sampleRate;
    }
    rotate() {
        const result = new Complex(Math.cos(this.phase), Math.sin(this.phase));
        this.phase += this.deltaPhase;
        while(this.phase > Math.PI)this.phase -= 2 * Math.PI;
        while(this.phase < -Math.PI)this.phase += 2 * Math.PI;
        return result;
    }
}
export class FrequencyModulation {
    prev;
    scale;
    constructor(bandwidth, sampleRate){
        this.scale = sampleRate / (bandwidth * Math.PI);
        this.prev = 0;
    }
    wrap(value) {
        if (value < -Math.PI) return value + 2 * Math.PI;
        if (value > Math.PI) return value - 2 * Math.PI;
        return value;
    }
    demod(sample) {
        const phase = sample.arg();
        const delta = this.wrap(phase - this.prev);
        this.prev = phase;
        return this.scale * delta;
    }
    reset() {
        this.prev = 0;
    }
}
export class SimpleMovingAverage {
    length;
    buffer;
    index = 0;
    sum = 0;
    count = 0;
    constructor(length){
        this.length = length;
        this.buffer = new Float32Array(length);
    }
    avg(value) {
        this.sum -= this.buffer[this.index];
        this.sum += value;
        this.buffer[this.index] = value;
        this.index = (this.index + 1) % this.length;
        if (this.count < this.length) {
            this.count++;
        }
        return this.sum / this.count;
    }
    reset() {
        this.buffer.fill(0);
        this.index = 0;
        this.sum = 0;
        this.count = 0;
    }
}
export class SchmittTrigger {
    lowThreshold;
    highThreshold;
    state = false;
    constructor(lowThreshold, highThreshold){
        this.lowThreshold = lowThreshold;
        this.highThreshold = highThreshold;
    }
    latch(value) {
        if (value < this.lowThreshold) {
            this.state = false;
        } else if (value > this.highThreshold) {
            this.state = true;
        }
        return this.state;
    }
    reset() {
        this.state = false;
    }
}
export class Delay {
    length;
    buffer;
    index = 0;
    constructor(length){
        this.length = length;
        this.buffer = new Float32Array(length);
    }
    push(value) {
        const delayed = this.buffer[this.index];
        this.buffer[this.index] = value;
        this.index = (this.index + 1) % this.length;
        return delayed;
    }
    reset() {
        this.buffer.fill(0);
        this.index = 0;
    }
}
export class ExponentialMovingAverage {
    alpha = 1;
    prev = 0;
    cutoff(freq, rate, order) {
        const x = Math.cos(2 * Math.PI * freq / rate);
        const alphaBase = x - 1 + Math.sqrt(x * (x - 4) + 3);
        this.alpha = Math.pow(alphaBase, 1.0 / order);
    }
    avg(value) {
        this.prev = this.prev * (1 - this.alpha) + this.alpha * value;
        return this.prev;
    }
    reset() {
        this.prev = 0;
    }
}
class Kaiser {
    summands;
    constructor(){
        this.summands = new Float64Array(35);
    }
    square(value) {
        return value * value;
    }
    i0(x) {
        this.summands[0] = 1;
        let val = 1;
        for(let n = 1; n < this.summands.length; n++){
            val *= x / (2 * n);
            this.summands[n] = this.square(val);
        }
        this.summands.sort((a, b)=>a - b);
        let sum = 0;
        for(let n = this.summands.length - 1; n >= 0; n--){
            sum += this.summands[n];
        }
        return sum;
    }
    window(a, n, N) {
        return this.i0(Math.PI * a * Math.sqrt(1 - this.square(2.0 * n / (N - 1) - 1))) / this.i0(Math.PI * a);
    }
}
class Filter {
    static sinc(x) {
        if (x === 0) return 1;
        const px = x * Math.PI;
        return Math.sin(px) / px;
    }
    static lowPass(cutoff, rate, n, N) {
        const f = 2 * cutoff / rate;
        const x = n - (N - 1) / 2.0;
        return f * Filter.sinc(f * x);
    }
}
export class ComplexConvolution {
    length;
    taps;
    real;
    imag;
    sum;
    pos = 0;
    constructor(length){
        this.length = length;
        this.taps = new Float32Array(length);
        this.real = new Float32Array(length);
        this.imag = new Float32Array(length);
        this.sum = new Complex();
    }
    push(input) {
        this.real[this.pos] = input.real;
        this.imag[this.pos] = input.imag;
        if (++this.pos >= this.length) {
            this.pos = 0;
        }
        this.sum.real = 0;
        this.sum.imag = 0;
        let readPos = this.pos;
        for (const tap of this.taps){
            this.sum.real += tap * this.real[readPos];
            this.sum.imag += tap * this.imag[readPos];
            if (++readPos >= this.length) {
                readPos = 0;
            }
        }
        return this.sum;
    }
    static createLowPassFilter(length, cutoffFrequency, sampleRate) {
        const filter = new ComplexConvolution(length);
        const kaiser = new Kaiser();
        for(let i = 0; i < filter.length; i++){
            filter.taps[i] = kaiser.window(2.0, i, filter.length) * Filter.lowPass(cutoffFrequency, sampleRate, i, filter.length);
        }
        return filter;
    }
}
