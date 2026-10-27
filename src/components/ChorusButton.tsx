import React from 'react';

interface ChorusButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}

export const ChorusButton: React.FC<ChorusButtonProps> = ({
  label,
  active,
  onClick,
  className = '',
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative group flex flex-col items-center justify-between w-10 h-16 p-1.5 rounded bg-gradient-to-b from-zinc-800 to-zinc-900 border border-zinc-700 shadow-md transition-all active:scale-95 cursor-pointer select-none ${
        active ? 'border-amber-500 shadow-amber-500/20' : 'hover:border-zinc-500'
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
  );
};
