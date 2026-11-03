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

export type MidiMappableAction =
  | 'prevPreset'
  | 'nextPreset'
  | 'selectPreset'
  | 'lfoTrig'
  | 'arpToggle'
  | 'arpHold'
  | 'pitchWheel'
  | 'modWheel';

export type MidiPresetChangeMode = 'program_change' | 'custom';

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
  if (action === 'pitchWheel' || action === 'modWheel') return 'keys';
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

// Default Launchkey MK4 MIDI CC Mapping — matches the 18 default controls (16 params + 2 preset actions):
export const DEFAULT_LAUNCHKEY_MK4_PARAM_TO_CC: Partial<Record<keyof HeraParameters, number>> = {
  // DCO PWM Switch (CH 06 -> CC0)
  DCOPWMMod: 0,        // PWM MAN/LFO/ENV -> CC0 (CH 06)
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
  // ECHO DELAY (CH 06)
  DelayEnabled: 8,     // ON -> CC8
  DelayFeedback: 9,    // F-BACK -> CC9
  DelayMix: 11,        // MIX -> CC11
  // REVERB GLOBAL (CH 06)
  ReverbEnabled: 17,   // ON -> CC17
  ReverbDecay: 6,      // DECAY -> CC6
  ReverbMix: 7,        // MIX -> CC7
};

export const DEFAULT_LAUNCHKEY_MK4_ACTION_TO_CC: Partial<Record<MidiMappableAction, number>> = {
  prevPreset: 1115, // PC115 (CH 06)
  nextPreset: 1114, // PC114 (CH 06)
};

export const DEFAULT_LAUNCHKEY_MK4_ACTION_TO_CHANNEL: Partial<Record<MidiMappableAction, number>> = {
  prevPreset: 6,
  nextPreset: 6,
};

export const DEFAULT_MIDI_CC_MAP: Record<number, keyof HeraParameters> = {
  0: 'DCOPWMMod',
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
  actionToCC?: Partial<Record<MidiMappableAction, number>>;
  actionToChannel?: Partial<Record<MidiMappableAction, number>>;
  presetChangeMode?: MidiPresetChangeMode;
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

const PROFILES_STORAGE_KEY = 'hera_midi_profiles_v5';
const ACTIVE_PROFILE_STORAGE_KEY = 'hera_active_midi_profile_id_v5';
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
    if (paramKey === 'DCOPWMMod' && paramToCC[paramKey] === 0) {
      out[paramKey] = 6; // CH 06 in Launchkey MK4 layout
      continue;
    }
    const sec = getSectionForParam(paramKey);
    const ch = sectionChannels[sec] ?? 0;
    if (ch >= 1 && ch <= 16) {
      out[paramKey] = ch;
    }
  }
  return out;
}

function buildDefaultActionMapping(): Record<number, MidiMappableAction> {
  return {
    1115: 'prevPreset',
    1114: 'nextPreset',
  };
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
  private actionToCC: Partial<Record<MidiMappableAction, number>> = {
    ...DEFAULT_LAUNCHKEY_MK4_ACTION_TO_CC,
  };
  private actionToChannel: Partial<Record<MidiMappableAction, number>> = {
    ...DEFAULT_LAUNCHKEY_MK4_ACTION_TO_CHANNEL,
  };
  private presetChangeMode: MidiPresetChangeMode = 'program_change';
  private profiles: MidiControllerProfile[] = [];
  private activeProfileId: string = DEFAULT_PROFILE_ID;

  private activeLearnParam: keyof HeraParameters | null = null;
  private activeLearnAction: MidiMappableAction | null = null;
  private lastLearnedPresetAction: MidiMappableAction | null = null;
  private lastLearnedPresetTimestamp: number = 0;

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
          actionToCC: { ...DEFAULT_LAUNCHKEY_MK4_ACTION_TO_CC },
          actionToChannel: { ...DEFAULT_LAUNCHKEY_MK4_ACTION_TO_CHANNEL },
          presetChangeMode: 'program_change',
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
        actionToCC: { ...DEFAULT_LAUNCHKEY_MK4_ACTION_TO_CC },
        actionToChannel: { ...DEFAULT_LAUNCHKEY_MK4_ACTION_TO_CHANNEL },
        presetChangeMode: 'program_change',
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

      const rawActionMapping = { ...(prof.actionMapping || {}) };
      const mergedActionToCC: Partial<Record<MidiMappableAction, number>> = {
        ...(prof.actionToCC || {}),
      };
      for (const [ccStr, act] of Object.entries(rawActionMapping)) {
        if (act && mergedActionToCC[act] === undefined) {
          mergedActionToCC[act] = Number(ccStr);
        }
      }
      const rebuiltActionMapping: Record<number, MidiMappableAction> = {};
      for (const [act, ccNum] of Object.entries(mergedActionToCC)) {
        if (ccNum !== undefined) {
          rebuiltActionMapping[ccNum] = act as MidiMappableAction;
        }
      }

      return {
        ...prof,
        paramToCC: mergedParamToCC,
        paramToChannel: {
          ...buildDefaultParamToChannel(mergedParamToCC, mergedSections),
          ...(prof.paramToChannel || {}),
        },
        actionMapping: rebuiltActionMapping,
        actionToCC: mergedActionToCC,
        actionToChannel: { ...(prof.actionToChannel || {}) },
        presetChangeMode: prof.presetChangeMode === 'custom' ? 'custom' : 'program_change',
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
    this.actionToCC = { ...(active.actionToCC || {}) };
    this.actionMapping = { ...(active.actionMapping || buildDefaultActionMapping()) };
    for (const [ccStr, act] of Object.entries(this.actionMapping)) {
      if (act && this.actionToCC[act] === undefined) {
        this.actionToCC[act] = Number(ccStr);
      }
    }
    this.actionToChannel = { ...(active.actionToChannel || {}) };
    this.presetChangeMode = active.presetChangeMode === 'custom' ? 'custom' : 'program_change';
    this.keysChannel = this.sectionChannels.keys;
    this.effectsChannel = active.effectsChannel ?? 0;

    this.persistProfilesToStorage();
  }

  private rebuildActionMappingFromActionToCC() {
    const out: Record<number, MidiMappableAction> = {};
    for (const [act, ccNum] of Object.entries(this.actionToCC)) {
      if (ccNum !== undefined) {
        out[ccNum] = act as MidiMappableAction;
      }
    }
    this.actionMapping = out;
  }

  private persistProfilesToStorage() {
    this.keysChannel = this.sectionChannels.keys;
    this.rebuildActionMappingFromActionToCC();

    // Sync current state into the active profile slot first (Auto-Save into active profile)
    this.profiles = this.profiles.map((p) =>
      p.id === this.activeProfileId
        ? {
            ...p,
            paramToCC: { ...this.paramToCC },
            paramToChannel: { ...this.paramToChannel },
            actionMapping: { ...this.actionMapping },
            actionToCC: { ...this.actionToCC },
            actionToChannel: { ...this.actionToChannel },
            presetChangeMode: this.presetChangeMode,
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
      actionToCC: { ...(p.actionToCC || {}) },
      actionToChannel: { ...(p.actionToChannel || {}) },
      presetChangeMode: p.presetChangeMode === 'custom' ? 'custom' : 'program_change',
      sectionChannels: { ...p.sectionChannels },
    }));
  }

  getActiveProfileId(): string {
    return this.activeProfileId;
  }

  getPresetChangeMode(): MidiPresetChangeMode {
    return this.presetChangeMode;
  }

  setPresetChangeMode(mode: MidiPresetChangeMode) {
    this.presetChangeMode = mode === 'custom' ? 'custom' : 'program_change';
    this.persistProfilesToStorage();
  }

  selectProfile(profileId: string) {
    const target = this.profiles.find((p) => p.id === profileId);
    if (!target) return;

    this.activeProfileId = target.id;
    this.paramToCC = { ...target.paramToCC };
    this.paramToChannel = { ...(target.paramToChannel || {}) };
    this.actionToCC = { ...(target.actionToCC || {}) };
    this.actionMapping = { ...target.actionMapping };
    for (const [ccStr, act] of Object.entries(this.actionMapping)) {
      if (act && this.actionToCC[act] === undefined) {
        this.actionToCC[act] = Number(ccStr);
      }
    }
    this.actionToChannel = { ...(target.actionToChannel || {}) };
    this.presetChangeMode = target.presetChangeMode === 'custom' ? 'custom' : 'program_change';
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

  createProfile(name?: string): MidiControllerProfile {
    const trimmed = (name || '').trim() || `User ${this.profiles.length}`;
    const newProfile: MidiControllerProfile = {
      id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      paramToCC: { ...this.paramToCC },
      paramToChannel: { ...this.paramToChannel },
      actionMapping: { ...this.actionMapping },
      actionToCC: { ...this.actionToCC },
      actionToChannel: { ...this.actionToChannel },
      presetChangeMode: this.presetChangeMode,
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

  renameProfile(profileId: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) return;
    this.profiles = this.profiles.map((p) =>
      p.id === profileId ? { ...p, name: trimmed } : p
    );
    this.persistProfilesToStorage();
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

    // Update any learned action channel in this section (except preset actions which keep their mapped button's channel)
    for (const actionKey of Object.keys(this.actionToCC) as MidiMappableAction[]) {
      if (
        actionKey === 'prevPreset' ||
        actionKey === 'nextPreset' ||
        actionKey === 'selectPreset'
      ) {
        continue;
      }
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

    for (const actionKey of Object.keys(this.actionToCC) as MidiMappableAction[]) {
      if (
        actionKey === 'prevPreset' ||
        actionKey === 'nextPreset' ||
        actionKey === 'selectPreset'
      ) {
        continue;
      }
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
   * Always prioritizes the parameter's individual learned channel (`paramToChannel[param]`) over `sectionChannels`.
   * Same CC numbers on different channels (e.g. CC7 on CH1 vs CH2 vs CH6) are strictly differentiated.
   */
  private doesParamMatchChannel(param: keyof HeraParameters, msgChannel: number): boolean {
    const effectiveCh = this.getChannelForParam(param);
    if (effectiveCh === 0) {
      return true; // OMNI
    }
    return msgChannel === effectiveCh;
  }

  private doesActionMatchChannel(action: MidiMappableAction, msgChannel: number): boolean {
    const effectiveCh = this.getChannelForAction(action);
    if (effectiveCh === 0) {
      return true; // OMNI
    }
    return msgChannel === effectiveCh;
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

    // 1. Remove any existing parameter mapping using the same CC on the same effective channel (or OMNI)
    for (const [p, existingCC] of Object.entries(this.paramToCC)) {
      const paramKey = p as keyof HeraParameters;
      if (paramKey === param || existingCC !== cc) continue;

      const otherEffectiveCh = this.getChannelForParam(paramKey);

      if (
        otherEffectiveCh === effectiveChannel ||
        otherEffectiveCh === 0 ||
        effectiveChannel === 0
      ) {
        delete this.paramToCC[paramKey];
        delete this.paramToChannel[paramKey];
      }
    }

    // 2. Also remove any conflicting Action mapping using the same CC on the same channel (or OMNI)
    for (const [actKey, existingCC] of Object.entries(this.actionToCC)) {
      const actionKey = actKey as MidiMappableAction;
      if (existingCC !== cc) continue;
      const otherEffectiveCh = this.getChannelForAction(actionKey);
      if (
        otherEffectiveCh === effectiveChannel ||
        otherEffectiveCh === 0 ||
        effectiveChannel === 0
      ) {
        delete this.actionToCC[actionKey];
        delete this.actionToChannel[actionKey];
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
    this.onActionMappingChanged?.(this.getActionMapping());
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
    const learnedCh = this.paramToChannel[param];
    if (learnedCh !== undefined && learnedCh >= 1 && learnedCh <= 16) {
      return learnedCh;
    }
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
    const section = getSectionForAction(action);
    const sectionCh = this.sectionChannels[section] ?? 0;
    const effectiveChannel =
      learnedChannel !== undefined && learnedChannel >= 1 && learnedChannel <= 16
        ? learnedChannel
        : sectionCh;

    // 1. Remove any conflicting parameter mapping on the same CC + channel (or OMNI) so old mappings never stay active!
    for (const [p, existingCC] of Object.entries(this.paramToCC)) {
      const paramKey = p as keyof HeraParameters;
      if (existingCC !== cc) continue;
      const otherEffectiveCh = this.getChannelForParam(paramKey);
      if (
        otherEffectiveCh === effectiveChannel ||
        otherEffectiveCh === 0 ||
        effectiveChannel === 0
      ) {
        delete this.paramToCC[paramKey];
        delete this.paramToChannel[paramKey];
      }
    }

    // 2. Remove any conflicting action mapping on the same CC + channel (or OMNI)
    for (const [actKey, existingCC] of Object.entries(this.actionToCC)) {
      const otherAction = actKey as MidiMappableAction;
      if (otherAction === action || existingCC !== cc) continue;
      const otherEffectiveCh = this.getChannelForAction(otherAction);
      if (
        otherEffectiveCh === effectiveChannel ||
        otherEffectiveCh === 0 ||
        effectiveChannel === 0
      ) {
        delete this.actionToCC[otherAction];
        delete this.actionToChannel[otherAction];
      }
    }

    // 3. Assign the new CC/PC code to this action
    this.actionToCC[action] = cc;
    if (effectiveChannel >= 1 && effectiveChannel <= 16) {
      this.actionToChannel[action] = effectiveChannel;
    } else {
      delete this.actionToChannel[action];
    }

    // 4. Automatically switch presetChangeMode to 'custom' when mapping a preset selection action
    if (action === 'prevPreset' || action === 'nextPreset' || action === 'selectPreset') {
      this.presetChangeMode = 'custom';
      this.lastLearnedPresetAction = action;
      this.lastLearnedPresetTimestamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    this.persistProfilesToStorage();
    this.onMappingChanged?.(this.getMapping());
    this.onActionMappingChanged?.(this.getActionMapping(), action, cc);
  }

  unmapAction(action: MidiMappableAction) {
    delete this.actionToCC[action];
    delete this.actionToChannel[action];
    this.persistProfilesToStorage();
    this.onActionMappingChanged?.(this.getActionMapping());
  }

  getActionMapping(): Record<number, MidiMappableAction> {
    this.rebuildActionMappingFromActionToCC();
    return { ...this.actionMapping };
  }

  getActionToCCMap(): Partial<Record<MidiMappableAction, number>> {
    return { ...this.actionToCC };
  }

  getCCForAction(action: MidiMappableAction): number | null {
    const cc = this.actionToCC[action];
    if (cc !== undefined) return cc;
    for (const [ccStr, a] of Object.entries(this.actionMapping)) {
      if (a === action) return Number(ccStr);
    }
    return null;
  }

  getChannelForAction(action: MidiMappableAction): number {
    const learnedCh = this.actionToChannel[action];
    if (learnedCh !== undefined && learnedCh >= 1 && learnedCh <= 16) {
      return learnedCh;
    }
    // For preset actions, if another preset button has a learned channel, use that button's channel
    // Otherwise default to 0 (OMNI) so preset Program Change is not tied to the section channel
    if (action === 'prevPreset' || action === 'nextPreset' || action === 'selectPreset') {
      const fallbackPresetCh =
        this.actionToChannel.selectPreset ??
        this.actionToChannel.prevPreset ??
        this.actionToChannel.nextPreset;
      if (fallbackPresetCh !== undefined && fallbackPresetCh >= 1 && fallbackPresetCh <= 16) {
        return fallbackPresetCh;
      }
      return 0;
    }
    const section = getSectionForAction(action);
    return this.sectionChannels[section] ?? 0;
  }

  /**
   * Returns the MIDI channel learned from any mapped preset button (1..16), or 0 (OMNI) if none is mapped.
   */
  getPresetMappedChannel(): number {
    const ch =
      this.actionToChannel.selectPreset ??
      this.actionToChannel.prevPreset ??
      this.actionToChannel.nextPreset;
    return ch !== undefined && ch >= 1 && ch <= 16 ? ch : 0;
  }

  resetToDefaultMapping() {
    this.paramToCC = buildDefaultParamToCC();
    this.paramToChannel = buildDefaultParamToChannel(this.paramToCC, this.sectionChannels);
    this.actionToCC = { ...DEFAULT_LAUNCHKEY_MK4_ACTION_TO_CC };
    this.actionMapping = buildDefaultActionMapping();
    this.actionToChannel = { ...DEFAULT_LAUNCHKEY_MK4_ACTION_TO_CHANNEL };
    this.presetChangeMode = 'program_change';
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
        this.onMidiActivity?.(2000, data2, msgChannel);
        const bendRaw = (data2 << 7) | data1;
        const normalized = Math.max(-1, Math.min(1, (bendRaw - 8192) / 8192));
        const norm0to1 = Math.max(0, Math.min(1, (normalized + 1) * 0.5));

        if (this.activeLearnAction === 'pitchWheel' || this.activeLearnAction === 'modWheel') {
          const learned = this.activeLearnAction;
          this.mapActionCC(2000, learned, msgChannel);
          this.activeLearnAction = null;
          if (learned === 'pitchWheel') {
            this.synth.setPitchBend(normalized);
            this.onActionTriggered?.('pitchWheel', normalized);
          } else {
            this.synth.setModWheel(norm0to1);
            this.onActionTriggered?.('modWheel', norm0to1);
          }
          return;
        }

        const pitchMapped = this.actionToCC.pitchWheel;
        const modMapped = this.actionToCC.modWheel;
        let handled = false;

        if (pitchMapped === 2000 && this.doesActionMatchChannel('pitchWheel', msgChannel)) {
          this.synth.setPitchBend(normalized);
          this.onActionTriggered?.('pitchWheel', normalized);
          handled = true;
        }
        if (modMapped === 2000 && this.doesActionMatchChannel('modWheel', msgChannel)) {
          this.synth.setModWheel(norm0to1);
          this.onActionTriggered?.('modWheel', norm0to1);
          handled = true;
        }

        // Default Pitch Bend behavior when Pitch Wheel is not custom-mapped to another CC
        if (!handled && pitchMapped === undefined && isKeysChannelMatch) {
          this.synth.setPitchBend(normalized);
          this.onActionTriggered?.('pitchWheel', normalized);
        }
        break;
      }
      case 0xc: {
        // Program Change (0xCn program)
        const programNumber = data1;
        const pcCode = 1000 + programNumber;
        this.onMidiActivity?.(pcCode, programNumber, msgChannel);

        // 1. MIDI Learn interception for Actions (including Bank Select + Program Change combo within 250ms):
        if (this.activeLearnAction) {
          const learned = this.activeLearnAction;
          this.mapActionCC(pcCode, learned, msgChannel);
          this.activeLearnAction = null;
          this.onActionTriggered?.(learned, programNumber);
          return;
        } else if (
          this.lastLearnedPresetAction &&
          now - this.lastLearnedPresetTimestamp < 250
        ) {
          // Controller sent Bank Select (CC0/CC32) right before Program Change — upgrade mapping to PC code on the button's channel
          const learned = this.lastLearnedPresetAction;
          this.mapActionCC(pcCode, learned, msgChannel);
          this.onActionTriggered?.(learned, programNumber);
          return;
        }

        // 2. Check if 'prevPreset' or 'nextPreset' is specifically mapped to this PC code on the mapped button's channel:
        for (const action of ['prevPreset', 'nextPreset'] as const) {
          const mappedCode = this.actionToCC[action];
          if (mappedCode === pcCode && this.doesActionMatchChannel(action, msgChannel)) {
            this.onActionTriggered?.(action, programNumber);
            return;
          }
        }

        // 3. If 'selectPreset' is mapped to Program Change (>= 1000) on this button's channel,
        //    ANY Program Change (0..127) on that mapped button's channel selects the preset!
        const selectMappedCode = this.actionToCC.selectPreset;
        if (
          selectMappedCode !== undefined &&
          selectMappedCode >= 1000 &&
          this.doesActionMatchChannel('selectPreset', msgChannel)
        ) {
          this.onActionTriggered?.('selectPreset', programNumber);
          return;
        }

        // 4. Program Change preset selection:
        //    Uses the channel of the mapped preset button (if any preset button was mapped on a channel),
        //    or accepts any channel (OMNI) when in 'program_change' mode — never locked to the section channel!
        const mappedPresetCh = this.getPresetMappedChannel();
        const isMappedButtonChannelMatch = mappedPresetCh === 0 || msgChannel === mappedPresetCh;

        if (this.presetChangeMode === 'program_change') {
          if (isMappedButtonChannelMatch || isArpPresetsChannelMatch || isKeysChannelMatch) {
            this.onProgramChange?.(programNumber);
          }
        } else if (mappedPresetCh >= 1 && msgChannel === mappedPresetCh && selectMappedCode === undefined) {
          // Even in custom mode, if the user mapped < or > to CC buttons on `mappedPresetCh`,
          // Program Change arriving on that same mapped button's channel is also honored
          const prevCode = this.actionToCC.prevPreset;
          const nextCode = this.actionToCC.nextPreset;
          const isPrevNextUsingPC =
            (prevCode !== undefined && prevCode >= 1000) ||
            (nextCode !== undefined && nextCode >= 1000);
          if (!isPrevNextUsingPC) {
            this.onProgramChange?.(programNumber);
          }
        }
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

        // 2. MIDI Learn interception for Actions (including Pitch & Mod Wheels):
        if (this.activeLearnAction) {
          const learned = this.activeLearnAction;
          const isMomentaryAction =
            learned === 'prevPreset' || learned === 'nextPreset' || learned === 'lfoTrig';
          if (isMomentaryAction && value === 0) {
            // Ignore button release (value 0) when waiting to learn a momentary trigger
            return;
          }
          this.mapActionCC(cc, learned, msgChannel);
          this.activeLearnAction = null;
          if (learned === 'pitchWheel') {
            const bend = normalized * 2 - 1;
            this.synth.setPitchBend(bend);
            this.onActionTriggered?.('pitchWheel', bend);
          } else if (learned === 'modWheel') {
            this.synth.setModWheel(normalized);
            this.onActionTriggered?.('modWheel', normalized);
          } else if (learned === 'selectPreset' || value >= 1) {
            this.onActionTriggered?.(learned, value);
          }
          return;
        }

        // 3. Check if CC triggers any Action on the matching MIDI channel
        for (const [actKey, mappedCode] of Object.entries(this.actionToCC)) {
          if (mappedCode !== cc) continue;
          const targetAction = actKey as MidiMappableAction;
          if (this.doesActionMatchChannel(targetAction, msgChannel)) {
            if (targetAction === 'pitchWheel') {
              const bend = normalized * 2 - 1;
              this.synth.setPitchBend(bend);
              this.onActionTriggered?.('pitchWheel', bend);
            } else if (targetAction === 'modWheel') {
              this.synth.setModWheel(normalized);
              this.onActionTriggered?.('modWheel', normalized);
            } else if (
              targetAction === 'arpToggle' ||
              targetAction === 'arpHold' ||
              targetAction === 'selectPreset'
            ) {
              this.onActionTriggered?.(targetAction, value);
            } else if (value >= 1) {
              this.onActionTriggered?.(targetAction, value);
            }
          }
        }

        // 4. Strict (CC + Channel) Parameter Resolution:
        //    Only update parameters mapped to `cc` whose effective channel matches `msgChannel` (or OMNI 0).
        //    Never fall back to parameters on other MIDI channels (e.g. CC7 on CH2 vs CH6 must never collide).
        const strictMatchedParams: Array<keyof HeraParameters> = [];

        for (const [paramKey, mappedCC] of Object.entries(this.paramToCC)) {
          if (mappedCC !== cc) continue;
          const targetParam = paramKey as keyof HeraParameters;
          if (this.doesParamMatchChannel(targetParam, msgChannel)) {
            strictMatchedParams.push(targetParam);
          }
        }

        if (strictMatchedParams.length === 0 && cc === 1 && this.actionToCC.modWheel === undefined) {
          const lfoCh = this.sectionChannels.lfo ?? 0;
          const isLfoChMatch = lfoCh === 0 || msgChannel === lfoCh;
          if (isKeysChannelMatch || isLfoChMatch) {
            this.synth.setModWheel(normalized);
            this.onActionTriggered?.('modWheel', normalized);
          }
        }

        for (const targetParam of strictMatchedParams) {
          let paramValue: number = normalized;

          // Handle 3-position switches (0, 1, 2) and 2-position switches (0, 1)
          if (targetParam === 'DCORange' || targetParam === 'DCOPWMMod') {
            if (value <= 0) {
              paramValue = 0;
            } else if (value === 1) {
              paramValue = 1;
            } else if (value === 2) {
              paramValue = 2;
            } else {
              paramValue = value < 64 ? 1 : 2;
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
