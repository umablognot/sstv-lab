// Adapted from smolgroot/sstv-decoder (0BSD). See THIRD_PARTY.txt.
import { Complex, Phasor, FrequencyModulation, SimpleMovingAverage, SchmittTrigger, Delay, ComplexConvolution } from './fm-demodulator.js';
export var SyncPulseWidth = /*#__PURE__*/ function(SyncPulseWidth) {
    SyncPulseWidth[SyncPulseWidth["FiveMilliSeconds"] = 0] = "FiveMilliSeconds";
    SyncPulseWidth[SyncPulseWidth["NineMilliSeconds"] = 1] = "NineMilliSeconds";
    SyncPulseWidth[SyncPulseWidth["TwentyMilliSeconds"] = 2] = "TwentyMilliSeconds";
    SyncPulseWidth[SyncPulseWidth["None"] = 3] = "None";
    return SyncPulseWidth;
}({});
export class SyncDetector {
    syncPulseFilter;
    baseBandLowPass;
    frequencyModulation;
    syncPulseTrigger;
    baseBandOscillator;
    syncPulseValueDelay;
    syncPulseCounter = 0;
    centerFrequency;
    scanLineBandwidth;
    syncPulseFrequencyValue;
    syncPulseFrequencyTolerance;
    syncPulse5msMinSamples;
    syncPulse5msMaxSamples;
    syncPulse9msMaxSamples;
    syncPulse20msMaxSamples;
    syncPulseFilterDelay;
    debugSampleCount = 0;
    debugLastLogTime = 0;
    debugMaxCounter = 0;
    static SYNC_PULSE_FREQ = 1200;
    static BLACK_FREQ = 1500;
    static WHITE_FREQ = 2300;
    constructor(sampleRate){
        this.scanLineBandwidth = SyncDetector.WHITE_FREQ - SyncDetector.BLACK_FREQ;
        this.frequencyModulation = new FrequencyModulation(this.scanLineBandwidth, sampleRate);
        const syncPulse5msSeconds = 0.005;
        const syncPulse9msSeconds = 0.009;
        const syncPulse20msSeconds = 0.020;
        const syncPulse5msMinSeconds = syncPulse5msSeconds / 2;
        const syncPulse5msMaxSeconds = (syncPulse5msSeconds + syncPulse9msSeconds) / 2;
        const syncPulse9msMaxSeconds = (syncPulse9msSeconds + syncPulse20msSeconds) / 2;
        const syncPulse20msMaxSeconds = 0.050;
        this.syncPulse5msMinSamples = Math.round(syncPulse5msMinSeconds * sampleRate);
        this.syncPulse5msMaxSamples = Math.round(syncPulse5msMaxSeconds * sampleRate);
        this.syncPulse9msMaxSamples = Math.round(syncPulse9msMaxSeconds * sampleRate);
        this.syncPulse20msMaxSamples = Math.round(syncPulse20msMaxSeconds * sampleRate);
        const syncPulseFilterSeconds = syncPulse5msSeconds / 2;
        const syncPulseFilterSamples = Math.round(syncPulseFilterSeconds * sampleRate) | 1;
        this.syncPulseFilterDelay = (syncPulseFilterSamples - 1) / 2;
        this.syncPulseFilter = new SimpleMovingAverage(syncPulseFilterSamples);
        this.syncPulseValueDelay = new Delay(syncPulseFilterSamples);
        const lowestFrequency = 1000;
        const highestFrequency = 2800;
        const cutoffFrequency = (highestFrequency - lowestFrequency) / 2;
        const baseBandLowPassSeconds = 0.002;
        const baseBandLowPassSamples = Math.round(baseBandLowPassSeconds * sampleRate) | 1;
        this.baseBandLowPass = ComplexConvolution.createLowPassFilter(baseBandLowPassSamples, cutoffFrequency, sampleRate);
        this.centerFrequency = (lowestFrequency + highestFrequency) / 2;
        this.baseBandOscillator = new Phasor(-this.centerFrequency, sampleRate);
        this.syncPulseFrequencyValue = this.normalizeFrequency(SyncDetector.SYNC_PULSE_FREQ);
        this.syncPulseFrequencyTolerance = 50 * 2 / this.scanLineBandwidth;
        const syncPorchFrequency = 1500;
        const syncHighFrequency = (SyncDetector.SYNC_PULSE_FREQ + syncPorchFrequency) / 2;
        const syncLowFrequency = (SyncDetector.SYNC_PULSE_FREQ + syncHighFrequency) / 2;
        const syncLowValue = this.normalizeFrequency(syncLowFrequency);
        const syncHighValue = this.normalizeFrequency(syncHighFrequency);
        this.syncPulseTrigger = new SchmittTrigger(syncLowValue, syncHighValue);
    }
    normalizeFrequency(frequency) {
        return (frequency - this.centerFrequency) * 2 / this.scanLineBandwidth;
    }
    process(samples, demodulated) {
        let syncPulseDetected = false;
        let syncPulseWidth = 3;
        let syncPulseOffset = 0;
        let frequencyOffset = 0;
        this.debugSampleCount += samples.length;
        let minDemod = Infinity;
        let maxDemod = -Infinity;
        let sumDemod = 0;
        for(let i = 0; i < samples.length; i++){
            let baseBand = new Complex(samples[i], 0).mul(this.baseBandOscillator.rotate());
            baseBand = this.baseBandLowPass.push(baseBand);
            const frequencyValue = this.frequencyModulation.demod(baseBand);
            const syncPulseValue = this.syncPulseFilter.avg(frequencyValue);
            const syncPulseDelayedValue = this.syncPulseValueDelay.push(syncPulseValue);
            demodulated[i] = frequencyValue;
            minDemod = Math.min(minDemod, syncPulseValue);
            maxDemod = Math.max(maxDemod, syncPulseValue);
            sumDemod += syncPulseValue;
            if (this.syncPulseCounter > this.debugMaxCounter) {
                this.debugMaxCounter = this.syncPulseCounter;
            }
            if (!this.syncPulseTrigger.latch(syncPulseValue)) {
                this.syncPulseCounter++;
            } else if (this.syncPulseCounter < this.syncPulse5msMinSamples || this.syncPulseCounter > this.syncPulse20msMaxSamples || Math.abs(syncPulseDelayedValue - this.syncPulseFrequencyValue) > this.syncPulseFrequencyTolerance) {
                if (this.syncPulseCounter > 0) {
                    const now = Date.now();
                    if (now - this.debugLastLogTime > 1000) {
                        const reason = this.syncPulseCounter < this.syncPulse5msMinSamples ? 'too short' : this.syncPulseCounter > this.syncPulse20msMaxSamples ? 'too long' : 'freq mismatch';
                        this.debugLastLogTime = now;
                    }
                }
                this.syncPulseCounter = 0;
            } else {
                if (this.syncPulseCounter < this.syncPulse5msMaxSamples) {
                    syncPulseWidth = 0;
                } else if (this.syncPulseCounter < this.syncPulse9msMaxSamples) {
                    syncPulseWidth = 1;
                } else {
                    syncPulseWidth = 2;
                }
                syncPulseOffset = i - this.syncPulseFilterDelay;
                frequencyOffset = syncPulseDelayedValue - this.syncPulseFrequencyValue;
                syncPulseDetected = true;
                this.syncPulseCounter = 0;
                this.debugMaxCounter = 0;
            }
        }
        const now = Date.now();
        if (now - this.debugLastLogTime > 3000 && !syncPulseDetected) {
            let minCompensated = Infinity;
            let maxCompensated = -Infinity;
            let sumCompensated = 0;
            for(let i = 0; i < demodulated.length; i++){
                minCompensated = Math.min(minCompensated, demodulated[i]);
                maxCompensated = Math.max(maxCompensated, demodulated[i]);
                sumCompensated += demodulated[i];
            }
            const avgCompensated = sumCompensated / demodulated.length;
            const avgFiltered = sumDemod / samples.length;
            this.debugLastLogTime = now;
            this.debugMaxCounter = 0;
        }
        return {
            detected: syncPulseDetected,
            width: syncPulseWidth,
            offset: syncPulseOffset,
            frequencyOffset
        };
    }
    reset() {
        this.syncPulseFilter.reset();
        this.frequencyModulation.reset();
        this.syncPulseTrigger.reset();
        this.syncPulseValueDelay.reset();
        this.syncPulseCounter = 0;
    }
}
