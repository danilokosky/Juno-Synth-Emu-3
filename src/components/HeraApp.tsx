import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HeraParameters, DEFAULT_PARAMETERS, VoiceStatus } from '../types/synth';
import { synthEngine, getAttackSec, getDecaySec, getReleaseSec } from '../audio/HeraAudioEngine';
import { MidiManager, MidiDevice } from '../audio/MidiManager';
import { FACTORY_PRESETS } from '../presets/factoryPresets';
import { Slider } from './Slider';
import { ToggleSwitch } from './ToggleSwitch';
import { ChorusButton } from './ChorusButton';
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
  Smartphone
} from 'lucide-react';

import { AndroidMidiModal } from './AndroidMidiModal';

export const HeraApp: React.FC = () => {
  const [params, setParams] = useState<HeraParameters>(() => {
    // Default to Preset 000: Strings 1
    const p0 = FACTORY_PRESETS[0]?.params;
    return p0 ? ({ ...DEFAULT_PARAMETERS, ...p0 } as HeraParameters) : { ...DEFAULT_PARAMETERS };
  });

  const [currentPresetName, setCurrentPresetName] = useState<string>('Strings 1');
  const [voices, setVoices] = useState<VoiceStatus[]>([]);
  const [isAudioStarted, setIsAudioStarted] = useState<boolean>(false);
  const [masterVolume, setMasterVolume] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Recording
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);

  // MIDI
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);
  const [midiActive, setMidiActive] = useState<boolean>(false);
  const [midiManagerInstance, setMidiManagerInstance] = useState<MidiManager | null>(null);
  const [currentMidiMapping, setCurrentMidiMapping] = useState<Record<number, keyof HeraParameters>>({});

  // Interactive MIDI Learn Mode State
  const [isMidiLearnActive, setIsMidiLearnActive] = useState<boolean>(false);
  const [selectedLearnParam, setSelectedLearnParam] = useState<keyof HeraParameters | null>(null);
  const [lastLearnedInfo, setLastLearnedInfo] = useState<{ param: string; cc: number } | null>(null);

  // Help & Android modals
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [showAndroidModal, setShowAndroidModal] = useState<boolean>(false);

  const midiTimeoutRef = useRef<number | null>(null);

  // Initialize engine listeners
  useEffect(() => {
    synthEngine.setVoicesListener((statuses) => {
      setVoices(statuses);
    });

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
    setCurrentMidiMapping(midiMgr.getMapping());
    midiMgr.init(
      (devices) => setMidiDevices(devices),
      () => {
        setMidiActive(true);
        if (midiTimeoutRef.current) clearTimeout(midiTimeoutRef.current);
        midiTimeoutRef.current = window.setTimeout(() => setMidiActive(false), 200);
      },
      (param, val) => {
        setParams((prev) => ({ ...prev, [param]: val }));
      },
      (mapping, learnedParam, learnedCC) => {
        setCurrentMidiMapping({ ...mapping });
        if (learnedParam && learnedCC !== undefined) {
          setSelectedLearnParam(null);
          setLastLearnedInfo({ param: String(learnedParam), cc: learnedCC });
          setTimeout(() => setLastLearnedInfo(null), 3500);
        }
      }
    );

    // Synchronize initial parameters
    synthEngine.setAllParameters(params);

    return () => {
      if (midiTimeoutRef.current) clearTimeout(midiTimeoutRef.current);
    };
  }, []);

  const handleParamChange = useCallback(
    <K extends keyof HeraParameters>(key: K, value: HeraParameters[K]) => {
      setParams((prev) => {
        const updated = { ...prev, [key]: value };
        synthEngine.setParameter(key, value);
        return updated;
      });
    },
    []
  );

  const handleSelectPreset = useCallback((newParams: HeraParameters, name: string) => {
    setParams(newParams);
    setCurrentPresetName(name);
    synthEngine.setAllParameters(newParams);
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

  // MIDI Learn Selection & Unmapping Helpers
  const handleSelectForLearn = (param: keyof HeraParameters) => {
    if (selectedLearnParam === param) {
      setSelectedLearnParam(null);
      midiManagerInstance?.setLearnParam(null);
    } else {
      setSelectedLearnParam(param);
      midiManagerInstance?.setLearnParam(param);
    }
  };

  const handleUnmapParam = (param: keyof HeraParameters) => {
    midiManagerInstance?.unmapParam(param);
    setCurrentMidiMapping(midiManagerInstance?.getMapping() || {});
    if (selectedLearnParam === param) {
      setSelectedLearnParam(null);
      midiManagerInstance?.setLearnParam(null);
    }
  };

  const getMappedCC = (param: keyof HeraParameters): number | null => {
    for (const [ccStr, p] of Object.entries(currentMidiMapping)) {
      if (p === param) return Number(ccStr);
    }
    return null;
  };

  return (
    <div
      onClick={startAudioOnInteraction}
      className="min-h-screen bg-stone-950 text-zinc-100 flex flex-col justify-between"
    >
      {/* Outer Synthetic Chassis with Walnut Wood Cheeks */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto my-0 sm:my-1.5 px-0.5 sm:px-2">
        <div className="relative rounded-lg shadow-2xl border-2 sm:border-4 border-stone-800 bg-zinc-900 flex flex-col overflow-hidden">
          {/* Wood Cheeks Simulation (Left & Right Borders) */}
          <div className="hidden lg:block absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-amber-950 via-amber-900 to-amber-950 border-r border-amber-900/60 z-30 pointer-events-none" />
          <div className="hidden lg:block absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-l from-amber-950 via-amber-900 to-amber-950 border-l border-amber-900/60 z-30 pointer-events-none" />

          {/* Top Roland Header Bar */}
          <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 px-2 sm:px-4 py-1 sm:py-1.5 border-b-2 border-zinc-700 flex flex-wrap items-center justify-between gap-2">
            {/* Branding / Badge */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-2xl font-black tracking-widest text-zinc-100 drop-shadow">
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
              <VoiceIndicator voices={voices} className="hidden sm:flex" />

              <div className="hidden md:block w-48">
                <Oscilloscope />
              </div>

              {/* Master Volume & Recording Controls */}
              <div className="flex items-center gap-2 bg-zinc-950 p-1.5 rounded border border-zinc-800">
                {/* MIDI in LED */}
                <div className="flex items-center gap-1 px-1.5 text-[9px] font-mono text-zinc-400 border-r border-zinc-800">
                  <Radio
                    size={13}
                    className={midiActive ? 'text-emerald-400 animate-pulse' : 'text-zinc-600'}
                  />
                  <span>MIDI</span>
                  <div
                    className={`w-2 h-2 rounded-full ${
                      midiActive ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-zinc-800'
                    }`}
                  />
                </div>

                {/* Interactive MIDI LEARN Main Button */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !isMidiLearnActive;
                    setIsMidiLearnActive(next);
                    if (!next) {
                      setSelectedLearnParam(null);
                      midiManagerInstance?.setLearnParam(null);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-bold transition-all cursor-pointer shadow-sm ${
                    isMidiLearnActive
                      ? 'bg-amber-500 text-zinc-950 border-2 border-amber-300 ring-2 ring-amber-400/80 animate-pulse'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
                  }`}
                  title="Ativar/Desativar modo MIDI Learn para mapear controles físicos do teclado"
                >
                  <Sliders size={13} className={isMidiLearnActive ? 'text-zinc-950' : 'text-amber-400'} />
                  <span>{isMidiLearnActive ? 'LEARN [ATIVO]' : 'MIDI LEARN'}</span>
                  <span className={`text-[10px] px-1 py-0.2 rounded font-mono ${
                    isMidiLearnActive ? 'bg-zinc-950 text-amber-300' : 'bg-zinc-900 text-zinc-400'
                  }`}>
                    {Object.keys(currentMidiMapping).length}
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

                {/* Master Volume */}
                <div className="flex items-center gap-1 pl-1">
                  <button
                    type="button"
                    onClick={() => {
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
                      const val = parseFloat(e.target.value);
                      setIsMuted(false);
                      setMasterVolume(val);
                      synthEngine.setMasterVolume(val);
                    }}
                    className="w-16 accent-amber-500 cursor-pointer"
                    title="Volume Master Geral"
                  />
                </div>

                {/* Android Native APK & MIDI Mapping Button */}
                <button
                  type="button"
                  onClick={() => setShowAndroidModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 rounded text-xs font-mono font-bold cursor-pointer transition-colors shadow-sm"
                  title="Abrir configurações de MIDI e download do APK Android"
                >
                  <Smartphone size={13} />
                  <span>Android & MIDI</span>
                </button>

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

          {/* Interactive MIDI Learn Floating Status Banner */}
          {isMidiLearnActive && (
            <div className="bg-gradient-to-r from-amber-950 via-zinc-900 to-amber-950 border-b-2 border-amber-500 px-4 py-2 flex flex-wrap items-center justify-between gap-2 shadow-lg animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                </span>
                {selectedLearnParam ? (
                  <span className="text-xs sm:text-sm font-mono text-amber-300 font-bold">
                    🎯 AURÉOLA ATIVA: <span className="text-white bg-amber-900/60 px-2 py-0.5 rounded border border-amber-400 uppercase tracking-wider">{selectedLearnParam}</span> — Mova agora qualquer knob, fader ou botão no seu teclado MIDI para vincular!
                  </span>
                ) : (
                  <span className="text-xs sm:text-sm font-mono text-zinc-300">
                    ⚡ <strong className="text-amber-400">MODO MIDI LEARN ATIVO</strong>: Toque em qualquer fader ou botão abaixo (com a auréola) para selecioná-lo e girar o botão no seu controlador. Para desmapear, clique no <strong className="text-red-400">✕</strong> da etiqueta.
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {lastLearnedInfo && (
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-600 text-white font-bold animate-in fade-in">
                    ✓ CC {lastLearnedInfo.cc} mapeado para {lastLearnedInfo.param}!
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsMidiLearnActive(false);
                    setSelectedLearnParam(null);
                    midiManagerInstance?.setLearnParam(null);
                  }}
                  className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-bold rounded border border-zinc-600 cursor-pointer"
                >
                  Concluir
                </button>
              </div>
            </div>
          )}

          {/* Roland Multi-Stripe Color Separator */}
          <div className="flex h-1.5 w-full">
            <div className="flex-1 bg-red-600" />
            <div className="flex-1 bg-amber-600" />
            <div className="flex-1 bg-yellow-500" />
            <div className="flex-1 bg-cyan-500" />
            <div className="flex-1 bg-blue-600" />
          </div>

          {/* Main Juno-60 Synth Control Panel */}
          <div className="bg-zinc-900 px-1 py-1 sm:py-2 border-b border-zinc-800 w-full overflow-hidden">
            <div className="w-full overflow-x-auto pb-1.5 scrollbar-thin overscroll-x-contain touch-pan-x">
              <div className="min-w-max w-fit flex flex-row items-stretch justify-start gap-1 sm:gap-1.5 px-2 mx-auto">
                {/* SECTION: LFO */}
              <div className="flex-shrink-0 bg-zinc-950/70 border-t-4 border-t-yellow-500 border border-zinc-800 rounded p-1.5 flex flex-col justify-between shadow-md">
                <div className="text-[10px] font-black font-mono tracking-widest text-yellow-400 uppercase text-center pb-0.5 border-b border-zinc-800/80">
                  LFO
                </div>
                <div className="flex items-center justify-center gap-1 my-1">
                  <Slider
                    label="Rate"
                    value={params.LFORate}
                    onChange={(v) => handleParamChange('LFORate', v)}
                    defaultValue={0.6}
                    color="amber"
                    isMidiLearnActive={isMidiLearnActive}
                    isSelectedForLearn={selectedLearnParam === 'LFORate'}
                    mappedCC={getMappedCC('LFORate')}
                    onSelectForLearn={() => handleSelectForLearn('LFORate')}
                    onUnmap={() => handleUnmapParam('LFORate')}
                  />
                  <Slider
                    label="Delay"
                    value={params.LFODelay}
                    onChange={(v) => handleParamChange('LFODelay', v)}
                    defaultValue={0.0}
                    color="amber"
                    isMidiLearnActive={isMidiLearnActive}
                    isSelectedForLearn={selectedLearnParam === 'LFODelay'}
                    mappedCC={getMappedCC('LFODelay')}
                    onSelectForLearn={() => handleSelectForLearn('LFODelay')}
                    onUnmap={() => handleUnmapParam('LFODelay')}
                  />
                </div>
                {/* Manual LFO Trigger button (iconic Juno button!) */}
                <div className="pt-0.5 border-t border-zinc-800/80 flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => synthEngine.triggerManualLfo()}
                    className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 active:bg-amber-600 active:text-black rounded text-[8.5px] font-mono font-bold text-zinc-300 border border-zinc-700 cursor-pointer transition-colors"
                  >
                    MAN TRIG
                  </button>
                </div>
              </div>

              {/* SECTION: DCO */}
              <div className="flex-shrink-0 bg-zinc-950/70 border-t-4 border-t-red-500 border border-zinc-800 rounded p-1.5 flex flex-col justify-between shadow-md">
                <div className="text-[10px] font-black font-mono tracking-widest text-red-400 uppercase text-center pb-0.5 border-b border-zinc-800/80">
                  DCO (Oscillator)
                </div>
                <div className="flex items-center justify-center gap-1 my-1">
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
                    />
                    <ToggleSwitch
                      label="LFO Trig"
                      options={[
                        { label: 'Man', value: 0 },
                        { label: 'Auto', value: 1 },
                      ]}
                      value={params.LFOTrigMode}
                      onChange={(v) => handleParamChange('LFOTrigMode', v)}
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
                    onSelectForLearn={() => handleSelectForLearn('DCONoiseLevel')}
                    onUnmap={() => handleUnmapParam('DCONoiseLevel')}
                  />
                </div>
                <div className="text-[7.5px] font-mono text-zinc-500 text-center tracking-wider pt-0.5 border-t border-zinc-800/80">
                  POLYBLEP ANALOG WAVEFORMS
                </div>
              </div>

              {/* SECTION: HPF */}
              <div className="flex-shrink-0 bg-zinc-950/70 border-t-4 border-t-cyan-500 border border-zinc-800 rounded p-1.5 flex flex-col justify-between shadow-md">
                <div className="text-[10px] font-black font-mono tracking-widest text-cyan-400 uppercase text-center pb-0.5 border-b border-zinc-800/80">
                  HPF
                </div>
                <div className="flex items-center justify-center my-1">
                  <Slider
                    label="Freq"
                    value={params.HPF}
                    onChange={(v) => handleParamChange('HPF', v)}
                    defaultValue={0}
                    color="cyan"
                    formatValue={(v) => (v < 0.05 ? '0' : (v * 3).toFixed(0))}
                    isMidiLearnActive={isMidiLearnActive}
                    isSelectedForLearn={selectedLearnParam === 'HPF'}
                    mappedCC={getMappedCC('HPF')}
                    onSelectForLearn={() => handleSelectForLearn('HPF')}
                    onUnmap={() => handleUnmapParam('HPF')}
                  />
                </div>
                <div className="text-[7.5px] font-mono text-zinc-500 text-center tracking-wider pt-0.5 border-t border-zinc-800/80">
                  4-WAY
                </div>
              </div>

              {/* SECTION: VCF */}
              <div className="flex-shrink-0 bg-zinc-950/70 border-t-4 border-t-cyan-400 border border-zinc-800 rounded p-1.5 flex flex-col justify-between shadow-md">
                <div className="text-[10px] font-black font-mono tracking-widest text-cyan-300 uppercase text-center pb-0.5 border-b border-zinc-800/80">
                  VCF (Filter)
                </div>
                <div className="flex items-center justify-center gap-1 my-1">
                  <Slider
                    label="Freq"
                    value={params.VCFCutoff}
                    onChange={(v) => handleParamChange('VCFCutoff', v)}
                    defaultValue={0.5}
                    color="cyan"
                    isMidiLearnActive={isMidiLearnActive}
                    isSelectedForLearn={selectedLearnParam === 'VCFCutoff'}
                    mappedCC={getMappedCC('VCFCutoff')}
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
                    formatValue={(v) => (v > 0 ? `+${(v * 10).toFixed(1)}` : (v * 10).toFixed(1))}
                    isMidiLearnActive={isMidiLearnActive}
                    isSelectedForLearn={selectedLearnParam === 'VCFEnv'}
                    mappedCC={getMappedCC('VCFEnv')}
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
                    onSelectForLearn={() => handleSelectForLearn('VCFBendDepth')}
                    onUnmap={() => handleUnmapParam('VCFBendDepth')}
                  />
                </div>
                <div className="text-[7.5px] font-mono text-zinc-500 text-center tracking-wider pt-0.5 border-t border-zinc-800/80">
                  24dB/OCT RESONANT OTA
                </div>
              </div>

              {/* SECTION: VCA */}
              <div className="flex-shrink-0 bg-zinc-950/70 border-t-4 border-t-amber-500 border border-zinc-800 rounded p-1.5 flex flex-col justify-between shadow-md">
                <div className="text-[10px] font-black font-mono tracking-widest text-amber-400 uppercase text-center pb-0.5 border-b border-zinc-800/80">
                  VCA
                </div>
                <div className="flex items-center justify-center gap-1.5 my-1">
                  <ToggleSwitch
                    label="Type"
                    options={[
                      { label: 'ENV', value: 0 },
                      { label: 'GATE', value: 1 },
                    ]}
                    value={params.VCAType}
                    onChange={(v) => handleParamChange('VCAType', v)}
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
                    onSelectForLearn={() => handleSelectForLearn('VCADepth')}
                    onUnmap={() => handleUnmapParam('VCADepth')}
                  />
                </div>
                <div className="text-[7.5px] font-mono text-zinc-500 text-center tracking-wider pt-0.5 border-t border-zinc-800/80">
                  AMP
                </div>
              </div>

              {/* SECTION: ENV */}
              <div className="flex-shrink-0 bg-zinc-950/70 border-t-4 border-t-amber-400 border border-zinc-800 rounded p-1.5 flex flex-col justify-between shadow-md">
                <div className="text-[10px] font-black font-mono tracking-widest text-amber-300 uppercase text-center pb-0.5 border-b border-zinc-800/80">
                  ENV (ADSR)
                </div>
                <div className="flex items-center justify-center gap-1 my-1">
                  <Slider
                    label="A"
                    value={params.ENVAttack}
                    onChange={(v) => handleParamChange('ENVAttack', v)}
                    defaultValue={0}
                    color="amber"
                    isMidiLearnActive={isMidiLearnActive}
                    isSelectedForLearn={selectedLearnParam === 'ENVAttack'}
                    mappedCC={getMappedCC('ENVAttack')}
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
                    onSelectForLearn={() => handleSelectForLearn('ENVRelease')}
                    onUnmap={() => handleUnmapParam('ENVRelease')}
                  />
                </div>
                <div className="text-[7.5px] font-mono text-zinc-500 text-center tracking-wider pt-0.5 border-t border-zinc-800/80">
                  EXPONENTIAL ADSR
                </div>
              </div>

              {/* SECTION: CHORUS */}
              <div className="flex-shrink-0 bg-zinc-950/70 border-t-4 border-t-rose-500 border border-zinc-800 rounded p-1.5 flex flex-col justify-between shadow-md">
                <div className="text-[10px] font-black font-mono tracking-widest text-rose-400 uppercase text-center pb-0.5 border-b border-zinc-800/80">
                  CHORUS
                </div>
                <div className="flex items-center justify-center gap-1.5 my-1">
                  <ChorusButton
                    label="I"
                    active={params.ChorusI > 0.5}
                    onClick={() => handleChorusToggle('ChorusI')}
                    isMidiLearnActive={isMidiLearnActive}
                    isSelectedForLearn={selectedLearnParam === 'ChorusI'}
                    mappedCC={getMappedCC('ChorusI')}
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
                    onSelectForLearn={() => handleSelectForLearn('ChorusII')}
                    onUnmap={() => handleUnmapParam('ChorusII')}
                  />
                </div>
                <div className="text-[7.5px] font-mono text-zinc-500 text-center tracking-wider pt-0.5 border-t border-zinc-800/80">
                  {params.ChorusI && params.ChorusII
                    ? 'I+II (ROTARY)'
                    : params.ChorusI
                    ? 'I (LUSH)'
                    : params.ChorusII
                    ? 'II (CREAMY)'
                    : 'OFF'}
                </div>
              </div>
            </div>
          </div>
        </div>

          {/* Middle Utility Section: Preset Manager + Arpeggiator */}
          <div className="p-1.5 sm:p-2 bg-zinc-950 border-b border-zinc-800 flex flex-col gap-1.5">
            <PresetManager
              currentParams={params}
              onSelectPreset={handleSelectPreset}
            />
            <Arpeggiator />
          </div>

          {/* Bottom Virtual Piano Keyboard & Controls */}
          <div className="bg-zinc-950">
            <PianoKeyboard />
          </div>
        </div>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h3 className="font-mono text-lg font-bold text-amber-400">
                Guia do Hera Juno Synthesizer
              </h3>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="text-zinc-400 hover:text-zinc-100 text-lg font-bold px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="text-xs space-y-3 text-zinc-300 font-sans">
              <div>
                <h4 className="font-bold text-zinc-100 mb-1">Como usar o MIDI Learn</h4>
                <div className="bg-zinc-950 p-2.5 rounded font-mono text-[11px] space-y-1.5 border border-zinc-800 text-zinc-300">
                  <p>1. Clique no botão <strong className="text-amber-400">MIDI LEARN</strong> na barra superior.</p>
                  <p>2. Todos os controles mostrarão as etiquetas de CC atual ou botão <code className="text-amber-400">+ LEARN</code>.</p>
                  <p>3. Toque no controle desejado: uma <strong className="text-amber-400">auréola luminosa pulsante</strong> indicará que ele está selecionado.</p>
                  <p>4. Mova qualquer knob ou fader no seu teclado MIDI externo: o controle será vinculado imediatamente!</p>
                  <p>5. Para desmapear, basta clicar no <strong className="text-red-400">✕</strong> na etiqueta do controle.</p>
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
                <h4 className="font-bold text-zinc-100 mb-1">Roland Juno Chorus BBD</h4>
                <p className="text-zinc-400 leading-relaxed">
                  Pressione <strong>Chorus I</strong> para ambiência suave (0.513 Hz),{' '}
                  <strong>Chorus II</strong> para modulação mais profunda (0.863 Hz), ou{' '}
                  <strong>ambos I & II</strong> para o lendário efeito rotary/vibrato rápido (9.75 Hz)!
                </p>
              </div>

              <div>
                <h4 className="font-bold text-zinc-100 mb-1">Gerenciador de Presets</h4>
                <p className="text-zinc-400 leading-relaxed">
                  Inclui todos os 56 presets de fábrica autênticos do Roland Juno-60 (000 - 055). Você pode salvar presets customizados no armazenamento local e exportar/importar arquivos XML.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold rounded cursor-pointer text-xs"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Android & MIDI Controller Modal */}
      <AndroidMidiModal
        isOpen={showAndroidModal}
        onClose={() => setShowAndroidModal(false)}
        midiDevices={midiDevices}
        currentMapping={currentMidiMapping}
        onMapCC={(cc, param) => {
          midiManagerInstance?.mapCC(cc, param);
          setCurrentMidiMapping(midiManagerInstance?.getMapping() || {});
        }}
      />
    </div>
  );
};
