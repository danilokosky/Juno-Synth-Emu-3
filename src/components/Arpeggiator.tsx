import React, { useState, useEffect } from 'react';
import { synthEngine, ArpConfig } from '../audio/HeraAudioEngine';
import { MidiMappableAction } from '../audio/MidiManager';
import { SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';

interface ArpeggiatorProps {
  className?: string;
  isMidiLearnActive?: boolean;
  selectedLearnAction?: MidiMappableAction | null;
  mappedCCArpToggle?: number | null;
  mappedCCArpHold?: number | null;
  onSelectActionForLearn?: (action: MidiMappableAction) => void;
  onUnmapAction?: (action: MidiMappableAction) => void;
  onRegisterArpActions?: (handlers: { toggleArp: () => void; toggleHold: () => void }) => void;
}

export const Arpeggiator: React.FC<ArpeggiatorProps> = ({
  className = '',
  isMidiLearnActive = false,
  selectedLearnAction = null,
  mappedCCArpToggle = null,
  mappedCCArpHold = null,
  onSelectActionForLearn,
  onUnmapAction,
  onRegisterArpActions,
}) => {
  const [config, setConfig] = useState<ArpConfig>(() => synthEngine.getArpConfig());
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Sync state changes with the central audio engine
  const updateConfig = (changes: Partial<ArpConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...changes };
      synthEngine.setArpConfig(next);
      return next;
    });
  };

  const toggleEnabled = () => {
    setConfig((prev) => {
      const next = { ...prev, enabled: !prev.enabled };
      synthEngine.setArpConfig(next);
      return next;
    });
  };

  const toggleHold = () => {
    setConfig((prev) => {
      const next = { ...prev, hold: !prev.hold };
      synthEngine.setArpConfig(next);
      return next;
    });
  };

  useEffect(() => {
    onRegisterArpActions?.({
      toggleArp: toggleEnabled,
      toggleHold: toggleHold,
    });
  }, [onRegisterArpActions]);

  return (
    <div
      className={`bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-xs shadow-inner transition-all ${className}`}
    >
      {/* Compact Main Line (always visible, minimal height) */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
        <div className="flex items-center gap-2">
          {/* Main Arp ON/OFF Toggle (Mappable via MIDI) */}
          <div className="relative flex flex-col items-center">
            {isMidiLearnActive && (mappedCCArpToggle !== null || selectedLearnAction === 'arpToggle') && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center justify-center whitespace-nowrap z-30">
                {mappedCCArpToggle !== null && mappedCCArpToggle !== undefined ? (
                  <div
                    className={`inline-flex items-center gap-0.5 text-white text-[7.5px] leading-none font-mono font-bold px-1.5 py-0.5 rounded-full border shadow select-none ${
                      selectedLearnAction === 'arpToggle'
                        ? 'bg-sky-500 border-white shadow-[0_0_10px_rgba(56,189,248,0.9)] animate-pulse'
                        : 'bg-[#0284c7] border-[#38bdf8]'
                    }`}
                  >
                    <span>CC{mappedCCArpToggle}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnmapAction?.('arpToggle');
                      }}
                      className="text-white hover:text-red-200 font-bold text-[8px] leading-none cursor-pointer pl-0.5"
                      title="Desmapear ARP ON/OFF"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="inline-flex items-center bg-[#0284c7] text-white text-[7.5px] leading-none font-mono font-bold px-1.5 py-0.5 rounded-full border border-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.85)] animate-pulse select-none pointer-events-none">
                    MAPEAR
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isMidiLearnActive) {
                  onSelectActionForLearn?.('arpToggle');
                } else {
                  toggleEnabled();
                }
              }}
              className={`px-2.5 py-1 rounded font-mono text-[10px] font-black uppercase tracking-wider transition-shadow cursor-pointer ${
                selectedLearnAction === 'arpToggle'
                  ? 'bg-sky-600/30 text-white border border-sky-400 ring-2 ring-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.65)]'
                  : isMidiLearnActive
                  ? 'bg-zinc-900 text-zinc-200 border border-zinc-700 ring-1 ring-sky-400/25 hover:ring-sky-400/70'
                  : config.enabled
                  ? 'bg-amber-400 text-zinc-950 border border-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.6)] ring-1 ring-amber-400/80'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-700 hover:text-zinc-200 hover:bg-zinc-850'
              }`}
              title={
                isMidiLearnActive
                  ? 'Clique para mapear ARP ON/OFF via MIDI'
                  : 'Ativar/Desativar Arpejador Analógico'
              }
            >
              ARP {config.enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Quick status badges */}
          <div className="flex items-center gap-1 text-[9px] font-mono text-zinc-400">
            <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
              {config.mode}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
              {config.range} {config.range === 1 ? 'OCT' : 'OCTS'}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-amber-400 font-bold">
              {config.bpm} BPM
            </span>
            {config.hold && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                HOLD
              </span>
            )}
          </div>
        </div>

        {/* Expand/Collapse Button */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 px-2 py-0.5 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 hover:text-white border border-zinc-700/80 rounded text-[9.5px] font-mono font-bold cursor-pointer transition-colors shadow-sm"
          title={isExpanded ? 'Recolher opções do arpejador' : 'Expandir opções detalhadas do arpejador'}
        >
          <SlidersHorizontal size={11} className="text-amber-400" />
          <span>{isExpanded ? 'RECOLHER' : 'AJUSTES'}</span>
          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Expanded Options Drawer (Only visible when user requests or expands) */}
      {isExpanded && (
        <div className="mt-2 pt-2 border-t border-zinc-800/90 flex flex-wrap items-center gap-3 text-[9px] font-mono animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Mode */}
          <div className="flex items-center gap-1">
            <span className="text-zinc-500 uppercase font-bold">Modo:</span>
            {(['UP', 'DOWN', 'U/D', 'RND'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => updateConfig({ mode: m })}
                className={`px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                  config.mode === m
                    ? 'bg-amber-400 text-black shadow-sm'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Range (Octaves) */}
          <div className="flex items-center gap-1 border-l border-zinc-800 pl-3">
            <span className="text-zinc-500 uppercase font-bold">Oitavas:</span>
            {[1, 2, 3].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => updateConfig({ range: r })}
                className={`px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                  config.range === r
                    ? 'bg-amber-400 text-black shadow-sm'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {r} Oct
              </button>
            ))}
          </div>

          {/* Rate Division */}
          <div className="flex items-center gap-1 border-l border-zinc-800 pl-3">
            <span className="text-zinc-500 uppercase font-bold">Divisão:</span>
            {(['1/8', '1/16', '1/16T'] as const).map((div) => (
              <button
                key={div}
                type="button"
                onClick={() => updateConfig({ rateDivision: div })}
                className={`px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                  config.rateDivision === div
                    ? 'bg-sky-400 text-black shadow-sm'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {div}
              </button>
            ))}
          </div>

          {/* Hold / Latch Toggle (Mappable via MIDI) */}
          <div className="relative flex items-center gap-1 border-l border-zinc-800 pl-3">
            {isMidiLearnActive && (mappedCCArpHold !== null || selectedLearnAction === 'arpHold') && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center justify-center whitespace-nowrap z-30">
                {mappedCCArpHold !== null && mappedCCArpHold !== undefined ? (
                  <div
                    className={`inline-flex items-center gap-0.5 text-white text-[7.5px] leading-none font-mono font-bold px-1.5 py-0.5 rounded-full border shadow select-none ${
                      selectedLearnAction === 'arpHold'
                        ? 'bg-sky-500 border-white shadow-[0_0_10px_rgba(56,189,248,0.9)] animate-pulse'
                        : 'bg-[#0284c7] border-[#38bdf8]'
                    }`}
                  >
                    <span>CC{mappedCCArpHold}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnmapAction?.('arpHold');
                      }}
                      className="text-white hover:text-red-200 font-bold text-[8px] leading-none cursor-pointer pl-0.5"
                      title="Desmapear ARP HOLD"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="inline-flex items-center bg-[#0284c7] text-white text-[7.5px] leading-none font-mono font-bold px-1.5 py-0.5 rounded-full border border-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.85)] animate-pulse select-none pointer-events-none">
                    MAPEAR
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isMidiLearnActive) {
                  onSelectActionForLearn?.('arpHold');
                } else {
                  toggleHold();
                }
              }}
              className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-shadow border ${
                selectedLearnAction === 'arpHold'
                  ? 'bg-sky-600/30 text-white border-sky-400 ring-2 ring-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.65)]'
                  : isMidiLearnActive
                  ? 'bg-zinc-900 text-zinc-200 border-zinc-700 ring-1 ring-sky-400/25 hover:ring-sky-400/70'
                  : config.hold
                  ? 'bg-amber-400 text-black border-amber-300 shadow-[0_0_6px_rgba(251,191,36,0.5)]'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
              }`}
              title={
                isMidiLearnActive
                  ? 'Clique para mapear HOLD via MIDI'
                  : 'Hold / Latch: mantém o arpejo tocando mesmo após soltar as teclas'
              }
            >
              HOLD {config.hold ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Tempo BPM Slider */}
          <div className="flex items-center gap-1.5 border-l border-zinc-800 pl-3 ml-auto">
            <span className="text-zinc-500 uppercase font-bold">BPM:</span>
            <input
              type="range"
              min={50}
              max={240}
              value={config.bpm}
              onChange={(e) => updateConfig({ bpm: Number(e.target.value) })}
              className="w-16 sm:w-20 accent-amber-400 cursor-pointer"
            />
            <span className="font-mono text-[10px] text-amber-400 font-bold w-7">
              {config.bpm}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
