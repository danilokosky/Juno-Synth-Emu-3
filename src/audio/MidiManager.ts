import { HeraSynthesizerEngine } from './HeraAudioEngine';
import { HeraParameters } from '../types/synth';

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
}

export type MidiSectionId =
  | 'keys'
  | 'lfo'
  | 'dco'
  | 'hpf'
  | 'vcf'
  | 'vca'
  | 'env'
  | 'chorus'
  | 'delay'
  | 'reverb'
  | 'arpPresets';

export type MidiSectionChannels = Record<MidiSectionId, number>;

export interface MidiSectionMeta {
  id: MidiSectionId;
  label: string;
  shortLabel: string;
  description: string;
  isKeys?: boolean;
}

export const MIDI_SECTIONS: MidiSectionMeta[] = [
  {
    id: 'keys',
    label: 'Teclas & Volume Master',
    shortLabel: 'TECLAS',
    description: 'Notas, Pitch Bend e Volume Geral',
    isKeys: true,
  },
  {
    id: 'lfo',
    label: 'LFO (Vibrato)',
    shortLabel: 'LFO',
    description: 'Rate, Vib Delay e Botão Man Trig',
  },
  {
    id: 'dco',
    label: 'DCO / VCO (Oscilador)',
    shortLabel: 'DCO',
    description: 'Range, PWM, LFO, Pulse, Saw, Sub e Noise',
  },
  {
    id: 'hpf',
    label: 'HPF (Filtro Passa-Alta)',
    shortLabel: 'HPF',
    description: 'Frequência do HPF',
  },
  {
    id: 'vcf',
    label: 'VCF (Filtro Principal)',
    shortLabel: 'VCF',
    description: 'Freq, Res, Env, LFO, Kybd e Bend',
  },
  {
    id: 'vca',
    label: 'VCA (Amplificador)',
    shortLabel: 'VCA',
    description: 'Modo ENV/GATE e VCA Level',
  },
  {
    id: 'env',
    label: 'ENV (Envelope ADSR)',
    shortLabel: 'ENV',
    description: 'Attack, Decay, Sustain e Release',
  },
  {
    id: 'chorus',
    label: 'Chorus BBD',
    shortLabel: 'CHORUS',
    description: 'Chorus I e Chorus II',
  },
  {
    id: 'delay',
    label: 'Echo Delay',
    shortLabel: 'DELAY',
    description: 'ON/OFF, Time, Feedback e Mix',
  },
  {
    id: 'reverb',
    label: 'Reverb Global',
    shortLabel: 'REVERB',
    description: 'ON/OFF, Mode, Time, Decay e Mix',
  },
  {
    id: 'arpPresets',
    label: 'Arpejador & Presets',
    shortLabel: 'ARP/PRG',
    description: 'Arp ON/OFF, Hold e Navegação de Presets',
  },
];

// Parameters that default to the Keys channel (Channel 1) on fresh profiles
export const KEYS_CHANNEL_PARAMS: ReadonlySet<keyof HeraParameters> = new Set<keyof HeraParameters>([
  'MasterVolume',   // Master Volume (Volume Geral)
  'VCADepth',       // VCA Level
  'DCOPulseLevel',  // VCO/DCO Pulse Level
  'DCOSawLevel',    // VCO/DCO Saw Level
  'DCOSubLevel',    // VCO/DCO Sub Level
  'DCONoiseLevel',  // VCO/DCO Noise Level
]);

export type MidiMappableAction = 'prevPreset' | 'nextPreset' | 'lfoTrig' | 'arpToggle' | 'arpHold';

export function getSectionForParam(param: keyof HeraParameters): MidiSectionId {
  switch (param) {
    case 'MasterVolume':
      return 'keys';
    case 'LFORate':
    case 'LFODelay':
      return 'lfo';
    case 'DCORange':
    case 'LFOTrigMode':
    case 'DCOPWMMod':
    case 'DCOPitchModDepth':
    case 'DCOPWMDepth':
    case 'DCOPulseLevel':
    case 'DCOSawLevel':
    case 'DCOSubLevel':
    case 'DCONoiseLevel':
      return 'dco';
    case 'HPF':
      return 'hpf';
    case 'VCFCutoff':
    case 'VCFResonance':
    case 'VCFEnv':
    case 'VCFLFO':
    case 'VCFKey':
    case 'VCFBendDepth':
      return 'vcf';
    case 'VCAType':
    case 'VCADepth':
      return 'vca';
    case 'ENVAttack':
    case 'ENVDecay':
    case 'ENVSustain':
    case 'ENVRelease':
      return 'env';
    case 'ChorusI':
    case 'ChorusII':
      return 'chorus';
    case 'DelayEnabled':
    case 'DelayTime':
    case 'DelayFeedback':
    case 'DelayMix':
      return 'delay';
    case 'ReverbEnabled':
    case 'ReverbType':
    case 'ReverbTime':
    case 'ReverbDecay':
    case 'ReverbMix':
      return 'reverb';
    default:
      return 'vcf';
  }
}

export function getSectionForAction(action: MidiMappableAction): MidiSectionId {
  if (action === 'lfoTrig') return 'lfo';
  return 'arpPresets';
}

export function formatMidiChannelShort(ch: number): string {
  return ch === 0 ? 'OMNI' : `CH${ch}`;
}

export const LAUNCHKEY_MK4_SECTION_CHANNELS: MidiSectionChannels = {
  keys: 2,       // CH 02
  lfo: 1,        // CH 01
  dco: 2,        // CH 02
  hpf: 6,        // CH 06
  vcf: 6,        // CH 06
  vca: 2,        // CH 02
  env: 2,        // CH 02
  chorus: 6,     // CH 06
  delay: 6,      // CH 06
  reverb: 6,     // CH 06
  arpPresets: 6, // CH 06
};

export function buildDefaultSectionChannels(keysCh?: number, fxCh?: number): MidiSectionChannels {
  if (keysCh === undefined && fxCh === undefined) {
    return { ...LAUNCHKEY_MK4_SECTION_CHANNELS };
  }
  const k = keysCh ?? LAUNCHKEY_MK4_SECTION_CHANNELS.keys;
  const f = fxCh ?? 6;
  return {
    keys: k,
    lfo: keysCh !== undefined && fxCh === undefined ? 1 : f,
    dco: k,
    hpf: f,
    vcf: f,
    vca: k,
    env: k,
    chorus: f,
    delay: f,
    reverb: f,
    arpPresets: f,
  };
}

// Default Launchkey MK4 MIDI CC Mapping — ONLY the controls mapped in the user's Launchkey MK4 layout:
export const DEFAULT_LAUNCHKEY_MK4_PARAM_TO_CC: Partial<Record<keyof HeraParameters, number>> = {
  // DCO (CH 02)
  DCOPitchModDepth: 1, // LFO -> CC1
  DCOPWMDepth: 20,     // PWM -> CC20
  DCOPulseLevel: 21,   // PULSE -> CC21
  DCOSawLevel: 22,     // SAW -> CC22
  DCOSubLevel: 23,     // SUB -> CC23
  // VCF (CH 06)
  VCFCutoff: 2,        // FREQ -> CC2
  // VCA (CH 02)
  VCADepth: 7,         // LEVEL -> CC7
  // ENV (CH 02)
  ENVAttack: 24,       // A -> CC24
  ENVRelease: 25,      // R -> CC25
  // CHORUS (CH 06)
  ChorusII: 0,         // II -> CC0
  // ECHO DELAY (CH 06)
  DelayEnabled: 8,     // ON -> CC8
  DelayFeedback: 9,    // F-BACK -> CC9
  DelayMix: 11,        // MIX -> CC11
  // REVERB GLOBAL (CH 06)
  ReverbEnabled: 17,   // ON -> CC17
  ReverbDecay: 6,      // DECAY -> CC6
  ReverbMix: 7,        // MIX -> CC7
};

export const DEFAULT_MIDI_CC_MAP: Record<number, keyof HeraParameters> = {
  0: 'ChorusII',
  1: 'DCOPitchModDepth',
  2: 'VCFCutoff',
  6: 'ReverbDecay',
  7: 'VCADepth',
  8: 'DelayEnabled',
  9: 'DelayFeedback',
  11: 'DelayMix',
  17: 'ReverbEnabled',
  20: 'DCOPWMDepth',
  21: 'DCOPulseLevel',
  22: 'DCOSawLevel',
  23: 'DCOSubLevel',
  24: 'ENVAttack',
  25: 'ENVRelease',
};

export interface MidiControllerProfile {
  id: string;
  name: string;
  paramToCC: Partial<Record<keyof HeraParameters, number>>;
  paramToChannel?: Partial<Record<keyof HeraParameters, number>>;
  mapping?: Record<number, keyof HeraParameters>; // Legacy migration support
  actionMapping: Record<number, MidiMappableAction>;
  actionToChannel?: Partial<Record<MidiMappableAction, number>>;
  keysChannel: number;
  effectsChannel: number;
  sectionChannels: MidiSectionChannels;
}

declare global {
  interface Window {
    __onAndroidNativeMidi?: (bytes: number[]) => void;
    __onAndroidNativeMidiDevices?: (deviceNames: string[]) => void;
    AndroidHost?: {
      saveTextFile?: (filename: string, content: string, mimeType: string) => boolean;
      refreshMidiDevices?: () => void;
    };
  }
}

const PROFILES_STORAGE_KEY = 'hera_midi_profiles_v4';
const ACTIVE_PROFILE_STORAGE_KEY = 'hera_active_midi_profile_id_v4';
export const DEFAULT_PROFILE_ID = 'launchkey-mk4';

function buildDefaultParamToCC(): Partial<Record<keyof HeraParameters, number>> {
  return { ...DEFAULT_LAUNCHKEY_MK4_PARAM_TO_CC };
}

function buildDefaultParamToChannel(
  paramToCC: Partial<Record<keyof HeraParameters, number>>,
  sectionChannels: MidiSectionChannels
): Partial<Record<keyof HeraParameters, number>> {
  const out: Partial<Record<keyof HeraParameters, number>> = {};
  for (const paramKey of Object.keys(paramToCC) as Array<keyof HeraParameters>) {
    const sec = getSectionForParam(paramKey);
    const ch = sectionChannels[sec] ?? 0;
    if (ch >= 1 && ch <= 16) {
      out[paramKey] = ch;
    }
  }
  return out;
}

function buildDefaultActionMapping(): Record<number, MidiMappableAction> {
  return {};
}

export class MidiManager {
  private midiAccess: MIDIAccess | null = null;
  private isSupported: boolean = false;
  private connectedDevices: MidiDevice[] = [];
  private nativeDeviceNames: string[] = [];
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
    effectsChannel: number,
    sectionChannels: MidiSectionChannels
  ) => void;
  private synth: HeraSynthesizerEngine;

  // 0 = OMNI (All Channels 1-16), 1..16 = Specific MIDI Channel
  private keysChannel: number = LAUNCHKEY_MK4_SECTION_CHANNELS.keys;
  private effectsChannel: number = 0;
  private sectionChannels: MidiSectionChannels = { ...LAUNCHKEY_MK4_SECTION_CHANNELS };

  private paramToCC: Partial<Record<keyof HeraParameters, number>> = buildDefaultParamToCC();
  private paramToChannel: Partial<Record<keyof HeraParameters, number>> = buildDefaultParamToChannel(
    this.paramToCC,
    this.sectionChannels
  );
  private actionMapping: Record<number, MidiMappableAction> = buildDefaultActionMapping();
  private actionToChannel: Partial<Record<MidiMappableAction, number>> = {};
  private profiles: MidiControllerProfile[] = [];
  private activeProfileId: string = DEFAULT_PROFILE_ID;

  private activeLearnParam: keyof HeraParameters | null = null;
  private activeLearnAction: MidiMappableAction | null = null;

  // Deduplication state between Web MIDI and Android Native MIDI Bridge
  private lastMsgSig: number = -1;
  private lastMsgTimestamp: number = 0;

  constructor(synth: HeraSynthesizerEngine) {
    this.synth = synth;
    this.loadProfilesFromStorage();
  }

  private loadProfilesFromStorage() {
    let loadedProfiles: MidiControllerProfile[] = [];
    let savedActiveId: string | null = null;

    try {
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
    const defaultSections: MidiSectionChannels = { ...LAUNCHKEY_MK4_SECTION_CHANNELS };

    if (loadedProfiles.length === 0) {
      loadedProfiles = [
        {
          id: DEFAULT_PROFILE_ID,
          name: 'Launchkey MK4',
          paramToCC: { ...defaultMap },
          paramToChannel: buildDefaultParamToChannel(defaultMap, defaultSections),
          actionMapping: buildDefaultActionMapping(),
          actionToChannel: {},
          keysChannel: defaultSections.keys,
          effectsChannel: 0,
          sectionChannels: { ...defaultSections },
        },
      ];
    } else if (!loadedProfiles.some((p) => p.id === DEFAULT_PROFILE_ID)) {
      loadedProfiles.unshift({
        id: DEFAULT_PROFILE_ID,
        name: 'Launchkey MK4',
        paramToCC: { ...defaultMap },
        paramToChannel: buildDefaultParamToChannel(defaultMap, defaultSections),
        actionMapping: buildDefaultActionMapping(),
        actionToChannel: {},
        keysChannel: defaultSections.keys,
        effectsChannel: 0,
        sectionChannels: { ...defaultSections },
      });
    }

    // Normalize all saved profiles and migrate legacy `mapping` if `paramToCC` was empty
    loadedProfiles = loadedProfiles.map((prof) => {
      const mergedSections: MidiSectionChannels = {
        ...LAUNCHKEY_MK4_SECTION_CHANNELS,
        ...(prof.sectionChannels || {}),
      };

      let mergedParamToCC: Partial<Record<keyof HeraParameters, number>> = {
        ...(prof.paramToCC || {}),
      };

      // Migrate legacy `mapping` (CC -> Param) if `paramToCC` is empty
      if (Object.keys(mergedParamToCC).length === 0 && prof.mapping) {
        for (const [ccStr, paramKey] of Object.entries(prof.mapping)) {
          if (paramKey) {
            mergedParamToCC[paramKey as keyof HeraParameters] = Number(ccStr);
          }
        }
      }

      // Ensure default Launchkey MK4 profile never loses its default mappings if corrupted/empty
      if (prof.id === DEFAULT_PROFILE_ID && Object.keys(mergedParamToCC).length === 0) {
        mergedParamToCC = { ...defaultMap };
      }

      return {
        ...prof,
        paramToCC: mergedParamToCC,
        paramToChannel: {
          ...buildDefaultParamToChannel(mergedParamToCC, mergedSections),
          ...(prof.paramToChannel || {}),
        },
        actionMapping: { ...(prof.actionMapping || {}) },
        actionToChannel: { ...(prof.actionToChannel || {}) },
        keysChannel: mergedSections.keys,
        effectsChannel: typeof prof.effectsChannel === 'number' ? prof.effectsChannel : 0,
        sectionChannels: mergedSections,
      };
    });

    this.profiles = loadedProfiles;
    const active =
      this.profiles.find((p) => p.id === savedActiveId) ||
      this.profiles.find((p) => p.id === DEFAULT_PROFILE_ID) ||
      this.profiles[0];

    this.activeProfileId = active.id;
    this.paramToCC =
      active.paramToCC && Object.keys(active.paramToCC).length > 0
        ? { ...active.paramToCC }
        : buildDefaultParamToCC();
    this.sectionChannels = {
      ...LAUNCHKEY_MK4_SECTION_CHANNELS,
      ...(active.sectionChannels || {}),
    };
    this.paramToChannel = {
      ...buildDefaultParamToChannel(this.paramToCC, this.sectionChannels),
      ...(active.paramToChannel || {}),
    };
    this.actionMapping = { ...(active.actionMapping || buildDefaultActionMapping()) };
    this.actionToChannel = { ...(active.actionToChannel || {}) };
    this.keysChannel = this.sectionChannels.keys;
    this.effectsChannel = active.effectsChannel ?? 0;

    this.persistProfilesToStorage();
  }

  private persistProfilesToStorage() {
    this.keysChannel = this.sectionChannels.keys;

    // Sync current state into the active profile slot first (Auto-Save into active profile)
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
            sectionChannels: { ...this.sectionChannels },
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
      this.effectsChannel,
      this.getSectionChannels()
    );
  }

  setOnProfilesChanged(
    cb: (
      profiles: MidiControllerProfile[],
      activeProfileId: string,
      keysChannel: number,
      effectsChannel: number,
      sectionChannels: MidiSectionChannels
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
      sectionChannels: { ...p.sectionChannels },
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
    this.sectionChannels = {
      ...buildDefaultSectionChannels(target.keysChannel ?? 1, target.effectsChannel ?? 0),
      ...(target.sectionChannels || {}),
    };
    this.keysChannel = this.sectionChannels.keys;
    this.effectsChannel = target.effectsChannel ?? 0;

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
      sectionChannels: { ...this.sectionChannels },
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

  getSectionChannels(): MidiSectionChannels {
    return { ...this.sectionChannels };
  }

  getSectionChannel(section: MidiSectionId): number {
    return this.sectionChannels[section] ?? 0;
  }

  setSectionChannel(section: MidiSectionId, channel: number) {
    const clamped = Math.max(0, Math.min(16, Math.floor(channel)));
    this.sectionChannels[section] = clamped;

    if (section === 'keys') {
      this.keysChannel = clamped;
      this.synth.allNotesOff();
    }

    // Update any learned per-parameter channel in this section to follow the newly chosen section channel
    for (const paramKey of Object.keys(this.paramToCC) as Array<keyof HeraParameters>) {
      if (getSectionForParam(paramKey) === section) {
        if (clamped === 0) {
          delete this.paramToChannel[paramKey];
        } else {
          this.paramToChannel[paramKey] = clamped;
        }
      }
    }

    // Update any learned action channel in this section
    for (const actionKey of Object.values(this.actionMapping)) {
      if (getSectionForAction(actionKey) === section) {
        if (clamped === 0) {
          delete this.actionToChannel[actionKey];
        } else {
          this.actionToChannel[actionKey] = clamped;
        }
      }
    }

    this.persistProfilesToStorage();
  }

  setAllFxSectionChannels(channel: number) {
    const clamped = Math.max(0, Math.min(16, Math.floor(channel)));
    this.effectsChannel = clamped;

    const fxSections: MidiSectionId[] = [
      'lfo',
      'dco',
      'hpf',
      'vcf',
      'vca',
      'env',
      'chorus',
      'delay',
      'reverb',
      'arpPresets',
    ];
    for (const sec of fxSections) {
      this.sectionChannels[sec] = clamped;
    }

    for (const paramKey of Object.keys(this.paramToCC) as Array<keyof HeraParameters>) {
      if (getSectionForParam(paramKey) !== 'keys') {
        if (clamped === 0) {
          delete this.paramToChannel[paramKey];
        } else {
          this.paramToChannel[paramKey] = clamped;
        }
      }
    }

    for (const actionKey of Object.values(this.actionMapping)) {
      if (clamped === 0) {
        delete this.actionToChannel[actionKey];
      } else {
        this.actionToChannel[actionKey] = clamped;
      }
    }

    this.persistProfilesToStorage();
  }

  setKeysChannel(channel: number) {
    this.setSectionChannel('keys', channel);
  }

  getKeysChannel(): number {
    return this.sectionChannels.keys;
  }

  setEffectsChannel(channel: number) {
    this.setAllFxSectionChannels(channel);
  }

  getEffectsChannel(): number {
    return this.effectsChannel;
  }

  /**
   * Determines whether a given parameter strictly matches `msgChannel` (1..16).
   * Matches if the section is set to OMNI (0), or if `msgChannel` equals the configured
   * section channel, or if `msgChannel` equals the parameter's individual learned channel.
   */
  private doesParamMatchChannel(param: keyof HeraParameters, msgChannel: number): boolean {
    const section = getSectionForParam(param);
    const sectionCh = this.sectionChannels[section] ?? 0;
    if (sectionCh === 0) {
      return true; // OMNI
    }

    const learnedCh = this.paramToChannel[param];
    if (learnedCh !== undefined && learnedCh >= 1 && learnedCh <= 16 && msgChannel === learnedCh) {
      return true;
    }

    return msgChannel === sectionCh;
  }

  private doesActionMatchChannel(action: MidiMappableAction, msgChannel: number): boolean {
    const section = getSectionForAction(action);
    const sectionCh = this.sectionChannels[section] ?? 0;
    if (sectionCh === 0) {
      return true; // OMNI
    }

    const learnedCh = this.actionToChannel[action];
    if (learnedCh !== undefined && learnedCh >= 1 && learnedCh <= 16 && msgChannel === learnedCh) {
      return true;
    }

    return msgChannel === sectionCh;
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

    // 1. Register Android Native MIDI Bridge callbacks (for APK WebView where Web MIDI may be absent)
    if (typeof window !== 'undefined') {
      window.__onAndroidNativeMidi = (bytes: number[]) => {
        if (Array.isArray(bytes) && bytes.length > 0) {
          this.handleRawMidiPacket(bytes);
        }
      };
      window.__onAndroidNativeMidiDevices = (deviceNames: string[]) => {
        if (Array.isArray(deviceNames)) {
          this.nativeDeviceNames = deviceNames;
          this.emitCombinedDevices();
        }
      };
      try {
        window.AndroidHost?.refreshMidiDevices?.();
      } catch {
        // ignore if not on Android host
      }
    }

    // 2. Initialize standard Web MIDI API
    if (typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator) {
      this.isSupported = true;
      try {
        this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
        this.midiAccess.onstatechange = () => this.updateInputs();
        this.updateInputs();
      } catch (err) {
        console.warn('Web MIDI Access not granted or available:', err);
        this.emitCombinedDevices();
      }
    } else {
      this.isSupported = typeof window !== 'undefined' && Boolean(window.AndroidHost);
      this.emitCombinedDevices();
    }
  }

  private emitCombinedDevices() {
    const combined: MidiDevice[] = [...this.connectedDevices];
    for (let i = 0; i < this.nativeDeviceNames.length; i++) {
      const name = this.nativeDeviceNames[i];
      if (!combined.some((d) => d.name === name)) {
        combined.push({
          id: `android-midi-${i}`,
          name,
          manufacturer: 'Android MIDI',
          state: 'connected',
        });
      }
    }
    this.onDevicesChanged?.(combined);
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
    const targetSection = getSectionForParam(param);
    const sectionCh = this.sectionChannels[targetSection] ?? 0;
    const effectiveChannel =
      learnedChannel !== undefined && learnedChannel >= 1 && learnedChannel <= 16
        ? learnedChannel
        : sectionCh;

    // Remove duplicate CC for any other parameter that listens on the same MIDI channel / section
    for (const [p, existingCC] of Object.entries(this.paramToCC)) {
      const paramKey = p as keyof HeraParameters;
      if (paramKey === param || existingCC !== cc) continue;

      const otherSection = getSectionForParam(paramKey);
      const otherSectionCh = this.sectionChannels[otherSection] ?? 0;
      const otherLearnedCh = this.paramToChannel[paramKey] ?? otherSectionCh;

      if (
        otherSection === targetSection ||
        otherLearnedCh === effectiveChannel ||
        otherSectionCh === effectiveChannel ||
        otherSectionCh === 0 ||
        effectiveChannel === 0
      ) {
        delete this.paramToCC[paramKey];
        delete this.paramToChannel[paramKey];
      }
    }

    this.paramToCC[param] = cc;
    if (effectiveChannel >= 1 && effectiveChannel <= 16) {
      this.paramToChannel[param] = effectiveChannel;
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

  getChannelForParam(param: keyof HeraParameters): number {
    const section = getSectionForParam(param);
    return this.sectionChannels[section] ?? 0;
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
    const section = getSectionForAction(action);
    const sectionCh = this.sectionChannels[section] ?? 0;
    if (learnedChannel !== undefined && learnedChannel >= 1 && learnedChannel <= 16) {
      this.actionToChannel[action] = learnedChannel;
    } else if (sectionCh >= 1 && sectionCh <= 16) {
      this.actionToChannel[action] = sectionCh;
    } else {
      delete this.actionToChannel[action];
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

  getChannelForAction(action: MidiMappableAction): number {
    const section = getSectionForAction(action);
    return this.sectionChannels[section] ?? 0;
  }

  resetToDefaultMapping() {
    this.paramToCC = buildDefaultParamToCC();
    this.paramToChannel = buildDefaultParamToChannel(this.paramToCC, this.sectionChannels);
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
    this.emitCombinedDevices();
  }

  private handleMidiMessage(event: MIDIMessageEvent) {
    if (!event.data || event.data.length < 1) return;
    this.handleRawMidiPacket(event.data);
  }

  /**
   * Parses raw MIDI packet bytes (supports single messages, multi-message USB packets, and running status).
   */
  private handleRawMidiPacket(data: Uint8Array | number[]) {
    const len = data.length;
    let i = 0;
    let runningStatus = 0;

    while (i < len) {
      const b = data[i] & 0xff;

      // Real-time system messages (0xF8..0xFF) are 1-byte and do not affect running status
      if (b >= 0xf8) {
        i += 1;
        continue;
      }

      // System Common / SysEx (0xF0..0xF7)
      if (b >= 0xf0) {
        runningStatus = 0;
        if (b === 0xf0) {
          while (i < len && (data[i] & 0xff) !== 0xf7) i++;
          i++; // skip 0xF7
        } else if (b === 0xf2) {
          i += 3;
        } else if (b === 0xf1 || b === 0xf3) {
          i += 2;
        } else {
          i += 1;
        }
        continue;
      }

      let statusByte = runningStatus;
      if (b & 0x80) {
        statusByte = b;
        runningStatus = b;
        i += 1;
      } else if (statusByte === 0) {
        i += 1;
        continue;
      }

      const command = statusByte >> 4;
      // Program Change (0xC) and Channel Pressure (0xD) are 2-byte messages; others (0x8, 0x9, 0xA, 0xB, 0xE) are 3-byte
      const dataBytesNeeded = command === 0xc || command === 0xd ? 1 : 2;
      if (i + dataBytesNeeded > len) {
        break;
      }

      const data1 = data[i] & 0x7f;
      const data2 = dataBytesNeeded === 2 ? data[i + 1] & 0x7f : 0;
      i += dataBytesNeeded;

      this.dispatchSingleMidiMessage(statusByte, data1, data2);
    }
  }

  private dispatchSingleMidiMessage(statusByte: number, data1: number, data2: number) {
    // Deduplicate identical messages arriving simultaneously via both Web MIDI and Android Native MIDI Bridge
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const sig = (statusByte << 16) | (data1 << 8) | data2;
    if (sig === this.lastMsgSig && now - this.lastMsgTimestamp < 5) {
      return;
    }
    this.lastMsgSig = sig;
    this.lastMsgTimestamp = now;

    const command = statusByte >> 4;
    const msgChannel = (statusByte & 0x0f) + 1; // 1..16

    const keysCh = this.sectionChannels.keys ?? 1;
    const isKeysChannelMatch = keysCh === 0 || msgChannel === keysCh;
    const arpPresetsCh = this.sectionChannels.arpPresets ?? 0;
    const isArpPresetsChannelMatch = arpPresetsCh === 0 || msgChannel === arpPresetsCh;

    switch (command) {
      case 0x9: {
        // Note On
        this.onMidiActivity?.(undefined, undefined, msgChannel);
        if (!isKeysChannelMatch) return;
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
        if (!isKeysChannelMatch) return;
        const note = data1;
        this.synth.noteOff(note);
        break;
      }
      case 0xe: {
        // Pitch Bend (14-bit)
        this.onMidiActivity?.(undefined, undefined, msgChannel);
        if (!isKeysChannelMatch) return;
        const bendRaw = (data2 << 7) | data1;
        const normalized = (bendRaw - 8192) / 8192;
        this.synth.setPitchBend(normalized);
        break;
      }
      case 0xc: {
        // Program Change (0xCn program)
        this.onMidiActivity?.(undefined, undefined, msgChannel);
        if (!isArpPresetsChannelMatch) return;
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

        // 1. MIDI Learn interception for Parameters (accepts incoming CC on whichever channel the hardware knob uses):
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

        // 3. Check if CC triggers an Action
        // Rule: 0 = OFF, >= 1 = ON
        const targetAction = this.actionMapping[cc];
        if (targetAction) {
          if (targetAction === 'arpToggle' || targetAction === 'arpHold') {
            this.onActionTriggered?.(targetAction, value);
          } else if (value >= 1) {
            this.onActionTriggered?.(targetAction, value);
          }
        }

        // 4. Two-Pass Parameter Resolution for CC:
        //    Pass 1: Parameters mapped to `cc` that strictly match `msgChannel` (disambiguates shared CCs like CC7 on CH2 vs CH6).
        //    Pass 2: If no parameter on `msgChannel` claimed `cc`, fallback to any parameter mapped to `cc`
        //            so hardware controllers transmitting on CH1 or another channel still control all mapped knobs/faders!
        const strictMatchedParams: Array<keyof HeraParameters> = [];
        const allMappedParamsForCC: Array<keyof HeraParameters> = [];

        for (const [paramKey, mappedCC] of Object.entries(this.paramToCC)) {
          if (mappedCC !== cc) continue;
          const targetParam = paramKey as keyof HeraParameters;
          allMappedParamsForCC.push(targetParam);
          if (this.doesParamMatchChannel(targetParam, msgChannel)) {
            strictMatchedParams.push(targetParam);
          }
        }

        const paramsToUpdate =
          strictMatchedParams.length > 0 ? strictMatchedParams : allMappedParamsForCC;

        for (const targetParam of paramsToUpdate) {
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
