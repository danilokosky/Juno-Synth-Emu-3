import React, { useState } from 'react';
import { Smartphone, Cpu, Radio, Sliders, CheckCircle, Copy, ExternalLink, HelpCircle, Download } from 'lucide-react';
import { DEFAULT_MIDI_CC_MAP } from '../audio/MidiManager';
import { HeraParameters } from '../types/synth';

interface AndroidMidiModalProps {
  isOpen: boolean;
  onClose: () => void;
  midiDevices: Array<{ id: string; name: string; manufacturer: string; state: string }>;
  currentMapping: Record<number, keyof HeraParameters>;
  onMapCC: (cc: number, param: keyof HeraParameters) => void;
}

export const AndroidMidiModal: React.FC<AndroidMidiModalProps> = ({
  isOpen,
  onClose,
  midiDevices,
  currentMapping,
  onMapCC,
}) => {
  const [activeTab, setActiveTab] = useState<'midi' | 'architecture' | 'instructions'>('midi');
  const [selectedParam, setSelectedParam] = useState<keyof HeraParameters>('VCFCutoff');
  const [ccInput, setCcInput] = useState<number>(74);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleAddMapping = () => {
    if (ccInput >= 0 && ccInput <= 127) {
      onMapCC(ccInput, selectedParam);
    }
  };

  const copyAndroidInstructions = () => {
    const text = `# Hera Juno Synthesizer - Android Native Project Setup
1. Open Android Studio (Hedgehog 2023.1.1+ or newer)
2. Select "Open Project" and select the /android folder of this repository.
3. Android Studio will automatically configure the C++ CMake project and Gradle dependencies.
4. Connect an Android device (via USB with USB Debugging enabled).
5. Plug your USB MIDI Keyboard/Controller into your Android phone/tablet using a USB-OTG adapter.
6. Click "Run 'app'" (Shift + F10).
7. The app starts with ultra-low latency native AAudio and auto-binds to your hardware knobs!`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-3">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
              <Smartphone size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-mono text-base font-bold text-zinc-100">
                  Android APK & Mapeamento MIDI
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-600/30 border border-emerald-500/50 text-emerald-300 font-bold">
                  Motor Orgânico Unificado
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                APK standalone com o mesmo som e interface do preview, suporte a MIDI USB e Bluetooth
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 text-lg font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800 bg-zinc-950 text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveTab('midi')}
            className={`flex-1 py-2.5 text-center font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'midi'
                ? 'border-amber-500 text-amber-400 bg-zinc-900/50'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            MIDI Controller & Knobs
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('architecture')}
            className={`flex-1 py-2.5 text-center font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'architecture'
                ? 'border-emerald-500 text-emerald-400 bg-zinc-900/50'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Native C++ Architecture
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('instructions')}
            className={`flex-1 py-2.5 text-center font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'instructions'
                ? 'border-cyan-500 text-cyan-400 bg-zinc-900/50'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Build in Android Studio
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-4 overflow-y-auto flex-1 text-xs space-y-4">
          {activeTab === 'midi' && (
            <div className="space-y-4">
              {/* Connected Hardware Devices */}
              <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold text-zinc-200 flex items-center gap-1.5">
                    <Radio size={14} className="text-emerald-400" />
                    Detected Hardware MIDI Controllers:
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {midiDevices.length} Connected
                  </span>
                </div>
                {midiDevices.length === 0 ? (
                  <p className="text-zinc-500 text-xs italic">
                    No external MIDI devices detected yet. Plug in any USB MIDI controller or keyboard via USB / OTG adapter or Bluetooth MIDI.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {midiDevices.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between bg-zinc-900 px-2 py-1.5 rounded border border-zinc-800"
                      >
                        <span className="font-mono text-emerald-400 font-bold">{d.name}</span>
                        <span className="text-[10px] text-zinc-400">{d.manufacturer}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* MIDI CC Mapping Table */}
              <div>
                <h4 className="font-bold text-zinc-200 font-mono mb-2 flex items-center gap-1.5">
                  <Sliders size={14} className="text-amber-400" />
                  Hardware Knobs, Switches & Faders Mapping (CC Table):
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-52 overflow-y-auto bg-zinc-950 p-2 rounded-lg border border-zinc-800 font-mono text-[11px]">
                  {Object.entries(currentMapping).map(([cc, param]) => (
                    <div
                      key={cc}
                      className="flex items-center justify-between p-1.5 bg-zinc-900 rounded border border-zinc-800/80"
                    >
                      <span className="text-amber-400 font-bold">CC {cc}</span>
                      <span className="text-zinc-300 truncate max-w-[120px]">{param}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom CC Mapping Input */}
              <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 flex flex-wrap items-center gap-2">
                <span className="font-mono text-zinc-300">Map Knob CC:</span>
                <input
                  type="number"
                  min="0"
                  max="127"
                  value={ccInput}
                  onChange={(e) => setCcInput(Number(e.target.value))}
                  className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-amber-400 font-mono font-bold"
                />
                <span className="font-mono text-zinc-300">to Parameter:</span>
                <select
                  value={selectedParam}
                  onChange={(e) => setSelectedParam(e.target.value as keyof HeraParameters)}
                  className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 font-mono text-xs cursor-pointer"
                >
                  <option value="VCFCutoff">VCF Cutoff Frequency</option>
                  <option value="VCFResonance">VCF Resonance</option>
                  <option value="VCFEnv">VCF Envelope Mod</option>
                  <option value="VCFLFO">VCF LFO Mod</option>
                  <option value="VCFKey">VCF Keyboard Track</option>
                  <option value="ENVAttack">ENV Attack</option>
                  <option value="ENVDecay">ENV Decay</option>
                  <option value="ENVSustain">ENV Sustain</option>
                  <option value="ENVRelease">ENV Release</option>
                  <option value="LFORate">LFO Rate</option>
                  <option value="LFODelay">LFO Delay</option>
                  <option value="DCOSawLevel">DCO Saw Level</option>
                  <option value="DCOPulseLevel">DCO Pulse Level</option>
                  <option value="DCOSubLevel">DCO Sub Level</option>
                  <option value="DCONoiseLevel">DCO Noise Level</option>
                  <option value="DCOPWMDepth">DCO PWM Depth</option>
                  <option value="HPF">HPF Cutoff</option>
                  <option value="VCADepth">VCA Master Depth</option>
                  <option value="ChorusI">Chorus I Switch</option>
                  <option value="ChorusII">Chorus II Switch</option>
                </select>
                <button
                  type="button"
                  onClick={handleAddMapping}
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold rounded cursor-pointer transition-colors"
                >
                  Apply Mapping
                </button>
              </div>
            </div>
          )}

          {activeTab === 'architecture' && (
            <div className="space-y-3 font-mono text-xs">
              <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 space-y-2">
                <span className="text-emerald-400 font-bold text-sm">
                  1. Native C++ Core (`/android/app/src/main/cpp/`)
                </span>
                <ul className="text-zinc-400 space-y-1 list-disc pl-4">
                  <li>
                    <strong className="text-zinc-200">HeraEngine.hpp:</strong> Complete 6-voice polyphonic Juno synthesizer in pure C++17 with PolyBLEP anti-aliased oscillators, 4-pole cascaded 24dB resonant lowpass filter with non-linear saturation, HPF, exponential ADSR envelopes, delayable LFO, and dual-BBD stereo chorus.
                  </li>
                  <li>
                    <strong className="text-zinc-200">native-lib.cpp:</strong> Direct JNI bridge and high-performance <code className="text-emerald-300">AAudio</code> callback operating in exclusive low-latency mode (&lt;10ms latency).
                  </li>
                  <li>
                    <strong className="text-zinc-200">CMakeLists.txt:</strong> Standard CMake NDK build script linking `libaaudio` and `liblog`.
                  </li>
                </ul>
              </div>

              <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 space-y-2">
                <span className="text-cyan-400 font-bold text-sm">
                  2. Kotlin & Jetpack Compose (`/android/app/src/main/java/`)
                </span>
                <ul className="text-zinc-400 space-y-1 list-disc pl-4">
                  <li>
                    <strong className="text-zinc-200">MidiControllerManager.kt:</strong> Uses Android's native <code className="text-cyan-300">android.media.midi.MidiManager</code> with automatic device discovery, USB-OTG and Bluetooth LE MIDI support, real-time message dispatch, and dynamic CC-to-parameter mapping.
                  </li>
                  <li>
                    <strong className="text-zinc-200">HeraSynthScreen.kt:</strong> Fully reactive tactile Jetpack Compose UI replicating the Roland Juno-60 chassis with vertical faders, toggle switches, chorus buttons, and multi-touch piano roll.
                  </li>
                  <li>
                    <strong className="text-zinc-200">MainActivity.kt:</strong> Landscape lock, wake-lock to prevent sleep during performance, and automatic audio lifecycle management.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'instructions' && (
            <div className="space-y-4">
              {/* Direct GitHub Release Download Box */}
              <div className="bg-gradient-to-r from-emerald-950/60 to-zinc-900 p-4 rounded-xl border border-emerald-500/40 shadow-lg space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-mono font-bold text-sm">
                    📦 Download Direto do APK no Navegador (GitHub Releases)
                  </span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/40 font-mono">
                    Automático
                  </span>
                </div>
                <p className="text-zinc-300 text-xs leading-relaxed">
                  O GitHub Actions compila o projeto nativo em C++ e publica automaticamente o arquivo <code className="text-amber-400 font-mono">Hera-Juno-Synth-debug.apk</code> na aba <strong>Releases</strong>. Você pode baixar direto no seu celular Android:
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href="https://github.com/danilokosky/Hera_Juno/releases/tag/latest-apk"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs rounded-lg shadow-md cursor-pointer transition-all active:scale-95"
                  >
                    <Download size={14} />
                    <span>Baixar APK (GitHub Releases)</span>
                    <ExternalLink size={12} className="opacity-70" />
                  </a>
                  <a
                    href="https://github.com/danilokosky/Hera_Juno/actions"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs rounded-lg border border-zinc-700 cursor-pointer transition-colors"
                  >
                    <span>Ver Execuções no GitHub Actions</span>
                    <ExternalLink size={12} className="opacity-70" />
                  </a>
                </div>
              </div>

              {/* How it works directly from the browser */}
              <div className="bg-zinc-950 p-3.5 rounded-lg border border-zinc-800 font-mono text-xs text-zinc-300 space-y-2">
                <p className="text-amber-400 font-bold">// Fluxo 100% pelo Navegador:</p>
                <p className="text-zinc-400">1. A cada commit ou quando você clica em <strong>"Run workflow"</strong> na aba Actions do GitHub, a máquina virtual do GitHub compila o código em C++ NDK e Kotlin.</p>
                <p className="text-zinc-400">2. A action gera o release oficial <code className="text-emerald-400">latest-apk</code> com o arquivo <code className="text-emerald-400">Hera-Juno-Synth-debug.apk</code> anexado.</p>
                <p className="text-zinc-400">3. Pelo navegador do seu celular Android, basta abrir o link de Releases, tocar no APK para baixar e instalar diretamente!</p>
              </div>

              <button
                type="button"
                onClick={copyAndroidInstructions}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded font-mono text-xs cursor-pointer border border-zinc-700"
              >
                {copied ? <CheckCircle size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>{copied ? 'Instruções copiadas!' : 'Copiar Instruções'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-zinc-950 p-3 border-t border-zinc-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white font-mono text-xs rounded cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
