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
      {isMidiLearnActive && (mappedCC !== null || isSelectedForLearn) && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-40 flex items-center justify-center whitespace-nowrap pointer-events-auto">
          {mappedCC !== null && mappedCC !== undefined ? (
            <div
              className={`inline-flex items-center gap-0.5 text-white text-[7.5px] leading-none font-mono font-bold px-1.5 py-0.5 rounded-full shadow-md border select-none ${
                isSelectedForLearn
                  ? 'bg-sky-500 border-white shadow-[0_0_10px_rgba(56,189,248,0.9)] animate-pulse'
                  : 'bg-[#0284c7] hover:bg-[#0369a1] border-[#38bdf8]'
              }`}
            >
              <span>CC{mappedCC}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnmap?.();
                }}
                className="text-white/90 hover:text-red-200 font-black text-[8px] leading-none cursor-pointer pl-0.5"
                title={`Desmapear CC ${mappedCC}`}
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="inline-flex items-center bg-[#0284c7] text-white text-[7.5px] leading-none font-mono font-bold px-1.5 py-0.5 rounded-full border border-[#38bdf8] shadow-[0_0_10px_rgba(56,189,248,0.85)] animate-pulse select-none pointer-events-none">
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
