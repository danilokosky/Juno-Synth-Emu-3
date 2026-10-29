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
      {/* MIDI Learn Badge for Chorus button inspirada no cartucho/cápsula MoogSynth */}
      {isMidiLearnActive && (
        <div className="mb-1 flex items-center justify-center min-h-[18px] z-20">
          {mappedCC !== null && mappedCC !== undefined ? (
            <div className="inline-flex items-center gap-1.5 bg-[#0284c7] hover:bg-[#0369a1] text-white text-[8.5px] font-mono font-bold px-2 py-0.5 rounded-full shadow-md border-2 border-[#38bdf8] select-none">
              <span className="tracking-wide">CC {mappedCC}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnmap?.();
                }}
                className="text-white/80 hover:text-white font-black text-[9.5px] leading-none cursor-pointer pl-0.5 hover:scale-125 transition-transform"
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
              className={`rounded-full px-2 py-0.5 text-[8px] font-mono font-bold tracking-wide transition-all cursor-pointer ${
                isSelectedForLearn
                  ? 'bg-[#0284c7] text-white border-2 border-[#38bdf8] shadow-[0_0_10px_rgba(56,189,248,0.7)]'
                  : 'bg-zinc-950/90 text-sky-400 hover:text-white border border-sky-400/40 hover:bg-[#0284c7]/30'
              }`}
            >
              {isSelectedForLearn ? 'AURÉOLA' : '+ LEARN'}
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
            ? 'ring-2 ring-sky-400 ring-offset-1 ring-offset-zinc-950 shadow-[0_0_14px_rgba(56,189,248,0.55)] border-sky-400 bg-sky-500/10'
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
