import { HeraParameters, DEFAULT_PARAMETERS, VoiceStatus } from '../types/synth';

export interface ArpConfig {
  enabled: boolean;
  bpm: number;
  mode: 'UP' | 'DOWN' | 'U/D' | 'RND';
  range: number; // 1, 2, 3 octaves
  rateDivision: '1/8' | '1/16' | '1/16T';
  hold: boolean;
}

// Curve translation functions matching HeraTables.cpp
export function getLfoRateHz(value: number): number {
  return 21.8 * Math.pow(Math.max(0, Math.min(1, value)), 2.863) + 0.4035;
}

export function getLfoDelaySec(value: number): number {
  return Math.pow(Math.max(0, Math.min(1, value)) * 1.64, 1.923);
}

export function getDcoLfoPitchCents(value: number): number {
  const d = Math.max(0, Math.min(1, value));
  // Smooth musical vibrato curve:
  // 0..50% fader -> 0..58 cents (fine resolution for expressive musical vibrato)
  // 50..100% fader -> 58..240 cents (wide synth pitch modulation up to 2.4 semitones)
  return d * (20 + 220 * Math.pow(d, 2.15));
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
  private sameNoteDamped: boolean = false;

  // Persistent Analog DCO Nodes (never destroyed during playback -> zero graph-lock & zero phase clicks)
  private ctx: AudioContext;
  private voiceGain: GainNode;
  private sawOsc: OscillatorNode;
  private pulseOsc: OscillatorNode;
  private pulseInvertGain: GainNode;
  private pulseDelay: DelayNode;
  private subOsc: OscillatorNode;
  private noiseSource: AudioBufferSourceNode;

  private sawGain: GainNode;
  private pulseGain: GainNode;
  private subGain: GainNode;
  private noiseGain: GainNode;

  private vcfFilter1: BiquadFilterNode;
  private vcfFilter2: BiquadFilterNode;
  private envGain: GainNode;

  // Audio-rate LFO modulation gains
  private voiceLfoPitchGain: GainNode;
  private voiceLfoFilterGain: GainNode;
  private voiceLfoPwmGain: GainNode;

  private noiseBuffer: AudioBuffer;
  private releaseTimer: number | null = null;
  private currentVelocityFactor: number = 1.0;
  private onVoiceIdle?: () => void;

  constructor(
    id: number,
    ctx: AudioContext,
    destination: AudioNode,
    noiseBuffer: AudioBuffer,
    lfoSource: AudioNode,
    onVoiceIdle?: () => void
  ) {
    this.id = id;
    this.ctx = ctx;
    this.noiseBuffer = noiseBuffer;
    this.onVoiceIdle = onVoiceIdle;

    this.voiceGain = ctx.createGain();
    this.voiceGain.gain.value = 1.0;

    this.sawGain = ctx.createGain();
    this.sawGain.gain.value = 0;
    this.pulseGain = ctx.createGain();
    this.pulseGain.gain.value = 0;
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;

    // 4-pole cascaded filter (2x 2-pole Biquad in series)
    this.vcfFilter1 = ctx.createBiquadFilter();
    this.vcfFilter1.type = 'lowpass';
    this.vcfFilter1.frequency.value = 2000;
    this.vcfFilter2 = ctx.createBiquadFilter();
    this.vcfFilter2.type = 'lowpass';
    this.vcfFilter2.frequency.value = 2000;

    // Connect oscillator gains to filter once
    this.sawGain.connect(this.vcfFilter1);
    this.pulseGain.connect(this.vcfFilter1);
    this.subGain.connect(this.vcfFilter1);
    this.noiseGain.connect(this.vcfFilter1);

    this.vcfFilter1.connect(this.vcfFilter2);

    this.envGain = ctx.createGain();
    this.envGain.gain.value = 0;

    this.vcfFilter2.connect(this.envGain);
    this.envGain.connect(this.voiceGain);
    this.voiceGain.connect(destination);

    // Audio-rate LFO routing for this voice
    this.voiceLfoPitchGain = ctx.createGain();
    this.voiceLfoPitchGain.gain.value = 0;
    lfoSource.connect(this.voiceLfoPitchGain);

    this.voiceLfoFilterGain = ctx.createGain();
    this.voiceLfoFilterGain.gain.value = 0;
    lfoSource.connect(this.voiceLfoFilterGain);

    this.voiceLfoPwmGain = ctx.createGain();
    this.voiceLfoPwmGain.gain.value = 0;
    lfoSource.connect(this.voiceLfoPwmGain);

    // Connect LFO filter gain directly to filter detune params (cents)
    this.voiceLfoFilterGain.connect(this.vcfFilter1.detune);
    this.voiceLfoFilterGain.connect(this.vcfFilter2.detune);

    // Initialize persistent continuously-running oscillators (true DCO architecture)
    this.sawOsc = ctx.createOscillator();
    this.sawOsc.type = 'sawtooth';
    this.sawOsc.frequency.value = 440;
    this.sawOsc.connect(this.sawGain);

    // Single phase-locked DCO sawtooth split into direct + inverted delayed path for 100% uniform PWM across all 6 voices
    this.pulseOsc = ctx.createOscillator();
    this.pulseOsc.type = 'sawtooth';
    this.pulseOsc.frequency.value = 440;

    this.pulseInvertGain = ctx.createGain();
    this.pulseInvertGain.gain.value = -1.0;

    this.pulseDelay = ctx.createDelay(0.05);
    this.pulseDelay.delayTime.value = 0.001;

    this.pulseOsc.connect(this.pulseGain);
    this.pulseOsc.connect(this.pulseInvertGain);
    this.pulseInvertGain.connect(this.pulseDelay);
    this.pulseDelay.connect(this.pulseGain);

    // Connect LFO PWM modulation to pulseDelay.delayTime
    this.voiceLfoPwmGain.connect(this.pulseDelay.delayTime);

    this.subOsc = ctx.createOscillator();
    this.subOsc.type = 'square';
    this.subOsc.frequency.value = 220;
    this.subOsc.connect(this.subGain);

    this.noiseSource = ctx.createBufferSource();
    this.noiseSource.buffer = this.noiseBuffer;
    this.noiseSource.loop = true;
    this.noiseSource.connect(this.noiseGain);

    // Connect LFO pitch modulation once
    this.voiceLfoPitchGain.connect(this.sawOsc.detune);
    this.voiceLfoPitchGain.connect(this.pulseOsc.detune);
    this.voiceLfoPitchGain.connect(this.subOsc.detune);

    // Start all oscillators once (silenced behind envGain = 0 when idle)
    const now = ctx.currentTime;
    this.sawOsc.start(now);
    this.pulseOsc.start(now);
    this.subOsc.start(now);
    this.noiseSource.start(now);
  }

  private holdParam(param: AudioParam, t: number) {
    if (typeof param.cancelAndHoldAtTime === 'function') {
      try {
        param.cancelAndHoldAtTime(t);
        return;
      } catch {
        // fallback below
      }
    }
    param.cancelScheduledValues(t);
  }

  start(
    note: number,
    velocity: number,
    params: HeraParameters,
    pitchBendSemitones: number,
    modWheelAmount: number = 0,
    keepLfoWarm: boolean = false
  ) {
    if (this.releaseTimer !== null) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }

    const t = this.ctx.currentTime;
    const wasActive = this.active;

    this.note = note;
    this.startTime = t;
    this.active = true;
    this.released = false;
    this.sameNoteDamped = false;

    // Update DCO frequencies, PWM width, and waveform mix levels smoothly
    this.updateOscillators(params, pitchBendSemitones, true);

    // Schedule LFO delay envelope for this voice
    this.scheduleLfo(params, modWheelAmount, t, keepLfoWarm || wasActive);

    // Filter cutoff calculation & envelope modulation
    this.updateFilter(params, pitchBendSemitones, 1.0, true, wasActive);

    // Amplitude Envelope (Linear & musical velocity scaling)
    this.currentVelocityFactor = 0.45 + 0.55 * Math.min(1.0, Math.max(0.1, velocity / 127));
    const vcaLevel = Math.max(0, Math.min(1, params.VCADepth));
    const envPeak = this.currentVelocityFactor;

    // Set VCA Level on dedicated voiceGain node (independent of ADSR envGain!)
    this.holdParam(this.voiceGain.gain, t);
    this.voiceGain.gain.setTargetAtTime(vcaLevel, t, 0.004);

    // Freeze current envelope voltage on audio thread (Warm Retrigger rises from current level without ever jumping to 0)
    this.holdParam(this.envGain.gain, t);

    if (params.VCAType === 1) {
      // Gate mode: smooth 2.5ms RC gate opening (click-free)
      this.envGain.gain.setTargetAtTime(envPeak, t, 0.0025);
    } else {
      // ADSR Envelope mode using continuous analog RC capacitor curves (setTargetAtTime)
      const attackSec = Math.max(0.004, getAttackSec(params.ENVAttack));
      const decaySec = Math.max(0.006, getDecaySec(params.ENVDecay));
      const sustainVal = params.ENVSustain * envPeak;

      if (params.ENVSustain >= 0.99) {
        // Full sustain (e.g., Strings 1): single uninterrupted RC charge curve to target volume
        this.envGain.gain.setTargetAtTime(envPeak, t, attackSec * 0.35);
      } else {
        // Attack charge up to peak, then RC decay to sustain level
        this.envGain.gain.setTargetAtTime(envPeak * 1.04, t, attackSec * 0.35);
        this.envGain.gain.setTargetAtTime(Math.max(0.0001, sustainVal), t + attackSec, decaySec * 0.33);
      }
    }
  }

  updateOscillators(params: HeraParameters, pitchBendSemitones: number, isNoteOn: boolean = false) {
    const t = this.ctx.currentTime;
    const rangeFactors = [0.5, 1.0, 2.0];
    const rangeFactor = rangeFactors[Math.max(0, Math.min(2, Math.floor(params.DCORange)))];

    const midiFreq = 440 * Math.pow(2, (this.note - 69) / 12);
    this.baseFreq = midiFreq * rangeFactor;

    const totalDetune = pitchBendSemitones * 100;

    const pwm = Math.max(0, Math.min(1, params.DCOPWMDepth));
    const pwmMod = Math.round(params.DCOPWMMod ?? 0);
    const period = 1 / Math.max(20, this.baseFreq);

    this.holdParam(this.sawOsc.frequency, t);
    this.holdParam(this.pulseOsc.frequency, t);
    this.holdParam(this.subOsc.frequency, t);
    this.holdParam(this.sawOsc.detune, t);
    this.holdParam(this.pulseOsc.detune, t);
    this.holdParam(this.subOsc.detune, t);
    this.holdParam(this.pulseDelay.delayTime, t);
    this.holdParam(this.voiceLfoPwmGain.gain, t);

    // Smooth 1.2ms micro-transition prevents delay-line & oscillator discontinuities at high BPM (150-260 BPM)
    this.sawOsc.frequency.setTargetAtTime(this.baseFreq, t, 0.0012);
    this.pulseOsc.frequency.setTargetAtTime(this.baseFreq, t, 0.0012);
    this.subOsc.frequency.setTargetAtTime(this.baseFreq * 0.5, t, 0.0012);

    this.sawOsc.detune.setTargetAtTime(totalDetune, t, 0.0015);
    this.pulseOsc.detune.setTargetAtTime(totalDetune, t, 0.0015);
    this.subOsc.detune.setTargetAtTime(totalDetune, t, 0.0015);

    if (pwmMod === 1) {
      // PWM = LFO: center pulse at 50% duty cycle and modulate delayTime via global LFO
      const centerDelay = Math.max(0.00005, Math.min(0.04, period * 0.5));
      const lfoPwmDepthSec = Math.min(centerDelay * 0.82, period * 0.40 * pwm);
      this.pulseDelay.delayTime.setTargetAtTime(centerDelay, t, 0.002);
      this.voiceLfoPwmGain.gain.setTargetAtTime(lfoPwmDepthSec, t, 0.005);
    } else if (pwmMod === 2) {
      // PWM = ENV: modulate pulse width with ADSR envelope
      this.voiceLfoPwmGain.gain.setTargetAtTime(0, t, 0.005);
      const baseDelay = Math.max(0.00005, Math.min(0.04, period * 0.5));
      const peakDelay = Math.max(0.00005, Math.min(0.04, period * (0.5 - 0.42 * pwm)));
      const sustainDelay = Math.max(
        0.00005,
        Math.min(0.04, period * (0.5 - 0.42 * pwm * params.ENVSustain))
      );
      if (isNoteOn) {
        const attackSec = Math.max(0.004, getAttackSec(params.ENVAttack));
        const decaySec = Math.max(0.006, getDecaySec(params.ENVDecay));
        this.pulseDelay.delayTime.setTargetAtTime(peakDelay, t, attackSec * 0.35);
        if (params.ENVSustain < 0.99) {
          this.pulseDelay.delayTime.setTargetAtTime(sustainDelay, t + attackSec, decaySec * 0.33);
        }
      } else {
        this.pulseDelay.delayTime.setTargetAtTime(
          this.released ? baseDelay : sustainDelay,
          t,
          0.005
        );
      }
    } else {
      // PWM = MAN: manual static pulse width control
      this.voiceLfoPwmGain.gain.setTargetAtTime(0, t, 0.005);
      const pulseWidthRatio = 0.5 - 0.45 * Math.max(-0.95, Math.min(0.95, pwm));
      const delayTime = Math.max(0.00005, Math.min(0.04, period * pulseWidthRatio));
      this.pulseDelay.delayTime.setTargetAtTime(delayTime, t, 0.0015);
    }

    this.updateOscillatorLevels(params);
  }

  updateOscillatorLevels(params: HeraParameters) {
    const t = this.ctx.currentTime;
    this.holdParam(this.sawGain.gain, t);
    this.holdParam(this.pulseGain.gain, t);
    this.holdParam(this.subGain.gain, t);
    this.holdParam(this.noiseGain.gain, t);

    this.sawGain.gain.setTargetAtTime(params.DCOSawLevel * 0.24, t, 0.005);
    this.pulseGain.gain.setTargetAtTime(params.DCOPulseLevel * 0.24, t, 0.005);
    this.subGain.gain.setTargetAtTime(params.DCOSubLevel * 0.18, t, 0.005);
    this.noiseGain.gain.setTargetAtTime(params.DCONoiseLevel * 0.12, t, 0.005);
  }

  scheduleLfo(
    params: HeraParameters,
    modWheelAmount: number,
    t: number,
    keepLfoWarm: boolean = false
  ) {
    const targetPitchCents =
      getDcoLfoPitchCents(params.DCOPitchModDepth) + getDcoLfoPitchCents(modWheelAmount);
    const targetFilterCents = params.VCFLFO * 2600;
    const delaySec = getLfoDelaySec(params.LFODelay);

    this.holdParam(this.voiceLfoPitchGain.gain, t);
    this.holdParam(this.voiceLfoFilterGain.gain, t);

    if (delaySec < 0.02 || keepLfoWarm) {
      this.voiceLfoPitchGain.gain.setTargetAtTime(targetPitchCents, t, 0.006);
      this.voiceLfoFilterGain.gain.setTargetAtTime(targetFilterCents, t, 0.006);
    } else {
      // Smooth continuous RC capacitor fade-in starting immediately at t (never dead-muted at 0)
      const tau = Math.max(0.015, delaySec * 0.35);
      this.voiceLfoPitchGain.gain.setValueAtTime(targetPitchCents * 0.2, t);
      this.voiceLfoPitchGain.gain.setTargetAtTime(targetPitchCents, t, tau);

      this.voiceLfoFilterGain.gain.setValueAtTime(targetFilterCents * 0.2, t);
      this.voiceLfoFilterGain.gain.setTargetAtTime(targetFilterCents, t, tau);
    }
  }

  updateLfoDepth(params: HeraParameters, modWheelAmount: number) {
    const t = this.ctx.currentTime;
    const targetPitchCents =
      getDcoLfoPitchCents(params.DCOPitchModDepth) + getDcoLfoPitchCents(modWheelAmount);
    const targetFilterCents = params.VCFLFO * 2600;

    this.holdParam(this.voiceLfoPitchGain.gain, t);
    this.holdParam(this.voiceLfoFilterGain.gain, t);

    // Apply immediately when moving DCO LFO, VCF LFO, or ModWheel so depth control is 100% responsive
    this.voiceLfoPitchGain.gain.setTargetAtTime(targetPitchCents, t, 0.008);
    this.voiceLfoFilterGain.gain.setTargetAtTime(targetFilterCents, t, 0.008);
  }

  updateFilter(
    params: HeraParameters,
    pitchBendSemitones: number,
    envAmountMultiplier: number = 1.0,
    isNoteOn: boolean = false,
    _wasActive: boolean = false
  ) {
    const t = this.ctx.currentTime;

    const minFreq = 16;
    const maxFreq = 20000;
    const baseCutoffHz = minFreq * Math.pow(maxFreq / minFreq, Math.max(0, Math.min(1, params.VCFCutoff)));

    const keyTrackingRatio = Math.pow(2, params.VCFKey * ((this.note - 60) / 12));
    let noteCutoffHz = baseCutoffHz * keyTrackingRatio;

    if (pitchBendSemitones !== 0) {
      noteCutoffHz *= Math.pow(2, params.VCFBendDepth * (pitchBendSemitones / 12));
    }

    const resonanceQ = 0.707 + params.VCFResonance * 3.6;
    this.vcfFilter1.Q.setTargetAtTime(resonanceQ, t, 0.015);
    this.vcfFilter2.Q.setTargetAtTime(resonanceQ, t, 0.015);

    const envOctaves = params.VCFEnv * 6.5 * envAmountMultiplier;
    const peakCutoffHz = Math.min(20000, Math.max(16, noteCutoffHz * Math.pow(2, envOctaves)));
    const sustainCutoffHz = Math.min(20000, Math.max(16, noteCutoffHz * Math.pow(2, envOctaves * params.ENVSustain)));

    noteCutoffHz = Math.min(20000, Math.max(16, noteCutoffHz));

    if (!isNoteOn && this.released) {
      // Do not reopen filter on voices that are already in their release phase
      return;
    }

    this.holdParam(this.vcfFilter1.frequency, t);
    this.holdParam(this.vcfFilter2.frequency, t);

    if (isNoteOn && Math.abs(params.VCFEnv) > 0.01) {
      const attackSec = Math.max(0.004, getAttackSec(params.ENVAttack));
      const decaySec = Math.max(0.006, getDecaySec(params.ENVDecay));

      if (params.ENVSustain >= 0.99) {
        this.vcfFilter1.frequency.setTargetAtTime(peakCutoffHz, t, attackSec * 0.35);
        this.vcfFilter2.frequency.setTargetAtTime(peakCutoffHz, t, attackSec * 0.35);
      } else {
        this.vcfFilter1.frequency.setTargetAtTime(peakCutoffHz, t, attackSec * 0.35);
        this.vcfFilter2.frequency.setTargetAtTime(peakCutoffHz, t, attackSec * 0.35);

        this.vcfFilter1.frequency.setTargetAtTime(sustainCutoffHz, t + attackSec, decaySec * 0.33);
        this.vcfFilter2.frequency.setTargetAtTime(sustainCutoffHz, t + attackSec, decaySec * 0.33);
      }
    } else {
      this.vcfFilter1.frequency.setTargetAtTime(sustainCutoffHz, t, 0.008);
      this.vcfFilter2.frequency.setTargetAtTime(sustainCutoffHz, t, 0.008);
    }
  }

  updateVolume(vcaDepth: number) {
    const t = this.ctx.currentTime;
    const level = Math.max(0, Math.min(1, vcaDepth));
    this.holdParam(this.voiceGain.gain, t);
    this.voiceGain.gain.setTargetAtTime(level, t, 0.012);
  }

  updateSustain(params: HeraParameters) {
    if (!this.active || this.released || params.VCAType === 1) return;
    const t = this.ctx.currentTime;
    const attackSec = Math.max(0.004, getAttackSec(params.ENVAttack));
    if (t - this.startTime < attackSec) return;
    const sustainVal = Math.max(0.0001, params.ENVSustain * this.currentVelocityFactor);
    this.holdParam(this.envGain.gain, t);
    this.envGain.gain.setTargetAtTime(sustainVal, t, 0.015);
  }

  // Smoothly accelerate release when another Round-Robin voice plays the exact same note
  softenSameNoteRelease() {
    if (!this.active || this.sameNoteDamped) return;
    this.sameNoteDamped = true;
    if (this.releaseTimer !== null) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
    this.released = true;
    const t = this.ctx.currentTime;
    this.holdParam(this.envGain.gain, t);
    // Gentle 16ms RC time constant (~75ms smooth decay, zero click, fast enough for 180-260 BPM 1/16 arp)
    this.envGain.gain.setTargetAtTime(0.0, t, 0.016);

    this.releaseTimer = window.setTimeout(() => {
      this.active = false;
      this.note = -1;
      this.sameNoteDamped = false;
      this.releaseTimer = null;
      this.onVoiceIdle?.();
    }, 80);
  }

  stop(params: HeraParameters) {
    if (!this.active || this.released) return;
    this.released = true;

    if (this.releaseTimer !== null) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }

    const t = this.ctx.currentTime;
    this.holdParam(this.envGain.gain, t);

    if (params.VCAType === 1) {
      // Gate release: smooth 4ms RC decay
      this.envGain.gain.setTargetAtTime(0.0, t, 0.004);
      this.releaseTimer = window.setTimeout(() => {
        this.active = false;
        this.note = -1;
        this.releaseTimer = null;
        this.onVoiceIdle?.();
      }, 28);
    } else {
      // ADSR release: continuous analog RC discharge
      const releaseSec = Math.max(0.012, getReleaseSec(params.ENVRelease));
      const timeConstant = Math.max(0.005, releaseSec * 0.25);
      this.envGain.gain.setTargetAtTime(0.0, t, timeConstant);

      const minFreq = 16;
      const maxFreq = 20000;
      const restCutoffHz = Math.min(20000, Math.max(16, minFreq * Math.pow(maxFreq / minFreq, params.VCFCutoff)));

      this.holdParam(this.vcfFilter1.frequency, t);
      this.holdParam(this.vcfFilter2.frequency, t);
      this.vcfFilter1.frequency.setTargetAtTime(restCutoffHz, t, timeConstant);
      this.vcfFilter2.frequency.setTargetAtTime(restCutoffHz, t, timeConstant);

      this.releaseTimer = window.setTimeout(() => {
        this.active = false;
        this.note = -1;
        this.releaseTimer = null;
        this.onVoiceIdle?.();
      }, releaseSec * 1000 + 80);
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
      const t = this.ctx.currentTime;
      this.holdParam(this.envGain.gain, t);
      this.envGain.gain.setTargetAtTime(0.0, t, 0.005);
    } catch {
      // ignored
    }
  }

  dispose() {
    this.stopImmediate();
    try {
      this.sawOsc.stop();
      this.pulseOsc.stop();
      this.subOsc.stop();
      this.noiseSource.stop();
    } catch {}
    this.sawOsc.disconnect();
    this.pulseOsc.disconnect();
    this.pulseInvertGain.disconnect();
    this.pulseDelay.disconnect();
    this.subOsc.disconnect();
    this.noiseSource.disconnect();
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
  private masterLimiter: DynamicsCompressorNode | null = null;

  // Chorus section
  private chorusInputGain: GainNode | null = null;
  private chorusDryGain: GainNode | null = null;
  private chorusWetGain: GainNode | null = null;
  private chorusSumGain: GainNode | null = null;
  private chorusDelayL: DelayNode | null = null;
  private chorusDelayR: DelayNode | null = null;
  private chorusFilterL: BiquadFilterNode | null = null;
  private chorusFilterR: BiquadFilterNode | null = null;
  private chorusLFO: OscillatorNode | null = null;
  private chorusLFOGainL: GainNode | null = null;
  private chorusLFOGainR: GainNode | null = null;

  // Stereo Echo / Delay Effect
  private delayInputGain: GainNode | null = null;
  private delayDryGain: GainNode | null = null;
  private delayWetGain: GainNode | null = null;
  private delaySumGain: GainNode | null = null;
  private delayNodeL: DelayNode | null = null;
  private delayNodeR: DelayNode | null = null;
  private delayFeedbackL: GainNode | null = null;
  private delayFeedbackR: GainNode | null = null;
  private delayFilterL: BiquadFilterNode | null = null;
  private delayFilterR: BiquadFilterNode | null = null;

  // Global Post-Processing Stereo Reverb (Plate / Hall)
  private reverbInputGain: GainNode | null = null;
  private reverbDryGain: GainNode | null = null;
  private reverbWetGain: GainNode | null = null;
  private reverbPreDelay: DelayNode | null = null;
  private reverbCombDelays: DelayNode[] = [];
  private reverbCombFeedbacks: GainNode[] = [];
  private reverbCombFilters: BiquadFilterNode[] = [];
  private reverbTankLfo: OscillatorNode | null = null;

  // Global Audio-Rate LFO for voice pitch/filter mod
  private globalLfoOsc: OscillatorNode | null = null;
  private globalLfoBus: GainNode | null = null;
  private masterVolume: number = 0.85;

  // Voice allocation (6-voice polyphony with Round-Robin)
  private voices: HeraVoiceInstance[] = [];
  private readonly MAX_VOICES = 6;
  private rrIndex: number = 0;
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

  // Arpeggiator Engine State
  private arpConfig: ArpConfig = {
    enabled: false,
    bpm: 120,
    mode: 'UP',
    range: 1,
    rateDivision: '1/16',
    hold: false,
  };
  private arpHeldNotes: number[] = [];
  private arpLatchedNotes: number[] = [];
  private arpTimerId: number | null = null;
  private arpCurrentStep: number = 0;
  private arpLastPlayedNote: number | null = null;
  private arpNoteOffTimerId: number | null = null;

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

  setMasterVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    this.params.MasterVolume = this.masterVolume;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume * 0.85, this.ctx.currentTime, 0.02);
    }
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

    // 2. Global Audio-Rate LFO Generator (Sine wave)
    this.globalLfoOsc = this.ctx.createOscillator();
    this.globalLfoOsc.type = 'sine';
    this.globalLfoOsc.frequency.value = getLfoRateHz(this.params.LFORate);

    this.globalLfoBus = this.ctx.createGain();
    this.globalLfoBus.gain.value = 1.0;
    this.globalLfoOsc.connect(this.globalLfoBus);
    this.globalLfoOsc.start();

    // 3. Main Signal Chain:
    // Voices -> HPF -> SoftClipper -> MasterGain -> Chorus -> StereoDelay -> MasterLimiter -> Analyser -> Destination
    this.hpfFilter = this.ctx.createBiquadFilter();
    this.hpfFilter.type = 'highpass';
    this.hpfFilter.frequency.value = getHpfFrequency(this.params.HPF);

    this.softClipper = this.ctx.createWaveShaper();
    this.softClipper.curve = this.createSoftClipCurve(512) as Float32Array<ArrayBuffer>;
    this.softClipper.oversample = '2x';

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.masterVolume * 0.85;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;

    // Connect pre-chorus chain
    this.hpfFilter.connect(this.softClipper);
    this.softClipper.connect(this.masterGain);

    // Setup authentic Roland BBD Stereo Chorus
    this.setupChorus(this.masterGain);

    // Setup Stereo Echo / Delay Effect & Master Limiter
    this.setupDelayAndLimiter();

    // Setup recorder destination
    this.mediaDest = this.ctx.createMediaStreamDestination();
    this.analyser.connect(this.mediaDest);

    // Instantiate 6 voices with audio-rate LFO bus
    this.voices = [];
    for (let i = 0; i < this.MAX_VOICES; i++) {
      this.voices.push(
        new HeraVoiceInstance(
          i,
          this.ctx,
          this.hpfFilter,
          this.noiseBuffer,
          this.globalLfoBus,
          () => this.broadcastVoiceStatus()
        )
      );
    }

    this.isInitialized = true;
    this.updateChorusMode();
    this.updateDelayMode();
    this.updateReverbMode();
  }

  private createSoftClipCurve(samples: number): Float32Array {
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; ++i) {
      const x = (i * 2) / samples - 1;
      // Musical tape-like soft saturation without harsh clipping
      curve[i] = Math.tanh(1.2 * x) / Math.tanh(1.2);
    }
    return curve;
  }

  private setupChorus(input: AudioNode) {
    if (!this.ctx) return;

    this.chorusInputGain = this.ctx.createGain();
    this.chorusDryGain = this.ctx.createGain();
    this.chorusWetGain = this.ctx.createGain();
    this.chorusSumGain = this.ctx.createGain();

    input.connect(this.chorusDryGain);
    input.connect(this.chorusInputGain);

    // Split to stereo delays
    const merger = this.ctx.createChannelMerger(2);

    this.chorusDelayL = this.ctx.createDelay(0.1);
    this.chorusDelayR = this.ctx.createDelay(0.1);

    // Roland Juno-60 BBD analog reconstruction lowpass filter (7.5 kHz)
    this.chorusFilterL = this.ctx.createBiquadFilter();
    this.chorusFilterL.type = 'lowpass';
    this.chorusFilterL.frequency.value = 7500;
    this.chorusFilterL.Q.value = 0.707;

    this.chorusFilterR = this.ctx.createBiquadFilter();
    this.chorusFilterR.type = 'lowpass';
    this.chorusFilterR.frequency.value = 7500;
    this.chorusFilterR.Q.value = 0.707;

    this.chorusInputGain.connect(this.chorusDelayL);
    this.chorusInputGain.connect(this.chorusDelayR);

    this.chorusDelayL.connect(this.chorusFilterL);
    this.chorusDelayR.connect(this.chorusFilterR);

    // 180° inverted polarity on right channel for authentic Roland spatial dimension
    const chorusInvertGainR = this.ctx.createGain();
    chorusInvertGainR.gain.value = -1.0;

    this.chorusFilterL.connect(merger, 0, 0); // Left channel: in-phase
    this.chorusFilterR.connect(chorusInvertGainR);
    chorusInvertGainR.connect(merger, 0, 1); // Right channel: inverted

    merger.connect(this.chorusWetGain);

    // Sum chorus dry & wet into chorusSumGain
    this.chorusDryGain.connect(this.chorusSumGain);
    this.chorusWetGain.connect(this.chorusSumGain);

    // Setup LFO for Chorus delay modulation
    this.chorusLFO = this.ctx.createOscillator();
    this.chorusLFO.type = 'sine';

    this.chorusLFOGainL = this.ctx.createGain();
    this.chorusLFOGainR = this.ctx.createGain();

    this.chorusLFO.connect(this.chorusLFOGainL);
    this.chorusLFO.connect(this.chorusLFOGainR);

    this.chorusLFOGainL.connect(this.chorusDelayL.delayTime);
    this.chorusLFOGainR.connect(this.chorusDelayR.delayTime);

    this.chorusLFO.start();
  }

  private setupDelayAndLimiter() {
    if (!this.ctx || !this.chorusSumGain || !this.analyser) return;

    // 1. Stereo Delay nodes
    this.delayInputGain = this.ctx.createGain();
    this.delayDryGain = this.ctx.createGain();
    this.delayWetGain = this.ctx.createGain();

    this.chorusSumGain.connect(this.delayDryGain);
    this.chorusSumGain.connect(this.delayInputGain);

    this.delayNodeL = this.ctx.createDelay(2.0);
    this.delayNodeR = this.ctx.createDelay(2.0);

    // Warm analog lowpass filters for delay repeats (4500Hz tape absorption)
    this.delayFilterL = this.ctx.createBiquadFilter();
    this.delayFilterL.type = 'lowpass';
    this.delayFilterL.frequency.value = 4500;

    this.delayFilterR = this.ctx.createBiquadFilter();
    this.delayFilterR.type = 'lowpass';
    this.delayFilterR.frequency.value = 4500;

    this.delayFeedbackL = this.ctx.createGain();
    this.delayFeedbackL.gain.value = 0;

    this.delayFeedbackR = this.ctx.createGain();
    this.delayFeedbackR.gain.value = 0;

    // Connect delay input
    this.delayInputGain.connect(this.delayNodeL);
    this.delayInputGain.connect(this.delayNodeR);

    // Damped feedback loop with cross-feed
    this.delayNodeL.connect(this.delayFilterL);
    this.delayFilterL.connect(this.delayFeedbackL);
    this.delayFeedbackL.connect(this.delayNodeL);
    this.delayFeedbackL.connect(this.delayNodeR);

    this.delayNodeR.connect(this.delayFilterR);
    this.delayFilterR.connect(this.delayFeedbackR);
    this.delayFeedbackR.connect(this.delayNodeR);
    this.delayFeedbackR.connect(this.delayNodeL);

    // Delay stereo merge into delaySumGain
    const delayMerger = this.ctx.createChannelMerger(2);
    this.delayNodeL.connect(delayMerger, 0, 0);
    this.delayNodeR.connect(delayMerger, 0, 1);
    delayMerger.connect(this.delayWetGain);

    this.delaySumGain = this.ctx.createGain();
    this.delayDryGain.connect(this.delaySumGain);
    this.delayWetGain.connect(this.delaySumGain);

    // Master Dynamics Limiter (Peak Protection - eliminates any clipping / "estouro")
    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.setValueAtTime(-1.5, this.ctx.currentTime);
    this.masterLimiter.knee.setValueAtTime(14.0, this.ctx.currentTime);
    this.masterLimiter.ratio.setValueAtTime(8.0, this.ctx.currentTime);
    this.masterLimiter.attack.setValueAtTime(0.001, this.ctx.currentTime);
    this.masterLimiter.release.setValueAtTime(0.12, this.ctx.currentTime);

    // Separate Global Post-Processing Stage: Stereo Plate/Hall Reverb after Delay, feeding Master Limiter
    this.setupGlobalPostReverb(this.delaySumGain, this.masterLimiter);

    this.masterLimiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  private setupGlobalPostReverb(input: AudioNode, output: AudioNode) {
    if (!this.ctx) return;

    this.reverbDryGain = this.ctx.createGain();
    this.reverbInputGain = this.ctx.createGain();
    this.reverbWetGain = this.ctx.createGain();
    this.reverbWetGain.gain.value = 0.0;

    input.connect(this.reverbDryGain);
    input.connect(this.reverbInputGain);
    this.reverbDryGain.connect(output);

    // Pre-Delay line (controlled by ReverbTime)
    this.reverbPreDelay = this.ctx.createDelay(0.25);
    this.reverbPreDelay.delayTime.value = 0.018;

    // Low-cut filter to keep low-end punch clean
    const lowCut = this.ctx.createBiquadFilter();
    lowCut.type = 'highpass';
    lowCut.frequency.value = 135;

    // Dual allpass diffusers for smooth studio density
    const diffuser1 = this.ctx.createBiquadFilter();
    diffuser1.type = 'allpass';
    diffuser1.frequency.value = 380;
    diffuser1.Q.value = 1.1;

    const diffuser2 = this.ctx.createBiquadFilter();
    diffuser2.type = 'allpass';
    diffuser2.frequency.value = 1240;
    diffuser2.Q.value = 1.1;

    this.reverbInputGain.connect(this.reverbPreDelay);
    this.reverbPreDelay.connect(lowCut);
    lowCut.connect(diffuser1);
    diffuser1.connect(diffuser2);

    const stereoMerger = this.ctx.createChannelMerger(2);
    const leftSum = this.ctx.createGain();
    const rightSum = this.ctx.createGain();
    const crossLtoR = this.ctx.createGain();
    const crossRtoL = this.ctx.createGain();
    crossLtoR.gain.value = 0.28;
    crossRtoL.gain.value = 0.28;

    leftSum.connect(stereoMerger, 0, 0);
    leftSum.connect(crossLtoR);
    crossLtoR.connect(stereoMerger, 0, 1);

    rightSum.connect(stereoMerger, 0, 1);
    rightSum.connect(crossRtoL);
    crossRtoL.connect(stereoMerger, 0, 0);

    // 6 mutually-prime parallel comb filter tank lines (3 Left, 3 Right)
    const baseCombTimes = [0.0297, 0.0371, 0.0411, 0.0313, 0.0389, 0.0437];
    this.reverbCombDelays = [];
    this.reverbCombFeedbacks = [];
    this.reverbCombFilters = [];

    // Subtle tank chorus LFO to eliminate metallic standing waves
    this.reverbTankLfo = this.ctx.createOscillator();
    this.reverbTankLfo.type = 'sine';
    this.reverbTankLfo.frequency.value = 0.41;
    this.reverbTankLfo.start();

    baseCombTimes.forEach((baseDelay, idx) => {
      if (!this.ctx) return;
      const delayNode = this.ctx.createDelay(0.25);
      delayNode.delayTime.value = baseDelay;

      const dampFilter = this.ctx.createBiquadFilter();
      dampFilter.type = 'lowpass';
      dampFilter.frequency.value = 5500;
      dampFilter.Q.value = 0.5;

      const fbGain = this.ctx.createGain();
      fbGain.gain.value = 0;

      const outGain = this.ctx.createGain();
      outGain.gain.value = 0.28;

      diffuser2.connect(delayNode);
      delayNode.connect(dampFilter);
      dampFilter.connect(fbGain);
      fbGain.connect(delayNode);
      dampFilter.connect(outGain);

      if (idx < 3) {
        outGain.connect(leftSum);
      } else {
        outGain.connect(rightSum);
      }

      // Modulate 2 tank lines subtly for lush Plate/Hall tail
      if ((idx === 1 || idx === 4) && this.reverbTankLfo) {
        const lfoModGain = this.ctx.createGain();
        lfoModGain.gain.value = idx === 1 ? 0.00024 : -0.00024;
        this.reverbTankLfo.connect(lfoModGain);
        lfoModGain.connect(delayNode.delayTime);
      }

      this.reverbCombDelays.push(delayNode);
      this.reverbCombFeedbacks.push(fbGain);
      this.reverbCombFilters.push(dampFilter);
    });

    stereoMerger.connect(this.reverbWetGain);
    this.reverbWetGain.connect(output);
  }

  private updateChorusMode() {
    if (!this.chorusDelayL || !this.chorusDelayR || !this.chorusLFO || !this.chorusLFOGainL || !this.chorusLFOGainR || !this.chorusDryGain || !this.chorusWetGain || !this.ctx) {
      return;
    }

    const mI = this.params.ChorusI > 0.5;
    const mII = this.params.ChorusII > 0.5;
    const mode = (mI ? 1 : 0) | (mII ? 2 : 0);

    const t = this.ctx.currentTime;

    this.chorusDelayL.delayTime.cancelScheduledValues(t);
    this.chorusDelayR.delayTime.cancelScheduledValues(t);
    this.chorusLFOGainL.gain.cancelScheduledValues(t);
    this.chorusLFOGainR.gain.cancelScheduledValues(t);
    this.chorusDryGain.gain.cancelScheduledValues(t);
    this.chorusWetGain.gain.cancelScheduledValues(t);
    this.chorusLFO.frequency.cancelScheduledValues(t);

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
      this.chorusDryGain.gain.setTargetAtTime(0.65, t, 0.02);
      this.chorusWetGain.gain.setTargetAtTime(0.52, t, 0.02);

      this.chorusLFO.frequency.setTargetAtTime(0.513, t, 0.02);
      this.chorusDelayL.delayTime.setTargetAtTime(0.0040, t, 0.02);
      this.chorusDelayR.delayTime.setTargetAtTime(0.0044, t, 0.02);
      this.chorusLFOGainL.gain.setTargetAtTime(0.0013, t, 0.02);
      this.chorusLFOGainR.gain.setTargetAtTime(-0.0013, t, 0.02);
    } else if (mode === 2) {
      // Chorus II (Authentic Roland Juno-60 Mode II):
      // Rate = 0.863 Hz, Delay = ~5.2ms Left, ~5.8ms Right, modulation depth = +/- 2.4ms
      // Thick, rich, warm organic wobble
      this.chorusDryGain.gain.setTargetAtTime(0.48, t, 0.02);
      this.chorusWetGain.gain.setTargetAtTime(0.68, t, 0.02);

      this.chorusLFO.frequency.setTargetAtTime(0.863, t, 0.02);
      this.chorusDelayL.delayTime.setTargetAtTime(0.0052, t, 0.02);
      this.chorusDelayR.delayTime.setTargetAtTime(0.0058, t, 0.02);
      this.chorusLFOGainL.gain.setTargetAtTime(0.0024, t, 0.02);
      this.chorusLFOGainR.gain.setTargetAtTime(-0.0024, t, 0.02);
    } else if (mode === 3) {
      // Chorus I + II (Authentic Roland Juno-60 Mode I+II - Dual Press):
      // Swirling Leslie rotary chorus
      this.chorusDryGain.gain.setTargetAtTime(0.50, t, 0.02);
      this.chorusWetGain.gain.setTargetAtTime(0.60, t, 0.02);

      this.chorusLFO.frequency.setTargetAtTime(1.02, t, 0.02);
      this.chorusDelayL.delayTime.setTargetAtTime(0.0046, t, 0.02);
      this.chorusDelayR.delayTime.setTargetAtTime(0.0050, t, 0.02);
      this.chorusLFOGainL.gain.setTargetAtTime(0.0016, t, 0.02);
      this.chorusLFOGainR.gain.setTargetAtTime(-0.0016, t, 0.02);
    }
  }

  private updateDelayMode() {
    try {
      if (
        !this.delayDryGain ||
        !this.delayWetGain ||
        !this.delayNodeL ||
        !this.delayNodeR ||
        !this.delayFeedbackL ||
        !this.delayFeedbackR ||
        !this.ctx
      ) {
        return;
      }

      const t = this.ctx.currentTime;
      const isEnabled = this.params.DelayEnabled > 0.5;

      if (!isEnabled) {
        this.delayDryGain.gain.setTargetAtTime(1.0, t, 0.02);
        this.delayWetGain.gain.setTargetAtTime(0.0, t, 0.02);
        this.delayFeedbackL.gain.setTargetAtTime(0.0, t, 0.02);
        this.delayFeedbackR.gain.setTargetAtTime(0.0, t, 0.02);
        return;
      }

      // Delay time: safe clamping between 0.06s and 0.75s, strictly within 2.0s buffer limit
      const baseTimeSec = 0.06 + Math.max(0, Math.min(1, this.params.DelayTime)) * 0.69;
      const timeL = Math.max(0.01, Math.min(1.8, baseTimeSec));
      const timeR = Math.max(0.01, Math.min(1.8, baseTimeSec * 1.333)); // Ping-pong stereo offset

      const fb = Math.max(0, Math.min(0.85, this.params.DelayFeedback)) * 0.72;
      const wet = Math.max(0, Math.min(1.0, this.params.DelayMix)) * 0.65;
      const dry = Math.max(0, 1.0 - (wet * 0.35));

      this.delayNodeL.delayTime.setTargetAtTime(timeL, t, 0.03);
      this.delayNodeR.delayTime.setTargetAtTime(timeR, t, 0.03);

      this.delayFeedbackL.gain.setTargetAtTime(fb * 0.45, t, 0.02);
      this.delayFeedbackR.gain.setTargetAtTime(fb * 0.45, t, 0.02);

      this.delayDryGain.gain.setTargetAtTime(dry, t, 0.02);
      this.delayWetGain.gain.setTargetAtTime(wet, t, 0.02);
    } catch (err) {
      console.warn('updateDelayMode audio error caught:', err);
    }
  }

  private updateReverbMode() {
    try {
      if (
        !this.ctx ||
        !this.reverbDryGain ||
        !this.reverbWetGain ||
        !this.reverbPreDelay ||
        this.reverbCombDelays.length === 0
      ) {
        return;
      }

      const t = this.ctx.currentTime;
      const isEnabled = this.params.ReverbEnabled > 0.5;

      this.reverbDryGain.gain.cancelScheduledValues(t);
      this.reverbWetGain.gain.cancelScheduledValues(t);

      if (!isEnabled) {
        this.reverbDryGain.gain.setTargetAtTime(1.0, t, 0.025);
        this.reverbWetGain.gain.setTargetAtTime(0.0, t, 0.025);
        this.reverbCombFeedbacks.forEach((fb) => {
          fb.gain.cancelScheduledValues(t);
          fb.gain.setTargetAtTime(0.0, t, 0.04);
        });
        return;
      }

      const isHall = this.params.ReverbType >= 0.5; // 0 = PLATE, 1 = HALL
      const timeNorm = Math.max(0, Math.min(1, this.params.ReverbTime));
      const decayNorm = Math.max(0, Math.min(1, this.params.ReverbDecay));
      const mixNorm = Math.max(0, Math.min(1, this.params.ReverbMix));

      // Plate vs Hall acoustic profile:
      // Plate: tight pre-delay (4ms..45ms), compact dense tank scale (0.85x..1.25x), bright damping (6800 Hz)
      // Hall: spacious pre-delay (15ms..95ms), large concert hall tank scale (1.15x..1.85x), warm damping (3400 Hz)
      const preDelaySec = isHall
        ? 0.015 + timeNorm * 0.080
        : 0.004 + timeNorm * 0.041;
      const sizeScale = isHall
        ? 1.15 + timeNorm * 0.70
        : 0.85 + timeNorm * 0.40;
      const dampingCutoffHz = isHall ? 3400 : 6800;

      // Feedback (RT60 decay): wide musical range 0.32 (short tight room) to 0.925 (lush infinite tail)
      const feedbackVal = 0.32 + decayNorm * 0.605;

      const wet = mixNorm * 0.78;
      const dry = Math.max(0.25, 1.0 - wet * 0.32);

      if (Math.abs(this.reverbPreDelay.delayTime.value - preDelaySec) > 0.0005) {
        this.reverbPreDelay.delayTime.cancelScheduledValues(t);
        this.reverbPreDelay.delayTime.setTargetAtTime(preDelaySec, t, 0.025);
      }

      const baseCombTimes = [0.0297, 0.0371, 0.0411, 0.0313, 0.0389, 0.0437];
      this.reverbCombDelays.forEach((delayNode, idx) => {
        const targetTime = Math.min(0.22, baseCombTimes[idx] * sizeScale);
        if (Math.abs(delayNode.delayTime.value - targetTime) > 0.0004) {
          delayNode.delayTime.cancelScheduledValues(t);
          delayNode.delayTime.setTargetAtTime(targetTime, t, 0.03);
        }
      });

      this.reverbCombFilters.forEach((filter) => {
        if (Math.abs(filter.frequency.value - dampingCutoffHz) > 5) {
          filter.frequency.cancelScheduledValues(t);
          filter.frequency.setTargetAtTime(dampingCutoffHz, t, 0.025);
        }
      });

      this.reverbCombFeedbacks.forEach((fb) => {
        fb.gain.cancelScheduledValues(t);
        fb.gain.setTargetAtTime(feedbackVal, t, 0.018);
      });

      this.reverbDryGain.gain.setTargetAtTime(dry, t, 0.02);
      this.reverbWetGain.gain.setTargetAtTime(wet, t, 0.02);
    } catch (err) {
      console.warn('updateReverbMode audio error caught:', err);
    }
  }

  // Arpeggiator Configuration
  setArpConfig(config: Partial<ArpConfig>) {
    const wasEnabled = this.arpConfig.enabled;
    this.arpConfig = { ...this.arpConfig, ...config };

    if (!this.arpConfig.enabled && wasEnabled) {
      this.stopArpClock();
      this.arpHeldNotes = [];
      this.arpLatchedNotes = [];
    } else if (this.arpConfig.enabled && !wasEnabled) {
      if (this.arpHeldNotes.length > 0) {
        this.startArpClock();
      }
    } else if (this.arpConfig.enabled && this.arpTimerId !== null) {
      this.restartArpClock();
    }
  }

  getArpConfig(): ArpConfig {
    return { ...this.arpConfig };
  }

  private getStepDurationMs(): number {
    const b = Math.max(40, Math.min(260, this.arpConfig.bpm));
    const beatMs = 60000 / b;
    if (this.arpConfig.rateDivision === '1/8') return beatMs / 2;
    if (this.arpConfig.rateDivision === '1/16') return beatMs / 4;
    return (beatMs / 4) * (2 / 3);
  }

  private startArpClock() {
    this.stopArpClock();
    this.arpCurrentStep = 0;
    this.arpTick();
    const interval = this.getStepDurationMs();
    this.arpTimerId = window.setInterval(() => this.arpTick(), interval);
  }

  private restartArpClock() {
    if (this.arpTimerId !== null) {
      window.clearInterval(this.arpTimerId);
      const interval = this.getStepDurationMs();
      this.arpTimerId = window.setInterval(() => this.arpTick(), interval);
    }
  }

  private stopArpClock() {
    if (this.arpTimerId !== null) {
      window.clearInterval(this.arpTimerId);
      this.arpTimerId = null;
    }
    if (this.arpNoteOffTimerId !== null) {
      window.clearTimeout(this.arpNoteOffTimerId);
      this.arpNoteOffTimerId = null;
    }
    if (this.arpLastPlayedNote !== null) {
      this.triggerVoiceOff(this.arpLastPlayedNote);
      this.arpLastPlayedNote = null;
    }
  }

  private arpTick() {
    const sourceNotes = this.arpHeldNotes.length > 0
      ? this.arpHeldNotes
      : (this.arpConfig.hold ? this.arpLatchedNotes : []);

    if (sourceNotes.length === 0) {
      if (this.arpLastPlayedNote !== null) {
        this.triggerVoiceOff(this.arpLastPlayedNote);
        this.arpLastPlayedNote = null;
      }
      return;
    }

    const sorted = [...sourceNotes].sort((a, b) => a - b);
    const expanded: number[] = [];
    const octaves = Math.max(1, Math.min(3, this.arpConfig.range));

    for (let oct = 0; oct < octaves; oct++) {
      for (const n of sorted) {
        expanded.push(n + oct * 12);
      }
    }

    let sequence: number[] = [];
    if (this.arpConfig.mode === 'UP') {
      sequence = expanded;
    } else if (this.arpConfig.mode === 'DOWN') {
      sequence = [...expanded].reverse();
    } else if (this.arpConfig.mode === 'U/D') {
      if (expanded.length <= 2) {
        sequence = expanded;
      } else {
        const middleReversed = expanded.slice(1, -1).reverse();
        sequence = [...expanded, ...middleReversed];
      }
    } else {
      sequence = expanded;
    }

    if (sequence.length === 0) return;

    let noteToPlay: number;
    if (this.arpConfig.mode === 'RND') {
      noteToPlay = sequence[Math.floor(Math.random() * sequence.length)];
    } else {
      noteToPlay = sequence[this.arpCurrentStep % sequence.length];
      this.arpCurrentStep = (this.arpCurrentStep + 1) % sequence.length;
    }

    if (this.arpLastPlayedNote !== null) {
      this.triggerVoiceOff(this.arpLastPlayedNote);
    }

    this.triggerVoiceOn(noteToPlay, 95);
    this.arpLastPlayedNote = noteToPlay;

    const stepDuration = this.getStepDurationMs();
    if (this.arpNoteOffTimerId !== null) {
      window.clearTimeout(this.arpNoteOffTimerId);
    }
    this.arpNoteOffTimerId = window.setTimeout(() => {
      if (this.arpLastPlayedNote === noteToPlay) {
        this.triggerVoiceOff(noteToPlay);
        this.arpLastPlayedNote = null;
      }
    }, stepDuration * 0.7);
  }

  // Voice allocation and trigger (Authentic 6-Voice Round-Robin + Warm Analog Retrigger)
  private triggerVoiceOn(note: number, velocity: number = 100) {
    const numVoices = this.voices.length;
    if (numVoices === 0) return;

    // 1. Search in Round-Robin order for the next completely free/inactive voice
    let selectedVoice: HeraVoiceInstance | undefined;
    for (let i = 0; i < numVoices; i++) {
      const idx = (this.rrIndex + i) % numVoices;
      if (!this.voices[idx].active) {
        selectedVoice = this.voices[idx];
        this.rrIndex = (idx + 1) % numVoices;
        break;
      }
    }

    // 2. If all 6 voices are active, pick the oldest voice in release for Warm Retrigger
    if (!selectedVoice) {
      const releasedVoices = this.voices
        .filter(v => v.released)
        .sort((a, b) => a.startTime - b.startTime);
      if (releasedVoices.length > 0) {
        selectedVoice = releasedVoices[0];
        this.rrIndex = (selectedVoice.id + 1) % numVoices;
      }
    }

    // 3. If all 6 voices are currently held, steal the oldest voice overall for Warm Retrigger
    if (!selectedVoice) {
      const sortedAll = [...this.voices].sort((a, b) => a.startTime - b.startTime);
      selectedVoice = sortedAll[0];
      this.rrIndex = (selectedVoice.id + 1) % numVoices;
    }

    // Softly damp any OTHER voice that is still ringing the exact same MIDI note
    // so rapid single-note arpeggios articulate cleanly without phase build-up
    let anyOtherVoiceActive = this.arpConfig.enabled;
    for (const v of this.voices) {
      if (v !== selectedVoice && v.active) {
        anyOtherVoiceActive = true;
        if (v.note === note) {
          v.softenSameNoteRelease();
        }
      }
    }

    if (selectedVoice) {
      selectedVoice.start(
        note,
        velocity,
        this.params,
        this.pitchBendSemitones,
        this.modWheelAmount,
        anyOtherVoiceActive
      );
    }

    this.broadcastVoiceStatus();
  }

  private triggerVoiceOff(note: number) {
    const matching = this.voices.filter(v => v.active && !v.released && v.note === note);
    matching.forEach(v => v.stop(this.params));
    this.broadcastVoiceStatus();
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

    // If Arpeggiator is active, route through arpeggiator clock
    if (this.arpConfig.enabled) {
      if (!this.arpHeldNotes.includes(note)) {
        this.arpHeldNotes.push(note);
      }
      this.arpLatchedNotes = [...this.arpHeldNotes];
      if (this.arpTimerId === null) {
        this.startArpClock();
      }
      return;
    }

    this.triggerVoiceOn(note, velocity);
  }

  // Note Off
  noteOff(note: number) {
    // If Arpeggiator is active, update held notes
    if (this.arpConfig.enabled) {
      this.arpHeldNotes = this.arpHeldNotes.filter(n => n !== note);
      if (!this.arpConfig.hold && this.arpHeldNotes.length === 0) {
        this.stopArpClock();
      }
      return;
    }

    this.triggerVoiceOff(note);
  }

  // All notes off
  allNotesOff() {
    this.stopArpClock();
    this.arpHeldNotes = [];
    this.arpLatchedNotes = [];
    this.voices.forEach(v => v.stopImmediate());
    this.broadcastVoiceStatus();
  }

  // Manual LFO trigger button (iconic Juno feature)
  triggerManualLfo() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.voices.forEach(v => {
      if (v.active) {
        v.scheduleLfo(this.params, this.modWheelAmount, t, false);
      }
    });
  }

  // Pitch bend: -1.0 to +1.0 (defaults to +/- 2 semitones)
  setPitchBend(value: number) {
    this.pitchBendSemitones = value * 2.0;
    if (this.ctx) {
      this.voices.forEach(v => {
        if (v.active) {
          v.updateOscillators(this.params, this.pitchBendSemitones, false);
          v.updateFilter(this.params, this.pitchBendSemitones);
        }
      });
    }
  }

  // Mod wheel: 0.0 to 1.0 (adds to LFO modulation)
  setModWheel(value: number) {
    this.modWheelAmount = value;
    if (this.ctx) {
      this.voices.forEach(v => {
        v.updateLfoDepth(this.params, this.modWheelAmount);
      });
    }
  }

  // Parameter update
  setParameter<K extends keyof HeraParameters>(param: K, value: HeraParameters[K]) {
    this.params[param] = value;

    if (!this.ctx) return;

    if (param === 'HPF' && this.hpfFilter) {
      this.hpfFilter.frequency.setTargetAtTime(getHpfFrequency(value as number), this.ctx.currentTime, 0.02);
    } else if (param === 'ChorusI' || param === 'ChorusII') {
      this.updateChorusMode();
    } else if (param === 'LFORate' && this.globalLfoOsc) {
      this.globalLfoOsc.frequency.setTargetAtTime(getLfoRateHz(value as number), this.ctx.currentTime, 0.015);
    } else if (param === 'LFODelay' || param === 'DCOPitchModDepth' || param === 'VCFLFO') {
      this.voices.forEach(v => {
        v.updateLfoDepth(this.params, this.modWheelAmount);
      });
    } else if (param === 'MasterVolume') {
      this.setMasterVolume(value as number);
    } else if (param === 'VCADepth') {
      this.voices.forEach(v => {
        v.updateVolume(value as number);
      });
    } else if (param.startsWith('Delay')) {
      this.updateDelayMode();
    } else if (param.startsWith('Reverb')) {
      this.updateReverbMode();
    } else if (
      param === 'DCOSawLevel' ||
      param === 'DCOPulseLevel' ||
      param === 'DCOSubLevel' ||
      param === 'DCONoiseLevel'
    ) {
      this.voices.forEach(v => {
        if (v.active) {
          v.updateOscillatorLevels(this.params);
        }
      });
    } else if (param.startsWith('DCO')) {
      this.voices.forEach(v => {
        if (v.active) {
          v.updateOscillators(this.params, this.pitchBendSemitones, false);
        }
      });
    } else if (param.startsWith('VCF')) {
      this.voices.forEach(v => {
        if (v.active) {
          v.updateFilter(this.params, this.pitchBendSemitones);
        }
      });
    } else if (param === 'ENVSustain') {
      this.voices.forEach(v => {
        if (v.active && !v.released) {
          v.updateSustain(this.params);
          v.updateFilter(this.params, this.pitchBendSemitones);
        }
      });
    }
  }

  setAllParameters(params: HeraParameters) {
    this.params = { ...params };
    if (typeof params.MasterVolume === 'number') {
      this.masterVolume = Math.max(0, Math.min(1, params.MasterVolume));
    }
    if (!this.ctx) return;

    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume * 0.85, this.ctx.currentTime, 0.02);
    }
    if (this.hpfFilter) {
      this.hpfFilter.frequency.setTargetAtTime(getHpfFrequency(params.HPF), this.ctx.currentTime, 0.02);
    }
    if (this.globalLfoOsc) {
      this.globalLfoOsc.frequency.setTargetAtTime(getLfoRateHz(params.LFORate), this.ctx.currentTime, 0.015);
    }
    this.updateChorusMode();
    this.updateDelayMode();
    this.updateReverbMode();
    this.voices.forEach(v => {
      if (v.active) {
        v.updateOscillators(this.params, this.pitchBendSemitones, false);
        v.updateLfoDepth(this.params, this.modWheelAmount);
        v.updateFilter(this.params, this.pitchBendSemitones);
        v.updateVolume(params.VCADepth);
      }
    });
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
    this.allNotesOff();
    this.voices.forEach(v => v.dispose());
    try {
      this.globalLfoOsc?.stop();
      this.globalLfoOsc?.disconnect();
    } catch {
      // already stopped
    }
    this.ctx?.close();
  }
}

// Global synth singleton
export const synthEngine = new HeraSynthesizerEngine();
