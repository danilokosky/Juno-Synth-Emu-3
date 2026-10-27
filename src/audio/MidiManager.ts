import { HeraSynthesizerEngine } from './HeraAudioEngine';
import { HeraParameters } from '../types/synth';

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
}

// Default hardware MIDI CC Mapping for physical knobs/switches/faders
export const DEFAULT_MIDI_CC_MAP: Record<number, keyof HeraParameters> = {
  1: 'DCOPitchModDepth', // Modulation Wheel
  7: 'VCADepth',         // Master Volume
  14: 'DCORange',        // DCO Range
  15: 'DCOPWMMod',       // PWM Mod Source
  16: 'DCOPWMDepth',     // PWM Depth
  18: 'DCOPulseLevel',   // Pulse Level
  19: 'DCOSawLevel',     // Saw Level
  20: 'DCOSubLevel',     // Sub Level
  21: 'DCONoiseLevel',   // Noise Level
  22: 'HPF',             // HPF Cutoff
  74: 'VCFCutoff',       // Standard MIDI Brightness / Cutoff
  71: 'VCFResonance',    // Standard MIDI Resonance
  23: 'VCFEnv',          // VCF Envelope Mod Depth
  24: 'VCFLFO',          // VCF LFO Mod Depth
  25: 'VCFKey',          // Keyboard Tracking
  26: 'VCFBendDepth',    // Pitch Bend Depth
  73: 'ENVAttack',       // Standard MIDI Attack
  75: 'ENVDecay',        // Standard MIDI Decay
  79: 'ENVSustain',      // Standard MIDI Sustain
  72: 'ENVRelease',      // Standard MIDI Release
  27: 'VCAType',         // VCA Mode (Gate / Env)
  28: 'LFORate',         // LFO Rate
  29: 'LFODelay',        // LFO Delay
  80: 'ChorusI',         // Chorus I
  81: 'ChorusII',        // Chorus II
};

export class MidiManager {
  private midiAccess: MIDIAccess | null = null;
  private isSupported: boolean = false;
  private connectedDevices: MidiDevice[] = [];
  private onDevicesChanged?: (devices: MidiDevice[]) => void;
  private onMidiActivity?: (cc?: number, value?: number) => void;
  private onParamChangedFromMidi?: (param: keyof HeraParameters, value: number) => void;
  private onMappingChanged?: (
    mapping: Record<number, keyof HeraParameters>,
    learnedParam?: keyof HeraParameters,
    learnedCC?: number
  ) => void;
  private synth: HeraSynthesizerEngine;

  private ccMapping: Record<number, keyof HeraParameters> = { ...DEFAULT_MIDI_CC_MAP };
  private activeLearnParam: keyof HeraParameters | null = null;

  constructor(synth: HeraSynthesizerEngine) {
    this.synth = synth;
  }

  async init(
    onDevicesChanged?: (devices: MidiDevice[]) => void,
    onMidiActivity?: (cc?: number, value?: number) => void,
    onParamChangedFromMidi?: (param: keyof HeraParameters, value: number) => void,
    onMappingChanged?: (
      mapping: Record<number, keyof HeraParameters>,
      learnedParam?: keyof HeraParameters,
      learnedCC?: number
    ) => void
  ) {
    this.onDevicesChanged = onDevicesChanged;
    this.onMidiActivity = onMidiActivity;
    this.onParamChangedFromMidi = onParamChangedFromMidi;
    this.onMappingChanged = onMappingChanged;

    if (typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator) {
      this.isSupported = true;
      try {
        this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
        this.midiAccess.onstatechange = () => this.updateInputs();
        this.updateInputs();
      } catch (err) {
        console.warn('Web MIDI Access not granted or available:', err);
      }
    } else {
      this.isSupported = false;
    }
  }

  setOnMappingChanged(
    cb: (
      mapping: Record<number, keyof HeraParameters>,
      learnedParam?: keyof HeraParameters,
      learnedCC?: number
    ) => void
  ) {
    this.onMappingChanged = cb;
  }

  setLearnParam(param: keyof HeraParameters | null) {
    this.activeLearnParam = param;
  }

  getLearnParam(): keyof HeraParameters | null {
    return this.activeLearnParam;
  }

  mapCC(cc: number, param: keyof HeraParameters) {
    // Remove existing mapping for this parameter if any
    for (const [k, v] of Object.entries(this.ccMapping)) {
      if (v === param) {
        delete this.ccMapping[Number(k)];
      }
    }
    this.ccMapping[cc] = param;
    this.onMappingChanged?.(this.getMapping(), param, cc);
  }

  unmapParam(param: keyof HeraParameters) {
    for (const [k, v] of Object.entries(this.ccMapping)) {
      if (v === param) {
        delete this.ccMapping[Number(k)];
      }
    }
    this.onMappingChanged?.(this.getMapping());
  }

  unmapCC(cc: number) {
    delete this.ccMapping[cc];
    this.onMappingChanged?.(this.getMapping());
  }

  getCCForParam(param: keyof HeraParameters): number | null {
    for (const [ccStr, p] of Object.entries(this.ccMapping)) {
      if (p === param) return Number(ccStr);
    }
    return null;
  }

  getMapping(): Record<number, keyof HeraParameters> {
    return { ...this.ccMapping };
  }

  resetToDefaultMapping() {
    this.ccMapping = { ...DEFAULT_MIDI_CC_MAP };
    this.onMappingChanged?.(this.getMapping());
  }

  private updateInputs() {
    if (!this.midiAccess) return;

    const devices: MidiDevice[] = [];
    const inputs = this.midiAccess.inputs.values();

    for (const input of inputs) {
      devices.push({
        id: input.id,
        name: input.name || 'MIDI Input Device',
        manufacturer: input.manufacturer || 'Generic',
        state: input.state,
      });

      input.onmidimessage = (e) => this.handleMidiMessage(e);
    }

    this.connectedDevices = devices;
    this.onDevicesChanged?.(devices);
  }

  private handleMidiMessage(event: MIDIMessageEvent) {
    if (!event.data) return;

    const [statusByte, data1, data2] = event.data;
    const command = statusByte >> 4;

    switch (command) {
      case 0x9: {
        // Note On
        this.onMidiActivity?.();
        const note = data1;
        const velocity = data2;
        if (velocity > 0) {
          this.synth.noteOn(note, velocity);
        } else {
          this.synth.noteOff(note);
        }
        break;
      }
      case 0x8: {
        // Note Off
        this.onMidiActivity?.();
        const note = data1;
        this.synth.noteOff(note);
        break;
      }
      case 0xe: {
        // Pitch Bend (14-bit)
        this.onMidiActivity?.();
        const bendRaw = (data2 << 7) | data1;
        const normalized = (bendRaw - 8192) / 8192;
        this.synth.setPitchBend(normalized);
        break;
      }
      case 0xb: {
        // Control Change
        const cc = data1;
        const value = data2;
        const normalized = value / 127;
        this.onMidiActivity?.(cc, value);

        // MIDI Learn interception
        if (this.activeLearnParam) {
          const learned = this.activeLearnParam;
          // Remove existing mappings for this param
          for (const [k, v] of Object.entries(this.ccMapping)) {
            if (v === learned) {
              delete this.ccMapping[Number(k)];
            }
          }
          this.ccMapping[cc] = learned;
          this.activeLearnParam = null;
          this.onMappingChanged?.(this.getMapping(), learned, cc);
          console.log(`MIDI Learn complete: CC ${cc} mapped to ${learned}`);
        }

        // Check if CC is mapped to a synth parameter
        const targetParam = this.ccMapping[cc];
        if (targetParam) {
          let paramValue: number = normalized;

          // Handle stepped/discrete parameters
          if (targetParam === 'DCORange') {
            paramValue = Math.min(2, Math.floor(normalized * 3));
          } else if (targetParam === 'DCOPWMMod') {
            paramValue = Math.min(2, Math.floor(normalized * 3));
          } else if (targetParam === 'VCAType' || targetParam === 'LFOTrigMode') {
            paramValue = normalized >= 0.5 ? 1 : 0;
          } else if (targetParam === 'ChorusI' || targetParam === 'ChorusII') {
            paramValue = normalized >= 0.5 ? 1 : 0;
          } else if (targetParam === 'VCFEnv') {
            // Bipolar: -1.0 to 1.0
            paramValue = normalized * 2 - 1;
          }

          this.synth.setParameter(targetParam, paramValue);
          this.onParamChangedFromMidi?.(targetParam, paramValue);
        }

        // Standard Panic (CC 120 / CC 123)
        if (cc === 120 || cc === 123) {
          this.synth.allNotesOff();
        }
        break;
      }
    }
  }

  getIsSupported(): boolean {
    return this.isSupported;
  }

  getDevices(): MidiDevice[] {
    return this.connectedDevices;
  }
}
