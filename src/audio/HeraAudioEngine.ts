import { HeraParameters, DEFAULT_PARAMETERS, VoiceStatus } from '../types/synth';

// Curve translation functions matching HeraTables.cpp
export function getLfoRateHz(value: number): number {
  return 21.8 * Math.pow(Math.max(0, Math.min(1, value)), 2.863) + 0.4035;
}

export function getLfoDelaySec(value: number): number {
  return Math.pow(Math.max(0, Math.min(1, value)) * 1.64, 1.923);
}

export function getAttackSec(value: number): number {
  return 0.0099 * Math.exp(5.8 * Math.max(0, Math.min(1, value)));
}

export function getDecaySec(value: number): number {
  return 0.0495 * Math.exp(6.0 * Math.max(0, Math.min(1, value)));
}

export function getReleaseSec(value: number): number {
  return 0.0495 * Math.exp(6.0 * Math.max(0, Math.min(1, value)));
}

export function getHpfFrequency(value: number): number {
  if (value < 0.05) return 10; // Flat bypass
  // Stepped approximation matching Juno 4-way switch or continuous curve:
  // table: 140, 250, 520, 1220
  const normalized = Math.max(0, Math.min(1, (value - 0.05) / 0.95));
  return 68.53 * Math.exp(4.065 * normalized) + 72.63;
}

class HeraVoiceInstance {
  id: number;
  note: number = -1;
  baseFreq: number = 440;
  startTime: number = 0;
  active: boolean = false;
  released: boolean = true;

  // Nodes
  private ctx: AudioContext;
  private voiceGain: GainNode;
  private sawOsc: OscillatorNode | null = null;
  private pulseOsc1: OscillatorNode | null = null;
  private pulseOsc2: OscillatorNode | null = null;
  private pulseInvertGain: GainNode | null = null;
  private pulseDelay: DelayNode | null = null;
  private subOsc: OscillatorNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;

  private sawGain: GainNode;
  private pulseGain: GainNode;
  private subGain: GainNode;
  private noiseGain: GainNode;

  private vcfFilter1: BiquadFilterNode;
  private vcfFilter2: BiquadFilterNode;
  private envGain: GainNode;

  private noiseBuffer: AudioBuffer;
  private releaseTimer: number | null = null;

  constructor(id: number, ctx: AudioContext, destination: AudioNode, noiseBuffer: AudioBuffer) {
    this.id = id;
    this.ctx = ctx;
    this.noiseBuffer = noiseBuffer;

    this.voiceGain = ctx.createGain();
    this.voiceGain.gain.value = 1.0;

    this.sawGain = ctx.createGain();
    this.pulseGain = ctx.createGain();
    this.subGain = ctx.createGain();
    this.noiseGain = ctx.createGain();

    // 4-pole cascaded filter (2x 2-pole Biquad in series)
    this.vcfFilter1 = ctx.createBiquadFilter();
    this.vcfFilter1.type = 'lowpass';
    this.vcfFilter2 = ctx.createBiquadFilter();
    this.vcfFilter2.type = 'lowpass';

    this.vcfFilter1.connect(this.vcfFilter2);

    this.envGain = ctx.createGain();
    this.envGain.gain.value = 0;

    this.vcfFilter2.connect(this.envGain);
    this.envGain.connect(this.voiceGain);
    this.voiceGain.connect(destination);
  }

  start(
    note: number,
    velocity: number,
    params: HeraParameters,
    pitchBendSemitones: number,
    lfoValue: number
  ) {
    if (this.releaseTimer !== null) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
    this.stopImmediate();

    this.note = note;
    this.startTime = this.ctx.currentTime;
    this.active = true;
    this.released = false;

    // Range factor: 0: 16' (half freq), 1: 8' (normal), 2: 4' (double freq)
    const rangeFactors = [0.5, 1.0, 2.0];
    const rangeFactor = rangeFactors[Math.max(0, Math.min(2, Math.floor(params.DCORange)))];

    // Standard MIDI note to frequency: 440 * 2^((note - 69)/12)
    const midiFreq = 440 * Math.pow(2, (note - 69) / 12);
    this.baseFreq = midiFreq * rangeFactor;

    // Pitch modulation: LFO depth + Pitch bend
    const pitchDetune = pitchBendSemitones * 100 + lfoValue * params.DCOPitchModDepth * 200;

    const t = this.ctx.currentTime;

    // 1. Saw Oscillator
    this.sawOsc = this.ctx.createOscillator();
    this.sawOsc.type = 'sawtooth';
    this.sawOsc.frequency.setValueAtTime(this.baseFreq, t);
    this.sawOsc.detune.setValueAtTime(pitchDetune, t);
    this.sawGain.gain.setValueAtTime(params.DCOSawLevel * 0.45, t);
    this.sawOsc.connect(this.sawGain);
    this.sawGain.connect(this.vcfFilter1);
    this.sawOsc.start(t);

    // 2. Pulse Oscillator with PWM:
    // Implemented via phase-cancellation of two sawtooth waves through delay line
    this.pulseOsc1 = this.ctx.createOscillator();
    this.pulseOsc1.type = 'sawtooth';
    this.pulseOsc1.frequency.setValueAtTime(this.baseFreq, t);
    this.pulseOsc1.detune.setValueAtTime(pitchDetune, t);

    this.pulseOsc2 = this.ctx.createOscillator();
    this.pulseOsc2.type = 'sawtooth';
    this.pulseOsc2.frequency.setValueAtTime(this.baseFreq, t);
    this.pulseOsc2.detune.setValueAtTime(pitchDetune, t);

    this.pulseInvertGain = this.ctx.createGain();
    this.pulseInvertGain.gain.value = -1.0;

    this.pulseDelay = this.ctx.createDelay(0.05);

    // Calculate pulse width (0.05 to 0.95)
    let pwm = params.DCOPWMDepth;
    if (params.DCOPWMMod === 1) {
      // LFO modulation
      pwm *= (lfoValue * 0.5 + 0.5);
    }
    const pulseWidthRatio = 0.5 - 0.45 * Math.max(-0.95, Math.min(0.95, pwm));
    const period = 1 / Math.max(10, this.baseFreq);
    const delayTime = Math.max(0.00005, Math.min(0.04, period * pulseWidthRatio));
    this.pulseDelay.delayTime.setValueAtTime(delayTime, t);

    this.pulseOsc1.connect(this.pulseGain);
    this.pulseOsc2.connect(this.pulseInvertGain);
    this.pulseInvertGain.connect(this.pulseDelay);
    this.pulseDelay.connect(this.pulseGain);

    this.pulseGain.gain.setValueAtTime(params.DCOPulseLevel * 0.45, t);
    this.pulseGain.connect(this.vcfFilter1);
    this.pulseOsc1.start(t);
    this.pulseOsc2.start(t);

    // 3. Sub Oscillator (square wave 1 octave down)
    this.subOsc = this.ctx.createOscillator();
    this.subOsc.type = 'square';
    this.subOsc.frequency.setValueAtTime(this.baseFreq * 0.5, t);
    this.subOsc.detune.setValueAtTime(pitchDetune, t);
    this.subGain.gain.setValueAtTime(params.DCOSubLevel * 0.4, t);
    this.subOsc.connect(this.subGain);
    this.subGain.connect(this.vcfFilter1);
    this.subOsc.start(t);

    // 4. Noise generator
    this.noiseSource = this.ctx.createBufferSource();
    this.noiseSource.buffer = this.noiseBuffer;
    this.noiseSource.loop = true;
    this.noiseGain.gain.setValueAtTime(params.DCONoiseLevel * 0.35, t);
    this.noiseSource.connect(this.noiseGain);
    this.noiseGain.connect(this.vcfFilter1);
    this.noiseSource.start(t);

    // Filter cutoff calculation & envelope modulation
    this.updateFilter(params, pitchBendSemitones, lfoValue, 1.0, true);

    // Amplitude Envelope
    const velFactor = Math.max(0.2, (velocity / 127) * (velocity / 127) * 1.5);
    const masterGain = params.VCADepth * velFactor;

    this.envGain.gain.cancelScheduledValues(t);
    this.envGain.gain.setValueAtTime(0, t);

    if (params.VCAType === 1) {
      // Gate mode: rapid attack and instant release
      this.envGain.gain.linearRampToValueAtTime(masterGain, t + 0.004);
    } else {
      // ADSR Envelope mode
      const attackSec = Math.max(0.002, getAttackSec(params.ENVAttack));
      const decaySec = Math.max(0.004, getDecaySec(params.ENVDecay));
      const sustainVal = params.ENVSustain * masterGain;

      this.envGain.gain.linearRampToValueAtTime(masterGain, t + attackSec);
      this.envGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustainVal), t + attackSec + decaySec);
    }
  }

  updateFilter(
    params: HeraParameters,
    pitchBendSemitones: number,
    lfoValue: number,
    envAmountMultiplier: number = 1.0,
    isNoteOn: boolean = false
  ) {
    const t = this.ctx.currentTime;

    // Authentic Hera cutoff equation:
    // cutoff = 7.8 * 2^(cutoffOctaves + envDetuneOctaves + lfoDetuneOctaves + keyboardDetuneOctaves + filterBendOctaves)
    const cutoffOctaves = params.VCFCutoff * (200 / 12) + params.VCFResonance * 0.5;
    const keyboardDetuneOctaves = params.VCFKey * ((this.note - 60) / 12);
    const filterBendOctaves = params.VCFBendDepth * (pitchBendSemitones / 12);
    const lfoDetuneOctaves = params.VCFLFO * lfoValue * 3.0;

    // Base cutoff frequency
    const baseOctaves = cutoffOctaves + keyboardDetuneOctaves + filterBendOctaves + lfoDetuneOctaves;
    let baseCutoffHz = 7.8 * Math.pow(2, baseOctaves);

    // Q calculation for 2 cascaded filters:
    // Juno self-oscillates at max resonance
    const resonanceQ = Math.max(0.5, params.VCFResonance * 18 + 0.707);
    this.vcfFilter1.Q.setValueAtTime(resonanceQ, t);
    this.vcfFilter2.Q.setValueAtTime(resonanceQ, t);

    // Envelope modulation of cutoff
    const envOctaves = params.VCFEnv * 12.0 * envAmountMultiplier;
    const peakOctaves = baseOctaves + envOctaves;
    const peakCutoffHz = Math.min(20000, Math.max(20, 7.8 * Math.pow(2, peakOctaves)));
    const sustainOctaves = baseOctaves + envOctaves * params.ENVSustain;
    const sustainCutoffHz = Math.min(20000, Math.max(20, 7.8 * Math.pow(2, sustainOctaves)));

    baseCutoffHz = Math.min(20000, Math.max(20, baseCutoffHz));

    this.vcfFilter1.frequency.cancelScheduledValues(t);
    this.vcfFilter2.frequency.cancelScheduledValues(t);

    if (isNoteOn && Math.abs(params.VCFEnv) > 0.01) {
      const attackSec = Math.max(0.002, getAttackSec(params.ENVAttack));
      const decaySec = Math.max(0.004, getDecaySec(params.ENVDecay));

      this.vcfFilter1.frequency.setValueAtTime(baseCutoffHz, t);
      this.vcfFilter2.frequency.setValueAtTime(baseCutoffHz, t);

      this.vcfFilter1.frequency.exponentialRampToValueAtTime(peakCutoffHz, t + attackSec);
      this.vcfFilter2.frequency.exponentialRampToValueAtTime(peakCutoffHz, t + attackSec);

      this.vcfFilter1.frequency.exponentialRampToValueAtTime(sustainCutoffHz, t + attackSec + decaySec);
      this.vcfFilter2.frequency.exponentialRampToValueAtTime(sustainCutoffHz, t + attackSec + decaySec);
    } else {
      this.vcfFilter1.frequency.setValueAtTime(sustainCutoffHz, t);
      this.vcfFilter2.frequency.setValueAtTime(sustainCutoffHz, t);
    }
  }

  stop(params: HeraParameters) {
    if (!this.active || this.released) return;
    this.released = true;

    if (this.releaseTimer !== null) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }

    const t = this.ctx.currentTime;
    this.envGain.gain.cancelScheduledValues(t);

    if (params.VCAType === 1) {
      // Gate release: rapid 5ms
      this.envGain.gain.linearRampToValueAtTime(0.0001, t + 0.006);
      this.releaseTimer = window.setTimeout(() => {
        this.stopImmediate();
        this.releaseTimer = null;
      }, 15);
    } else {
      // ADSR release
      const releaseSec = Math.max(0.005, getReleaseSec(params.ENVRelease));
      const currentGain = Math.max(0.0001, this.envGain.gain.value);
      this.envGain.gain.setValueAtTime(currentGain, t);
      this.envGain.gain.exponentialRampToValueAtTime(0.00001, t + releaseSec);

      // Filter release ramp
      const baseOctaves = params.VCFCutoff * (200 / 12) + params.VCFKey * ((this.note - 60) / 12);
      const restCutoffHz = Math.min(20000, Math.max(20, 7.8 * Math.pow(2, baseOctaves)));
      this.vcfFilter1.frequency.cancelScheduledValues(t);
      this.vcfFilter2.frequency.cancelScheduledValues(t);
      this.vcfFilter1.frequency.setValueAtTime(Math.max(20, this.vcfFilter1.frequency.value), t);
      this.vcfFilter2.frequency.setValueAtTime(Math.max(20, this.vcfFilter2.frequency.value), t);
      this.vcfFilter1.frequency.exponentialRampToValueAtTime(restCutoffHz, t + releaseSec);
      this.vcfFilter2.frequency.exponentialRampToValueAtTime(restCutoffHz, t + releaseSec);

      // Schedule Web Audio native stop directly on audio thread for clean cleanup
      const stopTime = t + releaseSec + 0.05;
      try {
        this.sawOsc?.stop(stopTime);
        this.pulseOsc1?.stop(stopTime);
        this.pulseOsc2?.stop(stopTime);
        this.subOsc?.stop(stopTime);
        this.noiseSource?.stop(stopTime);
      } catch {
        // already stopped
      }

      this.releaseTimer = window.setTimeout(() => {
        this.stopImmediate();
        this.releaseTimer = null;
      }, releaseSec * 1000 + 40);
    }
  }

  stopImmediate() {
    if (this.releaseTimer !== null) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
    this.active = false;
    this.released = true;
    this.note = -1;

    try {
      this.sawOsc?.stop();
      this.pulseOsc1?.stop();
      this.pulseOsc2?.stop();
      this.subOsc?.stop();
      this.noiseSource?.stop();
    } catch {
      // already stopped
    }

    this.sawOsc?.disconnect();
    this.pulseOsc1?.disconnect();
    this.pulseOsc2?.disconnect();
    this.pulseInvertGain?.disconnect();
    this.pulseDelay?.disconnect();
    this.subOsc?.disconnect();
    this.noiseSource?.disconnect();

    this.sawOsc = null;
    this.pulseOsc1 = null;
    this.pulseOsc2 = null;
    this.pulseInvertGain = null;
    this.pulseDelay = null;
    this.subOsc = null;
    this.noiseSource = null;
  }
}

export class HeraSynthesizerEngine {
  private ctx: AudioContext | null = null;
  private isInitialized = false;

  // Master bus
  private masterGain: GainNode | null = null;
  private hpfFilter: BiquadFilterNode | null = null;
  private softClipper: WaveShaperNode | null = null;
  private analyser: AnalyserNode | null = null;

  // Chorus section
  private chorusInputGain: GainNode | null = null;
  private chorusDryGain: GainNode | null = null;
  private chorusWetGain: GainNode | null = null;
  private chorusDelayL: DelayNode | null = null;
  private chorusDelayR: DelayNode | null = null;
  private chorusLFO: OscillatorNode | null = null;
  private chorusLFOGainL: GainNode | null = null;
  private chorusLFOGainR: GainNode | null = null;

  // Global LFO for voice pitch/filter mod
  private globalLfoPhase: number = 0;
  private globalLfoTimer: number | null = null;
  private globalLfoValue: number = 0;
  private lfoTriggerTime: number = 0;

  // Voice allocation (6-voice polyphony)
  private voices: HeraVoiceInstance[] = [];
  private readonly MAX_VOICES = 6;
  private noiseBuffer: AudioBuffer | null = null;

  // Parameters
  private params: HeraParameters = { ...DEFAULT_PARAMETERS };
  private pitchBendSemitones: number = 0;
  private modWheelAmount: number = 0;

  // Recording
  private mediaDest: MediaStreamAudioDestinationNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecording: boolean = false;

  // Listeners
  private onVoicesChange?: (statuses: VoiceStatus[]) => void;
  private onRecordingChange?: (isRecording: boolean, blob?: Blob) => void;

  constructor() {
    // Lazy AudioContext initialization on first user gesture
  }

  setVoicesListener(callback: (statuses: VoiceStatus[]) => void) {
    this.onVoicesChange = callback;
  }

  setRecordingListener(callback: (isRecording: boolean, blob?: Blob) => void) {
    this.onRecordingChange = callback;
  }

  async initAudio() {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioContextClass();

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.ctx.onstatechange = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
      });
    }

    // 1. Create Noise buffer (pink-ish / warm white noise)
    const bufferSize = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    // 2. Main Signal Chain:
    // Voices -> HPF -> SoftClipper -> MasterGain -> Chorus -> Analyser -> Destination
    this.hpfFilter = this.ctx.createBiquadFilter();
    this.hpfFilter.type = 'highpass';
    this.hpfFilter.frequency.value = getHpfFrequency(this.params.HPF);

    this.softClipper = this.ctx.createWaveShaper();
    this.softClipper.curve = this.createSoftClipCurve(512) as Float32Array<ArrayBuffer>;
    this.softClipper.oversample = '2x';

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;

    // Connect pre-chorus chain
    this.hpfFilter.connect(this.softClipper);
    this.softClipper.connect(this.masterGain);

    // Setup authentic Roland BBD Stereo Chorus
    this.setupChorus(this.masterGain);

    // Setup recorder destination
    this.mediaDest = this.ctx.createMediaStreamDestination();
    this.analyser.connect(this.mediaDest);

    // Instantiate 6 voices
    this.voices = [];
    for (let i = 0; i < this.MAX_VOICES; i++) {
      this.voices.push(new HeraVoiceInstance(i, this.ctx, this.hpfFilter, this.noiseBuffer));
    }

    // Start global LFO tick loop
    this.startGlobalLfo();

    this.isInitialized = true;
    this.updateChorusMode();
  }

  private createSoftClipCurve(samples: number): Float32Array {
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; ++i) {
      const x = (i * 2) / samples - 1;
      // Soft saturation matching Hera curveSoftClipTanh3
      curve[i] = Math.tanh(2.5 * x) / Math.tanh(2.5);
    }
    return curve;
  }

  private setupChorus(input: AudioNode) {
    if (!this.ctx || !this.analyser) return;

    this.chorusInputGain = this.ctx.createGain();
    this.chorusDryGain = this.ctx.createGain();
    this.chorusWetGain = this.ctx.createGain();

    input.connect(this.chorusDryGain);
    input.connect(this.chorusInputGain);

    // Split to stereo delays
    const merger = this.ctx.createChannelMerger(2);

    this.chorusDelayL = this.ctx.createDelay(0.1);
    this.chorusDelayR = this.ctx.createDelay(0.1);

    this.chorusInputGain.connect(this.chorusDelayL);
    this.chorusInputGain.connect(this.chorusDelayR);

    this.chorusDelayL.connect(merger, 0, 0); // Left channel
    this.chorusDelayR.connect(merger, 0, 1); // Right channel

    merger.connect(this.chorusWetGain);

    // Output sum
    this.chorusDryGain.connect(this.analyser);
    this.chorusWetGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Setup LFO for Chorus delay modulation
    this.chorusLFO = this.ctx.createOscillator();
    this.chorusLFO.type = 'triangle';

    this.chorusLFOGainL = this.ctx.createGain();
    this.chorusLFOGainR = this.ctx.createGain();

    this.chorusLFO.connect(this.chorusLFOGainL);
    this.chorusLFO.connect(this.chorusLFOGainR);

    this.chorusLFOGainL.connect(this.chorusDelayL.delayTime);
    this.chorusLFOGainR.connect(this.chorusDelayR.delayTime);

    this.chorusLFO.start();
  }

  private updateChorusMode() {
    if (!this.chorusDelayL || !this.chorusDelayR || !this.chorusLFO || !this.chorusLFOGainL || !this.chorusLFOGainR || !this.chorusDryGain || !this.chorusWetGain || !this.ctx) {
      return;
    }

    const mI = this.params.ChorusI > 0.5;
    const mII = this.params.ChorusII > 0.5;
    const mode = (mI ? 1 : 0) | (mII ? 2 : 0);

    const t = this.ctx.currentTime;

    // Smoothly cancel past scheduled values to prevent Web Audio thread underflows
    this.chorusDelayL.delayTime.cancelScheduledValues(t);
    this.chorusDelayR.delayTime.cancelScheduledValues(t);
    this.chorusLFOGainL.gain.cancelScheduledValues(t);
    this.chorusLFOGainR.gain.cancelScheduledValues(t);
    this.chorusDryGain.gain.cancelScheduledValues(t);
    this.chorusWetGain.gain.cancelScheduledValues(t);

    if (mode === 0) {
      // Off: 100% dry, 0% wet
      this.chorusDryGain.gain.setTargetAtTime(1.0, t, 0.02);
      this.chorusWetGain.gain.setTargetAtTime(0.0, t, 0.02);
      this.chorusLFOGainL.gain.setTargetAtTime(0.0, t, 0.02);
      this.chorusLFOGainR.gain.setTargetAtTime(0.0, t, 0.02);
      return;
    }

    if (mode === 1) {
      // Chorus I (Authentic Roland Juno-60 Mode I):
      // Rate = 0.513 Hz (slow, lush, dimensional stereo shimmer)
      // Delay = 5.5ms nominal, modulation depth = +/- 2.0ms (antiphase)
      this.chorusDryGain.gain.setTargetAtTime(0.70, t, 0.02);
      this.chorusWetGain.gain.setTargetAtTime(0.70, t, 0.02);

      this.chorusLFO.type = 'triangle';
      this.chorusLFO.frequency.setTargetAtTime(0.513, t, 0.02);
      this.chorusDelayL.delayTime.setTargetAtTime(0.0055, t, 0.02);
      this.chorusDelayR.delayTime.setTargetAtTime(0.0058, t, 0.02);
      this.chorusLFOGainL.gain.setTargetAtTime(0.0020, t, 0.02);
      this.chorusLFOGainR.gain.setTargetAtTime(-0.0020, t, 0.02); // 180° inverted phase for lush stereo width
    } else if (mode === 2) {
      // Chorus II (Authentic Roland Juno-60 Mode II):
      // Rate = 0.863 Hz (faster, noticeably deeper and thicker bucket-brigade sweep)
      // Delay = 7.5ms nominal, modulation depth = +/- 3.4ms (true warm wobble!)
      this.chorusDryGain.gain.setTargetAtTime(0.65, t, 0.02);
      this.chorusWetGain.gain.setTargetAtTime(0.80, t, 0.02); // Richer wet presence

      this.chorusLFO.type = 'triangle';
      this.chorusLFO.frequency.setTargetAtTime(0.863, t, 0.02);
      this.chorusDelayL.delayTime.setTargetAtTime(0.0075, t, 0.02);
      this.chorusDelayR.delayTime.setTargetAtTime(0.0078, t, 0.02);
      this.chorusLFOGainL.gain.setTargetAtTime(0.0034, t, 0.02);
      this.chorusLFOGainR.gain.setTargetAtTime(-0.0034, t, 0.02); // 180° antiphase stereo
    } else if (mode === 3) {
      // Chorus I + II (Authentic Roland Juno-60 Mode I+II):
      // Rate = 9.75 Hz (fast rotary Leslie swirl / vibrato)
      // Delay = 4.8ms nominal, modulation depth = +/- 0.6ms
      this.chorusDryGain.gain.setTargetAtTime(0.65, t, 0.02);
      this.chorusWetGain.gain.setTargetAtTime(0.75, t, 0.02);

      this.chorusLFO.type = 'triangle';
      this.chorusLFO.frequency.setTargetAtTime(9.75, t, 0.02);
      this.chorusDelayL.delayTime.setTargetAtTime(0.0048, t, 0.02);
      this.chorusDelayR.delayTime.setTargetAtTime(0.0050, t, 0.02);
      this.chorusLFOGainL.gain.setTargetAtTime(0.0006, t, 0.02);
      this.chorusLFOGainR.gain.setTargetAtTime(-0.0006, t, 0.02);
    }
  }

  private startGlobalLfo() {
    if (this.globalLfoTimer !== null) return;

    let lastTime = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;

      const rateHz = getLfoRateHz(this.params.LFORate);
      this.globalLfoPhase = (this.globalLfoPhase + rateHz * dt) % 1.0;

      // Sine LFO
      const rawSine = Math.sin(2 * Math.PI * this.globalLfoPhase);

      // Delay envelope calculation
      const delaySec = getLfoDelaySec(this.params.LFODelay);
      const timeSinceTrig = (now - this.lfoTriggerTime) / 1000;
      let delayEnv = 1.0;
      if (this.params.LFOTrigMode === 1 && delaySec > 0.01) {
        if (timeSinceTrig < delaySec) {
          delayEnv = 0.0;
        } else {
          // ramp up in ~0.3s
          delayEnv = Math.min(1.0, (timeSinceTrig - delaySec) / 0.3);
        }
      }

      this.globalLfoValue = rawSine * delayEnv;

      this.globalLfoTimer = requestAnimationFrame(tick);
    };

    this.globalLfoTimer = requestAnimationFrame(tick);
  }

  // Note On
  async noteOn(note: number, velocity: number = 100) {
    await this.initAudio();
    if (!this.ctx) return;

    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        // audio context resume error ignored
      }
    }

    // Check if note is already playing
    const existing = this.voices.find(v => v.active && v.note === note);
    if (existing) {
      existing.start(note, velocity, this.params, this.pitchBendSemitones, this.globalLfoValue);
      this.broadcastVoiceStatus();
      return;
    }

    // Auto LFO trigger if no unreleased voices
    const hasHeld = this.voices.some(v => v.active && !v.released);
    if (!hasHeld) {
      this.lfoTriggerTime = performance.now();
      if (this.params.LFOTrigMode === 1) {
        this.globalLfoPhase = 0;
      }
    }

    // Voice allocation:
    // 1. Free/inactive voice
    let voice = this.voices.find(v => !v.active);
    // 2. Oldest released voice
    if (!voice) {
      voice = this.voices
        .filter(v => v.released)
        .sort((a, b) => a.startTime - b.startTime)[0];
    }
    // 3. Oldest voice overall (voice stealing)
    if (!voice) {
      voice = this.voices.sort((a, b) => a.startTime - b.startTime)[0];
    }

    if (voice) {
      voice.start(note, velocity, this.params, this.pitchBendSemitones, this.globalLfoValue);
    }

    this.broadcastVoiceStatus();
  }

  // Note Off
  noteOff(note: number) {
    const matching = this.voices.filter(v => v.active && v.note === note);
    matching.forEach(v => v.stop(this.params));
    this.broadcastVoiceStatus();
  }

  // All notes off
  allNotesOff() {
    this.voices.forEach(v => v.stopImmediate());
    this.broadcastVoiceStatus();
  }

  // Manual LFO trigger button (iconic Juno feature)
  triggerManualLfo() {
    this.lfoTriggerTime = performance.now();
    this.globalLfoPhase = 0;
  }

  // Pitch bend: -1.0 to +1.0 (defaults to +/- 2 semitones)
  setPitchBend(value: number) {
    this.pitchBendSemitones = value * 2.0;
    if (this.ctx) {
      this.voices.forEach(v => {
        if (v.active) {
          v.updateFilter(this.params, this.pitchBendSemitones, this.globalLfoValue);
        }
      });
    }
  }

  // Mod wheel: 0.0 to 1.0 (adds to LFO modulation)
  setModWheel(value: number) {
    this.modWheelAmount = value;
  }

  // Parameter update
  setParameter<K extends keyof HeraParameters>(param: K, value: HeraParameters[K]) {
    this.params[param] = value;

    if (!this.ctx) return;

    if (param === 'HPF' && this.hpfFilter) {
      this.hpfFilter.frequency.setTargetAtTime(getHpfFrequency(value as number), this.ctx.currentTime, 0.01);
    } else if (param === 'ChorusI' || param === 'ChorusII') {
      this.updateChorusMode();
    } else if (param === 'VCADepth' && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(Math.max(0.01, (value as number) * 1.2), this.ctx.currentTime, 0.02);
    } else if (
      param.startsWith('VCF') ||
      param.startsWith('ENV') ||
      param.startsWith('DCO')
    ) {
      // Dynamic update to active voices
      this.voices.forEach(v => {
        if (v.active) {
          v.updateFilter(this.params, this.pitchBendSemitones, this.globalLfoValue);
        }
      });
    }
  }

  setAllParameters(params: HeraParameters) {
    this.params = { ...params };
    if (!this.ctx) return;

    if (this.hpfFilter) {
      this.hpfFilter.frequency.setTargetAtTime(getHpfFrequency(params.HPF), this.ctx.currentTime, 0.01);
    }
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(Math.max(0.01, params.VCADepth * 1.2), this.ctx.currentTime, 0.02);
    }
    this.updateChorusMode();
  }

  getParameters(): HeraParameters {
    return { ...this.params };
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  private broadcastVoiceStatus() {
    if (!this.onVoicesChange) return;
    const statuses: VoiceStatus[] = this.voices.map(v => ({
      id: v.id,
      note: v.note,
      freq: v.baseFreq,
      active: v.active && !v.released,
      startTime: v.startTime,
    }));
    this.onVoicesChange(statuses);
  }

  // Audio recording
  startRecording() {
    if (!this.mediaDest) return;
    try {
      this.recordedChunks = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      this.mediaRecorder = new MediaRecorder(this.mediaDest.stream, { mimeType });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordedChunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: mimeType });
        this.isRecording = false;
        this.onRecordingChange?.(false, blob);
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      this.onRecordingChange?.(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
    }
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  dispose() {
    if (this.globalLfoTimer !== null) {
      cancelAnimationFrame(this.globalLfoTimer);
      this.globalLfoTimer = null;
    }
    this.allNotesOff();
    this.ctx?.close();
  }
}

// Global synth singleton
export const synthEngine = new HeraSynthesizerEngine();
