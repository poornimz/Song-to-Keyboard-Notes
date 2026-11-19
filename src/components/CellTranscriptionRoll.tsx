import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Code2, Copy, ListMusic, Loader2, Sparkles } from 'lucide-react';
import type { ChordStep, NoteEvent, PipelineStageStatus } from '../types/notebook';
import { PianoRollCanvas } from './PianoRollCanvas';

interface CellTranscriptionRollProps {
  transcribeStatus: PipelineStageStatus;
  transcribeError: string | null;
  hasMelSpec: boolean;
  latencyMs: number | null;
  rawNoteCount: number;
  filteredNotes: NoteEvent[];
  chordSteps: ChordStep[];
  minVelocity: number;
  onChangeMinVelocity: (val: number) => void;
  durationSec: number;
  currentTimeSec: number;
  isPlaying: boolean;
  onTranscribe: () => void;
  onSeek: (timeSec: number) => void;
  onAuditionStep: (step: ChordStep) => void;
  rawSequenceJson: Record<string, unknown> | null;
}

export function CellTranscriptionRoll({
  transcribeStatus,
  transcribeError,
  hasMelSpec,
  latencyMs,
  rawNoteCount,
  filteredNotes,
  chordSteps,
  minVelocity,
  onChangeMinVelocity,
  durationSec,
  currentTimeSec,
  isPlaying,
  onTranscribe,
  onSeek,
  onAuditionStep,
  rawSequenceJson,
}: CellTranscriptionRollProps) {
  const [inspectorTab, setInspectorTab] = useState<'timeline' | 'json'>('timeline');
  const [copiedJson, setCopiedJson] = useState(false);
  const activeStepRowRef = useRef<HTMLButtonElement | null>(null);

  const activeStepId = useMemo(() => {
    if (!isPlaying && currentTimeSec <= 0) return null;
    for (let i = chordSteps.length - 1; i >= 0; i--) {
      const step = chordSteps[i];
      if (currentTimeSec >= step.startTime - 0.02 && currentTimeSec <= step.endTime + 0.05) {
        return step.id;
      }
    }
    return null;
  }, [chordSteps, currentTimeSec, isPlaying]);

  useEffect(() => {
    if (isPlaying && activeStepId && activeStepRowRef.current) {
      activeStepRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isPlaying, activeStepId]);

  const filteredSequenceJson = useMemo(() => {
    if (!rawSequenceJson) return null;
    return {
      totalTime: Number(durationSec.toFixed(3)),
      tempos: rawSequenceJson.tempos ?? [{ time: 0, qpm: 120 }],
      minVelocityFilter: minVelocity,
      noteCount: filteredNotes.length,
      notes: filteredNotes.map((n) => ({
        pitch: n.pitch,
        noteName: n.noteName,
        startTime: n.startTime,
        endTime: n.endTime,
        velocity: n.velocity,
      })),
    };
  }, [rawSequenceJson, durationSec, minVelocity, filteredNotes]);

  const handleCopyJson = async () => {
    if (!filteredSequenceJson) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(filteredSequenceJson, null, 2));
      setCopiedJson(true);
      window.setTimeout(() => setCopiedJson(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <section
      id="cell-3"
      className="scroll-mt-28 rounded-xl border border-slate-200 bg-white overflow-hidden"
    >
      {/* Cell Header */}
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="font-mono text-xs font-semibold text-blue-600 shrink-0">In [3]</span>
          <h2 className="font-display text-lg font-semibold text-slate-900 tracking-tight">
            Transcribe Audio to Keyboard Notes &amp; Piano Roll
          </h2>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {transcribeStatus === 'ready' && (
            <span className="text-xs font-mono tabular-nums text-slate-600 hidden sm:inline">
              {latencyMs !== null ? `${latencyMs} ms inference` : ''} · {filteredNotes.length}/
              {rawNoteCount} notes · {chordSteps.length} steps
            </span>
          )}

          <button
            type="button"
            onClick={onTranscribe}
            disabled={!hasMelSpec || transcribeStatus === 'loading'}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2"
          >
            {transcribeStatus === 'loading' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>
              {transcribeStatus === 'loading' ? 'Transcribing…' : 'Transcribe Active Clip'}
            </span>
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Velocity Filter & Telemetry Controls */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center pb-3 border-b border-slate-200">
          <div className="md:col-span-6 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="min-velocity-slider" className="font-medium text-slate-700">
                Minimum Key Velocity (Filter Ghost Overtones)
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {minVelocity} / 127
              </span>
            </div>
            <input
              id="min-velocity-slider"
              type="range"
              min={10}
              max={90}
              step={1}
              value={minVelocity}
              onChange={(e) => onChangeMinVelocity(Number(e.target.value))}
              className="studio-slider w-full"
            />
          </div>

          <div className="md:col-span-6 flex flex-wrap items-center md:justify-end gap-x-5 gap-y-1 text-xs font-mono tabular-nums text-slate-600">
            <span>
              Inference:{' '}
              <strong className="text-slate-900">
                {latencyMs !== null ? `${latencyMs} ms` : '—'}
              </strong>
            </span>
            <span>
              Notes:{' '}
              <strong className="text-slate-900">
                {filteredNotes.length}
              </strong>{' '}
              / {rawNoteCount}
            </span>
            <span>
              Chord Steps: <strong className="text-slate-900">{chordSteps.length}</strong>
            </span>
          </div>
        </div>

        {transcribeError && (
          <div
            role="alert"
            className="px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-xs sm:text-sm text-red-800"
          >
            {transcribeError}
          </div>
        )}

        {/* Two-Zone Split: C2-C7 Piano Roll + Tabbed Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <div className="lg:col-span-7 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium text-slate-700">
                C2–C7 Piano Roll (Click anywhere to seek playhead)
              </span>
              <span className="font-mono tabular-nums">
                Playhead: {currentTimeSec.toFixed(2)}s
              </span>
            </div>
            <PianoRollCanvas
              notes={filteredNotes}
              durationSec={durationSec}
              currentTimeSec={currentTimeSec}
              isPlaying={isPlaying}
              onSeek={onSeek}
            />
          </div>

          {/* Right Tabbed Inspector */}
          <div className="lg:col-span-5 flex flex-col rounded-lg border border-slate-200 bg-[#F8FAFC] overflow-hidden min-h-[330px] max-h-[364px]">
            <div className="px-3 py-2 border-b border-slate-200 bg-white flex items-center justify-between gap-2">
              <div
                role="tablist"
                aria-label="Transcription inspector view"
                className="inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-md border border-slate-200"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === 'timeline'}
                  onClick={() => setInspectorTab('timeline')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                    inspectorTab === 'timeline'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ListMusic className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Notes Timeline</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === 'json'}
                  onClick={() => setInspectorTab('json')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                    inspectorTab === 'json'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>INoteSequence JSON</span>
                </button>
              </div>

              {inspectorTab === 'json' && filteredSequenceJson && (
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap cursor-pointer"
                >
                  {copiedJson ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>{copiedJson ? 'Copied' : 'Copy'}</span>
                </button>
              )}
            </div>

            {inspectorTab === 'timeline' ? (
              <div className="flex-1 overflow-y-auto divide-y divide-slate-200/80">
                {chordSteps.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center text-xs text-slate-500">
                    <p className="font-medium text-slate-700">No notes in timeline yet</p>
                    <p className="mt-1">
                      Click <span className="font-medium text-slate-800">Transcribe Active Clip</span>{' '}
                      or lower the Minimum Key Velocity slider.
                    </p>
                  </div>
                ) : (
                  chordSteps.map((step) => {
                    const isActive = step.id === activeStepId;
                    const dur = Math.max(0.05, step.endTime - step.startTime);
                    return (
                      <button
                        key={step.id}
                        ref={isActive ? activeStepRowRef : null}
                        type="button"
                        onClick={() => onAuditionStep(step)}
                        className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-950'
                            : 'hover:bg-white text-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`font-mono text-xs tabular-nums shrink-0 w-12 ${
                              isActive ? 'text-emerald-700 font-semibold' : 'text-slate-500'
                            }`}
                          >
                            {step.startTime.toFixed(2)}s
                          </span>
                          <span
                            className={`font-mono text-xs sm:text-sm font-semibold truncate ${
                              isActive ? 'text-emerald-800' : 'text-slate-900'
                            }`}
                          >
                            {step.chordLabel}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] tabular-nums text-slate-500 shrink-0">
                          {dur.toFixed(2)}s · v{step.avgVelocity}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            ) : (
              <pre className="flex-1 overflow-auto p-3.5 text-[11px] leading-relaxed font-mono text-slate-800 bg-white">
                <code>
                  {filteredSequenceJson
                    ? JSON.stringify(filteredSequenceJson, null, 2)
                    : '// Transcribe a clip in In [3] to inspect the INoteSequence output'}
                </code>
              </pre>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
