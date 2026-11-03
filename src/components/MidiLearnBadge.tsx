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
  positionClass = 'bottom-[calc(100%-6px)] left-1/2 -translate-x-1/2',
}) => {
  if (!isMidiLearnActive || (mappedCC === null && !isSelectedForLearn)) {
    return null;
  }

  const hasCC = mappedCC !== null && mappedCC !== undefined;
  const ccCodeLabel = hasCC
    ? mappedCC === 2000
      ? 'PB'
      : mappedCC >= 1000
      ? `PC${mappedCC - 1000}`
      : `CC${mappedCC}`
    : '';

  return (
    <div
      className={`absolute ${positionClass.replace(/^absolute\s+/, '')} z-40 flex items-center justify-center pointer-events-auto select-none`}
    >
      {isSelectedForLearn ? (
        <div className="flex flex-col items-center justify-center bg-sky-500 text-white px-1 py-0.5 rounded-md border border-white shadow-[0_0_10px_rgba(56,189,248,0.95)] animate-pulse leading-none min-w-[28px] max-w-[38px]">
          <span className="text-[7px] font-mono font-black tracking-tighter leading-none whitespace-nowrap">
            MAPEAR
          </span>
          {hasCC && (
            <span className="text-[8px] font-mono font-bold text-white leading-none whitespace-nowrap border-t border-white/35 mt-0.5 pt-0.5 w-full text-center">
              {ccCodeLabel}
            </span>
          )}
          {channelLabel && (
            <span
              className={`text-[7px] font-mono font-bold text-sky-100 leading-none whitespace-nowrap w-full text-center ${
                hasCC ? 'mt-0.5' : 'border-t border-white/35 mt-0.5 pt-0.5'
              }`}
            >
              {channelLabel}
            </span>
          )}
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
              className="w-full border-t border-white/35 mt-0.5 pt-0.5 text-white hover:text-red-200 font-black text-[8px] leading-none cursor-pointer flex items-center justify-center"
              title={`Desmapear ${ccCodeLabel}`}
            >
              ✕
            </button>
          )}
        </div>
      ) : hasCC ? (
        <div className="flex flex-col items-center justify-center bg-[#0284c7] hover:bg-[#0369a1] text-white font-mono px-1 py-0.5 rounded-md shadow-md border border-[#38bdf8] leading-none min-w-[26px] max-w-[36px]">
          <span className="text-[8px] font-bold leading-none whitespace-nowrap">
            {ccCodeLabel}
          </span>
          {channelLabel && (
            <span className="text-[6.5px] font-semibold text-sky-100/95 leading-none whitespace-nowrap mt-0.5">
              {channelLabel}
            </span>
          )}
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
            className="w-full border-t border-white/30 mt-0.5 pt-0.5 text-white/95 hover:text-red-200 font-black text-[7.5px] leading-none cursor-pointer flex items-center justify-center"
            title={`Desmapear ${ccCodeLabel}`}
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
};
