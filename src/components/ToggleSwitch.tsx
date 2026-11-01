import React from 'react';

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

  // MIDI Learn Integration
  isMidiLearnActive?: boolean;
  isSelectedForLearn?: boolean;
  mappedCC?: number | null;
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
      {isMidiLearnActive && (mappedCC !== null || isSelectedForLearn) && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-40 flex items-center justify-center whitespace-nowrap pointer-events-auto">
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

      <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-wider mb-0.5 truncate max-w-[50px]">
        {label}
      </span>

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
                  ? 'bg-amber-500 text-black shadow font-black border border-amber-400'
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
