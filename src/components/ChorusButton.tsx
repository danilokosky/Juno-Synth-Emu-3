import React from 'react';
import { MidiLearnBadge } from './MidiLearnBadge';

interface ChorusButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;

  // MIDI Learn Integration
  isMidiLearnActive?: boolean;
  isSelectedForLearn?: boolean;
  mappedCC?: number | null;
  channelLabel?: string;
  onSelectForLearn?: () => void;
  onUnmap?: () => void;
}

export const ChorusButton: React.FC<ChorusButtonProps> = ({
  label,
  active,
  onClick,
  className = '',
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
      className="relative flex flex-col items-center"
    >
      {/* Floating MIDI Learn Badge (position: absolute -> zero layout shift!) */}
      <MidiLearnBadge
        isMidiLearnActive={isMidiLearnActive}
        isSelectedForLearn={isSelectedForLearn}
        mappedCC={mappedCC}
        channelLabel={channelLabel}
        onUnmap={onUnmap}
        positionClass="bottom-[calc(100%+2px)] left-1/2 -translate-x-1/2"
      />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (isMidiLearnActive) {
            onSelectForLearn?.();
          } else {
            onClick();
          }
        }}
        title={
          isMidiLearnActive
            ? `Clique para mapear Chorus ${label} via MIDI`
            : `Chorus ${label}`
        }
        className={`relative group flex flex-col items-center justify-between w-10 h-16 p-1.5 rounded bg-gradient-to-b from-zinc-800 to-zinc-900 border shadow-md transition-shadow active:scale-95 cursor-pointer select-none ${
          isSelectedForLearn
            ? 'ring-2 ring-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.65)] border-sky-400 bg-sky-500/15'
            : isMidiLearnActive
            ? 'ring-1 ring-sky-400/25 hover:ring-sky-400/70 border-zinc-700'
            : active
            ? 'border-amber-500 shadow-amber-500/20'
            : 'border-zinc-700 hover:border-zinc-500'
        } ${className}`}
      >
        {/* Square LED indicator lens */}
        <div
          className={`w-3.5 h-3.5 rounded-sm border transition-all duration-150 ${
            active
              ? 'bg-amber-400 border-amber-300 shadow-[0_0_8px_#f59e0b]'
              : 'bg-zinc-950 border-zinc-800'
          }`}
        />

        {/* Button label Roman numeral */}
        <div className="font-serif font-black text-sm text-zinc-100 tracking-wider">
          {label}
        </div>

        {/* Tactile push bevel line */}
        <div className="w-full h-1 bg-zinc-950/40 rounded-full" />
      </button>
    </div>
  );
};
