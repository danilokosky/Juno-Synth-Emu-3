import React from 'react';
import { VoiceStatus } from '../types/synth';

interface VoiceIndicatorProps {
  voices: VoiceStatus[];
  className?: string;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToNoteName(midi: number): string {
  if (midi < 0) return '--';
  const octave = Math.floor(midi / 12) - 1;
  const note = NOTE_NAMES[midi % 12];
  return `${note}${octave}`;
}

export const VoiceIndicator: React.FC<VoiceIndicatorProps> = ({ voices, className = '' }) => {
  return (
    <div className={`flex flex-col gap-1 bg-zinc-950 p-2 rounded border border-zinc-800/80 shadow-inner ${className}`}>
      <div className="flex items-center justify-between text-[8px] font-mono uppercase text-zinc-400 border-b border-zinc-800 pb-1 mb-0.5">
        <span>Polyphonic Voices</span>
        <span className="text-amber-500 font-bold">6-Voice</span>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => {
          const v = voices[i];
          const isActive = !!v?.active;
          return (
            <div key={i} className="flex flex-col items-center">
              <div
                className={`w-2.5 h-2.5 rounded-full border transition-all duration-75 ${
                  isActive
                    ? 'bg-red-500 border-red-300 shadow-[0_0_8px_#ef4444]'
                    : 'bg-zinc-900 border-zinc-800'
                }`}
              />
              <span className="text-[7px] font-mono text-zinc-500 mt-0.5">{i + 1}</span>
              <span
                className={`text-[8px] font-mono font-bold mt-0.5 ${
                  isActive ? 'text-amber-400' : 'text-zinc-600'
                }`}
              >
                {isActive ? midiToNoteName(v.note) : '-'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
