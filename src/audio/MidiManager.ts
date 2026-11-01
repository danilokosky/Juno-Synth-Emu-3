import { HeraSynthesizerEngine } from './HeraAudioEngine';
import { HeraParameters } from '../types/synth';

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
}

// Parameters that respond on the Keys MIDI Channel (Channel 1 by default: Master Volume, VCA Level, and VCO/DCO Waveform Levels)
export const KEYS_CHANNEL_PARAMS: ReadonlySet<keyof HeraParameters> = new Set<keyof HeraParameters>([
  'MasterVolume',   // Master Volume (Volume Geral)
  'VCADepth',       // VCA Level
  'DCOPulseLevel',  // VCO/DCO Pulse Level
  'DCOSawLevel',    // VCO/DCO Saw Level
  'DCOSubLevel',    // VCO/DCO Sub Level
  'DCONoiseLevel',  // VCO/DCO Noise Level
]);

// Default hardware MIDI CC Mapping for physical knobs/switches/faders
export const DEFAULT_MIDI_CC_MAP: Record<number, keyof HeraParameters> = {
  1: 'DCOPitchModDepth', // Modulation Wheel
  7: 'MasterVolume',     // Master Volume (Keys Channel)
  11: 'VCADepth',        // VCA Level (Keys Channel)
  14: 'DCORange',        // DCO Range
  15: 'DCOPWMMod',       // PWM Mod Source
  16: 'DCOPWMDepth',     // PWM Depth
  18: 'DCOPulseLevel',   // VCO/DCO Pulse Level (Keys Channel)
  19: 'DCOSawLevel',     // VCO/DCO Saw Level (Keys Channel)
  20: 'DCOSubLevel',     // VCO/DCO Sub Level (Keys Channel)
  21: 'DCONoiseLevel',   // VCO/DCO Noise Level (Keys Channel)
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
  85: 'DelayEnabled',    // Echo Delay On/Off
  86: 'DelayTime',       // Echo Delay Time
  87: 'DelayFeedback',   // Echo Delay Feedback
  88: 'DelayMix',        // Echo Delay Mix
  89: 'ReverbEnabled',   // Global Post Reverb On/Off
  90: 'ReverbType',      // Global Post Reverb Type (Plate / Hall)
  91: 'ReverbMix',       // Global Post Reverb Mix
  92: 'ReverbTime',      // Global Post Reverb Time
  93: 'ReverbDecay',     // Global Post Reverb Decay
};

export type MidiMappableAction = 'prevPreset' | 'nextPreset' | 'lfoTrig' | 'arpToggle' | 'arpHold';

function buildDefaultParamToCC(): Partial<Record<keyof HeraParameters, number>> {
  const map: Partial<Record<keyof HeraParameters, number>> = {};
  for (const [ccStr, param] of Object.entries(DEFAULT_MIDI_CC_MAP)) {
    map[param] = Number(ccStr);
  }
  return map;
}

export class MidiManager {
  private midiAccess: MIDIAccess | null = null;
  private isSupported: boolean = false;
  private connectedDevices: MidiDevice[] = [];
  private onDevicesChanged?: (devices: MidiDevice[]) => void;
  private onMidiActivity?: (cc?: number, value?: number, channel?: number) => void;
  private onParamChangedFromMidi?: (param: keyof HeraParameters, value: number) => void;
  private onMappingChanged?: (
    mapping: Record<number, keyof HeraParameters>,
    learnedParam?: keyof HeraParameters,
    learnedCC?: number
  ) => void;
  private onProgramChange?: (programNumber: number) => void;
  private onActionTriggered?: (action: MidiMappableAction) => void;
  private onActionMappingChanged?: (actionMap: Record<number, MidiMappableAction>, learnedAction?: MidiMappableAction, learnedCC?: number) => void;
  private synth: HeraSynthesizerEngine;

  // 0 = OMNI (Global / All Channels 1-16), 1..16 = Specific MIDI Channel
  // keysChannel (default 1 = Channel 1): filters Note On (0x9), Note Off (0x8), Pitch Bend (0xE), AND Volume/VCO Level CCs
  private keysChannel: number = 1;
  // effectsChannel (default 0 = OMNI or 2..16): filters Effects, Filter, LFO, Switches, Reverb, Delay & Actions
  private effectsChannel: number = 0;

  private paramToCC: Partial<Record<keyof HeraParameters, number>> = buildDefaultParamToCC();
  private actionMapping: Record<number, MidiMappableAction> = { 110: 'prevPreset', 111: 'nextPreset' };
  private activeLearnParam: keyof HeraParameters | null = null;
  private activeLearnAction: MidiMappableAction | null = null;

  constructor(synth: HeraSynthesizerEngine) {
    this.synth = synth;
    try {
      const savedKeys = localStorage.getItem('hera_midi_keys_channel');
      if (savedKeys !== null) {
        const parsed = parseInt(savedKeys, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 16) {
          this.keysChannel = parsed;
        }
      }
      const savedFx = localStorage.getItem('hera_midi_ctrl_channel');
      if (savedFx !== null) {
        const parsed = parseInt(savedFx, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 16) {
          this.effectsChannel = parsed;
        }
      }
    } catch {
      // localStorage unavailable
    }
  }

  setKeysChannel(channel: number) {
    const clamped = Math.max(0, Math.min(16, Math.floor(channel)));
    if (this.keysChannel !== clamped) {
      this.keysChannel = clamped;
      this.synth.allNotesOff();
      try {
        localStorage.setItem('hera_midi_keys_channel', String(clamped));
      } catch {
        // localStorage unavailable
      }
    }
  }

  getKeysChannel(): number {
    return this.keysChannel;
  }

  setEffectsChannel(channel: number) {
    const clamped = Math.max(0, Math.min(16, Math.floor(channel)));
    if (this.effectsChannel !== clamped) {
      this.effectsChannel = clamped;
      try {
        localStorage.setItem('hera_midi_ctrl_channel', String(clamped));
      } catch {
        // localStorage unavailable
      }
    }
  }

  getEffectsChannel(): number {
    return this.effectsChannel;
  }

  async init(
    onDevicesChanged?: (devices: MidiDevice[]) => void,
    onMidiActivity?: (cc?: number, value?: number, channel?: number) => void,
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
    const targetIsKeysGroup = KEYS_CHANNEL_PARAMS.has(param);
    // Remove duplicate CC only within the same channel group (Keys vs Effects)
    for (const [p, existingCC] of Object.entries(this.paramToCC)) {
      const paramKey = p as keyof HeraParameters;
      if (existingCC === cc && KEYS_CHANNEL_PARAMS.has(paramKey) === targetIsKeysGroup) {
        delete this.paramToCC[paramKey];
      }
    }
    this.paramToCC[param] = cc;
    this.onMappingChanged?.(this.getMapping(), param, cc);
  }

  unmapParam(param: keyof HeraParameters) {
    delete this.paramToCC[param];
    this.onMappingChanged?.(this.getMapping());
  }

  unmapCC(cc: number) {
    for (const [p, existingCC] of Object.entries(this.paramToCC)) {
      if (existingCC === cc) {
        delete this.paramToCC[p as keyof HeraParameters];
      }
    }
    this.onMappingChanged?.(this.getMapping());
  }

  getCCForParam(param: keyof HeraParameters): number | null {
    const cc = this.paramToCC[param];
    return cc !== undefined ? cc : null;
  }

  getParamToCCMap(): Partial<Record<keyof HeraParameters, number>> {
    return { ...this.paramToCC };
  }

  getMapping(): Record<number, keyof HeraParameters> {
    const out: Record<number, keyof HeraParameters> = {};
    for (const [param, cc] of Object.entries(this.paramToCC)) {
      if (cc !== undefined) {
        out[cc] = param as keyof HeraParameters;
      }
    }
    return out;
  }

  setOnProgramChange(cb: (programNumber: number) => void) {
    this.onProgramChange = cb;
  }

  setOnActionTriggered(cb: (action: MidiMappableAction) => void) {
    this.onActionTriggered = cb;
  }

  setOnActionMappingChanged(
    cb: (actionMap: Record<number, MidiMappableAction>, learnedAction?: MidiMappableAction, learnedCC?: number) => void
  ) {
    this.onActionMappingChanged = cb;
  }

  setLearnAction(action: MidiMappableAction | null) {
    this.activeLearnAction = action;
  }

  getLearnAction(): MidiMappableAction | null {
    return this.activeLearnAction;
  }

  mapActionCC(cc: number, action: MidiMappableAction) {
    for (const [k, v] of Object.entries(this.actionMapping)) {
      if (v === action) delete this.actionMapping[Number(k)];
    }
    this.actionMapping[cc] = action;
    this.onActionMappingChanged?.(this.getActionMapping(), action, cc);
  }

  unmapAction(action: MidiMappableAction) {
    for (const [k, v] of Object.entries(this.actionMapping)) {
      if (v === action) delete this.actionMapping[Number(k)];
    }
    this.onActionMappingChanged?.(this.getActionMapping());
  }

  getActionMapping(): Record<number, MidiMappableAction> {
    return { ...this.actionMapping };
  }

  getCCForAction(action: MidiMappableAction): number | null {
    for (const [ccStr, a] of Object.entries(this.actionMapping)) {
      if (a === action) return Number(ccStr);
    }
    return null;
  }

  resetToDefaultMapping() {
    this.paramToCC = buildDefaultParamToCC();
    this.actionMapping = { 110: 'prevPreset', 111: 'nextPreset' };
    this.onMappingChanged?.(this.getMapping());
    this.onActionMappingChanged?.(this.getActionMapping());
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
    if (!event.data || event.data.length < 1) return;

    const [statusByte, data1 = 0, data2 = 0] = event.data;
    const command = statusByte >> 4;
    const msgChannel = (statusByte & 0x0f) + 1; // 1..16

    const isKeysChannelMatch = this.keysChannel === 0 || msgChannel === this.keysChannel;
    const isEffectsChannelMatch = this.effectsChannel === 0 || msgChannel === this.effectsChannel;

    // 1. Keys / Notes Channel Filtering (Note On 0x9, Note Off 0x8, Pitch Bend 0xE)
    if (command === 0x9 || command === 0x8 || command === 0xe) {
      if (!isKeysChannelMatch) {
        return;
      }
    }

    // 2. Program Change (0xC) on Effects/Controls channel
    if (command === 0xc) {
      if (!isEffectsChannelMatch) {
        return;
      }
    }

    // 3. Control Change (0xB): routed to Keys Channel for Volumes/VCO Levels, and Effects Channel for Effects/Controls
    if (command === 0xb) {
      if (!isKeysChannelMatch && !isEffectsChannelMatch) {
        return;
      }
    }

    switch (command) {
      case 0x9: {
        // Note On
        this.onMidiActivity?.(undefined, undefined, msgChannel);
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
        this.onMidiActivity?.(undefined, undefined, msgChannel);
        const note = data1;
        this.synth.noteOff(note);
        break;
      }
      case 0xe: {
        // Pitch Bend (14-bit)
        this.onMidiActivity?.(undefined, undefined, msgChannel);
        const bendRaw = (data2 << 7) | data1;
        const normalized = (bendRaw - 8192) / 8192;
        this.synth.setPitchBend(normalized);
        break;
      }
      case 0xc: {
        // Program Change (0xCn program)
        this.onMidiActivity?.(undefined, undefined, msgChannel);
        const programNumber = data1;
        this.onProgramChange?.(programNumber);
        break;
      }
      case 0xb: {
        // Control Change
        const cc = data1;
        const value = data2;
        const normalized = value / 127;
        this.onMidiActivity?.(cc, value, msgChannel);

        // MIDI Learn interception for Parameters (channel-aware: Volumes/VCO Levels learn on Keys channel, others on Effects channel)
        if (this.activeLearnParam) {
          const learned = this.activeLearnParam;
          const isKeysParam = KEYS_CHANNEL_PARAMS.has(learned);
          if ((isKeysParam && isKeysChannelMatch) || (!isKeysParam && isEffectsChannelMatch)) {
            this.mapCC(cc, learned);
            this.activeLearnParam = null;
            console.log(`MIDI Learn complete: CC ${cc} (Ch ${msgChannel}) mapped to ${learned}`);
          }
        }

        // MIDI Learn interception for Actions (prevPreset, nextPreset, lfoTrig, arpToggle, arpHold -> Effects channel)
        if (this.activeLearnAction && isEffectsChannelMatch) {
          const learned = this.activeLearnAction;
          for (const [k, v] of Object.entries(this.actionMapping)) {
            if (v === learned) {
              delete this.actionMapping[Number(k)];
            }
          }
          this.actionMapping[cc] = learned;
          this.activeLearnAction = null;
          this.onActionMappingChanged?.(this.getActionMapping(), learned, cc);
          console.log(`MIDI Learn action complete: CC ${cc} mapped to ${learned}`);
        }

        // Check if CC triggers an Action (only on Effects channel & button press / value > 63)
        if (isEffectsChannelMatch) {
          const targetAction = this.actionMapping[cc];
          if (targetAction && value > 63) {
            this.onActionTriggered?.(targetAction);
          }
        }

        // Check if CC is mapped to any synth parameter(s) matching the incoming MIDI channel group
        for (const [paramKey, mappedCC] of Object.entries(this.paramToCC)) {
          if (mappedCC !== cc) continue;
          const targetParam = paramKey as keyof HeraParameters;
          const isKeysParam = KEYS_CHANNEL_PARAMS.has(targetParam);

          if (isKeysParam && !isKeysChannelMatch) continue;
          if (!isKeysParam && !isEffectsChannelMatch) continue;

          let paramValue: number = normalized;

          // Handle stepped/discrete parameters
          if (targetParam === 'DCORange') {
            paramValue = Math.min(2, Math.floor(normalized * 3));
          } else if (targetParam === 'DCOPWMMod') {
            paramValue = Math.min(2, Math.floor(normalized * 3));
          } else if (
            targetParam === 'VCAType' ||
            targetParam === 'LFOTrigMode' ||
            targetParam === 'ReverbType'
          ) {
            paramValue = normalized >= 0.5 ? 1 : 0;
          } else if (
            targetParam === 'ChorusI' ||
            targetParam === 'ChorusII' ||
            targetParam === 'DelayEnabled' ||
            targetParam === 'ReverbEnabled'
          ) {
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
