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

export interface MidiControllerProfile {
  id: string;
  name: string;
  paramToCC: Partial<Record<keyof HeraParameters, number>>;
  paramToChannel?: Partial<Record<keyof HeraParameters, number>>;
  actionMapping: Record<number, MidiMappableAction>;
  actionToChannel?: Partial<Record<MidiMappableAction, number>>;
  keysChannel: number;
  effectsChannel: number;
}

const PROFILES_STORAGE_KEY = 'hera_midi_profiles_v1';
const ACTIVE_PROFILE_STORAGE_KEY = 'hera_active_midi_profile_id_v1';
export const DEFAULT_PROFILE_ID = 'launchkey-mk4';

function buildDefaultParamToCC(): Partial<Record<keyof HeraParameters, number>> {
  const map: Partial<Record<keyof HeraParameters, number>> = {};
  for (const [ccStr, param] of Object.entries(DEFAULT_MIDI_CC_MAP)) {
    map[param] = Number(ccStr);
  }
  return map;
}

function buildDefaultActionMapping(): Record<number, MidiMappableAction> {
  return { 110: 'prevPreset', 111: 'nextPreset' };
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
  private onActionTriggered?: (action: MidiMappableAction, rawValue: number) => void;
  private onActionMappingChanged?: (
    actionMap: Record<number, MidiMappableAction>,
    learnedAction?: MidiMappableAction,
    learnedCC?: number
  ) => void;
  private onProfilesChanged?: (
    profiles: MidiControllerProfile[],
    activeProfileId: string,
    keysChannel: number,
    effectsChannel: number
  ) => void;
  private synth: HeraSynthesizerEngine;

  // 0 = OMNI (Global / All Channels 1-16), 1..16 = Specific MIDI Channel
  // keysChannel (default 1 = Channel 1): filters Note On (0x9), Note Off (0x8), Pitch Bend (0xE), AND Volume/VCO Level CCs
  private keysChannel: number = 1;
  // effectsChannel (default 0 = OMNI or 1..16): filters Effects, Filter, LFO, Switches, Reverb, Delay & Actions
  private effectsChannel: number = 0;

  private paramToCC: Partial<Record<keyof HeraParameters, number>> = buildDefaultParamToCC();
  private paramToChannel: Partial<Record<keyof HeraParameters, number>> = {};
  private actionMapping: Record<number, MidiMappableAction> = buildDefaultActionMapping();
  private actionToChannel: Partial<Record<MidiMappableAction, number>> = {};
  private profiles: MidiControllerProfile[] = [];
  private activeProfileId: string = DEFAULT_PROFILE_ID;

  private activeLearnParam: keyof HeraParameters | null = null;
  private activeLearnAction: MidiMappableAction | null = null;

  constructor(synth: HeraSynthesizerEngine) {
    this.synth = synth;
    this.loadProfilesFromStorage();
  }

  private loadProfilesFromStorage() {
    let loadedProfiles: MidiControllerProfile[] = [];
    let savedActiveId: string | null = null;

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

      const rawProfiles = localStorage.getItem(PROFILES_STORAGE_KEY);
      if (rawProfiles) {
        const parsed = JSON.parse(rawProfiles);
        if (Array.isArray(parsed) && parsed.length > 0) {
          loadedProfiles = parsed;
        }
      }
      savedActiveId = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
    } catch {
      // localStorage unavailable or corrupted
    }

    const defaultMap = buildDefaultParamToCC();

    if (loadedProfiles.length === 0) {
      loadedProfiles = [
        {
          id: DEFAULT_PROFILE_ID,
          name: 'Launchkey MK4',
          paramToCC: { ...defaultMap },
          paramToChannel: {},
          actionMapping: buildDefaultActionMapping(),
          actionToChannel: {},
          keysChannel: this.keysChannel,
          effectsChannel: this.effectsChannel,
        },
      ];
    } else if (!loadedProfiles.some((p) => p.id === DEFAULT_PROFILE_ID)) {
      loadedProfiles.unshift({
        id: DEFAULT_PROFILE_ID,
        name: 'Launchkey MK4',
        paramToCC: { ...defaultMap },
        paramToChannel: {},
        actionMapping: buildDefaultActionMapping(),
        actionToChannel: {},
        keysChannel: this.keysChannel,
        effectsChannel: this.effectsChannel,
      });
    }

    // Ensure newly added synth parameters (like ReverbEnabled, ReverbType, ReverbTime, ReverbDecay, ReverbMix)
    // have their default CC if a profile was saved before they existed and hasn't used that CC
    loadedProfiles = loadedProfiles.map((prof) => {
      const mergedParamToCC: Partial<Record<keyof HeraParameters, number>> = {
        ...prof.paramToCC,
      };
      const usedCCs = new Set(Object.values(mergedParamToCC));
      for (const [paramKey, defCC] of Object.entries(defaultMap)) {
        const k = paramKey as keyof HeraParameters;
        if (mergedParamToCC[k] === undefined && defCC !== undefined && !usedCCs.has(defCC)) {
          mergedParamToCC[k] = defCC;
        }
      }
      return {
        ...prof,
        paramToCC: mergedParamToCC,
        paramToChannel: { ...(prof.paramToChannel || {}) },
        actionToChannel: { ...(prof.actionToChannel || {}) },
      };
    });

    this.profiles = loadedProfiles;
    const active =
      this.profiles.find((p) => p.id === savedActiveId) ||
      this.profiles.find((p) => p.id === DEFAULT_PROFILE_ID) ||
      this.profiles[0];

    this.activeProfileId = active.id;
    this.paramToCC = { ...(active.paramToCC || buildDefaultParamToCC()) };
    this.paramToChannel = { ...(active.paramToChannel || {}) };
    this.actionMapping = { ...(active.actionMapping || buildDefaultActionMapping()) };
    this.actionToChannel = { ...(active.actionToChannel || {}) };
    if (typeof active.keysChannel === 'number') {
      this.keysChannel = active.keysChannel;
    }
    if (typeof active.effectsChannel === 'number') {
      this.effectsChannel = active.effectsChannel;
    }

    this.persistProfilesToStorage();
  }

  private persistProfilesToStorage() {
    // Sync current state into the active profile slot first
    this.profiles = this.profiles.map((p) =>
      p.id === this.activeProfileId
        ? {
            ...p,
            paramToCC: { ...this.paramToCC },
            paramToChannel: { ...this.paramToChannel },
            actionMapping: { ...this.actionMapping },
            actionToChannel: { ...this.actionToChannel },
            keysChannel: this.keysChannel,
            effectsChannel: this.effectsChannel,
          }
        : p
    );

    try {
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(this.profiles));
      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, this.activeProfileId);
      localStorage.setItem('hera_midi_keys_channel', String(this.keysChannel));
      localStorage.setItem('hera_midi_ctrl_channel', String(this.effectsChannel));
    } catch {
      // ignore storage errors
    }

    this.onProfilesChanged?.(
      this.getProfiles(),
      this.activeProfileId,
      this.keysChannel,
      this.effectsChannel
    );
  }

  setOnProfilesChanged(
    cb: (
      profiles: MidiControllerProfile[],
      activeProfileId: string,
      keysChannel: number,
      effectsChannel: number
    ) => void
  ) {
    this.onProfilesChanged = cb;
  }

  getProfiles(): MidiControllerProfile[] {
    return this.profiles.map((p) => ({
      ...p,
      paramToCC: { ...p.paramToCC },
      paramToChannel: { ...(p.paramToChannel || {}) },
      actionMapping: { ...p.actionMapping },
      actionToChannel: { ...(p.actionToChannel || {}) },
    }));
  }

  getActiveProfileId(): string {
    return this.activeProfileId;
  }

  selectProfile(profileId: string) {
    const target = this.profiles.find((p) => p.id === profileId);
    if (!target) return;

    this.activeProfileId = target.id;
    this.paramToCC = { ...target.paramToCC };
    this.paramToChannel = { ...(target.paramToChannel || {}) };
    this.actionMapping = { ...target.actionMapping };
    this.actionToChannel = { ...(target.actionToChannel || {}) };
    if (typeof target.keysChannel === 'number') {
      this.keysChannel = target.keysChannel;
    }
    if (typeof target.effectsChannel === 'number') {
      this.effectsChannel = target.effectsChannel;
    }

    this.synth.allNotesOff();
    this.persistProfilesToStorage();
    this.onMappingChanged?.(this.getMapping());
    this.onActionMappingChanged?.(this.getActionMapping());
  }

  createProfile(name: string): MidiControllerProfile {
    const trimmed = name.trim() || `Perfil ${this.profiles.length + 1}`;
    const newProfile: MidiControllerProfile = {
      id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      paramToCC: { ...this.paramToCC },
      paramToChannel: { ...this.paramToChannel },
      actionMapping: { ...this.actionMapping },
      actionToChannel: { ...this.actionToChannel },
      keysChannel: this.keysChannel,
      effectsChannel: this.effectsChannel,
    };

    this.profiles.push(newProfile);
    this.activeProfileId = newProfile.id;
    this.persistProfilesToStorage();
    this.onMappingChanged?.(this.getMapping());
    this.onActionMappingChanged?.(this.getActionMapping());
    return newProfile;
  }

  deleteProfile(profileId: string) {
    if (profileId === DEFAULT_PROFILE_ID) return; // Keep default Launchkey MK4 profile
    this.profiles = this.profiles.filter((p) => p.id !== profileId);
    if (this.activeProfileId === profileId) {
      const fallback = this.profiles[0];
      if (fallback) {
        this.selectProfile(fallback.id);
        return;
      }
    }
    this.persistProfilesToStorage();
  }

  setKeysChannel(channel: number) {
    const clamped = Math.max(0, Math.min(16, Math.floor(channel)));
    if (this.keysChannel !== clamped) {
      const prevKeysCh = this.keysChannel;
      this.keysChannel = clamped;
      // Update any Keys-group parameter that was learned on the previous keysChannel
      for (const paramKey of KEYS_CHANNEL_PARAMS) {
        if (this.paramToChannel[paramKey] === prevKeysCh) {
          if (clamped === 0) {
            delete this.paramToChannel[paramKey];
          } else {
            this.paramToChannel[paramKey] = clamped;
          }
        }
      }
      this.synth.allNotesOff();
      this.persistProfilesToStorage();
    }
  }

  getKeysChannel(): number {
    return this.keysChannel;
  }

  setEffectsChannel(channel: number) {
    const clamped = Math.max(0, Math.min(16, Math.floor(channel)));
    if (this.effectsChannel !== clamped) {
      const prevFxCh = this.effectsChannel;
      this.effectsChannel = clamped;
      // Update any Effects-group parameter that was learned on the previous effectsChannel
      for (const paramKey of Object.keys(this.paramToChannel) as Array<keyof HeraParameters>) {
        if (!KEYS_CHANNEL_PARAMS.has(paramKey) && this.paramToChannel[paramKey] === prevFxCh) {
          if (clamped === 0) {
            delete this.paramToChannel[paramKey];
          } else {
            this.paramToChannel[paramKey] = clamped;
          }
        }
      }
      this.persistProfilesToStorage();
    }
  }

  getEffectsChannel(): number {
    return this.effectsChannel;
  }

  /**
   * Determines whether a given parameter responds to a CC message on `msgChannel` (1..16).
   * - If the parameter was explicitly learned via MIDI Learn on a specific channel (`this.paramToChannel[param]`),
   *   it responds on that exact learned channel AND also on its group channel (`keysChannel` or `effectsChannel`).
   * - Otherwise, it responds on its group channel (`KEYS_CHANNEL_PARAMS` -> `keysChannel`, others -> `effectsChannel`).
   */
  private doesParamMatchChannel(param: keyof HeraParameters, msgChannel: number): boolean {
    const learnedCh = this.paramToChannel[param];
    if (learnedCh !== undefined && learnedCh >= 1 && learnedCh <= 16) {
      if (msgChannel === learnedCh) return true;
    }

    const isKeysParam = KEYS_CHANNEL_PARAMS.has(param);
    if (isKeysParam) {
      return this.keysChannel === 0 || msgChannel === this.keysChannel;
    } else {
      return this.effectsChannel === 0 || msgChannel === this.effectsChannel;
    }
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

  mapCC(cc: number, param: keyof HeraParameters, learnedChannel?: number) {
    const effectiveChannel =
      learnedChannel !== undefined && learnedChannel >= 1 && learnedChannel <= 16
        ? learnedChannel
        : KEYS_CHANNEL_PARAMS.has(param)
        ? this.keysChannel
        : this.effectsChannel;

    // Remove duplicate CC for any other parameter that would respond on the same MIDI channel
    for (const [p, existingCC] of Object.entries(this.paramToCC)) {
      const paramKey = p as keyof HeraParameters;
      if (paramKey === param || existingCC !== cc) continue;

      if (
        effectiveChannel === 0 ||
        this.doesParamMatchChannel(paramKey, effectiveChannel) ||
        KEYS_CHANNEL_PARAMS.has(paramKey) === KEYS_CHANNEL_PARAMS.has(param)
      ) {
        delete this.paramToCC[paramKey];
        delete this.paramToChannel[paramKey];
      }
    }

    this.paramToCC[param] = cc;
    if (learnedChannel !== undefined && learnedChannel >= 1 && learnedChannel <= 16) {
      this.paramToChannel[param] = learnedChannel;
    } else {
      delete this.paramToChannel[param];
    }

    this.persistProfilesToStorage();
    this.onMappingChanged?.(this.getMapping(), param, cc);
  }

  unmapParam(param: keyof HeraParameters) {
    delete this.paramToCC[param];
    delete this.paramToChannel[param];
    this.persistProfilesToStorage();
    this.onMappingChanged?.(this.getMapping());
  }

  unmapCC(cc: number) {
    for (const [p, existingCC] of Object.entries(this.paramToCC)) {
      if (existingCC === cc) {
        const k = p as keyof HeraParameters;
        delete this.paramToCC[k];
        delete this.paramToChannel[k];
      }
    }
    this.persistProfilesToStorage();
    this.onMappingChanged?.(this.getMapping());
  }

  getCCForParam(param: keyof HeraParameters): number | null {
    const cc = this.paramToCC[param];
    return cc !== undefined ? cc : null;
  }

  getChannelForParam(param: keyof HeraParameters): number | null {
    const ch = this.paramToChannel[param];
    return ch !== undefined ? ch : null;
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

  setOnActionTriggered(cb: (action: MidiMappableAction, rawValue: number) => void) {
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

  mapActionCC(cc: number, action: MidiMappableAction, learnedChannel?: number) {
    for (const [k, v] of Object.entries(this.actionMapping)) {
      if (v === action) delete this.actionMapping[Number(k)];
    }
    this.actionMapping[cc] = action;
    if (learnedChannel !== undefined && learnedChannel >= 1 && learnedChannel <= 16) {
      this.actionToChannel[action] = learnedChannel;
    }
    this.persistProfilesToStorage();
    this.onActionMappingChanged?.(this.getActionMapping(), action, cc);
  }

  unmapAction(action: MidiMappableAction) {
    for (const [k, v] of Object.entries(this.actionMapping)) {
      if (v === action) delete this.actionMapping[Number(k)];
    }
    delete this.actionToChannel[action];
    this.persistProfilesToStorage();
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
    this.paramToChannel = {};
    this.actionMapping = buildDefaultActionMapping();
    this.actionToChannel = {};
    this.persistProfilesToStorage();
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
        // Scale faders from 0 to 100 in CC values; values above 100 (up to 127+) clamp to 100
        const clampedCC = Math.max(0, Math.min(100, value));
        const normalized = clampedCC / 100;
        this.onMidiActivity?.(cc, clampedCC, msgChannel);

        // 1. MIDI Learn interception for Parameters:
        // Accepts any physical fader/knob/switch CC on its incoming MIDI channel and locks onto (cc, msgChannel)
        if (this.activeLearnParam) {
          const learned = this.activeLearnParam;
          this.mapCC(cc, learned, msgChannel);
          this.activeLearnParam = null;
        }

        // 2. MIDI Learn interception for Actions:
        if (this.activeLearnAction) {
          const learned = this.activeLearnAction;
          this.mapActionCC(cc, learned, msgChannel);
          this.activeLearnAction = null;
        }

        // 3. Check if CC triggers an Action (matches learned action channel or Effects channel)
        // Rule: 0 = OFF, >= 1 = ON
        const targetAction = this.actionMapping[cc];
        if (targetAction) {
          const learnedActionCh = this.actionToChannel[targetAction];
          const actionChannelMatches =
            (learnedActionCh !== undefined && msgChannel === learnedActionCh) ||
            isEffectsChannelMatch;

          if (actionChannelMatches) {
            if (targetAction === 'arpToggle' || targetAction === 'arpHold') {
              // Switch state directly: 0 = OFF, >= 1 = ON
              this.onActionTriggered?.(targetAction, value);
            } else if (value >= 1) {
              // Momentary actions (prevPreset, nextPreset, lfoTrig) trigger when value >= 1
              this.onActionTriggered?.(targetAction, value);
            }
          }
        }

        // 4. Check if CC is mapped to any synth parameter(s) matching the incoming MIDI channel
        for (const [paramKey, mappedCC] of Object.entries(this.paramToCC)) {
          if (mappedCC !== cc) continue;
          const targetParam = paramKey as keyof HeraParameters;

          if (!this.doesParamMatchChannel(targetParam, msgChannel)) {
            continue;
          }

          let paramValue: number = normalized;

          // Handle switches & buttons: 0 is OFF (0), >= 1 is ON (1)
          if (targetParam === 'DCORange' || targetParam === 'DCOPWMMod') {
            if (value <= 0) {
              paramValue = 0;
            } else if (value === 1) {
              paramValue = 1;
            } else if (value === 2) {
              paramValue = 2;
            } else {
              paramValue = clampedCC < 50 ? 1 : 2;
            }
          } else if (
            targetParam === 'VCAType' ||
            targetParam === 'LFOTrigMode' ||
            targetParam === 'ReverbType' ||
            targetParam === 'ChorusI' ||
            targetParam === 'ChorusII' ||
            targetParam === 'DelayEnabled' ||
            targetParam === 'ReverbEnabled'
          ) {
            paramValue = value >= 1 ? 1 : 0;
          } else if (targetParam === 'VCFEnv') {
            // Bipolar: -1.0 to 1.0 (0..100 CC -> -1.0..1.0, >100 clamped to 1.0)
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


