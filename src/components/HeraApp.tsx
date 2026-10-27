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
  HelpCircle
} from 'lucide-react';

import { AndroidMidiModal } from './AndroidMidiModal';
import { Smartphone } from 'lucide-react';

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

  return (
    <div
      onClick={startAudioOnInteraction}
      className="min-h-screen bg-stone-950 text-zinc-100 flex flex-col justify-between"
    >
      {/* Outer Synthetic Chassis with Walnut Wood Cheeks */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto my-0 sm:my-3 px-1 sm:px-3">
        <div className="relative rounded-lg shadow-2xl border-4 border-stone-800 bg-zinc-900 flex flex-col overflow-hidden">
          {/* Wood Cheeks Simulation (Left & Right Borders) */}
          <div className="hidden lg:block absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-amber-950 via-amber-900 to-amber-950 border-r border-amber-900/60 z-30" />
          <div className="hidden lg:block absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-l from-amber-950 via-amber-900 to-amber-950 border-l border-amber-900/60 z-30" />

          {/* Top Roland Header Bar */}
          <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 px-4 py-2 border-b-2 border-zinc-700 flex flex-wrap items-center justify-between gap-3">
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
                      handleParamChange('VCADepth', next ? 0 : masterVolume);
                    }}
                    className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    {isMuted || params.VCADepth === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : params.VCADepth}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setIsMuted(false);
                      setMasterVolume(val);
                      handleParamChange('VCADepth', val);
                    }}
                    className="w-16 accent-amber-500 cursor-pointer"
                    title="Master VCA Volume"
                  />
                </div>

                {/* Android Native C++ & MIDI Mapping Button */}
                <button
                  type="button"
                  onClick={() => setShowAndroidModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 rounded text-xs font-mono font-bold cursor-pointer transition-colors shadow-sm"
                  title="Open Android Native C++ & MIDI Mapping settings"
                >
                  <Smartphone size={13} />
                  <span>Android NDK & MIDI</span>
                </button>

                {/* Help button */}
                <button
                  type="button"
                  onClick={() => setShowHelp(true)}
                  className="p-1 text-zinc-400 hover:text-zinc-200 rounded cursor-pointer"
                  title="Keyboard shortcuts & manual"
                >
                  <HelpCircle size={15} />
                </button>
              </div>
            </div>
          </div>

          {/* Juno Synthetic Control Panel (Sliders & Sections) */}
          <div className="bg-gradient-to-b from-[#1b1c20] to-[#121316] p-2 sm:p-4 border-b border-zinc-800 overflow-x-auto">
            <div className="flex flex-nowrap items-stretch gap-2 sm:gap-3 min-w-[940px]">
              {/* SECTION: LFO */}
              <div className="flex-1 bg-zinc-950/70 border-t-4 border-t-amber-500 border border-zinc-800 rounded p-2 flex flex-col justify-between shadow-md">
                <div className="text-[11px] font-black font-mono tracking-widest text-amber-400 uppercase text-center pb-1 border-b border-zinc-800/80">
                  LFO
                </div>
                <div className="flex items-center justify-around gap-2 my-2">
                  <Slider
                    label="Rate"
                    value={params.LFORate}
                    onChange={(v) => handleParamChange('LFORate', v)}
                    defaultValue={0.6}
                    color="amber"
                  />
                  <Slider
                    label="Delay"
                    value={params.LFODelay}
                    onChange={(v) => handleParamChange('LFODelay', v)}
                    defaultValue={0.0}
                    color="amber"
                  />
                </div>
                {/* Manual LFO Trigger button (iconic Juno button!) */}
                <div className="pt-1 border-t border-zinc-800/80 flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => synthEngine.triggerManualLfo()}
                    className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 active:bg-amber-600 active:text-black rounded text-[9px] font-mono font-bold text-zinc-300 border border-zinc-700 cursor-pointer transition-colors"
                  >
                    MAN TRIG
                  </button>
                </div>
              </div>

              {/* SECTION: DCO */}
              <div className="flex-[3.5] bg-zinc-950/70 border-t-4 border-t-red-500 border border-zinc-800 rounded p-2 flex flex-col justify-between shadow-md">
                <div className="text-[11px] font-black font-mono tracking-widest text-red-400 uppercase text-center pb-1 border-b border-zinc-800/80">
                  DCO (Digitally Controlled Oscillator)
                </div>
                <div className="flex items-center justify-between gap-1 sm:gap-2 my-2">
                  {/* Selectors Column */}
                  <div className="flex flex-col gap-1.5 pr-1 border-r border-zinc-800/80">
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
                  />
                  <Slider
                    label="PWM"
                    value={params.DCOPWMDepth}
                    onChange={(v) => handleParamChange('DCOPWMDepth', v)}
                    defaultValue={0}
                    color="red"
                  />
                  <Slider
                    label="Pulse"
                    value={params.DCOPulseLevel}
                    onChange={(v) => handleParamChange('DCOPulseLevel', v)}
                    defaultValue={0}
                    color="red"
                  />
                  <Slider
                    label="Saw"
                    value={params.DCOSawLevel}
                    onChange={(v) => handleParamChange('DCOSawLevel', v)}
                    defaultValue={1.0}
                    color="red"
                  />
                  <Slider
                    label="Sub"
                    value={params.DCOSubLevel}
                    onChange={(v) => handleParamChange('DCOSubLevel', v)}
                    defaultValue={0}
                    color="red"
                  />
                  <Slider
                    label="Noise"
                    value={params.DCONoiseLevel}
                    onChange={(v) => handleParamChange('DCONoiseLevel', v)}
                    defaultValue={0}
                    color="red"
                  />
                </div>
                <div className="text-[8px] font-mono text-zinc-500 text-center tracking-wider pt-0.5 border-t border-zinc-800/80">
                  POLYBLEP ANALOG OSCILLATOR WAVEFORMS
                </div>
              </div>

              {/* SECTION: HPF */}
              <div className="flex-[0.8] bg-zinc-950/70 border-t-4 border-t-cyan-500 border border-zinc-800 rounded p-2 flex flex-col justify-between shadow-md">
                <div className="text-[11px] font-black font-mono tracking-widest text-cyan-400 uppercase text-center pb-1 border-b border-zinc-800/80">
                  HPF
                </div>
                <div className="flex items-center justify-center my-2">
                  <Slider
                    label="Freq"
                    value={params.HPF}
                    onChange={(v) => handleParamChange('HPF', v)}
                    defaultValue={0}
                    color="cyan"
                    formatValue={(v) => (v < 0.05 ? '0' : (v * 3).toFixed(0))}
                  />
                </div>
                <div className="text-[8px] font-mono text-zinc-500 text-center tracking-wider pt-0.5 border-t border-zinc-800/80">
                  4-WAY SWITCH
                </div>
              </div>

              {/* SECTION: VCF */}
              <div className="flex-[3] bg-zinc-950/70 border-t-4 border-t-cyan-400 border border-zinc-800 rounded p-2 flex flex-col justify-between shadow-md">
                <div className="text-[11px] font-black font-mono tracking-widest text-cyan-300 uppercase text-center pb-1 border-b border-zinc-800/80">
                  VCF (Voltage Controlled Filter)
                </div>
                <div className="flex items-center justify-around gap-1 sm:gap-2 my-2">
                  <Slider
                    label="Freq"
                    value={params.VCFCutoff}
                    onChange={(v) => handleParamChange('VCFCutoff', v)}
                    defaultValue={0.5}
                    color="cyan"
                  />
                  <Slider
                    label="Res"
                    value={params.VCFResonance}
                    onChange={(v) => handleParamChange('VCFResonance', v)}
                    defaultValue={0}
                    color="cyan"
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
                  />
                  <Slider
                    label="LFO"
                    value={params.VCFLFO}
                    onChange={(v) => handleParamChange('VCFLFO', v)}
                    defaultValue={0}
                    color="cyan"
                  />
                  <Slider
                    label="Kybd"
                    value={params.VCFKey}
                    onChange={(v) => handleParamChange('VCFKey', v)}
                    defaultValue={0}
                    color="cyan"
                  />
                  <Slider
                    label="Bend"
                    value={params.VCFBendDepth}
                    onChange={(v) => handleParamChange('VCFBendDepth', v)}
                    defaultValue={0}
                    color="cyan"
                  />
                </div>
                <div className="text-[8px] font-mono text-zinc-500 text-center tracking-wider pt-0.5 border-t border-zinc-800/80">
                  24dB/OCT CASCADED RESONANT OTA
                </div>
              </div>

              {/* SECTION: VCA */}
              <div className="flex-1 bg-zinc-950/70 border-t-4 border-t-amber-500 border border-zinc-800 rounded p-2 flex flex-col justify-between shadow-md">
                <div className="text-[11px] font-black font-mono tracking-widest text-amber-400 uppercase text-center pb-1 border-b border-zinc-800/80">
                  VCA
                </div>
                <div className="flex items-center justify-around gap-2 my-2">
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
                  />
                </div>
                <div className="text-[8px] font-mono text-zinc-500 text-center tracking-wider pt-0.5 border-t border-zinc-800/80">
                  AMP CONTROL
                </div>
              </div>

              {/* SECTION: ENV */}
              <div className="flex-[2] bg-zinc-950/70 border-t-4 border-t-amber-400 border border-zinc-800 rounded p-2 flex flex-col justify-between shadow-md">
                <div className="text-[11px] font-black font-mono tracking-widest text-amber-300 uppercase text-center pb-1 border-b border-zinc-800/80">
                  ENV (Envelope Generator)
                </div>
                <div className="flex items-center justify-around gap-1 sm:gap-2 my-2">
                  <Slider
                    label="A"
                    value={params.ENVAttack}
                    onChange={(v) => handleParamChange('ENVAttack', v)}
                    defaultValue={0}
                    color="amber"
                  />
                  <Slider
                    label="D"
                    value={params.ENVDecay}
                    onChange={(v) => handleParamChange('ENVDecay', v)}
                    defaultValue={0}
                    color="amber"
                  />
                  <Slider
                    label="S"
                    value={params.ENVSustain}
                    onChange={(v) => handleParamChange('ENVSustain', v)}
                    defaultValue={1.0}
                    color="amber"
                  />
                  <Slider
                    label="R"
                    value={params.ENVRelease}
                    onChange={(v) => handleParamChange('ENVRelease', v)}
                    defaultValue={0}
                    color="amber"
                  />
                </div>
                <div className="text-[8px] font-mono text-zinc-500 text-center tracking-wider pt-0.5 border-t border-zinc-800/80">
                  ANALOG EXPONENTIAL ADSR
                </div>
              </div>

              {/* SECTION: CHORUS */}
              <div className="flex-1 bg-zinc-950/70 border-t-4 border-t-rose-500 border border-zinc-800 rounded p-2 flex flex-col justify-between shadow-md">
                <div className="text-[11px] font-black font-mono tracking-widest text-rose-400 uppercase text-center pb-1 border-b border-zinc-800/80">
                  CHORUS
                </div>
                <div className="flex items-center justify-center gap-2 my-2">
                  <ChorusButton
                    label="I"
                    active={params.ChorusI > 0.5}
                    onClick={() => handleChorusToggle('ChorusI')}
                  />
                  <ChorusButton
                    label="II"
                    active={params.ChorusII > 0.5}
                    onClick={() => handleChorusToggle('ChorusII')}
                  />
                </div>
                <div className="text-[8px] font-mono text-zinc-500 text-center tracking-wider pt-0.5 border-t border-zinc-800/80">
                  {params.ChorusI && params.ChorusII
                    ? 'MODE I+II (FAST)'
                    : params.ChorusI
                    ? 'MODE I (LUSH)'
                    : params.ChorusII
                    ? 'MODE II (DEEP)'
                    : 'OFF'}
                </div>
              </div>
            </div>
          </div>

          {/* Middle Utility Section: Preset Manager + Arpeggiator */}
          <div className="p-3 bg-zinc-950 border-b border-zinc-800 flex flex-col gap-2">
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
                Hera Juno Synthesizer Guide
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
                <h4 className="font-bold text-zinc-100 mb-1">Computer Keyboard Shortcuts</h4>
                <div className="bg-zinc-950 p-2.5 rounded font-mono text-[11px] grid grid-cols-2 gap-2 border border-zinc-800">
                  <div>
                    <span className="text-amber-400 font-bold">Lower Octave:</span>
                    <p className="text-zinc-400">Z, S, X, D, C, V, G, B, H, N, J, M</p>
                  </div>
                  <div>
                    <span className="text-amber-400 font-bold">Upper Octave:</span>
                    <p className="text-zinc-400">Q, 2, W, 3, E, R, 5, T, 6, Y, 7, U, I</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-zinc-100 mb-1">Roland Juno Chorus</h4>
                <p className="text-zinc-400 leading-relaxed">
                  Press <strong>Chorus I</strong> for gentle stereo shimmer (0.513 Hz LFO),{' '}
                  <strong>Chorus II</strong> for deeper, richer wobble (0.863 Hz LFO), or{' '}
                  <strong>both I & II</strong> simultaneously for the legendary Juno fast vibrato / rotary Leslie swirl (9.75 Hz)!
                </p>
              </div>

              <div>
                <h4 className="font-bold text-zinc-100 mb-1">Web MIDI Support</h4>
                <p className="text-zinc-400 leading-relaxed">
                  Plug in any USB or Bluetooth MIDI keyboard controller. Hera detects it automatically with full support for Note On/Off, Pitch Bend Wheel, Modulation Wheel, Cutoff (CC 74), and Resonance (CC 71).
                </p>
              </div>

              <div>
                <h4 className="font-bold text-zinc-100 mb-1">Preset Management</h4>
                <p className="text-zinc-400 leading-relaxed">
                  Includes all 56 authentic Roland Juno-60 factory presets (Presets 000 - 055). You can customize any parameter, save your own custom presets to browser storage, and export/import XML preset files compatible with the Hera engine.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold rounded cursor-pointer text-xs"
              >
                Close
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

