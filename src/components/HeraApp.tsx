import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HeraParameters, DEFAULT_PARAMETERS, VoiceStatus } from '../types/synth';
import { synthEngine, getAttackSec, getDecaySec, getReleaseSec } from '../audio/HeraAudioEngine';
import {
  MidiManager,
  MidiDevice,
  MidiMappableAction,
  MidiPresetChangeMode,
  MidiControllerProfile,
  MidiSectionId,
  MidiSectionChannels,
  MIDI_SECTIONS,
  DEFAULT_PROFILE_ID,
  buildDefaultSectionChannels,
  getSectionForParam,
  getSectionForAction,
  formatMidiChannelShort,
} from '../audio/MidiManager';
import { FACTORY_PRESETS } from '../presets/factoryPresets';
import { Slider } from './Slider';
import { ToggleSwitch } from './ToggleSwitch';
import { ChorusButton } from './ChorusButton';
import { MidiLearnBadge } from './MidiLearnBadge';
import { Oscilloscope } from './Oscilloscope';
import { VoiceIndicator } from './VoiceIndicator';
import { PresetManager } from './PresetManager';
import { PianoKeyboard } from './PianoKeyboard';
import { Arpeggiator } from './Arpeggiator';
import {
  Volume2,
  VolumeX,
  Disc,
  Download,
  Activity,
  Radio,
  Sparkles,
  Info,
  Layers,
  HelpCircle,
  Sliders,
  Check,
  Plus,
  ChevronDown,
  Trash2,
  Pencil,
  X
} from 'lucide-react';

import { AtariCartridgeIcon } from './AtariCartridgeIcon';

type RackSectionId = 'lfo' | 'dco' | 'hpf' | 'vcf' | 'vca' | 'env' | 'chorus' | 'delay' | 'reverb';

const RACK_SECTION_IDS: RackSectionId[] = [
  'lfo',
  'dco',
  'hpf',
  'vcf',
  'vca',
  'env',
  'chorus',
  'delay',
  'reverb',
];

const RACK_SECTION_GOLDEN_HALO = 'rgba(251, 191, 36, 0.12)';

function getVisualRackSectionForParam(param: keyof HeraParameters): RackSectionId | null {
  if (param === 'MasterVolume') return null;
  // LFOTrigMode is visually rendered inside the DCO section card's selector column
  if (param === 'LFOTrigMode') return 'dco';
  const sec = getSectionForParam(param);
  if (
    sec === 'lfo' ||
    sec === 'dco' ||
    sec === 'hpf' ||
    sec === 'vcf' ||
    sec === 'vca' ||
    sec === 'env' ||
    sec === 'chorus' ||
    sec === 'delay' ||
    sec === 'reverb'
  ) {
    return sec;
  }
  return null;
}

export const HeraApp: React.FC = () => {
  const [params, setParams] = useState<HeraParameters>(() => {
    // Default to Preset 000: Strings 1
    const p0 = FACTORY_PRESETS[0]?.params;
    return p0 ? ({ ...DEFAULT_PARAMETERS, ...p0 } as HeraParameters) : { ...DEFAULT_PARAMETERS };
  });

  const [currentPresetName, setCurrentPresetName] = useState<string>('Strings 1');
  const [isAudioStarted, setIsAudioStarted] = useState<boolean>(false);
  const [masterVolume, setMasterVolume] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Recording
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);

  // Collapsible ARP & Keyboard sections controlled from the Voices/Preset bar
  const [isArpSectionOpen, setIsArpSectionOpen] = useState<boolean>(false);
  const [isArpEnabled, setIsArpEnabled] = useState<boolean>(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState<boolean>(true);

  // Responsive viewport dimensions for Faders Section proportional zoom & elongation (max +20%)
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  }));
  const topHeaderRef = useRef<HTMLDivElement | null>(null);
  const presetBarRef = useRef<HTMLDivElement | null>(null);
  const keyboardSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updateSize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const { faderElongation, rackZoomFactor } = (() => {
    const vw = viewportSize.width;
    const vh = viewportSize.height;
    const aspect = vw / Math.max(1, vh);
    const isSmartphone = vh < 520 || (aspect >= 1.8 && vh < 560);

    const headerH = topHeaderRef.current?.offsetHeight || 54;
    const presetH = presetBarRef.current?.offsetHeight || 64;
    const keyboardH = keyboardSectionRef.current?.offsetHeight || 205;
    const nonRackAboveKeyboardH = headerH + presetH + 14;
    const baseRackH = 236;

    if (isSmartphone) {
      // On Smartphone: Header + Faders Section + Preset Bar fill 100% of viewport height so Keyboard stays hidden below on scroll
      const targetRackH = Math.max(baseRackH, vh - nonRackAboveKeyboardH);
      const totalScale = Math.max(1.0, targetRackH / baseRackH);
      const elongation = Math.min(1.2, Math.max(1.0, totalScale)); // Never exceed +20%
      const zoom = Math.min(1.45, Math.max(1.0, totalScale / elongation));
      return { faderElongation: elongation, rackZoomFactor: zoom };
    }

    if (!isKeyboardOpen) {
      // Tablet / Window / Fullscreen TV/Monitor with Keyboard hidden: elongate faders up to max 20%
      return { faderElongation: 1.2, rackZoomFactor: 1.1 };
    }

    // Tablet / Window / Fullscreen TV/Monitor with complete Keyboard visible:
    const targetRackH = Math.max(baseRackH, vh - nonRackAboveKeyboardH - keyboardH - 16);
    const totalScale = Math.max(1.0, targetRackH / baseRackH);
    const elongation = Math.min(1.2, Math.max(1.0, totalScale)); // Never exceed +20%
    const zoom = Math.min(1.22, Math.max(1.0, totalScale / elongation));
    return { faderElongation: elongation, rackZoomFactor: zoom };
  })();

  // MIDI
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);
  const [midiActive, setMidiActive] = useState<boolean>(false);
  const [midiKeysChannel, setMidiKeysChannel] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('hera_midi_keys_channel') ?? localStorage.getItem('hera_midi_channel');
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 16) return parsed;
      }
    } catch {
      // ignore
    }
    return 1;
  });
  const [midiEffectsChannel, setMidiEffectsChannel] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('hera_midi_ctrl_channel');
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 16) return parsed;
      }
    } catch {
      // ignore
    }
    return 0;
  });
  const [midiSectionChannels, setMidiSectionChannels] = useState<MidiSectionChannels>(() =>
    buildDefaultSectionChannels()
  );
  const [isChannelsMenuOpen, setIsChannelsMenuOpen] = useState<boolean>(false);
  const channelsDropdownRef = useRef<HTMLDivElement | null>(null);

  const [midiManagerInstance, setMidiManagerInstance] = useState<MidiManager | null>(null);
  const [currentMidiMapping, setCurrentMidiMapping] = useState<Record<number, keyof HeraParameters>>({});
  const [paramToCCMap, setParamToCCMap] = useState<Partial<Record<keyof HeraParameters, number>>>({});
  const [currentMidiActionMapping, setCurrentMidiActionMapping] = useState<Record<number, MidiMappableAction>>({});
  const [actionToCCMap, setActionToCCMap] = useState<Partial<Record<MidiMappableAction, number>>>({});
  const [presetChangeMode, setPresetChangeMode] = useState<MidiPresetChangeMode>('program_change');

  // MIDI Controller Profiles State (Default: Launchkey MK4, auto-saved on every mapping/channel change)
  const [midiProfiles, setMidiProfiles] = useState<MidiControllerProfile[]>([]);
  const [activeMidiProfileId, setActiveMidiProfileId] = useState<string>(DEFAULT_PROFILE_ID);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState<boolean>(false);
  const [isCreatingProfile, setIsCreatingProfile] = useState<boolean>(false);
  const [newProfileName, setNewProfileName] = useState<string>('');
  const [renamingProfileId, setRenamingProfileId] = useState<string | null>(null);
  const [renameProfileValue, setRenameProfileValue] = useState<string>('');
  const profileDropdownRef = useRef<HTMLDivElement | null>(null);

  // Interactive MIDI Learn Mode State
  const [isMidiLearnActive, setIsMidiLearnActive] = useState<boolean>(false);
  const midiLearnActiveRef = useRef<boolean>(false);
  useEffect(() => {
    midiLearnActiveRef.current = isMidiLearnActive;
  }, [isMidiLearnActive]);
  const [selectedLearnParam, setSelectedLearnParam] = useState<keyof HeraParameters | null>(null);
  const [selectedLearnAction, setSelectedLearnAction] = useState<MidiMappableAction | null>(null);
  const [lastLearnedInfo, setLastLearnedInfo] = useState<{ param: string; cc: number } | null>(null);
  const loadPresetByIndexRef = useRef<((index: number) => void) | null>(null);
  const presetNavRef = useRef<{
    prev: () => void;
    next: () => void;
    loadByIndex: (index: number) => void;
  } | null>(null);
  const arpActionsRef = useRef<{
    toggleArp: () => void;
    toggleHold: () => void;
    setArpEnabled: (enabled: boolean) => void;
    setHoldEnabled: (hold: boolean) => void;
  } | null>(null);
  const wheelUpdaterRef = useRef<{
    setPitchBendUi: (val: number) => void;
    setModWheelUi: (val: number) => void;
  } | null>(null);

  // Help modal
  const [showHelp, setShowHelp] = useState<boolean>(false);

  // Live Rack Section Projection Pop-up (triggered immediately on MIDI controller change, disappears in 500ms)
  const [isSectionProjectionEnabled, setIsSectionProjectionEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('hera_midi_section_projection') !== 'false';
    } catch {
      return true;
    }
  });
  const sectionProjectionEnabledRef = useRef<boolean>(isSectionProjectionEnabled);
  useEffect(() => {
    sectionProjectionEnabledRef.current = isSectionProjectionEnabled;
  }, [isSectionProjectionEnabled]);

  const [projectedSection, setProjectedSection] = useState<RackSectionId | null>(null);
  const [projectedSectionFading, setProjectedSectionFading] = useState<boolean>(false);
  const [projectedSectionDims, setProjectedSectionDims] = useState<{ width?: number; height?: number }>({});
  const rackSectionRefs = useRef<Partial<Record<RackSectionId, HTMLDivElement | null>>>({});
  const projectionFadeTimerRef = useRef<number | null>(null);
  const projectionHideTimerRef = useRef<number | null>(null);

  const triggerSectionProjection = useCallback((sectionId: RackSectionId) => {
    if (!sectionProjectionEnabledRef.current || midiLearnActiveRef.current) return;
    const el = rackSectionRefs.current[sectionId];
    if (el) {
      setProjectedSectionDims({
        width: el.offsetWidth,
        height: el.offsetHeight,
      });
    }
    if (projectionFadeTimerRef.current) {
      clearTimeout(projectionFadeTimerRef.current);
    }
    if (projectionHideTimerRef.current) {
      clearTimeout(projectionHideTimerRef.current);
    }
    setProjectedSection(sectionId);
    setProjectedSectionFading(false);

    projectionFadeTimerRef.current = window.setTimeout(() => {
      setProjectedSectionFading(true);
    }, 1500);
    projectionHideTimerRef.current = window.setTimeout(() => {
      setProjectedSection(null);
      setProjectedSectionFading(false);
    }, 1850);
  }, []);

  const handleSetSectionProjectionEnabled = useCallback((enabled: boolean) => {
    sectionProjectionEnabledRef.current = enabled;
    setIsSectionProjectionEnabled(enabled);
    try {
      localStorage.setItem('hera_midi_section_projection', enabled ? 'true' : 'false');
    } catch {
      // ignore
    }
    if (!enabled) {
      if (projectionFadeTimerRef.current) clearTimeout(projectionFadeTimerRef.current);
      if (projectionHideTimerRef.current) clearTimeout(projectionHideTimerRef.current);
      setProjectedSection(null);
      setProjectedSectionFading(false);
    }
  }, []);

  const midiTimeoutRef = useRef<number | null>(null);

  // Initialize engine listeners
  useEffect(() => {
    synthEngine.setRecordingListener((recording, blob) => {
      setIsRecording(recording);
      if (blob) {
        const url = URL.createObjectURL(blob);
        setRecordedAudioUrl(url);
      }
    });

    // Initialize MIDI
    const midiMgr = new MidiManager(synthEngine);
    setMidiManagerInstance(midiMgr);
    setMidiKeysChannel(midiMgr.getKeysChannel());
    setMidiEffectsChannel(midiMgr.getEffectsChannel());
    setMidiSectionChannels(midiMgr.getSectionChannels());
    setCurrentMidiMapping(midiMgr.getMapping());
    setParamToCCMap(midiMgr.getParamToCCMap());
    setCurrentMidiActionMapping(midiMgr.getActionMapping());
    setActionToCCMap(midiMgr.getActionToCCMap());
    setPresetChangeMode(midiMgr.getPresetChangeMode());
    setMidiProfiles(midiMgr.getProfiles());
    setActiveMidiProfileId(midiMgr.getActiveProfileId());

    midiMgr.setOnProfilesChanged((profiles, activeId, keysCh, fxCh, sectionChs) => {
      setMidiProfiles(profiles);
      setActiveMidiProfileId(activeId);
      setMidiKeysChannel(keysCh);
      setMidiEffectsChannel(fxCh);
      setMidiSectionChannels({ ...sectionChs });
      setParamToCCMap(midiMgr.getParamToCCMap());
      setActionToCCMap(midiMgr.getActionToCCMap());
      setPresetChangeMode(midiMgr.getPresetChangeMode());
    });

    midiMgr.setOnProgramChange((programNumber: number) => {
      if (presetNavRef.current) {
        presetNavRef.current.loadByIndex(programNumber);
      } else {
        loadPresetByIndexRef.current?.(programNumber);
      }
    });

    midiMgr.setOnActionTriggered((action, rawValue) => {
      if (action === 'prevPreset') {
        presetNavRef.current?.prev();
      } else if (action === 'nextPreset') {
        presetNavRef.current?.next();
      } else if (action === 'selectPreset') {
        presetNavRef.current?.loadByIndex(rawValue);
      } else if (action === 'lfoTrig') {
        synthEngine.triggerManualLfo();
        if (!midiLearnActiveRef.current && midiMgr.getCCForAction('lfoTrig') !== null) {
          triggerSectionProjection('lfo');
        }
      } else if (action === 'arpToggle') {
        // 0 = OFF, >= 1 = ON
        arpActionsRef.current?.setArpEnabled(rawValue >= 1);
      } else if (action === 'arpHold') {
        // 0 = OFF, >= 1 = ON
        arpActionsRef.current?.setHoldEnabled(rawValue >= 1);
      } else if (action === 'pitchWheel') {
        wheelUpdaterRef.current?.setPitchBendUi(rawValue);
      } else if (action === 'modWheel') {
        wheelUpdaterRef.current?.setModWheelUi(rawValue);
      }
    });

    midiMgr.setOnActionMappingChanged((actionMap, learnedAction, learnedCC) => {
      setCurrentMidiActionMapping({ ...actionMap });
      setActionToCCMap(midiMgr.getActionToCCMap());
      setPresetChangeMode(midiMgr.getPresetChangeMode());
      if (learnedAction && learnedCC !== undefined) {
        setSelectedLearnAction(null);
        setLastLearnedInfo({ param: String(learnedAction), cc: learnedCC });
        setTimeout(() => setLastLearnedInfo(null), 3500);
      }
    });

    midiMgr.init(
      (devices) => setMidiDevices(devices),
      () => {
        setMidiActive(true);
        if (midiTimeoutRef.current) clearTimeout(midiTimeoutRef.current);
        midiTimeoutRef.current = window.setTimeout(() => setMidiActive(false), 200);
      },
      (param, val) => {
        if (param === 'MasterVolume') {
          setIsMuted(false);
          setMasterVolume(val);
        }
        setParams((prev) => ({ ...prev, [param]: val }));
        if (!midiLearnActiveRef.current && midiMgr.getCCForParam(param) !== null) {
          const visualSection = getVisualRackSectionForParam(param);
          if (visualSection) {
            triggerSectionProjection(visualSection);
          }
        }
      },
      (mapping, learnedParam, learnedCC) => {
        setCurrentMidiMapping({ ...mapping });
        setParamToCCMap(midiMgr.getParamToCCMap());
        if (learnedParam && learnedCC !== undefined) {
          setSelectedLearnParam(null);
          setLastLearnedInfo({ param: String(learnedParam), cc: learnedCC });
          setTimeout(() => setLastLearnedInfo(null), 3500);
        }
      }
    );

    // Synchronize initial parameters
    synthEngine.setAllParameters(params);

    const handleClickOutsideProfile = (e: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target as Node)) {
        setIsProfileMenuOpen(false);
        setIsCreatingProfile(false);
      }
      if (channelsDropdownRef.current && !channelsDropdownRef.current.contains(e.target as Node)) {
        setIsChannelsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideProfile);

    return () => {
      if (midiTimeoutRef.current) clearTimeout(midiTimeoutRef.current);
      if (projectionFadeTimerRef.current) clearTimeout(projectionFadeTimerRef.current);
      if (projectionHideTimerRef.current) clearTimeout(projectionHideTimerRef.current);
      document.removeEventListener('mousedown', handleClickOutsideProfile);
    };
  }, [triggerSectionProjection]);

  const handleParamChange = useCallback(
    <K extends keyof HeraParameters>(key: K, value: HeraParameters[K]) => {
      try {
        setParams((prev) => {
          const updated = { ...prev, [key]: value };
          synthEngine.setParameter(key, value);
          return updated;
        });
      } catch (err) {
        console.error('Failed to update parameter', key, value, err);
      }
    },
    []
  );

  const handleSelectPreset = useCallback((newParams: HeraParameters, name: string) => {
    setParams((prev) => {
      // Preserve global post-processing Reverb & Master Volume when changing synth presets
      const merged: HeraParameters = {
        ...newParams,
        MasterVolume: prev.MasterVolume,
        ReverbEnabled: prev.ReverbEnabled,
        ReverbType: prev.ReverbType,
        ReverbTime: prev.ReverbTime,
        ReverbDecay: prev.ReverbDecay,
        ReverbMix: prev.ReverbMix,
      };
      synthEngine.setAllParameters(merged);
      return merged;
    });
    setCurrentPresetName(name);
  }, []);

  const startAudioOnInteraction = async () => {
    if (!isAudioStarted) {
      await synthEngine.initAudio();
      setIsAudioStarted(true);
    }
  };

  const handleToggleRecord = () => {
    if (isRecording) {
      synthEngine.stopRecording();
    } else {
      synthEngine.startRecording();
    }
  };

  const handleChorusToggle = (chorusNum: 'ChorusI' | 'ChorusII') => {
    const current = params[chorusNum];
    handleParamChange(chorusNum, current > 0.5 ? 0 : 1);
  };

  // MIDI Channel Selection Helpers (Keys & Per-Section Controls/Effects, auto-saved in active profile)
  const handleMidiSectionChannelChange = (section: MidiSectionId, newChannel: number) => {
    const ch = Math.max(0, Math.min(16, Math.floor(newChannel)));
    midiManagerInstance?.setSectionChannel(section, ch);
    if (midiManagerInstance) {
      setMidiSectionChannels(midiManagerInstance.getSectionChannels());
      setMidiKeysChannel(midiManagerInstance.getKeysChannel());
    } else {
      setMidiSectionChannels((prev) => ({ ...prev, [section]: ch }));
      if (section === 'keys') setMidiKeysChannel(ch);
    }
  };

  const handleMidiKeysChannelChange = (newChannel: number) => {
    handleMidiSectionChannelChange('keys', newChannel);
  };

  const handleMidiEffectsChannelChange = (newChannel: number) => {
    const ch = Math.max(0, Math.min(16, Math.floor(newChannel)));
    setMidiEffectsChannel(ch);
    midiManagerInstance?.setAllFxSectionChannels(ch);
    if (midiManagerInstance) {
      setMidiSectionChannels(midiManagerInstance.getSectionChannels());
    }
  };

  const getChannelLabelForParam = (param: keyof HeraParameters): string => {
    if (midiManagerInstance) {
      return formatMidiChannelShort(midiManagerInstance.getChannelForParam(param));
    }
    const sec = getSectionForParam(param);
    return formatMidiChannelShort(midiSectionChannels[sec] ?? 0);
  };

  const getChannelLabelForAction = (action: MidiMappableAction): string => {
    if (midiManagerInstance) {
      return formatMidiChannelShort(midiManagerInstance.getChannelForAction(action));
    }
    const sec = getSectionForAction(action);
    return formatMidiChannelShort(midiSectionChannels[sec] ?? 0);
  };

  // MIDI Controller Profile Handlers (auto-saved immediately)
  const activeMidiProfileName =
    midiProfiles.find((p) => p.id === activeMidiProfileId)?.name || 'Launchkey MK4';

  const handleSelectMidiProfile = (profileId: string) => {
    if (!midiManagerInstance) return;
    midiManagerInstance.selectProfile(profileId);
    setActiveMidiProfileId(profileId);
    setMidiProfiles(midiManagerInstance.getProfiles());
    setCurrentMidiMapping(midiManagerInstance.getMapping());
    setParamToCCMap(midiManagerInstance.getParamToCCMap());
    setCurrentMidiActionMapping(midiManagerInstance.getActionMapping());
    setActionToCCMap(midiManagerInstance.getActionToCCMap());
    setPresetChangeMode(midiManagerInstance.getPresetChangeMode());
    setMidiKeysChannel(midiManagerInstance.getKeysChannel());
    setMidiEffectsChannel(midiManagerInstance.getEffectsChannel());
    setMidiSectionChannels(midiManagerInstance.getSectionChannels());
    setIsProfileMenuOpen(false);
    setIsCreatingProfile(false);
    setRenamingProfileId(null);
  };

  const handleCreateMidiProfile = () => {
    if (!midiManagerInstance) return;
    const created = midiManagerInstance.createProfile(
      newProfileName.trim() || `User ${midiProfiles.length}`
    );
    setMidiProfiles(midiManagerInstance.getProfiles());
    setActiveMidiProfileId(created.id);
    setCurrentMidiMapping(midiManagerInstance.getMapping());
    setParamToCCMap(midiManagerInstance.getParamToCCMap());
    setCurrentMidiActionMapping(midiManagerInstance.getActionMapping());
    setActionToCCMap(midiManagerInstance.getActionToCCMap());
    setPresetChangeMode(midiManagerInstance.getPresetChangeMode());
    setMidiSectionChannels(midiManagerInstance.getSectionChannels());
    setNewProfileName('');
    setIsCreatingProfile(false);
    setIsProfileMenuOpen(false);
  };

  const handleConfirmRenameProfile = (profileId: string) => {
    if (!midiManagerInstance) return;
    const trimmed = renameProfileValue.trim();
    if (trimmed) {
      midiManagerInstance.renameProfile(profileId, trimmed);
      setMidiProfiles(midiManagerInstance.getProfiles());
    }
    setRenamingProfileId(null);
    setRenameProfileValue('');
  };

  const handlePresetChangeModeUpdate = (mode: MidiPresetChangeMode) => {
    setPresetChangeMode(mode);
    midiManagerInstance?.setPresetChangeMode(mode);
  };

  const handleDeleteMidiProfile = (e: React.MouseEvent, profileId: string) => {
    e.stopPropagation();
    if (!midiManagerInstance || profileId === DEFAULT_PROFILE_ID) return;
    midiManagerInstance.deleteProfile(profileId);
    setMidiProfiles(midiManagerInstance.getProfiles());
    setActiveMidiProfileId(midiManagerInstance.getActiveProfileId());
    setCurrentMidiMapping(midiManagerInstance.getMapping());
    setParamToCCMap(midiManagerInstance.getParamToCCMap());
    setCurrentMidiActionMapping(midiManagerInstance.getActionMapping());
    setActionToCCMap(midiManagerInstance.getActionToCCMap());
    setPresetChangeMode(midiManagerInstance.getPresetChangeMode());
    setMidiSectionChannels(midiManagerInstance.getSectionChannels());
  };

  // MIDI Learn Selection & Unmapping Helpers
  const handleSelectForLearn = (param: keyof HeraParameters) => {
    if (selectedLearnParam === param) {
      setSelectedLearnParam(null);
      midiManagerInstance?.setLearnParam(null);
    } else {
      setSelectedLearnParam(param);
      setSelectedLearnAction(null);
      midiManagerInstance?.setLearnAction(null);
      midiManagerInstance?.setLearnParam(param);
    }
  };

  const handleUnmapParam = (param: keyof HeraParameters) => {
    midiManagerInstance?.unmapParam(param);
    setCurrentMidiMapping(midiManagerInstance?.getMapping() || {});
    setParamToCCMap(midiManagerInstance?.getParamToCCMap() || {});
    if (selectedLearnParam === param) {
      setSelectedLearnParam(null);
      midiManagerInstance?.setLearnParam(null);
    }
  };

  const getMappedCC = (param: keyof HeraParameters): number | null => {
    const cc = paramToCCMap[param];
    if (cc !== undefined) return cc;
    if (midiManagerInstance) {
      return midiManagerInstance.getCCForParam(param);
    }
    return null;
  };

  const getMappedActionCC = (action: MidiMappableAction): number | null => {
    const direct = actionToCCMap[action];
    if (direct !== undefined) return direct;
    if (midiManagerInstance) {
      return midiManagerInstance.getCCForAction(action);
    }
    for (const [ccStr, a] of Object.entries(currentMidiActionMapping)) {
      if (a === action) return Number(ccStr);
    }
    return null;
  };

  const handleSelectActionForLearn = (action: MidiMappableAction) => {
    if (selectedLearnAction === action) {
      setSelectedLearnAction(null);
      midiManagerInstance?.setLearnAction(null);
    } else {
      setSelectedLearnAction(action);
      setSelectedLearnParam(null);
      midiManagerInstance?.setLearnParam(null);
      midiManagerInstance?.setLearnAction(action);
    }
  };

  const handleUnmapAction = (action: MidiMappableAction) => {
    midiManagerInstance?.unmapAction(action);
    setCurrentMidiActionMapping(midiManagerInstance?.getActionMapping() || {});
    setActionToCCMap(midiManagerInstance?.getActionToCCMap() || {});
    if (selectedLearnAction === action) {
      setSelectedLearnAction(null);
      midiManagerInstance?.setLearnAction(null);
    }
  };

  const renderRackSectionCard = (sectionId: RackSectionId, isProjectedOverlay = false) => {
    const refProp = isProjectedOverlay
      ? undefined
      : (el: HTMLDivElement | null) => {
          rackSectionRefs.current[sectionId] = el;
        };

    const overlayStyle: React.CSSProperties | undefined = isProjectedOverlay
      ? {
          width: projectedSectionDims.width ? `${projectedSectionDims.width}px` : undefined,
          height: projectedSectionDims.height ? `${projectedSectionDims.height}px` : undefined,
          boxShadow: `0 0 18px 2px rgba(251, 191, 36, 0.14), 0 0 34px 6px ${RACK_SECTION_GOLDEN_HALO}, 0 14px 36px rgba(0, 0, 0, 0.85)`,
          outline: '1px solid rgba(251, 191, 36, 0.22)',
        }
      : undefined;

    const cardBgClass = isProjectedOverlay ? 'bg-zinc-950' : 'bg-zinc-950/70';

    switch (sectionId) {
      case 'lfo':
        return (
          <div
            key={isProjectedOverlay ? 'proj-lfo' : 'rack-lfo'}
            ref={refProp}
            style={overlayStyle}
            className={`flex-shrink-0 ${cardBgClass} border-t-4 border-t-yellow-500 border border-zinc-800 rounded p-2 flex flex-col justify-between shadow-md`}
          >
            <div className="text-[10px] font-black font-mono tracking-widest text-yellow-400 uppercase text-center pb-1 border-b border-zinc-800/80">
              LFO
            </div>
            <div className="flex items-center justify-center gap-1.5 my-3 py-1">
              <Slider
                label="Rate"
                value={params.LFORate}
                onChange={(v) => handleParamChange('LFORate', v)}
                defaultValue={0.6}
                color="amber"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'LFORate'}
                mappedCC={getMappedCC('LFORate')}
                channelLabel={getChannelLabelForParam('LFORate')}
                onSelectForLearn={() => handleSelectForLearn('LFORate')}
                onUnmap={() => handleUnmapParam('LFORate')}
              />
              <Slider
                label="Vib Del"
                value={params.LFODelay}
                onChange={(v) => handleParamChange('LFODelay', v)}
                defaultValue={0.0}
                color="amber"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'LFODelay'}
                mappedCC={getMappedCC('LFODelay')}
                channelLabel={getChannelLabelForParam('LFODelay')}
                onSelectForLearn={() => handleSelectForLearn('LFODelay')}
                onUnmap={() => handleUnmapParam('LFODelay')}
              />
            </div>
            {/* Manual LFO Trigger button (iconic Juno button - Mappable via MIDI!) */}
            <div className="relative pt-1 border-t border-zinc-800/80 flex flex-col items-center">
              <MidiLearnBadge
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnAction === 'lfoTrig'}
                mappedCC={getMappedActionCC('lfoTrig')}
                channelLabel={getChannelLabelForAction('lfoTrig')}
                onUnmap={() => handleUnmapAction('lfoTrig')}
                title="Desmapear MAN TRIG"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isMidiLearnActive) {
                    handleSelectActionForLearn('lfoTrig');
                  } else {
                    synthEngine.triggerManualLfo();
                  }
                }}
                title={
                  isMidiLearnActive
                    ? 'Clique para mapear MAN TRIG via MIDI'
                    : 'Acionar gatilho manual do LFO'
                }
                className={`px-2 py-0.5 rounded text-[8.5px] font-mono font-bold border cursor-pointer transition-shadow ${
                  selectedLearnAction === 'lfoTrig'
                    ? 'bg-sky-500/20 text-white border-sky-400 ring-2 ring-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.65)]'
                    : isMidiLearnActive
                    ? 'bg-zinc-800 text-zinc-200 border-zinc-700 ring-1 ring-sky-400/25 hover:ring-sky-400/70'
                    : 'bg-zinc-800 hover:bg-zinc-700 active:bg-amber-600 active:text-black text-zinc-300 border-zinc-700'
                }`}
              >
                MAN TRIG
              </button>
            </div>
          </div>
        );

      case 'dco':
        return (
          <div
            key={isProjectedOverlay ? 'proj-dco' : 'rack-dco'}
            ref={refProp}
            style={overlayStyle}
            className={`flex-shrink-0 ${cardBgClass} border-t-4 border-t-red-500 border border-zinc-800 rounded p-2 flex flex-col justify-between shadow-md`}
          >
            <div className="text-[10px] font-black font-mono tracking-widest text-red-400 uppercase text-center pb-1 border-b border-zinc-800/80">
              DCO (Oscillator)
            </div>
            <div className="flex items-center justify-center gap-1.5 my-3 py-1">
              {/* Selectors Column */}
              <div className="flex flex-col gap-1 pr-1 border-r border-zinc-800/80">
                <ToggleSwitch
                  label="Range"
                  options={[
                    { label: "16'", value: 0 },
                    { label: "8'", value: 1 },
                    { label: "4'", value: 2 },
                  ]}
                  value={params.DCORange}
                  onChange={(v) => handleParamChange('DCORange', v)}
                  isMidiLearnActive={isMidiLearnActive}
                  isSelectedForLearn={selectedLearnParam === 'DCORange'}
                  mappedCC={getMappedCC('DCORange')}
                  channelLabel={getChannelLabelForParam('DCORange')}
                  onSelectForLearn={() => handleSelectForLearn('DCORange')}
                  onUnmap={() => handleUnmapParam('DCORange')}
                />
                <ToggleSwitch
                  label="LFO Trig"
                  options={[
                    { label: 'Man', value: 0 },
                    { label: 'Auto', value: 1 },
                  ]}
                  value={params.LFOTrigMode}
                  onChange={(v) => handleParamChange('LFOTrigMode', v)}
                  isMidiLearnActive={isMidiLearnActive}
                  isSelectedForLearn={selectedLearnParam === 'LFOTrigMode'}
                  mappedCC={getMappedCC('LFOTrigMode')}
                  channelLabel={getChannelLabelForParam('LFOTrigMode')}
                  onSelectForLearn={() => handleSelectForLearn('LFOTrigMode')}
                  onUnmap={() => handleUnmapParam('LFOTrigMode')}
                />
                <ToggleSwitch
                  label="PWM"
                  options={[
                    { label: 'Man', value: 0 },
                    { label: 'LFO', value: 1 },
                    { label: 'Env', value: 2 },
                  ]}
                  value={params.DCOPWMMod}
                  onChange={(v) => handleParamChange('DCOPWMMod', v)}
                  isMidiLearnActive={isMidiLearnActive}
                  isSelectedForLearn={selectedLearnParam === 'DCOPWMMod'}
                  mappedCC={getMappedCC('DCOPWMMod')}
                  channelLabel={getChannelLabelForParam('DCOPWMMod')}
                  onSelectForLearn={() => handleSelectForLearn('DCOPWMMod')}
                  onUnmap={() => handleUnmapParam('DCOPWMMod')}
                />
              </div>

              {/* DCO Sliders */}
              <Slider
                label="LFO"
                value={params.DCOPitchModDepth}
                onChange={(v) => handleParamChange('DCOPitchModDepth', v)}
                defaultValue={0}
                color="red"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'DCOPitchModDepth'}
                mappedCC={getMappedCC('DCOPitchModDepth')}
                channelLabel={getChannelLabelForParam('DCOPitchModDepth')}
                onSelectForLearn={() => handleSelectForLearn('DCOPitchModDepth')}
                onUnmap={() => handleUnmapParam('DCOPitchModDepth')}
              />
              <Slider
                label="PWM"
                value={params.DCOPWMDepth}
                onChange={(v) => handleParamChange('DCOPWMDepth', v)}
                defaultValue={0}
                color="red"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'DCOPWMDepth'}
                mappedCC={getMappedCC('DCOPWMDepth')}
                channelLabel={getChannelLabelForParam('DCOPWMDepth')}
                onSelectForLearn={() => handleSelectForLearn('DCOPWMDepth')}
                onUnmap={() => handleUnmapParam('DCOPWMDepth')}
              />
              <Slider
                label="Pulse"
                value={params.DCOPulseLevel}
                onChange={(v) => handleParamChange('DCOPulseLevel', v)}
                defaultValue={0}
                color="red"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'DCOPulseLevel'}
                mappedCC={getMappedCC('DCOPulseLevel')}
                channelLabel={getChannelLabelForParam('DCOPulseLevel')}
                onSelectForLearn={() => handleSelectForLearn('DCOPulseLevel')}
                onUnmap={() => handleUnmapParam('DCOPulseLevel')}
              />
              <Slider
                label="Saw"
                value={params.DCOSawLevel}
                onChange={(v) => handleParamChange('DCOSawLevel', v)}
                defaultValue={1.0}
                color="red"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'DCOSawLevel'}
                mappedCC={getMappedCC('DCOSawLevel')}
                channelLabel={getChannelLabelForParam('DCOSawLevel')}
                onSelectForLearn={() => handleSelectForLearn('DCOSawLevel')}
                onUnmap={() => handleUnmapParam('DCOSawLevel')}
              />
              <Slider
                label="Sub"
                value={params.DCOSubLevel}
                onChange={(v) => handleParamChange('DCOSubLevel', v)}
                defaultValue={0}
                color="red"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'DCOSubLevel'}
                mappedCC={getMappedCC('DCOSubLevel')}
                channelLabel={getChannelLabelForParam('DCOSubLevel')}
                onSelectForLearn={() => handleSelectForLearn('DCOSubLevel')}
                onUnmap={() => handleUnmapParam('DCOSubLevel')}
              />
              <Slider
                label="Noise"
                value={params.DCONoiseLevel}
                onChange={(v) => handleParamChange('DCONoiseLevel', v)}
                defaultValue={0}
                color="red"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'DCONoiseLevel'}
                mappedCC={getMappedCC('DCONoiseLevel')}
                channelLabel={getChannelLabelForParam('DCONoiseLevel')}
                onSelectForLearn={() => handleSelectForLearn('DCONoiseLevel')}
                onUnmap={() => handleUnmapParam('DCONoiseLevel')}
              />
            </div>
            <div className="text-[7.5px] font-mono text-zinc-500 text-center tracking-wider pt-1 border-t border-zinc-800/80">
              POLYBLEP ANALOG WAVEFORMS
            </div>
          </div>
        );

      case 'hpf':
        return (
          <div
            key={isProjectedOverlay ? 'proj-hpf' : 'rack-hpf'}
            ref={refProp}
            style={overlayStyle}
            className={`flex-shrink-0 ${cardBgClass} border-t-4 border-t-cyan-500 border border-zinc-800 rounded p-2 flex flex-col justify-between shadow-md`}
          >
            <div className="text-[10px] font-black font-mono tracking-widest text-cyan-400 uppercase text-center pb-1 border-b border-zinc-800/80">
              HPF
            </div>
            <div className="flex items-center justify-center my-3 py-1">
              <Slider
                label="Freq"
                value={params.HPF}
                onChange={(v) => handleParamChange('HPF', v)}
                defaultValue={0}
                color="cyan"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'HPF'}
                mappedCC={getMappedCC('HPF')}
                channelLabel={getChannelLabelForParam('HPF')}
                onSelectForLearn={() => handleSelectForLearn('HPF')}
                onUnmap={() => handleUnmapParam('HPF')}
              />
            </div>
            <div className="text-[7.5px] font-mono text-zinc-500 text-center tracking-wider pt-1 border-t border-zinc-800/80">
              4-WAY
            </div>
          </div>
        );

      case 'vcf':
        return (
          <div
            key={isProjectedOverlay ? 'proj-vcf' : 'rack-vcf'}
            ref={refProp}
            style={overlayStyle}
            className={`flex-shrink-0 ${cardBgClass} border-t-4 border-t-cyan-400 border border-zinc-800 rounded p-2 flex flex-col justify-between shadow-md`}
          >
            <div className="text-[10px] font-black font-mono tracking-widest text-cyan-300 uppercase text-center pb-1 border-b border-zinc-800/80">
              VCF (Filter)
            </div>
            <div className="flex items-center justify-center gap-1.5 my-3 py-1">
              <Slider
                label="Freq"
                value={params.VCFCutoff}
                onChange={(v) => handleParamChange('VCFCutoff', v)}
                defaultValue={0.5}
                color="cyan"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'VCFCutoff'}
                mappedCC={getMappedCC('VCFCutoff')}
                channelLabel={getChannelLabelForParam('VCFCutoff')}
                onSelectForLearn={() => handleSelectForLearn('VCFCutoff')}
                onUnmap={() => handleUnmapParam('VCFCutoff')}
              />
              <Slider
                label="Res"
                value={params.VCFResonance}
                onChange={(v) => handleParamChange('VCFResonance', v)}
                defaultValue={0}
                color="cyan"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'VCFResonance'}
                mappedCC={getMappedCC('VCFResonance')}
                channelLabel={getChannelLabelForParam('VCFResonance')}
                onSelectForLearn={() => handleSelectForLearn('VCFResonance')}
                onUnmap={() => handleUnmapParam('VCFResonance')}
              />
              <Slider
                label="Env"
                value={params.VCFEnv}
                min={-1}
                max={1}
                step={0.02}
                bipolar
                onChange={(v) => handleParamChange('VCFEnv', v)}
                defaultValue={0}
                color="cyan"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'VCFEnv'}
                mappedCC={getMappedCC('VCFEnv')}
                channelLabel={getChannelLabelForParam('VCFEnv')}
                onSelectForLearn={() => handleSelectForLearn('VCFEnv')}
                onUnmap={() => handleUnmapParam('VCFEnv')}
              />
              <Slider
                label="LFO"
                value={params.VCFLFO}
                onChange={(v) => handleParamChange('VCFLFO', v)}
                defaultValue={0}
                color="cyan"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'VCFLFO'}
                mappedCC={getMappedCC('VCFLFO')}
                channelLabel={getChannelLabelForParam('VCFLFO')}
                onSelectForLearn={() => handleSelectForLearn('VCFLFO')}
                onUnmap={() => handleUnmapParam('VCFLFO')}
              />
              <Slider
                label="Kybd"
                value={params.VCFKey}
                onChange={(v) => handleParamChange('VCFKey', v)}
                defaultValue={0}
                color="cyan"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'VCFKey'}
                mappedCC={getMappedCC('VCFKey')}
                channelLabel={getChannelLabelForParam('VCFKey')}
                onSelectForLearn={() => handleSelectForLearn('VCFKey')}
                onUnmap={() => handleUnmapParam('VCFKey')}
              />
              <Slider
                label="Bend"
                value={params.VCFBendDepth}
                onChange={(v) => handleParamChange('VCFBendDepth', v)}
                defaultValue={0}
                color="cyan"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'VCFBendDepth'}
                mappedCC={getMappedCC('VCFBendDepth')}
                channelLabel={getChannelLabelForParam('VCFBendDepth')}
                onSelectForLearn={() => handleSelectForLearn('VCFBendDepth')}
                onUnmap={() => handleUnmapParam('VCFBendDepth')}
              />
            </div>
            <div className="text-[7.5px] font-mono text-zinc-500 text-center tracking-wider pt-1 border-t border-zinc-800/80">
              24dB/OCT RESONANT OTA
            </div>
          </div>
        );

      case 'vca':
        return (
          <div
            key={isProjectedOverlay ? 'proj-vca' : 'rack-vca'}
            ref={refProp}
            style={overlayStyle}
            className={`flex-shrink-0 ${cardBgClass} border-t-4 border-t-amber-500 border border-zinc-800 rounded p-2 flex flex-col justify-between shadow-md`}
          >
            <div className="text-[10px] font-black font-mono tracking-widest text-amber-400 uppercase text-center pb-1 border-b border-zinc-800/80">
              VCA
            </div>
            <div className="flex items-center justify-center gap-1.5 my-3 py-1">
              <ToggleSwitch
                label="Type"
                options={[
                  { label: 'ENV', value: 0 },
                  { label: 'GATE', value: 1 },
                ]}
                value={params.VCAType}
                onChange={(v) => handleParamChange('VCAType', v)}
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'VCAType'}
                mappedCC={getMappedCC('VCAType')}
                channelLabel={getChannelLabelForParam('VCAType')}
                onSelectForLearn={() => handleSelectForLearn('VCAType')}
                onUnmap={() => handleUnmapParam('VCAType')}
              />
              <Slider
                label="Level"
                value={params.VCADepth}
                onChange={(v) => handleParamChange('VCADepth', v)}
                defaultValue={0.5}
                color="amber"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'VCADepth'}
                mappedCC={getMappedCC('VCADepth')}
                channelLabel={getChannelLabelForParam('VCADepth')}
                onSelectForLearn={() => handleSelectForLearn('VCADepth')}
                onUnmap={() => handleUnmapParam('VCADepth')}
              />
            </div>
            <div className="text-[7.5px] font-mono text-zinc-500 text-center tracking-wider pt-1 border-t border-zinc-800/80">
              AMP
            </div>
          </div>
        );

      case 'env':
        return (
          <div
            key={isProjectedOverlay ? 'proj-env' : 'rack-env'}
            ref={refProp}
            style={overlayStyle}
            className={`flex-shrink-0 ${cardBgClass} border-t-4 border-t-amber-400 border border-zinc-800 rounded p-2 flex flex-col justify-between shadow-md`}
          >
            <div className="text-[10px] font-black font-mono tracking-widest text-amber-300 uppercase text-center pb-1 border-b border-zinc-800/80">
              ENV (ADSR)
            </div>
            <div className="flex items-center justify-center gap-1.5 my-3 py-1">
              <Slider
                label="A"
                value={params.ENVAttack}
                onChange={(v) => handleParamChange('ENVAttack', v)}
                defaultValue={0}
                color="amber"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'ENVAttack'}
                mappedCC={getMappedCC('ENVAttack')}
                channelLabel={getChannelLabelForParam('ENVAttack')}
                onSelectForLearn={() => handleSelectForLearn('ENVAttack')}
                onUnmap={() => handleUnmapParam('ENVAttack')}
              />
              <Slider
                label="D"
                value={params.ENVDecay}
                onChange={(v) => handleParamChange('ENVDecay', v)}
                defaultValue={0}
                color="amber"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'ENVDecay'}
                mappedCC={getMappedCC('ENVDecay')}
                channelLabel={getChannelLabelForParam('ENVDecay')}
                onSelectForLearn={() => handleSelectForLearn('ENVDecay')}
                onUnmap={() => handleUnmapParam('ENVDecay')}
              />
              <Slider
                label="S"
                value={params.ENVSustain}
                onChange={(v) => handleParamChange('ENVSustain', v)}
                defaultValue={1.0}
                color="amber"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'ENVSustain'}
                mappedCC={getMappedCC('ENVSustain')}
                channelLabel={getChannelLabelForParam('ENVSustain')}
                onSelectForLearn={() => handleSelectForLearn('ENVSustain')}
                onUnmap={() => handleUnmapParam('ENVSustain')}
              />
              <Slider
                label="R"
                value={params.ENVRelease}
                onChange={(v) => handleParamChange('ENVRelease', v)}
                defaultValue={0}
                color="amber"
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'ENVRelease'}
                mappedCC={getMappedCC('ENVRelease')}
                channelLabel={getChannelLabelForParam('ENVRelease')}
                onSelectForLearn={() => handleSelectForLearn('ENVRelease')}
                onUnmap={() => handleUnmapParam('ENVRelease')}
              />
            </div>
            <div className="text-[7.5px] font-mono text-zinc-500 text-center tracking-wider pt-1 border-t border-zinc-800/80">
              EXPONENTIAL ADSR
            </div>
          </div>
        );

      case 'chorus':
        return (
          <div
            key={isProjectedOverlay ? 'proj-chorus' : 'rack-chorus'}
            ref={refProp}
            style={overlayStyle}
            className={`flex-shrink-0 ${cardBgClass} border-t-4 border-t-rose-500 border border-zinc-800 rounded p-2 flex flex-col justify-between shadow-md`}
          >
            <div className="text-[10px] font-black font-mono tracking-widest text-rose-400 uppercase text-center pb-1 border-b border-zinc-800/80">
              CHORUS
            </div>
            <div className="flex items-center justify-center gap-1.5 my-3 py-1">
              <ChorusButton
                label="I"
                active={params.ChorusI > 0.5}
                onClick={() => handleChorusToggle('ChorusI')}
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'ChorusI'}
                mappedCC={getMappedCC('ChorusI')}
                channelLabel={getChannelLabelForParam('ChorusI')}
                onSelectForLearn={() => handleSelectForLearn('ChorusI')}
                onUnmap={() => handleUnmapParam('ChorusI')}
              />
              <ChorusButton
                label="II"
                active={params.ChorusII > 0.5}
                onClick={() => handleChorusToggle('ChorusII')}
                isMidiLearnActive={isMidiLearnActive}
                isSelectedForLearn={selectedLearnParam === 'ChorusII'}
                mappedCC={getMappedCC('ChorusII')}
                channelLabel={getChannelLabelForParam('ChorusII')}
                onSelectForLearn={() => handleSelectForLearn('ChorusII')}
                onUnmap={() => handleUnmapParam('ChorusII')}
              />
            </div>
            <div className="text-[7.5px] font-mono text-zinc-500 text-center tracking-wider pt-1 border-t border-zinc-800/80">
              {params.ChorusI && params.ChorusII
                ? 'I+II (ROTARY)'
                : params.ChorusI
                ? 'I (LUSH)'
                : params.ChorusII
                ? 'II (CREAMY)'
                : 'OFF'}
            </div>
          </div>
        );

      case 'delay':
        return (
          <div
            key={isProjectedOverlay ? 'proj-delay' : 'rack-delay'}
            ref={refProp}
            style={overlayStyle}
            className={`flex-shrink-0 ${cardBgClass} border-t-4 border-t-emerald-500 border border-zinc-800 rounded p-2 flex flex-col justify-between shadow-md`}
          >
            <div className="text-[10px] font-black font-mono tracking-widest text-emerald-400 uppercase text-center pb-1 border-b border-zinc-800/80">
              ECHO DELAY
            </div>
            <div className="flex flex-col items-stretch justify-center my-2 py-0.5 gap-1.5">
              {/* Top-left ON/OFF Switch right below the header and right above the faders */}
              <div className="flex justify-start pl-0.5">
                <ToggleSwitch
                  label="Delay Power"
                  hideLabel
                  orientation="horizontal"
                  options={[
                    { label: 'OFF', value: 0 },
                    { label: 'ON', value: 1 },
                  ]}
                  value={params.DelayEnabled > 0.5 ? 1 : 0}
                  onChange={(v) => handleParamChange('DelayEnabled', v)}
                  activeColorClass="bg-emerald-600 text-white shadow-[0_0_8px_#10b981] font-black border border-emerald-400"
                  isMidiLearnActive={isMidiLearnActive}
                  isSelectedForLearn={selectedLearnParam === 'DelayEnabled'}
                  mappedCC={getMappedCC('DelayEnabled')}
                  channelLabel={getChannelLabelForParam('DelayEnabled')}
                  onSelectForLearn={() => handleSelectForLearn('DelayEnabled')}
                  onUnmap={() => handleUnmapParam('DelayEnabled')}
                />
              </div>
              <div className="flex items-center justify-center gap-1.5">
                <Slider
                  label="Time"
                  value={params.DelayTime}
                  onChange={(v) => handleParamChange('DelayTime', v)}
                  defaultValue={0.35}
                  color="amber"
                  isMidiLearnActive={isMidiLearnActive}
                  isSelectedForLearn={selectedLearnParam === 'DelayTime'}
                  mappedCC={getMappedCC('DelayTime')}
                  channelLabel={getChannelLabelForParam('DelayTime')}
                  onSelectForLearn={() => handleSelectForLearn('DelayTime')}
                  onUnmap={() => handleUnmapParam('DelayTime')}
                />
                <Slider
                  label="F-Back"
                  value={params.DelayFeedback}
                  onChange={(v) => handleParamChange('DelayFeedback', v)}
                  defaultValue={0.4}
                  color="amber"
                  isMidiLearnActive={isMidiLearnActive}
                  isSelectedForLearn={selectedLearnParam === 'DelayFeedback'}
                  mappedCC={getMappedCC('DelayFeedback')}
                  channelLabel={getChannelLabelForParam('DelayFeedback')}
                  onSelectForLearn={() => handleSelectForLearn('DelayFeedback')}
                  onUnmap={() => handleUnmapParam('DelayFeedback')}
                />
                <Slider
                  label="Mix"
                  value={params.DelayMix}
                  onChange={(v) => handleParamChange('DelayMix', v)}
                  defaultValue={0.35}
                  color="amber"
                  isMidiLearnActive={isMidiLearnActive}
                  isSelectedForLearn={selectedLearnParam === 'DelayMix'}
                  mappedCC={getMappedCC('DelayMix')}
                  channelLabel={getChannelLabelForParam('DelayMix')}
                  onSelectForLearn={() => handleSelectForLearn('DelayMix')}
                  onUnmap={() => handleUnmapParam('DelayMix')}
                />
              </div>
            </div>
            <div className="text-[7.5px] font-mono text-zinc-500 text-center tracking-wider pt-1 border-t border-zinc-800/80">
              {params.DelayEnabled > 0.5 ? 'STEREO TAPE ECHO' : 'BYPASS'}
            </div>
          </div>
        );

      case 'reverb':
        return (
          <div
            key={isProjectedOverlay ? 'proj-reverb' : 'rack-reverb'}
            ref={refProp}
            style={overlayStyle}
            className={`flex-shrink-0 ${cardBgClass} border-t-4 border-t-violet-500 border border-zinc-800 rounded p-2 flex flex-col justify-between shadow-md`}
          >
            <div className="flex items-center justify-center pb-1 border-b border-zinc-800/80 gap-1.5 px-0.5">
              <span className="text-[10px] font-black font-mono tracking-widest text-violet-400 uppercase">
                REVERB
              </span>
              <span className="text-[7px] font-mono font-bold px-1 py-0.2 rounded bg-violet-950/90 text-violet-300 border border-violet-700/60 uppercase">
                GLOBAL
              </span>
            </div>
            <div className="flex flex-col items-stretch justify-center my-2 py-0.5 gap-1.5">
              {/* Top-left ON/OFF Switch right below the header and right above the faders */}
              <div className="flex justify-start pl-0.5">
                <ToggleSwitch
                  label="Reverb Power"
                  hideLabel
                  orientation="horizontal"
                  options={[
                    { label: 'OFF', value: 0 },
                    { label: 'ON', value: 1 },
                  ]}
                  value={params.ReverbEnabled > 0.5 ? 1 : 0}
                  onChange={(v) => handleParamChange('ReverbEnabled', v)}
                  activeColorClass="bg-violet-600 text-white shadow-[0_0_8px_#8b5cf6] font-black border border-violet-400"
                  isMidiLearnActive={isMidiLearnActive}
                  isSelectedForLearn={selectedLearnParam === 'ReverbEnabled'}
                  mappedCC={getMappedCC('ReverbEnabled')}
                  channelLabel={getChannelLabelForParam('ReverbEnabled')}
                  onSelectForLearn={() => handleSelectForLearn('ReverbEnabled')}
                  onUnmap={() => handleUnmapParam('ReverbEnabled')}
                />
              </div>
              <div className="flex items-center justify-center gap-1.5">
                <div className="flex flex-col justify-center pr-1 border-r border-zinc-800/80">
                  <ToggleSwitch
                    label="Mode"
                    options={[
                      { label: 'PLATE', value: 0 },
                      { label: 'HALL', value: 1 },
                    ]}
                    value={params.ReverbType >= 0.5 ? 1 : 0}
                    onChange={(v) => handleParamChange('ReverbType', v)}
                    isMidiLearnActive={isMidiLearnActive}
                    isSelectedForLearn={selectedLearnParam === 'ReverbType'}
                    mappedCC={getMappedCC('ReverbType')}
                    channelLabel={getChannelLabelForParam('ReverbType')}
                    onSelectForLearn={() => handleSelectForLearn('ReverbType')}
                    onUnmap={() => handleUnmapParam('ReverbType')}
                  />
                </div>
                <Slider
                  label="Time"
                  value={params.ReverbTime}
                  onChange={(v) => handleParamChange('ReverbTime', v)}
                  defaultValue={0.45}
                  color="cyan"
                  isMidiLearnActive={isMidiLearnActive}
                  isSelectedForLearn={selectedLearnParam === 'ReverbTime'}
                  mappedCC={getMappedCC('ReverbTime')}
                  channelLabel={getChannelLabelForParam('ReverbTime')}
                  onSelectForLearn={() => handleSelectForLearn('ReverbTime')}
                  onUnmap={() => handleUnmapParam('ReverbTime')}
                />
                <Slider
                  label="Decay"
                  value={params.ReverbDecay}
                  onChange={(v) => handleParamChange('ReverbDecay', v)}
                  defaultValue={0.55}
                  color="cyan"
                  isMidiLearnActive={isMidiLearnActive}
                  isSelectedForLearn={selectedLearnParam === 'ReverbDecay'}
                  mappedCC={getMappedCC('ReverbDecay')}
                  channelLabel={getChannelLabelForParam('ReverbDecay')}
                  onSelectForLearn={() => handleSelectForLearn('ReverbDecay')}
                  onUnmap={() => handleUnmapParam('ReverbDecay')}
                />
                <Slider
                  label="Mix"
                  value={params.ReverbMix}
                  onChange={(v) => handleParamChange('ReverbMix', v)}
                  defaultValue={0.3}
                  color="cyan"
                  isMidiLearnActive={isMidiLearnActive}
                  isSelectedForLearn={selectedLearnParam === 'ReverbMix'}
                  mappedCC={getMappedCC('ReverbMix')}
                  channelLabel={getChannelLabelForParam('ReverbMix')}
                  onSelectForLearn={() => handleSelectForLearn('ReverbMix')}
                  onUnmap={() => handleUnmapParam('ReverbMix')}
                />
              </div>
            </div>
            <div className="text-[7.5px] font-mono text-zinc-500 text-center tracking-wider pt-1 border-t border-zinc-800/80">
              {params.ReverbEnabled > 0.5
                ? params.ReverbType >= 0.5
                  ? 'POST-FX CONCERT HALL'
                  : 'POST-FX STUDIO PLATE'
                : 'POST-FX BYPASS'}
            </div>
          </div>
        );
    }
  };

  return (
    <div
      onClick={startAudioOnInteraction}
      className="min-h-screen h-auto w-full bg-stone-950 text-zinc-100 flex flex-col justify-start"
    >
      {/* Outer Synthetic Chassis with Walnut Wood Cheeks */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto my-0 sm:my-1.5 px-0.5 sm:px-2 pb-6">
        <div className="relative rounded-lg shadow-2xl border-2 sm:border-4 border-stone-800 bg-zinc-900 flex flex-col">
          {/* Wood Cheeks Simulation (Left & Right Borders) */}
          <div className="hidden lg:block absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-amber-950 via-amber-900 to-amber-950 border-r border-amber-900/60 z-30 pointer-events-none" />
          <div className="hidden lg:block absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-l from-amber-950 via-amber-900 to-amber-950 border-l border-amber-900/60 z-30 pointer-events-none" />

          {/* Top Roland Header Bar */}
          <div
            ref={topHeaderRef}
            className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 px-2 sm:px-4 py-1 sm:py-1.5 border-b-2 border-zinc-700 flex flex-wrap items-center justify-between gap-2"
          >
            {/* Branding / Badge */}
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg shadow-md border border-zinc-700/80 bg-zinc-950 p-0.5 flex items-center justify-center hover:scale-105 transition-transform overflow-hidden">
                <AtariCartridgeIcon className="w-full h-full object-contain" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xl sm:text-2xl font-black tracking-widest text-zinc-100 drop-shadow">
                    HERA
                  </span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-red-600 text-white tracking-widest uppercase">
                    JUNO-60
                  </span>
                </div>
                <span className="text-[9px] font-mono tracking-wider text-zinc-400">
                  POLYPHONIC SYNTHESIZER • 6 VOICES • STEREO BBD CHORUS
                </span>
              </div>
            </div>

            {/* Quick Status / Oscilloscope & Live Voices */}
            <div className="flex items-center gap-3">
              <VoiceIndicator className="hidden sm:flex" />

              <div className="hidden md:block w-48">
                <Oscilloscope />
              </div>

              {/* Master Volume & Recording Controls */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 bg-zinc-950 p-1.5 rounded border border-zinc-800">
                {/* MIDI in LED + Dual MIDI Channel Selectors (KEYS & CTRL/FX) */}
                <div className="flex flex-wrap items-center gap-1.5 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300 border-r border-zinc-800">
                  <div className="flex items-center gap-1">
                    <Radio
                      size={13}
                      className={midiActive ? 'text-emerald-400 animate-pulse' : 'text-zinc-500'}
                    />
                    <span className="text-[9px] text-zinc-400 font-bold tracking-wider">MIDI</span>
                    <div
                      className={`w-2 h-2 rounded-full ${
                        midiActive ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-zinc-800'
                      }`}
                      title={midiDevices.length > 0 ? `Conectado: ${midiDevices.map(d => d.name).join(', ')}` : 'Aguardando controlador MIDI'}
                    />
                  </div>

                  {/* CANAIS MIDI Tab / Dropdown (Keys + Per-Section Controls/FX Channels, Auto-Saved in Profile) */}
                  <div ref={channelsDropdownRef} className="relative flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsChannelsMenuOpen((prev) => !prev);
                        setIsProfileMenuOpen(false);
                      }}
                      title="Abrir aba de Canais MIDI: escolher canal das Teclas e canal individual de cada seção do sintetizador (Salvo automaticamente no perfil ativo)"
                      className={`flex items-center gap-1 font-mono font-bold text-[9.5px] px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
                        isChannelsMenuOpen
                          ? 'bg-sky-950/80 text-sky-300 border-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.4)]'
                          : 'bg-zinc-900 hover:bg-zinc-800 text-sky-300 border-zinc-700 hover:border-sky-500/60'
                      }`}
                    >
                      <Layers size={11} className="text-sky-400 flex-shrink-0" />
                      <span>CANAIS</span>
                      <span className="text-[8.5px] px-1 py-0.2 rounded bg-zinc-950 text-amber-400 border border-zinc-800">
                        T:{formatMidiChannelShort(midiSectionChannels.keys)}
                      </span>
                      <ChevronDown size={11} className="text-sky-400 flex-shrink-0" />
                    </button>

                    {isChannelsMenuOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-full left-0 mt-1 w-72 sm:w-80 bg-zinc-950 border border-zinc-700 rounded-md shadow-2xl z-50 py-1.5 font-mono text-[10px] overflow-hidden"
                      >
                        <div className="px-2.5 pb-1.5 mb-1 border-b border-zinc-800 flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-[9.5px] font-bold text-zinc-100 uppercase tracking-wider">
                              Canais MIDI por Seção
                            </span>
                            <span className="text-[8px] text-emerald-400">
                              Salvo no perfil: {activeMidiProfileName}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsChannelsMenuOpen(false)}
                            className="text-zinc-400 hover:text-white px-1.5 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-[9px] cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>

                        {/* Quick Set All FX Sections */}
                        <div className="px-2.5 py-1 bg-zinc-900/70 border-b border-zinc-800/80 flex items-center justify-between gap-2">
                          <span className="text-[8.5px] text-sky-300 font-bold uppercase">
                            Aplicar a todas seções FX:
                          </span>
                          <select
                            value={midiEffectsChannel}
                            onChange={(e) => handleMidiEffectsChannelChange(Number(e.target.value))}
                            className="bg-zinc-950 hover:bg-zinc-900 text-sky-300 font-mono font-bold text-[9px] px-1.5 py-0.5 rounded border border-sky-500/40 focus:outline-none cursor-pointer"
                          >
                            <option value={0}>OMNI (Todos)</option>
                            {Array.from({ length: 16 }, (_, i) => i + 1).map((ch) => (
                              <option key={ch} value={ch}>
                                CH {String(ch).padStart(2, '0')}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Preset Change Mode Selector (Program Change vs Custom Program — uses mapped button's channel) */}
                        <div className="px-2.5 py-1.5 bg-zinc-900/90 border-b border-zinc-800 flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[8px] font-bold text-amber-400 uppercase tracking-wider">
                              Mudança de Presets (Timbres):
                            </span>
                            <span className="text-[7.5px] font-mono text-emerald-400">
                              Canal Botão: {formatMidiChannelShort(midiManagerInstance?.getPresetMappedChannel() ?? 0)}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            <button
                              type="button"
                              onClick={() => handlePresetChangeModeUpdate('program_change')}
                              className={`px-1.5 py-1 rounded text-[8.5px] font-mono font-bold border cursor-pointer transition-colors ${
                                presetChangeMode === 'program_change'
                                  ? 'bg-sky-600 text-white border-sky-400 shadow-sm'
                                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                              }`}
                              title="Aceita Program Change (PC 0..127) diretamente pelo canal do botão mapeado ou qualquer canal (independente da seção)"
                            >
                              PROGRAM CHANGE
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePresetChangeModeUpdate('custom')}
                              className={`px-1.5 py-1 rounded text-[8.5px] font-mono font-bold border cursor-pointer transition-colors ${
                                presetChangeMode === 'custom'
                                  ? 'bg-amber-500 text-black border-amber-300 font-black shadow-sm'
                                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                              }`}
                              title="Usa o botão/knob mapeado via MIDI Learn em <, > ou no visor de Preset (no canal referente ao botão mapeado)"
                            >
                              CUSTOM PROGRAM
                            </button>
                          </div>
                        </div>

                        {/* Live Section Projection Pop-up Toggle */}
                        <div className="px-2.5 py-1.5 bg-zinc-900/70 border-b border-zinc-800 flex items-center justify-between gap-2">
                          <div className="flex flex-col min-w-0">
                            <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-wider">
                              Projeção de Seção (Pop-up):
                            </span>
                            <span className="text-[7px] text-zinc-400 truncate">
                              Exibe a seção ao mover o controlador
                            </span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handleSetSectionProjectionEnabled(true)}
                              className={`px-2 py-0.5 rounded text-[8.5px] font-mono font-bold border cursor-pointer transition-colors ${
                                isSectionProjectionEnabled
                                  ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
                                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                              }`}
                              title="Ativar projeção centralizada da seção ao alterar pelo controlador MIDI"
                            >
                              LIGADO
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetSectionProjectionEnabled(false)}
                              className={`px-2 py-0.5 rounded text-[8.5px] font-mono font-bold border cursor-pointer transition-colors ${
                                !isSectionProjectionEnabled
                                  ? 'bg-rose-600 text-white border-rose-400 shadow-sm'
                                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                              }`}
                              title="Desligar projeção centralizada da seção"
                            >
                              DESLIGADO
                            </button>
                          </div>
                        </div>

                        {/* Per-Section Channel List */}
                        <div className="max-h-64 overflow-y-auto divide-y divide-zinc-900 px-1">
                          {MIDI_SECTIONS.map((sec) => {
                            const isKeys = sec.id === 'keys';
                            const isArpPresets = sec.id === 'arpPresets';
                            const currentCh = midiSectionChannels[sec.id] ?? (isKeys ? 1 : 0);
                            const mappedPresetCh = midiManagerInstance?.getPresetMappedChannel() ?? 0;
                            return (
                              <div
                                key={sec.id}
                                className="flex items-center justify-between px-2 py-1.5 hover:bg-zinc-900/60 rounded transition-colors gap-2"
                              >
                                <div className="flex flex-col min-w-0">
                                  <span
                                    className={`text-[9.5px] font-bold truncate ${
                                      isKeys ? 'text-amber-400' : 'text-zinc-200'
                                    }`}
                                  >
                                    {sec.label}
                                  </span>
                                  <span className="text-[7.5px] text-zinc-500 truncate">
                                    {isKeys
                                      ? 'Notas, PitchBend, Master, VCA e Levels DCO'
                                      : isArpPresets
                                      ? `Presets (${presetChangeMode === 'custom' ? 'Custom' : 'PC'}): Canal do botão (${formatMidiChannelShort(mappedPresetCh)})`
                                      : `Seção ${sec.shortLabel} (MIDI Learn / CC)`}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {isArpPresets && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handlePresetChangeModeUpdate(
                                          presetChangeMode === 'custom' ? 'program_change' : 'custom'
                                        )
                                      }
                                      title="Alternar entre Program Change padrão e Custom Program (MIDI Learn)"
                                      className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold border cursor-pointer ${
                                        presetChangeMode === 'custom'
                                          ? 'bg-amber-500/20 text-amber-300 border-amber-400'
                                          : 'bg-sky-950 text-sky-300 border-sky-500/50'
                                      }`}
                                    >
                                      {presetChangeMode === 'custom' ? 'CUSTOM' : 'PC'}
                                    </button>
                                  )}
                                  <select
                                    value={currentCh}
                                    onChange={(e) =>
                                      handleMidiSectionChannelChange(sec.id, Number(e.target.value))
                                    }
                                    aria-label={`Selecionar Canal MIDI para ${sec.label}`}
                                    className={`bg-zinc-900 hover:bg-zinc-800 font-mono font-bold text-[9.5px] px-1.5 py-0.5 rounded border focus:outline-none cursor-pointer transition-colors flex-shrink-0 ${
                                      isKeys
                                        ? 'text-amber-400 border-amber-500/50 focus:border-amber-400'
                                        : currentCh === 0
                                        ? 'text-sky-300 border-zinc-700 focus:border-sky-400'
                                        : 'text-emerald-300 border-emerald-500/50 focus:border-emerald-400'
                                    }`}
                                  >
                                    <option value={0}>OMNI</option>
                                    {Array.from({ length: 16 }, (_, i) => i + 1).map((ch) => (
                                      <option key={ch} value={ch}>
                                        CH {String(ch).padStart(2, '0')}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* MIDI Controller Profile Tab / Suspended Dropdown + Direct '+' Add Button */}
                  <div ref={profileDropdownRef} className="relative flex items-center gap-1 pl-1 border-l border-zinc-800">
                    <span className="text-[8.5px] text-emerald-400 font-bold">PERFIL:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileMenuOpen((prev) => !prev);
                        setIsChannelsMenuOpen(false);
                        setIsCreatingProfile(false);
                        setRenamingProfileId(null);
                      }}
                      title="Selecionar, adicionar ou renomear Perfil de Mapeamento MIDI"
                      className="flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 text-emerald-300 font-mono font-bold text-[9.5px] px-1.5 py-0.5 rounded border border-zinc-700 hover:border-emerald-500/60 cursor-pointer transition-colors"
                    >
                      <span className="max-w-[96px] truncate">{activeMidiProfileName}</span>
                      <ChevronDown size={11} className="text-emerald-400 flex-shrink-0" />
                    </button>

                    {/* Direct '+' Button to Create a New Custom Profile */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileMenuOpen(true);
                        setIsChannelsMenuOpen(false);
                        setRenamingProfileId(null);
                        setIsCreatingProfile(true);
                        setNewProfileName(`User ${midiProfiles.length}`);
                      }}
                      title="Adicionar novo perfil MIDI customizado (+)"
                      className="flex items-center justify-center w-5 h-5 rounded bg-emerald-950/80 hover:bg-emerald-800 text-emerald-300 border border-emerald-500/60 font-mono font-black text-xs cursor-pointer transition-colors"
                    >
                      <Plus size={11} />
                    </button>

                    {isProfileMenuOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-full left-0 mt-1 w-64 bg-zinc-950 border border-zinc-700 rounded-md shadow-2xl z-50 py-1 font-mono text-[10px] overflow-hidden"
                      >
                        <div className="px-2.5 py-1 text-[8.5px] text-zinc-400 border-b border-zinc-800 flex items-center justify-between uppercase tracking-wider">
                          <span>Perfis MIDI (Auto-Save)</span>
                          <span className="text-emerald-400 font-bold">ATIVO</span>
                        </div>

                        <div className="max-h-52 overflow-y-auto divide-y divide-zinc-900">
                          {midiProfiles.map((profile) => {
                            const isSelected = profile.id === activeMidiProfileId;
                            const isRenamingThis = renamingProfileId === profile.id;
                            return (
                              <div
                                key={profile.id}
                                onClick={() => {
                                  if (!isRenamingThis) {
                                    handleSelectMidiProfile(profile.id);
                                  }
                                }}
                                className={`flex items-center justify-between px-2 py-1.5 cursor-pointer transition-colors gap-1 ${
                                  isSelected
                                    ? 'bg-emerald-950/60 text-emerald-300 font-bold'
                                    : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                                }`}
                              >
                                {isRenamingThis ? (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1 w-full"
                                  >
                                    <input
                                      type="text"
                                      autoFocus
                                      value={renameProfileValue}
                                      onChange={(e) => setRenameProfileValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          handleConfirmRenameProfile(profile.id);
                                        } else if (e.key === 'Escape') {
                                          setRenamingProfileId(null);
                                        }
                                      }}
                                      placeholder="Novo nome..."
                                      className="flex-1 min-w-0 bg-zinc-900 text-zinc-100 px-1.5 py-0.5 rounded border border-amber-400 text-[10px] font-mono focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleConfirmRenameProfile(profile.id)}
                                      className="p-1 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded cursor-pointer"
                                      title="Salvar novo nome"
                                    >
                                      <Check size={10} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setRenamingProfileId(null)}
                                      className="p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded cursor-pointer"
                                      title="Cancelar"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-1.5 truncate">
                                      <Check
                                        size={11}
                                        className={
                                          isSelected ? 'text-emerald-400 opacity-100 flex-shrink-0' : 'opacity-0 flex-shrink-0'
                                        }
                                      />
                                      <span className="truncate">{profile.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setIsCreatingProfile(false);
                                          setRenamingProfileId(profile.id);
                                          setRenameProfileValue(profile.name);
                                        }}
                                        className="text-zinc-400 hover:text-amber-300 p-0.5 rounded cursor-pointer"
                                        title={`Renomear perfil ${profile.name}`}
                                      >
                                        <Pencil size={11} />
                                      </button>
                                      {profile.id !== DEFAULT_PROFILE_ID && (
                                        <button
                                          type="button"
                                          onClick={(e) => handleDeleteMidiProfile(e, profile.id)}
                                          className="text-zinc-500 hover:text-red-400 p-0.5 rounded cursor-pointer"
                                          title={`Excluir perfil ${profile.name}`}
                                        >
                                          <Trash2 size={11} />
                                        </button>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* '+' Option Inside the Dropdown List to Add User Profile */}
                        <div className="border-t border-zinc-800 pt-1 mt-0.5 px-1.5 pb-1 bg-zinc-950">
                          {!isCreatingProfile ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setRenamingProfileId(null);
                                  setIsCreatingProfile(true);
                                  setNewProfileName(`User ${midiProfiles.length}`);
                                }}
                                className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded text-emerald-400 hover:bg-emerald-950/50 hover:text-emerald-300 font-bold cursor-pointer transition-colors text-left"
                              >
                                <Plus size={12} className="text-emerald-400 flex-shrink-0" />
                                <span>Adicionar Perfil...</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsCreatingProfile(false);
                                  setRenamingProfileId(activeMidiProfileId);
                                  setRenameProfileValue(activeMidiProfileName);
                                }}
                                className="flex items-center gap-1 px-2 py-1.5 rounded text-amber-400 hover:bg-amber-950/40 hover:text-amber-300 font-bold cursor-pointer transition-colors"
                                title="Renomear perfil atual"
                              >
                                <Pencil size={11} />
                                <span>Renomear</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 p-0.5">
                              <input
                                type="text"
                                autoFocus
                                value={newProfileName}
                                onChange={(e) => setNewProfileName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleCreateMidiProfile();
                                  } else if (e.key === 'Escape') {
                                    setIsCreatingProfile(false);
                                  }
                                }}
                                placeholder="Nome do novo perfil..."
                                className="flex-1 min-w-0 bg-zinc-900 text-zinc-100 px-2 py-1 rounded border border-emerald-500/60 text-[10px] font-mono focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={handleCreateMidiProfile}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-black font-bold rounded cursor-pointer text-[10px] flex items-center justify-center"
                                title="Criar e selecionar perfil"
                              >
                                <Check size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsCreatingProfile(false)}
                                className="px-1.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded cursor-pointer text-[10px] flex items-center justify-center"
                                title="Cancelar"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Interactive MIDI LEARN Main Button (Fixed border/dimensions -> zero layout shift) */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !isMidiLearnActive;
                    midiLearnActiveRef.current = next;
                    setIsMidiLearnActive(next);
                    if (next) {
                      if (projectionFadeTimerRef.current) clearTimeout(projectionFadeTimerRef.current);
                      if (projectionHideTimerRef.current) clearTimeout(projectionHideTimerRef.current);
                      setProjectedSection(null);
                      setProjectedSectionFading(false);
                    } else {
                      setSelectedLearnParam(null);
                      setSelectedLearnAction(null);
                      midiManagerInstance?.setLearnParam(null);
                      midiManagerInstance?.setLearnAction(null);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold transition-shadow cursor-pointer shadow-sm border ${
                    isMidiLearnActive
                      ? 'bg-[#0284c7] text-white border-[#38bdf8] shadow-[0_0_12px_rgba(56,189,248,0.55)] ring-2 ring-sky-400/70'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                  }`}
                  title="Ativar/Desativar modo MIDI Learn: clique diretamente em qualquer fader, switch ou botão para mapear"
                >
                  <Sliders size={13} className={isMidiLearnActive ? 'text-white' : 'text-sky-400'} />
                  <span>MIDI LEARN</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-black ${
                    isMidiLearnActive ? 'bg-zinc-950 text-sky-300' : 'bg-zinc-900 text-zinc-400'
                  }`}>
                    {(midiManagerInstance ? Object.keys(midiManagerInstance.getParamToCCMap()).length : Object.keys(currentMidiMapping).length) + Object.keys(currentMidiActionMapping).length}
                  </span>
                </button>

                {/* Record Button */}
                <button
                  type="button"
                  onClick={handleToggleRecord}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                    isRecording
                      ? 'bg-red-600 text-white animate-pulse shadow-[0_0_8px_#ef4444]'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                  title={isRecording ? 'Stop Recording' : 'Record Audio'}
                >
                  <Disc size={13} />
                  <span>{isRecording ? 'REC' : 'Record'}</span>
                </button>

                {recordedAudioUrl && (
                  <a
                    href={recordedAudioUrl}
                    download={`Hera_Recording_${Date.now()}.webm`}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer"
                    title="Download recorded performance"
                  >
                    <Download size={13} />
                  </a>
                )}

                {/* Master Volume (Mappable on Keys MIDI Channel) */}
                <div
                  onClick={(e) => {
                    if (isMidiLearnActive) {
                      e.stopPropagation();
                      handleSelectForLearn('MasterVolume');
                    }
                  }}
                  title={
                    isMidiLearnActive
                      ? 'Clique para mapear Volume Geral (Canal das Teclas)'
                      : 'Volume Master Geral (Mapeável no Canal das Teclas)'
                  }
                  className={`relative flex items-center gap-1 px-1.5 py-0.5 rounded transition-shadow ${
                    isMidiLearnActive
                      ? selectedLearnParam === 'MasterVolume'
                        ? 'cursor-pointer ring-2 ring-sky-400 bg-sky-500/20 shadow-[0_0_14px_rgba(56,189,248,0.65)]'
                        : 'cursor-pointer ring-1 ring-sky-400/30 hover:ring-sky-400/70 hover:bg-sky-500/10'
                      : ''
                  }`}
                >
                  <MidiLearnBadge
                    isMidiLearnActive={isMidiLearnActive}
                    isSelectedForLearn={selectedLearnParam === 'MasterVolume'}
                    mappedCC={getMappedCC('MasterVolume')}
                    channelLabel={getChannelLabelForParam('MasterVolume')}
                    onUnmap={() => handleUnmapParam('MasterVolume')}
                    title="Desmapear Volume Geral"
                    positionClass="absolute -bottom-4 left-1/2 -translate-x-1/2 z-40"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      if (isMidiLearnActive) {
                        e.stopPropagation();
                        handleSelectForLearn('MasterVolume');
                        return;
                      }
                      const next = !isMuted;
                      setIsMuted(next);
                      synthEngine.setMasterVolume(next ? 0 : masterVolume);
                    }}
                    className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    {isMuted || masterVolume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : masterVolume}
                    onChange={(e) => {
                      if (isMidiLearnActive) {
                        handleSelectForLearn('MasterVolume');
                        return;
                      }
                      const val = parseFloat(e.target.value);
                      setIsMuted(false);
                      setMasterVolume(val);
                      handleParamChange('MasterVolume', val);
                    }}
                    className="w-16 accent-amber-500 cursor-pointer"
                    title="Volume Master Geral (Canal das Teclas)"
                  />
                  <span className="text-[9px] font-mono text-amber-400 font-bold min-w-[20px] text-right">
                    {Math.min(100, Math.max(0, Math.round((isMuted ? 0 : masterVolume) * 100)))}
                  </span>
                </div>

                {/* Help button */}
                <button
                  type="button"
                  onClick={() => setShowHelp(true)}
                  className="p-1 text-zinc-400 hover:text-zinc-200 rounded cursor-pointer"
                  title="Ajuda e manual do Juno-60"
                >
                  <HelpCircle size={15} />
                </button>
              </div>
            </div>
          </div>


          {/* Roland Multi-Stripe Color Separator */}
          <div className="flex h-1.5 w-full">
            <div className="flex-1 bg-red-600" />
            <div className="flex-1 bg-amber-600" />
            <div className="flex-1 bg-yellow-500" />
            <div className="flex-1 bg-cyan-500" />
            <div className="flex-1 bg-blue-600" />
          </div>

          {/* Main Juno-60 Synth Control Panel (Section-only zoom + up to 20% proportional fader elongation) */}
          <div
            style={
              {
                '--fader-elongation': faderElongation,
              } as React.CSSProperties
            }
            className="bg-zinc-900 px-1 py-1 sm:py-2 border-b border-zinc-800 w-full"
          >
            <div className="w-full overflow-x-auto pt-3.5 pb-1.5 scrollbar-thin">
              <div
                style={{ zoom: rackZoomFactor }}
                className="min-w-max w-fit flex flex-row items-stretch justify-start gap-1 sm:gap-1.5 px-2 mx-auto"
              >
                {RACK_SECTION_IDS.map((sectionId) => renderRackSectionCard(sectionId, false))}
              </div>
            </div>
          </div>

          {/* Middle Utility Section: Preset Manager + Arpeggiator */}
          <div
            ref={presetBarRef}
            className="p-1.5 sm:p-2 bg-zinc-950 border-b border-zinc-800 flex flex-col gap-1.5"
          >
            <PresetManager
              currentParams={params}
              onSelectPreset={handleSelectPreset}
              isArpSectionOpen={isArpSectionOpen}
              isArpEnabled={isArpEnabled}
              onToggleArpSection={() => setIsArpSectionOpen((prev) => !prev)}
              isKeyboardOpen={isKeyboardOpen}
              onToggleKeyboard={() => setIsKeyboardOpen((prev) => !prev)}
              isMidiLearnActive={isMidiLearnActive}
              selectedLearnAction={selectedLearnAction}
              mappedCCPrev={getMappedActionCC('prevPreset')}
              mappedCCNext={getMappedActionCC('nextPreset')}
              mappedCCSelect={getMappedActionCC('selectPreset')}
              channelLabel={getChannelLabelForAction('selectPreset')}
              channelLabelPrev={getChannelLabelForAction('prevPreset')}
              channelLabelNext={getChannelLabelForAction('nextPreset')}
              channelLabelSelect={getChannelLabelForAction('selectPreset')}
              onSelectActionForLearn={handleSelectActionForLearn}
              onUnmapAction={handleUnmapAction}
              onRegisterLoadByIndex={(fn) => {
                loadPresetByIndexRef.current = fn;
              }}
              onRegisterPresetNav={(nav) => {
                presetNavRef.current = nav;
              }}
            />
            <Arpeggiator
              isOpen={isArpSectionOpen}
              onArpEnabledChange={setIsArpEnabled}
              isMidiLearnActive={isMidiLearnActive}
              selectedLearnAction={selectedLearnAction}
              mappedCCArpToggle={getMappedActionCC('arpToggle')}
              mappedCCArpHold={getMappedActionCC('arpHold')}
              channelLabel={getChannelLabelForAction('arpToggle')}
              onSelectActionForLearn={handleSelectActionForLearn}
              onUnmapAction={handleUnmapAction}
              onRegisterArpActions={(handlers) => {
                arpActionsRef.current = handlers;
              }}
            />
          </div>

          {/* Bottom Virtual Piano Keyboard & Controls */}
          {isKeyboardOpen && (
            <div ref={keyboardSectionRef} className="bg-zinc-950">
              <PianoKeyboard
                isMidiLearnActive={isMidiLearnActive}
                selectedLearnAction={selectedLearnAction}
                mappedCCPitch={getMappedActionCC('pitchWheel')}
                mappedCCMod={getMappedActionCC('modWheel')}
                channelLabelPitch={getChannelLabelForAction('pitchWheel')}
                channelLabelMod={getChannelLabelForAction('modWheel')}
                onSelectActionForLearn={handleSelectActionForLearn}
                onUnmapAction={handleUnmapAction}
                onRegisterWheelUpdater={(updater) => {
                  wheelUpdaterRef.current = updater;
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Centered Live Rack Section Projection Pop-up (Immediate on MIDI change, disappears in 500ms, inhibited during MIDI Learn) */}
      {isSectionProjectionEnabled && !isMidiLearnActive && projectedSection && (
        <div
          className={`fixed inset-0 z-40 pointer-events-none flex items-center justify-center ${
            projectedSectionFading
              ? 'opacity-0 transition-opacity duration-[350ms] ease-out'
              : 'opacity-100 transition-none'
          }`}
        >
          <div
            style={
              {
                '--fader-elongation': faderElongation,
                zoom: rackZoomFactor,
              } as React.CSSProperties
            }
            className="flex items-stretch justify-center"
          >
            {renderRackSectionCard(projectedSection, true)}
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelp && (
        <div
          className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-lg max-w-lg w-full max-h-[85vh] sm:max-h-[90vh] flex flex-col p-4 sm:p-5 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 flex-shrink-0">
              <h3 className="font-mono text-base sm:text-lg font-bold text-amber-400">
                Guia do Hera Juno Synthesizer
              </h3>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-amber-400 font-mono text-xs font-bold rounded border border-zinc-600 cursor-pointer shadow-sm transition-colors"
                aria-label="Fechar Guia"
              >
                <span>✕</span>
                <span className="hidden sm:inline">FECHAR</span>
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="text-xs space-y-3.5 text-zinc-300 font-sans flex-1 overflow-y-auto pr-2 my-3 overscroll-contain">
              <div>
                <h4 className="font-bold text-zinc-100 mb-1">Canais MIDI por Seção (Auto-Save no Perfil)</h4>
                <div className="bg-zinc-950 p-2.5 rounded font-mono text-[11px] space-y-2 border border-zinc-800 text-zinc-300">
                  <p className="text-[10px] text-zinc-400">
                    Na barra superior, clique em <strong className="text-sky-400">CANAIS</strong> para escolher o canal de escuta das <strong className="text-amber-400">Teclas</strong> e o canal individual de <strong className="text-sky-300">cada seção do sintetizador</strong> (LFO, DCO, HPF, VCF, VCA, ENV, Chorus, Echo Delay, Reverb Global e Arp/Presets). Tudo é salvo automaticamente no perfil MIDI ativo (ex.: <strong className="text-emerald-400">{activeMidiProfileName}</strong>).
                  </p>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-zinc-100 mb-1">Como usar o MIDI Learn</h4>
                <div className="bg-zinc-950 p-2.5 rounded font-mono text-[11px] space-y-1.5 border border-zinc-800 text-zinc-300">
                  <p>1. Clique no botão <strong className="text-sky-400">MIDI LEARN</strong> na barra superior.</p>
                  <p>2. Os controles que já possuem vínculo mostram o balão <code className="text-sky-400">CCxx ✕</code>; os não mapeados ficam limpos sem balão.</p>
                  <p>3. Clique em <strong className="text-amber-400">qualquer parte</strong> de um fader, Volume Geral, chave seletora (switch) ou botão de efeito: a <strong className="text-sky-400">auréola luminosa</strong> e o balão compacto aparecerão com a identificação do canal/CC na linha de baixo.</p>
                  <p>4. Mova o knob, fader ou botão no seu controlador MIDI: o vínculo será salvo imediatamente no perfil ativo!</p>
                  <p>5. Para remover um vínculo, clique no <strong className="text-red-400">✕</strong> no balão do controle.</p>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-zinc-100 mb-1">Atalhos de Teclado no PC</h4>
                <div className="bg-zinc-950 p-2.5 rounded font-mono text-[11px] grid grid-cols-2 gap-2 border border-zinc-800">
                  <div>
                    <span className="text-amber-400 font-bold">Oitava Inferior:</span>
                    <p className="text-zinc-400">Z, S, X, D, C, V, G, B, H, N, J, M</p>
                  </div>
                  <div>
                    <span className="text-amber-400 font-bold">Oitava Superior:</span>
                    <p className="text-zinc-400">Q, 2, W, 3, E, R, 5, T, 6, Y, 7, U, I</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-zinc-100 mb-1">Delays e Reverb Global de Pós-Processamento</h4>
                <div className="bg-zinc-950 p-2.5 rounded font-mono text-[11px] space-y-1.5 border border-zinc-800 text-zinc-300">
                  <p><strong className="text-yellow-400">1. LFO Vib Del (Atraso do Vibrato):</strong> Define o tempo antes de iniciar o vibrato quando o slider <strong className="text-red-400">LFO</strong> na seção DCO ou VCF está levantado.</p>
                  <p><strong className="text-emerald-400">2. Echo Delay (Eco Estéreo Espacial):</strong> Localizado ao lado do Chorus. Possui botão <strong className="text-emerald-400">ON/OFF</strong>, Time, Feedback e Mix.</p>
                  <p><strong className="text-violet-400">3. Reverb Global (Pós-Processamento Estéreo):</strong> Estágio global pós-sintetizador com modos <strong className="text-violet-300">PLATE</strong> e <strong className="text-violet-300">HALL</strong>, controles de <strong className="text-violet-300">Time</strong>, <strong className="text-violet-300">Decay</strong>, <strong className="text-violet-300">Mix</strong> e <strong className="text-violet-300">ON/OFF</strong>, todos mapeáveis via MIDI.</p>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-zinc-100 mb-1">Roland Juno Chorus BBD</h4>
                <p className="text-zinc-400 leading-relaxed">
                  Pressione <strong>Chorus I</strong> para ambiência suave (0.513 Hz),{' '}
                  <strong>Chorus II</strong> para modulação mais profunda e cremosa (0.863 Hz), ou{' '}
                  <strong>ambos I & II</strong> para o lendário efeito rotary/vibrato (1.02 Hz)!
                </p>
              </div>

              <div>
                <h4 className="font-bold text-zinc-100 mb-1">Gerenciador de Presets</h4>
                <p className="text-zinc-400 leading-relaxed">
                  Inclui todos os 56 presets de fábrica autênticos do Roland Juno-60 (000 - 055). Você pode salvar presets customizados no armazenamento local e exportar/importar arquivos XML.
                </p>
              </div>
            </div>

            {/* Modal Footer (Sticky) */}
            <div className="pt-3 border-t border-zinc-800 flex justify-end flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="w-full sm:w-auto px-5 py-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black font-mono font-bold rounded cursor-pointer text-xs uppercase tracking-wider shadow-md transition-colors"
              >
                ✕ Fechar Guia
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
