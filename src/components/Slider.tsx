import React, { useRef, useState, useCallback, useEffect } from 'react';

interface SliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  bipolar?: boolean;
  color?: 'amber' | 'cyan' | 'red' | 'default';
  formatValue?: (val: number) => string;
  onChange: (val: number) => void;
  className?: string;
}

export const Slider: React.FC<SliderProps> = ({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  defaultValue = 0,
  bipolar = false,
  color = 'default',
  formatValue,
  onChange,
  className = '',
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Normalize value to 0..1 for rendering height
  const range = max - min;
  const normalizedValue = Math.max(0, Math.min(1, (value - min) / range));

  const updateFromPointer = useCallback(
    (clientY: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const height = rect.height;
      // Inverted: bottom is min, top is max
      const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / height));
      let newVal = min + ratio * range;
      if (step > 0) {
        newVal = Math.round(newVal / step) * step;
      }
      newVal = Math.max(min, Math.min(max, newVal));
      onChange(Number(newVal.toFixed(4)));
    },
    [min, max, range, step, onChange]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    setShowTooltip(true);
    updateFromPointer(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    updateFromPointer(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      setShowTooltip(false);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -Math.sign(e.deltaY) * (step || 0.05);
    const newVal = Math.max(min, Math.min(max, value + delta));
    onChange(Number(newVal.toFixed(4)));
  };

  const handleDoubleClick = () => {
    onChange(defaultValue);
  };

  const displayString = formatValue
    ? formatValue(value)
    : (value * (max === 1 && min === 0 ? 10 : 1)).toFixed(1);

  // Cap indicator color based on section
  const capColorClass =
    color === 'red'
      ? 'from-red-600 to-rose-700 border-red-500'
      : color === 'amber'
      ? 'from-amber-600 to-yellow-700 border-amber-500'
      : color === 'cyan'
      ? 'from-cyan-600 to-sky-700 border-cyan-500'
      : 'from-zinc-200 to-zinc-400 border-zinc-100';

  return (
    <div
      className={`flex flex-col items-center select-none text-center ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => !isDragging && setShowTooltip(false)}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      title={`${label}: ${displayString} (Double-click to reset)`}
    >
      {/* Label */}
      <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider mb-1 truncate max-w-[48px]">
        {label}
      </span>

      {/* Fader Track & Scale */}
      <div className="relative flex items-center justify-center w-8 h-28 my-1">
        {/* Tick scale marks on left and right */}
        <div className="absolute left-0 top-1 bottom-1 flex flex-col justify-between items-end pr-1 text-[7px] font-mono text-zinc-500 pointer-events-none">
          <span>10</span>
          <span>5</span>
          <span>0</span>
        </div>

        {/* Vertical Groove Slot */}
        <div
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative w-2 h-full bg-zinc-950 rounded-full border border-zinc-800 shadow-inner cursor-pointer"
        >
          {/* Center line for bipolar */}
          {bipolar && (
            <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-zinc-600 -translate-y-1/2 pointer-events-none" />
          )}

          {/* Slider Cap */}
          <div
            className="absolute left-1/2 -translate-x-1/2 w-6 h-6 -translate-y-1/2 pointer-events-none transition-transform duration-75"
            style={{
              bottom: `calc(${normalizedValue * 100}% - 12px)`,
            }}
          >
            {/* Ribbed Juno Fader Knob */}
            <div
              className={`w-full h-full rounded shadow-md border bg-gradient-to-b ${capColorClass} flex items-center justify-center`}
            >
              {/* Center Line on knob cap */}
              <div className="w-4 h-[2px] bg-zinc-950 shadow-sm rounded-full" />
            </div>
          </div>
        </div>

        {/* Tick scale marks right side */}
        <div className="absolute right-0 top-1 bottom-1 flex flex-col justify-between items-start pl-1 text-[7px] font-mono text-zinc-500 pointer-events-none">
          <div className="w-1 h-[1px] bg-zinc-600" />
          <div className="w-1.5 h-[1px] bg-zinc-500" />
          <div className="w-1 h-[1px] bg-zinc-600" />
        </div>
      </div>

      {/* Numerical Readout */}
      <div className="mt-0.5 text-[9px] font-mono font-medium text-amber-400 bg-zinc-900/90 border border-zinc-800/80 rounded px-1 min-w-[28px] shadow-inner">
        {displayString}
      </div>
    </div>
  );
};
