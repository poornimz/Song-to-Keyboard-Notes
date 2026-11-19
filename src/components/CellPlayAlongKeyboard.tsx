import { useMemo, useState } from 'react';
import { Check, Copy, Download, Pause, Play, Repeat, Square } from 'lucide-react';
import type { ChordStep, MonitorSource, NoteEvent } from '../types/notebook';
import { midiToNoteName } from '../utils/musicTheory';
import { VirtualKeyboard } from './VirtualKeyboard';

interface CellPlayAlongKeyboardProps {
  notes: NoteEvent[];
  chordSteps: ChordStep[];
  durationSec: number;
  currentTimeSec: number;
  isPlaying: boolean;
  activePitches: Set<number>;
  monitorSource: MonitorSource;
  onChangeMonitorSource: (source: MonitorSource) => void;
  speed: number;
  onChangeSpeed: (speed: number) => void;
  isLooping: boolean;
  onToggleLoop: () => void;
  onPlayPause: () => void;
  onStop: () => void;
  onKeyPress: (midi: number) => void;
  onCopyNoteList: () => Promise<boolean>;
  onExportMidi: () => void;
}

export function CellPlayAlongKeyboard({
  notes,
  durationSec,
  currentTimeSec,
  isPlaying,
  activePitches,
  monitorSource,
  onChangeMonitorSource,
  speed,
  onChangeSpeed,
  isLooping,
  onToggleLoop,
  onPlayPause,
  onStop,
  onKeyPress,
  onCopyNoteList,
  onExportMidi,
}: CellPlayAlongKeyboardProps) {
  const [copiedNotes, setCopiedNotes] = useState(false);

  const hasNotes = notes.length > 0;
  const activePitchLabels = useMemo(() => {
    if (activePitches.size === 0) return 'Click any key to play, or press Play to follow along';
    return Array.from(activePitches)
      .sort((a, b) => a - b)
      .map((p) => midiToNoteName(p))
      .join(' + ');
  }, [activePitches]);

  const handleCopy = async () => {
    const ok = await onCopyNoteList();
    if (ok) {
      setCopiedNotes(true);
      window.setTimeout(() => setCopiedNotes(false), 1800);
    }
  };

  return (
    <section
      id="cell-4"
      className="scroll-mt-28 rounded-xl border border-slate-200 bg-white overflow-hidden"
    >
      {/* Cell Header */}
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="font-mono text-xs font-semibold text-blue-600 shrink-0">In [4]</span>
          <h2 className="font-display text-lg font-semibold text-slate-900 tracking-tight">
            Interactive Play-Along Virtual Keyboard &amp; Export
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!hasNotes}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {copiedNotes ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            )}
            <span>{copiedNotes ? 'Copied Note List' : 'Copy Note List'}</span>
          </button>

          <button
            type="button"
            onClick={onExportMidi}
            disabled={!hasNotes}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export MIDI</span>
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Transport, Monitor Source, Practice Speed & Loop */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          {/* Play / Pause / Stop + Timer */}
          <div className="lg:col-span-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onPlayPause}
              disabled={!hasNotes && monitorSource === 'piano'}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                  <span>Play</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onStop}
              disabled={!isPlaying && currentTimeSec === 0}
              aria-label="Stop playback"
              className="inline-flex items-center justify-center p-2 text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
            </button>

            <span className="font-mono text-xs tabular-nums text-slate-700 ml-1 whitespace-nowrap">
              {currentTimeSec.toFixed(2)}s / {durationSec.toFixed(2)}s
            </span>
          </div>

          {/* Audio Monitor Source Segmented Control */}
          <div className="lg:col-span-5 flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
              Audio Monitor
            </span>
            <div
              role="group"
              aria-label="Audio monitor source"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200"
            >
              {(
                [
                  { id: 'piano', label: 'Piano Notes' },
                  { id: 'original', label: 'Original Clip' },
                  { id: 'layered', label: 'Layered A+B' },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onChangeMonitorSource(option.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    monitorSource === option.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Practice Speed & Loop */}
          <div className="lg:col-span-4 flex items-center gap-4">
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="practice-speed-slider" className="font-medium text-slate-700">
                  Practice Speed
                </label>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {speed.toFixed(2)}x
                </span>
              </div>
              <input
                id="practice-speed-slider"
                type="range"
                min={0.5}
                max={1.25}
                step={0.05}
                value={speed}
                onChange={(e) => onChangeSpeed(Number(e.target.value))}
                className="studio-slider w-full"
              />
            </div>

            <button
              type="button"
              onClick={onToggleLoop}
              aria-pressed={isLooping}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isLooping
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Repeat className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isLooping ? 'Loop On' : 'Loop Off'}</span>
            </button>
          </div>
        </div>

        {/* Active Sounding Notes Readout */}
        <div className="px-3.5 py-2.5 rounded-lg border border-slate-200 bg-[#F8FAFC] flex items-center justify-between gap-4">
          <span className="text-xs font-medium text-slate-600">Sounding Keys (C2–C7)</span>
          <span
            className={`font-mono text-sm font-semibold tabular-nums ${
              activePitches.size > 0 ? 'text-emerald-700' : 'text-slate-500 font-normal text-xs'
            }`}
          >
            {activePitchLabels}
          </span>
        </div>

        {/* 61-Key Interactive Virtual Piano */}
        <VirtualKeyboard activePitches={activePitches} onKeyPress={onKeyPress} />
      </div>
    </section>
  );
}
