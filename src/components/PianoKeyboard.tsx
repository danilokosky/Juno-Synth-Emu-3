import React, { useState, useEffect, useRef, useCallback } from 'react';
import { synthEngine } from '../audio/HeraAudioEngine';
import { ChevronLeft, ChevronRight, Music, Volume2 } from 'lucide-react';

interface PianoKeyboardProps {
  className?: string;
}

// Key definitions
const WHITE_NOTES = [0, 2, 4, 5, 7, 9, 11]; // C, D, E, F, G, A, B
const BLACK_NOTES: Record<number, number> = {
  0: 1,  // C#
  1: 3,  // D#
  3: 6,  // F#
  4: 8,  // G#
  5: 10, // A#
};

// Keyboard shortcut mapping
const KEY_MAP: Record<string, number> = {
  // Lower octave (Z to M)
  z: 48, // C3
  s: 49, // C#3
  x: 50, // D3
  d: 51, // D#3
  c: 52, // E3
  v: 53, // F3
  g: 54, // F#3
  b: 55, // G3
  h: 56, // G#3
  n: 57, // A3
  j: 58, // A#3
  m: 59, // B3
  ',': 60, // C4

  // Upper octave (Q to P / numbers)
  q: 60, // C4
  '2': 61, // C#4
  w: 62, // D4
  '3': 63, // D#4
  e: 64, // E4
  r: 65, // F4
  '5': 66, // F#4
  t: 67, // G4
  '6': 68, // G#4
  y: 69, // A4
  '7': 70, // A#4
  u: 71, // B4
  i: 72, // C5
  '9': 73, // C#5
  o: 74, // D5
  '0': 75, // D#5
  p: 76, // E5
};

export const PianoKeyboard: React.FC<PianoKeyboardProps> = ({ className = '' }) => {
  const [octaveShift, setOctaveShift] = useState<number>(0);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [pitchBend, setPitchBend] = useState<number>(0);
  const [modWheel, setModWheel] = useState<number>(0);
  const [holdSustain, setHoldSustain] = useState<boolean>(false);
  const [showKeyLabels, setShowKeyLabels] = useState<boolean>(true);

  const isMouseDownRef = useRef(false);
  const heldNotesRef = useRef<Set<number>>(new Set());

  // Number of octaves to display (3 octaves: 36 keys + top C = 37 keys)
  const baseStartMidi = 48 + octaveShift * 12; // C3 + octaveShift
  const numOctaves = 3;

  const playNote = useCallback((note: number, velocity: number = 100) => {
    heldNotesRef.current.add(note);
    setActiveNotes(new Set(heldNotesRef.current));
    synthEngine.noteOn(note, velocity);
  }, []);

  const releaseNote = useCallback((note: number) => {
    if (holdSustain) return; // In hold mode, notes keep ringing until hold is turned off
    heldNotesRef.current.delete(note);
    setActiveNotes(new Set(heldNotesRef.current));
    synthEngine.noteOff(note);
  }, [holdSustain]);

  // Handle computer keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.repeat) return;

      const key = e.key.toLowerCase();
      const baseNote = KEY_MAP[key];
      if (baseNote !== undefined) {
        const note = baseNote + octaveShift * 12;
        playNote(note);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const key = e.key.toLowerCase();
      const baseNote = KEY_MAP[key];
      if (baseNote !== undefined) {
        const note = baseNote + octaveShift * 12;
        releaseNote(note);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [octaveShift, playNote, releaseNote]);

  // Pitch bend spring-back handling
  const handlePitchBendPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePitchBendPointerMove = (e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const normalizedY = 1 - (e.clientY - rect.top) / rect.height; // 0 (bottom) to 1 (top)
    const bend = Math.max(-1, Math.min(1, (normalizedY - 0.5) * 2));
    setPitchBend(bend);
    synthEngine.setPitchBend(bend);
  };

  const handlePitchBendPointerUp = () => {
    // Spring back to center
    setPitchBend(0);
    synthEngine.setPitchBend(0);
  };

  // Mod wheel handling
  const handleModWheelPointerMove = (e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const normalizedY = 1 - (e.clientY - rect.top) / rect.height;
    const mod = Math.max(0, Math.min(1, normalizedY));
    setModWheel(mod);
    synthEngine.setModWheel(mod);
  };

  const toggleHold = () => {
    if (holdSustain) {
      // Release all held notes
      heldNotesRef.current.clear();
      setActiveNotes(new Set());
      synthEngine.allNotesOff();
    }
    setHoldSustain(!holdSustain);
  };

  // Build keys data for rendering
  const keysList: {
    midi: number;
    isBlack: boolean;
    whiteIndex: number;
    blackLeftOffset?: number;
    shortcutKey?: string;
  }[] = [];

  let whiteCount = 0;
  for (let oct = 0; oct < numOctaves; oct++) {
    for (let w = 0; w < 7; w++) {
      const whiteMidi = baseStartMidi + oct * 12 + WHITE_NOTES[w];
      const shortcut = Object.keys(KEY_MAP).find(
        (k) => KEY_MAP[k] + octaveShift * 12 === whiteMidi
      );

      keysList.push({
        midi: whiteMidi,
        isBlack: false,
        whiteIndex: whiteCount,
        shortcutKey: shortcut,
      });

      // Check if black note follows
      if (BLACK_NOTES[w] !== undefined) {
        const blackMidi = baseStartMidi + oct * 12 + BLACK_NOTES[w];
        const blackShortcut = Object.keys(KEY_MAP).find(
          (k) => KEY_MAP[k] + octaveShift * 12 === blackMidi
        );

        keysList.push({
          midi: blackMidi,
          isBlack: true,
          whiteIndex: whiteCount,
          blackLeftOffset: whiteCount,
          shortcutKey: blackShortcut,
        });
      }

      whiteCount++;
    }
  }

  // Add final high C
  const finalMidi = baseStartMidi + numOctaves * 12;
  const finalShortcut = Object.keys(KEY_MAP).find(
    (k) => KEY_MAP[k] + octaveShift * 12 === finalMidi
  );
  keysList.push({
    midi: finalMidi,
    isBlack: false,
    whiteIndex: whiteCount,
    shortcutKey: finalShortcut,
  });
  whiteCount++;

  return (
    <div className={`flex flex-col bg-zinc-950 border-t-4 border-zinc-800 p-2 shadow-2xl select-none ${className}`}>
      {/* Keyboard Controls Bar */}
      <div className="flex flex-wrap items-center justify-between pb-2 px-1 text-xs text-zinc-400 gap-2">
        <div className="flex items-center gap-2">
          {/* Octave transpose */}
          <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 shadow-inner">
            <span className="text-[9px] font-mono uppercase text-zinc-500 mr-1.5 font-bold">Octave</span>
            <button
              type="button"
              onClick={() => setOctaveShift(Math.max(-2, octaveShift - 1))}
              className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded font-bold cursor-pointer"
              title="Octave Down"
            >
              -
            </button>
            <span className="w-6 text-center font-mono font-bold text-amber-400">
              {octaveShift > 0 ? `+${octaveShift}` : octaveShift}
            </span>
            <button
              type="button"
              onClick={() => setOctaveShift(Math.min(2, octaveShift + 1))}
              className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded font-bold cursor-pointer"
              title="Octave Up"
            >
              +
            </button>
          </div>

          {/* Hold / Sustain */}
          <button
            type="button"
            onClick={toggleHold}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-bold border transition-colors cursor-pointer ${
              holdSustain
                ? 'bg-amber-500 border-amber-400 text-black shadow-[0_0_8px_#f59e0b]'
                : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>HOLD</span>
          </button>

          {/* Toggle Key Shortcuts */}
          <button
            type="button"
            onClick={() => setShowKeyLabels(!showKeyLabels)}
            className={`px-2 py-1 rounded text-[10px] font-mono border transition-colors cursor-pointer ${
              showKeyLabels
                ? 'bg-zinc-800 border-zinc-600 text-zinc-200'
                : 'bg-zinc-950 border-zinc-800 text-zinc-500'
            }`}
          >
            {showKeyLabels ? 'Shortcuts On' : 'Shortcuts Off'}
          </button>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
          <span>61-Key Polyphonic Keyboard</span>
          <span className="text-zinc-700">|</span>
          <span>Click & Drag / QWERTY Keyboard Supported</span>
        </div>
      </div>

      {/* Main Playing Area: Left Benders + Piano Keys */}
      <div className="flex items-stretch gap-2.5">
        {/* Left Wheels Section (Bender & Mod Wheel) */}
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded p-1.5 shadow-inner">
          {/* Pitch Bender Wheel */}
          <div className="flex flex-col items-center">
            <span className="text-[8px] font-mono uppercase text-zinc-400 mb-1">Pitch</span>
            <div
              onPointerDown={handlePitchBendPointerDown}
              onPointerMove={handlePitchBendPointerMove}
              onPointerUp={handlePitchBendPointerUp}
              onPointerCancel={handlePitchBendPointerUp}
              className="relative w-7 h-28 bg-zinc-950 rounded border border-zinc-700 shadow-inner cursor-ns-resize flex items-center justify-center overflow-hidden"
              title="Pitch Bender (Center spring)"
            >
              {/* Center detent mark */}
              <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-zinc-600 -translate-y-1/2 pointer-events-none" />
              {/* Wheel handle */}
              <div
                className="w-5 h-7 rounded bg-gradient-to-b from-zinc-600 via-zinc-400 to-zinc-700 border border-zinc-500 shadow transition-transform duration-75 pointer-events-none"
                style={{
                  transform: `translateY(${-pitchBend * 36}px)`,
                }}
              />
            </div>
            <span className="text-[7px] font-mono text-amber-500 mt-1">
              {pitchBend !== 0 ? (pitchBend > 0 ? `+${pitchBend.toFixed(1)}` : pitchBend.toFixed(1)) : 'CTR'}
            </span>
          </div>

          {/* Modulation Wheel */}
          <div className="flex flex-col items-center">
            <span className="text-[8px] font-mono uppercase text-zinc-400 mb-1">Mod</span>
            <div
              onPointerDown={handlePitchBendPointerDown}
              onPointerMove={handleModWheelPointerMove}
              className="relative w-7 h-28 bg-zinc-950 rounded border border-zinc-700 shadow-inner cursor-ns-resize flex items-center justify-center overflow-hidden"
              title="Modulation Wheel"
            >
              {/* Wheel handle */}
              <div
                className="w-5 h-7 rounded bg-gradient-to-b from-zinc-600 via-zinc-400 to-zinc-700 border border-zinc-500 shadow pointer-events-none"
                style={{
                  transform: `translateY(${-(modWheel - 0.5) * 64}px)`,
                }}
              />
            </div>
            <span className="text-[7px] font-mono text-cyan-400 mt-1">
              {Math.round(modWheel * 100)}%
            </span>
          </div>
        </div>

        {/* Piano Roll Keys */}
        <div
          className="relative flex-1 h-36 bg-zinc-950 rounded-b shadow-2xl overflow-hidden touch-none border border-zinc-800"
          onPointerDown={() => {
            isMouseDownRef.current = true;
          }}
          onPointerUp={() => {
            isMouseDownRef.current = false;
          }}
          onPointerLeave={() => {
            isMouseDownRef.current = false;
          }}
        >
          {/* White keys */}
          <div className="absolute inset-0 flex">
            {keysList
              .filter((k) => !k.isBlack)
              .map((k) => {
                const isActive = activeNotes.has(k.midi);
                return (
                  <div
                    key={k.midi}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      try {
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      } catch {}
                      playNote(k.midi);
                    }}
                    onPointerEnter={() => {
                      if (isMouseDownRef.current) playNote(k.midi);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      try {
                        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                      } catch {}
                      releaseNote(k.midi);
                    }}
                    onPointerCancel={() => releaseNote(k.midi)}
                    className={`relative flex-1 h-full rounded-b border border-zinc-300 shadow transition-colors cursor-pointer flex flex-col justify-end items-center pb-1.5 select-none ${
                      isActive
                        ? 'bg-gradient-to-b from-amber-200 via-amber-300 to-amber-400 border-amber-500 shadow-[0_0_12px_#f59e0b]'
                        : 'bg-gradient-to-b from-zinc-100 via-zinc-50 to-zinc-200 hover:bg-zinc-100 active:bg-amber-100'
                    }`}
                  >
                    {showKeyLabels && k.shortcutKey && (
                      <span
                        className={`text-[9px] font-mono font-bold uppercase ${
                          isActive ? 'text-black' : 'text-zinc-600'
                        }`}
                      >
                        {k.shortcutKey}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>

          {/* Black keys */}
          {keysList
            .filter((k) => k.isBlack)
            .map((k) => {
              const isActive = activeNotes.has(k.midi);
              // Calculate horizontal position relative to whiteCount
              const leftPercent = ((k.blackLeftOffset! + 0.65) / whiteCount) * 100;
              const widthPercent = (0.7 / whiteCount) * 100;

              return (
                <div
                  key={k.midi}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    } catch {}
                    playNote(k.midi);
                  }}
                  onPointerEnter={() => {
                    if (isMouseDownRef.current) playNote(k.midi);
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    try {
                      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                    } catch {}
                    releaseNote(k.midi);
                  }}
                  onPointerCancel={() => releaseNote(k.midi)}
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                  }}
                  className={`absolute top-0 h-22 rounded-b z-10 border border-zinc-950 shadow-lg cursor-pointer flex flex-col justify-end items-center pb-1 select-none transition-colors ${
                    isActive
                      ? 'bg-gradient-to-b from-amber-500 to-yellow-600 border-amber-400 shadow-[0_0_12px_#f59e0b]'
                      : 'bg-gradient-to-b from-zinc-800 via-zinc-900 to-black hover:from-zinc-700'
                  }`}
                >
                  {showKeyLabels && k.shortcutKey && (
                    <span
                      className={`text-[8px] font-mono font-bold uppercase ${
                        isActive ? 'text-black' : 'text-zinc-400'
                      }`}
                    >
                      {k.shortcutKey}
                    </span>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
