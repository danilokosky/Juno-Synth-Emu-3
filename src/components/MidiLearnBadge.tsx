import React from 'react';

interface MidiLearnBadgeProps {
  isMidiLearnActive?: boolean;
  isSelectedForLearn?: boolean;
  mappedCC?: number | null;
  channelLabel?: string;
  onUnmap?: () => void;
  positionClass?: string;
  title?: string;
  label?: string;
}

export const MidiLearnBadge: React.FC<MidiLearnBadgeProps> = ({
  isMidiLearnActive = false,
  isSelectedForLearn = false,
  mappedCC = null,
  channelLabel,
  onUnmap,
  positionClass = '-top-2.5 left-1/2 -translate-x-1/2',
}) => {
  if (!isMidiLearnActive || (mappedCC === null && !isSelectedForLearn)) {
    return null;
  }

  const hasCC = mappedCC !== null && mappedCC !== undefined;

  return (
    <div
      className={`absolute ${positionClass.replace(/^absolute\s+/, '')} z-40 flex items-center justify-center pointer-events-auto select-none`}
    >
      {isSelectedForLearn ? (
        <div className="flex flex-col items-center justify-center bg-sky-500 text-white px-1.5 py-0.5 rounded-md border border-white shadow-[0_0_10px_rgba(56,189,248,0.95)] animate-pulse leading-none max-w-[54px]">
          <span className="text-[8.5px] font-mono font-black tracking-tight leading-none whitespace-nowrap">
            MAPEAR
          </span>
          {(hasCC || channelLabel) && (
            <div className="flex items-center justify-center gap-0.5 border-t border-white/35 mt-0.5 pt-0.5 w-full whitespace-nowrap">
              <span className="text-[8px] font-mono font-bold text-sky-50 leading-none">
                {hasCC ? `CC${mappedCC}` : channelLabel}
              </span>
              {hasCC && (
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onUnmap?.();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onUnmap?.();
                  }}
                  className="text-white hover:text-red-200 font-black text-[8.5px] leading-none cursor-pointer pl-0.5"
                  title={`Desmapear CC ${mappedCC}`}
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>
      ) : hasCC ? (
        <div className="inline-flex items-center justify-center gap-0.5 bg-[#0284c7] hover:bg-[#0369a1] text-white text-[8.5px] leading-none font-mono font-bold px-1.5 py-0.5 rounded-md shadow-md border border-[#38bdf8] whitespace-nowrap max-w-[52px]">
          <span>CC{mappedCC}</span>
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onUnmap?.();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onUnmap?.();
            }}
            className="text-white/95 hover:text-red-200 font-black text-[8.5px] leading-none cursor-pointer pl-0.5"
            title={`Desmapear CC ${mappedCC}`}
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
};
