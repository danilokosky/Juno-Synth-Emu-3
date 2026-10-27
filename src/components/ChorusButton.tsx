import React from 'react';

interface ChorusButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;

  // MIDI Learn Integration
  isMidiLearnActive?: boolean;
  isSelectedForLearn?: boolean;
  mappedCC?: number | null;
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
  onSelectForLearn,
  onUnmap,
}) => {
  return (
    <div className="flex flex-col items-center">
      {/* MIDI Learn Badge for Chorus button */}
      {isMidiLearnActive && (
        <div className="mb-1 flex items-center justify-center min-h-[18px]">
          {mappedCC !== null && mappedCC !== undefined ? (
            <div className="flex items-center gap-1 bg-amber-500 text-zinc-950 text-[8px] font-mono font-black px-1 py-0.5 rounded shadow border border-amber-300">
              <span>CC {mappedCC}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnmap?.();
                }}
                className="w-3 h-3 flex items-center justify-center rounded-full bg-red-700 hover:bg-red-800 text-white text-[8px] font-black cursor-pointer leading-none"
                title={`Desmapear CC ${mappedCC}`}
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectForLearn?.();
              }}
              className={`text-[8px] font-mono px-1 py-0.5 rounded border border-dashed cursor-pointer ${
                isSelectedForLearn
                  ? 'bg-amber-500 text-zinc-950 font-bold border-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                  : 'bg-zinc-800/80 text-zinc-400 border-zinc-600'
              }`}
            >
              {isSelectedForLearn ? 'AURA' : '+ LEARN'}
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (isMidiLearnActive) {
            onSelectForLearn?.();
          } else {
            onClick();
          }
        }}
        className={`relative group flex flex-col items-center justify-between w-10 h-16 p-1.5 rounded bg-gradient-to-b from-zinc-800 to-zinc-900 border shadow-md transition-all active:scale-95 cursor-pointer select-none ${
          isSelectedForLearn
            ? 'ring-4 ring-amber-400 ring-offset-2 ring-offset-zinc-950 shadow-[0_0_24px_rgba(251,191,36,0.95)] animate-pulse border-amber-300'
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
