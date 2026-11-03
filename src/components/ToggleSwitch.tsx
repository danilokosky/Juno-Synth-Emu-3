import React from 'react';
import { MidiLearnBadge } from './MidiLearnBadge';

interface SwitchOption {
  label: string;
  value: number;
}

interface ToggleSwitchProps {
  label: string;
  options: SwitchOption[];
  value: number;
  onChange: (val: number) => void;
  className?: string;
  orientation?: 'vertical' | 'horizontal';
  activeColorClass?: string;
  hideLabel?: boolean;

  // MIDI Learn Integration
  isMidiLearnActive?: boolean;
  isSelectedForLearn?: boolean;
  mappedCC?: number | null;
  channelLabel?: string;
  onSelectForLearn?: () => void;
  onUnmap?: () => void;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  label,
  options,
  value,
  onChange,
  className = '',
  orientation = 'vertical',
  activeColorClass = 'bg-amber-500 text-black shadow font-black border border-amber-400',
  hideLabel = false,
  isMidiLearnActive = false,
  isSelectedForLearn = false,
  mappedCC = null,
  channelLabel,
  onSelectForLearn,
  onUnmap,
}) => {
  return (
    <div
      onClick={(e) => {
        if (isMidiLearnActive) {
          e.stopPropagation();
          onSelectForLearn?.();
        }
      }}
      title={
        isMidiLearnActive
          ? `Clique em qualquer parte de "${label}" para mapear via MIDI`
          : label
      }
      className={`relative flex flex-col items-center select-none text-center p-0.5 rounded transition-shadow duration-150 ${
        isSelectedForLearn
          ? 'ring-2 ring-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.65)] bg-sky-500/15 cursor-pointer'
          : isMidiLearnActive
          ? 'ring-1 ring-sky-400/25 hover:ring-sky-400/70 hover:bg-sky-500/10 cursor-pointer'
          : ''
      } ${className}`}
    >
      {/* Floating MIDI Learn Badge (position: absolute -> zero layout shift!) */}
      <MidiLearnBadge
        isMidiLearnActive={isMidiLearnActive}
        isSelectedForLearn={isSelectedForLearn}
        mappedCC={mappedCC}
        channelLabel={channelLabel}
        onUnmap={onUnmap}
        positionClass="bottom-[calc(100%-4px)] left-1/2 -translate-x-1/2"
      />

      {!hideLabel && (
        <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-wider mb-0.5 truncate max-w-[50px]">
          {label}
        </span>
      )}

      <div
        className={`flex ${
          orientation === 'vertical' ? 'flex-col gap-1' : 'flex-row gap-0.5'
        } bg-zinc-950 p-0.5 rounded border border-zinc-800 shadow-inner`}
      >
        {options.map((opt) => {
          const isSelected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isMidiLearnActive) {
                  onSelectForLearn?.();
                } else {
                  onChange(opt.value);
                }
              }}
              className={`px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded transition-all duration-75 cursor-pointer ${
                isSelected
                  ? activeColorClass
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
