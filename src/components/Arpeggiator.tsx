import React, { useState, useEffect } from 'react';
import { synthEngine, ArpConfig } from '../audio/HeraAudioEngine';
import { MidiMappableAction } from '../audio/MidiManager';
import { MidiLearnBadge } from './MidiLearnBadge';

interface ArpeggiatorProps {
  className?: string;
  isOpen?: boolean;
  onArpEnabledChange?: (enabled: boolean) => void;
  isMidiLearnActive?: boolean;
  selectedLearnAction?: MidiMappableAction | null;
  mappedCCArpToggle?: number | null;
  mappedCCArpHold?: number | null;
  channelLabel?: string;
  onSelectActionForLearn?: (action: MidiMappableAction) => void;
  onUnmapAction?: (action: MidiMappableAction) => void;
  onRegisterArpActions?: (handlers: {
    toggleArp: () => void;
    toggleHold: () => void;
    setArpEnabled: (enabled: boolean) => void;
    setHoldEnabled: (hold: boolean) => void;
  }) => void;
}

export const Arpeggiator: React.FC<ArpeggiatorProps> = ({
  className = '',
  isOpen = false,
  onArpEnabledChange,
  isMidiLearnActive = false,
  selectedLearnAction = null,
  mappedCCArpToggle = null,
  mappedCCArpHold = null,
  channelLabel,
  onSelectActionForLearn,
  onUnmapAction,
  onRegisterArpActions,
}) => {
  const [config, setConfig] = useState<ArpConfig>(() => synthEngine.getArpConfig());

  // Sync state changes with the central audio engine
  const updateConfig = (changes: Partial<ArpConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...changes };
      synthEngine.setArpConfig(next);
      if (changes.enabled !== undefined) {
        onArpEnabledChange?.(next.enabled);
      }
      return next;
    });
  };

  const toggleEnabled = () => {
    setConfig((prev) => {
      const next = { ...prev, enabled: !prev.enabled };
      synthEngine.setArpConfig(next);
      onArpEnabledChange?.(next.enabled);
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

  const setArpEnabled = (enabled: boolean) => {
    setConfig((prev) => {
      if (prev.enabled === enabled) return prev;
      const next = { ...prev, enabled };
      synthEngine.setArpConfig(next);
      onArpEnabledChange?.(next.enabled);
      return next;
    });
  };

  const setHoldEnabled = (hold: boolean) => {
    setConfig((prev) => {
      if (prev.hold === hold) return prev;
      const next = { ...prev, hold };
      synthEngine.setArpConfig(next);
      return next;
    });
  };

  useEffect(() => {
    onRegisterArpActions?.({
      toggleArp: toggleEnabled,
      toggleHold: toggleHold,
      setArpEnabled,
      setHoldEnabled,
    });
  }, [onRegisterArpActions]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={`bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs shadow-inner transition-all animate-in fade-in slide-in-from-top-1 duration-150 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-3 text-[9.5px] font-mono">
        {/* Main Arp ON/OFF Toggle (Mappable via MIDI) */}
        <div className="relative flex flex-col items-center">
          <MidiLearnBadge
            isMidiLearnActive={isMidiLearnActive}
            isSelectedForLearn={selectedLearnAction === 'arpToggle'}
            mappedCC={mappedCCArpToggle}
            channelLabel={channelLabel}
            onUnmap={() => onUnmapAction?.('arpToggle')}
            positionClass="-top-4 left-1/2 -translate-x-1/2"
          />
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
        <div className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-400">
          <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-bold">
            {config.mode}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-bold">
            {config.range} {config.range === 1 ? 'OCT' : 'OCTS'}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-amber-400 font-bold">
            {config.bpm} BPM
          </span>
        </div>

        {/* Mode */}
        <div className="flex items-center gap-1 border-l border-zinc-800 pl-3">
          <span className="text-zinc-500 uppercase font-bold">Modo:</span>
          {(['UP', 'DOWN', 'U/D', 'RND'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => updateConfig({ mode: m })}
              className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
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
              className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                config.range === r
                  ? 'bg-amber-400 text-black shadow-sm'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {r}x
            </button>
          ))}
        </div>

        {/* Rate Division */}
        <div className="flex items-center gap-1 border-l border-zinc-800 pl-3">
          <span className="text-zinc-500 uppercase font-bold">Div:</span>
          {(['1/8', '1/16', '1/16T'] as const).map((div) => (
            <button
              key={div}
              type="button"
              onClick={() => updateConfig({ rateDivision: div })}
              className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
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
          <MidiLearnBadge
            isMidiLearnActive={isMidiLearnActive}
            isSelectedForLearn={selectedLearnAction === 'arpHold'}
            mappedCC={mappedCCArpHold}
            channelLabel={channelLabel}
            onUnmap={() => onUnmapAction?.('arpHold')}
            positionClass="-top-4 left-1/2 -translate-x-1/2"
          />
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
            className={`px-2.5 py-0.5 rounded font-bold cursor-pointer transition-shadow border ${
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
            className="w-20 sm:w-24 accent-amber-400 cursor-pointer"
          />
          <span className="font-mono text-[10px] text-amber-400 font-bold w-7">
            {config.bpm}
          </span>
        </div>
      </div>
    </div>
  );
};

