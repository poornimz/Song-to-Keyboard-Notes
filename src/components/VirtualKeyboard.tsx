import { useMemo, useState } from 'react';
import {
  KEYBOARD_MAX_MIDI,
  KEYBOARD_MIN_MIDI,
  isBlackKey,
  midiToNoteName,
} from '../utils/musicTheory';

interface VirtualKeyboardProps {
  activePitches: Set<number>;
  onKeyPress: (midi: number) => void;
}

interface WhiteKeyDef {
  midi: number;
  noteName: string;
  index: number;
}

interface BlackKeyDef {
  midi: number;
  noteName: string;
  leftPercent: number;
}

export function VirtualKeyboard({ activePitches, onKeyPress }: VirtualKeyboardProps) {
  const [pressedMidi, setPressedMidi] = useState<number | null>(null);

  const { whiteKeys, blackKeys } = useMemo(() => {
    const whites: WhiteKeyDef[] = [];
    const blacks: BlackKeyDef[] = [];

    // First pass: count white keys (C2..C7 = 36 white keys)
    for (let midi = KEYBOARD_MIN_MIDI; midi <= KEYBOARD_MAX_MIDI; midi++) {
      if (!isBlackKey(midi)) {
        whites.push({
          midi,
          noteName: midiToNoteName(midi),
          index: whites.length,
        });
      }
    }

    const totalWhites = whites.length;
    const whiteWidthPct = 100 / totalWhites;

    // Second pass: place black keys proportionally relative to the preceding white key
    let whiteCountSoFar = 0;
    for (let midi = KEYBOARD_MIN_MIDI; midi <= KEYBOARD_MAX_MIDI; midi++) {
      if (!isBlackKey(midi)) {
        whiteCountSoFar++;
      } else {
        const pc = midi % 12;
        // Slight pianistic offset so C#/F# sit slightly left and D#/A# sit slightly right
        let bias = 0;
        if (pc === 1 || pc === 6) bias = -0.05;
        if (pc === 3 || pc === 10) bias = 0.05;

        const centerPct = (whiteCountSoFar + bias) * whiteWidthPct;
        const blackWidthPct = whiteWidthPct * 0.62;
        blacks.push({
          midi,
          noteName: midiToNoteName(midi),
          leftPercent: centerPct - blackWidthPct / 2,
        });
      }
    }

    return { whiteKeys: whites, blackKeys: blacks };
  }, []);

  const whiteWidthPct = 100 / whiteKeys.length;
  const blackWidthPct = whiteWidthPct * 0.62;

  const triggerKey = (midi: number) => {
    setPressedMidi(midi);
    onKeyPress(midi);
  };

  const releaseKey = (midi: number) => {
    setPressedMidi((prev) => (prev === midi ? null : prev));
  };

  return (
    <div className="w-full overflow-x-auto pb-1">
      <div
        className="relative min-w-[840px] h-44 sm:h-48 select-none rounded-lg border border-slate-300 bg-slate-900 p-1.5 shadow-inner"
        role="group"
        aria-label="61-key interactive virtual piano keyboard from C2 to C7"
      >
        {/* White Keys Layer */}
        <div className="relative w-full h-full flex">
          {whiteKeys.map((key) => {
            const isActiveFromPlayback = activePitches.has(key.midi);
            const isManuallyPressed = pressedMidi === key.midi;
            const isCNote = key.midi % 12 === 0;

            return (
              <button
                key={key.midi}
                type="button"
                onPointerDown={() => triggerKey(key.midi)}
                onPointerUp={() => releaseKey(key.midi)}
                onPointerLeave={() => releaseKey(key.midi)}
                onPointerCancel={() => releaseKey(key.midi)}
                aria-label={`Play ${key.noteName}`}
                className={`relative h-full border-r border-slate-300 last:border-r-0 first:rounded-l-[4px] last:rounded-r-[4px] transition-colors duration-75 flex flex-col justify-end items-center pb-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:z-30 ${
                  isManuallyPressed
                    ? 'bg-blue-500 text-white'
                    : isActiveFromPlayback
                      ? 'bg-emerald-400 text-slate-950'
                      : 'bg-white hover:bg-slate-50 text-slate-500'
                }`}
                style={{ width: `${whiteWidthPct}%` }}
              >
                <span
                  className={`font-mono text-[10px] leading-none tracking-tight ${
                    isManuallyPressed || isActiveFromPlayback
                      ? 'font-semibold opacity-100'
                      : isCNote
                        ? 'font-semibold text-slate-700'
                        : 'text-slate-400 hidden sm:inline'
                  }`}
                >
                  {isCNote || isManuallyPressed || isActiveFromPlayback ? key.noteName : key.noteName.replace(/\d/, '')}
                </span>
              </button>
            );
          })}
        </div>

        {/* Black Keys Layer */}
        <div className="pointer-events-none absolute inset-x-1.5 top-1.5 h-[60%]">
          {blackKeys.map((key) => {
            const isActiveFromPlayback = activePitches.has(key.midi);
            const isManuallyPressed = pressedMidi === key.midi;

            return (
              <button
                key={key.midi}
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  triggerKey(key.midi);
                }}
                onPointerUp={() => releaseKey(key.midi)}
                onPointerLeave={() => releaseKey(key.midi)}
                onPointerCancel={() => releaseKey(key.midi)}
                aria-label={`Play ${key.noteName}`}
                className={`pointer-events-auto absolute top-0 h-full rounded-b-[4px] border border-slate-950 shadow-sm transition-colors duration-75 flex flex-col justify-end items-center pb-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-400 z-20 ${
                  isManuallyPressed
                    ? 'bg-blue-600 text-white border-blue-400'
                    : isActiveFromPlayback
                      ? 'bg-emerald-500 text-white border-emerald-700'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                }`}
                style={{
                  left: `${key.leftPercent}%`,
                  width: `${blackWidthPct}%`,
                }}
              >
                {(isManuallyPressed || isActiveFromPlayback) && (
                  <span className="font-mono text-[9px] font-semibold leading-none">
                    {key.noteName}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
