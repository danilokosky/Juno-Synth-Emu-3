import React, { useState, useEffect, useRef } from 'react';
import { synthEngine } from '../audio/HeraAudioEngine';

interface ArpeggiatorProps {
  className?: string;
}

export const Arpeggiator: React.FC<ArpeggiatorProps> = ({ className = '' }) => {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [bpm, setBpm] = useState<number>(120);
  const [mode, setMode] = useState<'UP' | 'DOWN' | 'U/D' | 'RND'>('UP');
  const [range, setRange] = useState<number>(2); // 1, 2, 3 octaves
  const [rateDivision, setRateDivision] = useState<'1/8' | '1/16' | '1/16T'>('1/16');

  const heldNotesRef = useRef<number[]>([]);
  const isEnabledRef = useRef<boolean>(enabled);
  isEnabledRef.current = enabled;

  const modeRef = useRef(mode);
  modeRef.current = mode;

  const rangeRef = useRef(range);
  rangeRef.current = range;

  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;

  const rateDivisionRef = useRef(rateDivision);
  rateDivisionRef.current = rateDivision;

  // Track keyboard events to feed arpeggiator notes
  useEffect(() => {
    let currentStep = 0;
    let lastPlayedNote: number | null = null;
    let intervalId: number | null = null;

    const tick = () => {
      if (!isEnabledRef.current) return;

      const notes = heldNotesRef.current;
      if (notes.length === 0) {
        if (lastPlayedNote !== null) {
          synthEngine.noteOff(lastPlayedNote);
          lastPlayedNote = null;
        }
        return;
      }

      // Generate pattern based on held notes and octave range
      const sorted = [...notes].sort((a, b) => a - b);
      const expanded: number[] = [];
      for (let oct = 0; oct < rangeRef.current; oct++) {
        for (const n of sorted) {
          expanded.push(n + oct * 12);
        }
      }

      let sequence: number[] = [];
      if (modeRef.current === 'UP') {
        sequence = expanded;
      } else if (modeRef.current === 'DOWN') {
        sequence = [...expanded].reverse();
      } else if (modeRef.current === 'U/D') {
        const reversed = [...expanded].slice(1, -1).reverse();
        sequence = [...expanded, ...reversed];
      } else {
        // Random
        sequence = expanded;
      }

      if (sequence.length === 0) return;

      let noteToPlay: number;
      if (modeRef.current === 'RND') {
        noteToPlay = sequence[Math.floor(Math.random() * sequence.length)];
      } else {
        noteToPlay = sequence[currentStep % sequence.length];
        currentStep = (currentStep + 1) % sequence.length;
      }

      if (lastPlayedNote !== null) {
        synthEngine.noteOff(lastPlayedNote);
      }
      synthEngine.noteOn(noteToPlay, 90);
      lastPlayedNote = noteToPlay;

      // Note duration is 75% of step
      const stepMs = getStepDurationMs(bpmRef.current, rateDivisionRef.current);
      setTimeout(() => {
        if (lastPlayedNote === noteToPlay) {
          synthEngine.noteOff(noteToPlay);
        }
      }, stepMs * 0.75);
    };

    function getStepDurationMs(b: number, div: '1/8' | '1/16' | '1/16T'): number {
      const beatMs = 60000 / b;
      if (div === '1/8') return beatMs / 2;
      if (div === '1/16') return beatMs / 4;
      return (beatMs / 4) * (2 / 3); // triplet
    }

    if (enabled) {
      const stepDuration = getStepDurationMs(bpm, rateDivision);
      intervalId = window.setInterval(tick, stepDuration);
    }

    return () => {
      if (intervalId !== null) clearInterval(intervalId);
      if (lastPlayedNote !== null) {
        synthEngine.noteOff(lastPlayedNote);
      }
    };
  }, [enabled, bpm, rateDivision, mode, range]);

  return (
    <div className={`flex flex-wrap items-center gap-2 bg-zinc-950 p-2 rounded border border-zinc-800 text-xs shadow-inner ${className}`}>
      {/* Header & Toggle */}
      <div className="flex items-center gap-1.5 border-r border-zinc-800 pr-2">
        <button
          type="button"
          onClick={() => setEnabled(!enabled)}
          className={`px-2 py-1 rounded font-mono font-bold uppercase transition-all cursor-pointer ${
            enabled
              ? 'bg-amber-500 text-black border border-amber-400 shadow-[0_0_8px_#f59e0b]'
              : 'bg-zinc-900 text-zinc-400 border border-zinc-700 hover:text-zinc-200'
          }`}
        >
          Arp {enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Mode */}
      <div className="flex items-center gap-1">
        <span className="text-[9px] font-mono text-zinc-500 uppercase">Mode</span>
        {(['UP', 'DOWN', 'U/D', 'RND'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold cursor-pointer transition-colors ${
              mode === m
                ? 'bg-zinc-200 text-black'
                : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Range (Octaves) */}
      <div className="flex items-center gap-1 border-l border-zinc-800 pl-2">
        <span className="text-[9px] font-mono text-zinc-500 uppercase">Range</span>
        {[1, 2, 3].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold cursor-pointer transition-colors ${
              range === r
                ? 'bg-amber-500 text-black'
                : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {r} Oct
          </button>
        ))}
      </div>

      {/* Rate Division */}
      <div className="flex items-center gap-1 border-l border-zinc-800 pl-2">
        <span className="text-[9px] font-mono text-zinc-500 uppercase">Rate</span>
        {(['1/8', '1/16', '1/16T'] as const).map((div) => (
          <button
            key={div}
            type="button"
            onClick={() => setRateDivision(div)}
            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold cursor-pointer transition-colors ${
              rateDivision === div
                ? 'bg-cyan-500 text-black'
                : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {div}
          </button>
        ))}
      </div>

      {/* Tempo BPM */}
      <div className="flex items-center gap-1.5 border-l border-zinc-800 pl-2">
        <span className="text-[9px] font-mono text-zinc-500 uppercase">BPM</span>
        <input
          type="range"
          min={60}
          max={200}
          value={bpm}
          onChange={(e) => setBpm(Number(e.target.value))}
          className="w-16 accent-amber-500 cursor-pointer"
        />
        <span className="font-mono text-[10px] text-amber-400 w-7">{bpm}</span>
      </div>
    </div>
  );
};
