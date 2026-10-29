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

  // MIDI Learn Integration
  isMidiLearnActive?: boolean;
  isSelectedForLearn?: boolean;
  mappedCC?: number | null;
  onSelectForLearn?: () => void;
  onUnmap?: () => void;
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
  isMidiLearnActive = false,
  isSelectedForLearn = false,
  mappedCC = null,
  onSelectForLearn,
  onUnmap,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const faderAreaRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
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
      if (height <= 0) return;

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

  // Native non-passive touch listeners on the fader area:
  // Calling e.preventDefault() here unequivocally forbids the Android / Mobile browser
  // from scrolling the page when the user touches and drags the fader!
  useEffect(() => {
    const el = faderAreaRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (isMidiLearnActive) {
        e.preventDefault();
        e.stopPropagation();
        onSelectForLearn?.();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const touch = e.touches[0];
      if (touch) {
        setIsDragging(true);
        setShowTooltip(true);
        updateFromPointer(touch.clientY);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isMidiLearnActive) return;
      e.preventDefault();
      e.stopPropagation();
      const touch = e.touches[0];
      if (touch) {
        updateFromPointer(touch.clientY);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (isMidiLearnActive) return;
      e.preventDefault();
      setIsDragging(false);
      setShowTooltip(false);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });
    el.addEventListener('touchcancel', onTouchEnd, { passive: false });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isMidiLearnActive, updateFromPointer, onSelectForLearn]);

  // Window-level pointer listeners while dragging for desktop/mouse response
  useEffect(() => {
    if (!isDragging) return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
      e.preventDefault();
      updateFromPointer(e.clientY);
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
      activePointerIdRef.current = null;
      setIsDragging(false);
      setShowTooltip(false);
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [isDragging, updateFromPointer]);

  // Touch and pointer down handler
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // In MIDI learn mode: select this control for mapping instead of moving the fader
    if (isMidiLearnActive) {
      onSelectForLearn?.();
      return;
    }

    activePointerIdRef.current = e.pointerId;

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Fallback gracefully if pointer capture is not supported
    }

    setIsDragging(true);
    setShowTooltip(true);
    updateFromPointer(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
    activePointerIdRef.current = null;
    if (isDragging) {
      setIsDragging(false);
      setShowTooltip(false);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (isMidiLearnActive) return;
    e.preventDefault();
    const delta = -Math.sign(e.deltaY) * (step || 0.05);
    const newVal = Math.max(min, Math.min(max, value + delta));
    onChange(Number(newVal.toFixed(4)));
  };

  const handleDoubleClick = () => {
    if (!isMidiLearnActive) {
      onChange(defaultValue);
    }
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
      ref={containerRef}
      className={`relative flex flex-col items-center select-none text-center p-0.5 rounded transition-all duration-150 ${
        isSelectedForLearn
          ? 'ring-2 ring-sky-400 ring-offset-1 ring-offset-zinc-950 shadow-[0_0_14px_rgba(56,189,248,0.55)] bg-sky-500/10'
          : isMidiLearnActive
          ? 'hover:bg-sky-500/5 hover:ring-1 hover:ring-sky-400/30 cursor-pointer'
          : ''
      } ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => !isDragging && setShowTooltip(false)}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onClick={(e) => {
        if (isMidiLearnActive) {
          e.stopPropagation();
          onSelectForLearn?.();
        }
      }}
      title={`${label}: ${displayString} (Double-click to reset)`}
    >
      {/* MIDI Learn Badge / Etiqueta Cápsula estilo MoogSynth */}
      {isMidiLearnActive && (
        <div className="mb-1 flex items-center justify-center min-h-[18px] z-20">
          {mappedCC !== null && mappedCC !== undefined ? (
            <div className="inline-flex items-center gap-1.5 bg-[#0284c7] hover:bg-[#0369a1] text-white text-[9px] font-mono font-bold px-2 py-0.5 rounded-full shadow-md border-2 border-[#38bdf8] animate-in fade-in zoom-in-95 select-none">
              <span className="tracking-wide">CC {mappedCC}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnmap?.();
                }}
                className="text-white/80 hover:text-white font-black text-[10px] leading-none cursor-pointer pl-0.5 hover:scale-125 transition-transform"
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
                  : 'bg-zinc-950/90 hover:bg-[#0284c7]/30 text-sky-400 hover:text-white border border-sky-400/40'
              }`}
            >
              {isSelectedForLearn ? 'AURÉOLA' : '+ LEARN'}
            </button>
          )}
        </div>
      )}

      {/* Parameter Title / Label - Strictly separated from fader travel */}
      <div className="h-5 flex items-center justify-center mb-1 z-10">
        <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-wider truncate max-w-[48px] leading-tight">
          {label}
        </span>
      </div>

      {/* Fader Touch Target Container with vertical clearances so cap never encroaches on title */}
      <div
        ref={faderAreaRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        style={{ touchAction: 'none' }}
        className="relative flex items-center justify-center w-8 sm:w-9 h-26 sm:h-28 px-0.5 py-2 cursor-pointer select-none active:brightness-110 touch-none"
      >
        {/* Tick scale marks left side - strictly z-0 behind the fader cap */}
        <div className="absolute left-0 top-2.5 bottom-2.5 flex flex-col justify-between items-end pr-0.5 text-[7px] font-mono text-zinc-500 pointer-events-none z-0">
          <span>10</span>
          <span>5</span>
          <span>0</span>
        </div>

        {/* Tick scale marks right side - strictly z-0 behind the fader cap */}
        <div className="absolute right-0 top-2.5 bottom-2.5 flex flex-col justify-between items-start pl-0.5 text-[7px] font-mono text-zinc-500 pointer-events-none z-0">
          <div className="w-1.5 h-[1px] bg-zinc-600" />
          <div className="w-2 h-[1px] bg-zinc-500" />
          <div className="w-1.5 h-[1px] bg-zinc-600" />
        </div>

        {/* Vertical Groove Slot */}
        <div
          ref={trackRef}
          className={`relative w-2.5 h-full rounded-full border shadow-inner transition-colors z-10 ${
            isDragging
              ? 'bg-zinc-900 border-amber-500/70 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
              : 'bg-zinc-950 border-zinc-800'
          }`}
        >
          {/* Center line for bipolar */}
          {bipolar && (
            <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-zinc-600 -translate-y-1/2 pointer-events-none z-10" />
          )}

          {/* Slider Cap - layered strictly on top of ticks (z-30) */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 w-6.5 sm:w-7 h-5 sm:h-5.5 pointer-events-none transition-transform duration-75 z-30 ${
              isDragging ? 'scale-105 drop-shadow-[0_2px_10px_rgba(245,158,11,0.6)]' : 'drop-shadow-md'
            }`}
            style={{
              bottom: `calc(3px + ${normalizedValue} * (100% - 24px))`,
            }}
          >
            {/* Ribbed Juno Fader Knob with opaque styling so ticks never show over or through */}
            <div
              className={`w-full h-full rounded-sm shadow-md border bg-gradient-to-b ${capColorClass} flex items-center justify-center ${
                isDragging ? 'border-amber-300 ring-2 ring-amber-400/50' : ''
              }`}
            >
              {/* White Center Line on knob cap */}
              <div className="w-4.5 h-[2px] bg-zinc-950 shadow-sm rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Numerical Readout */}
      <div
        className={`mt-1 text-[9px] font-mono font-medium rounded px-1 min-w-[28px] shadow-inner transition-colors z-10 ${
          isDragging
            ? 'text-amber-300 bg-zinc-950 border border-amber-500'
            : 'text-amber-400 bg-zinc-900/90 border border-zinc-800/80'
        }`}
      >
        {displayString}
      </div>
    </div>
  );
};
