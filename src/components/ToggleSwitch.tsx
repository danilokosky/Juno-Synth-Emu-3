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
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  label,
  options,
  value,
  onChange,
  className = '',
  orientation = 'vertical',
}) => {
  return (
    <div className={`flex flex-col items-center select-none text-center ${className}`}>
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
                onChange(opt.value);
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
